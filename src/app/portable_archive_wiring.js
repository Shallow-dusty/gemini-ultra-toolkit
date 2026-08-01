import { PORTABLE_ARCHIVE_SECTIONS } from '../features/portable_archive/constants.js';
import { PortableArchiveError } from '../features/portable_archive/errors.js';
const INTEGRATION_KEYS = Object.freeze(['section', 'exportSection', 'contributor']);
const CONTRIBUTOR_KEYS = Object.freeze(['snapshot', 'apply', 'rollback']);
const DISABLED_CODES = new Set(['FEATURE_INACTIVE', 'SERVICE_INACTIVE', 'NOT_STARTED']);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Typed application-composition failure; feature ports remain presentation-independent. */
export class PortableArchiveWiringError extends PortableArchiveError {
    constructor(code, message, details = {}, cause = undefined) {
        super(code, message, Object.freeze({ ...details }), cause);
        this.name = 'PortableArchiveWiringError';
    }
}
const fail = (code, message, details = {}, cause = undefined) => {
    throw new PortableArchiveWiringError(code, message, details, cause);
};
const upstreamCode = error => typeof error?.code === 'string' && error.code ? error.code : null;
function translateFailure(error, fallbackCode, section) {
    if (error instanceof PortableArchiveWiringError) return error;
    const sourceCode = upstreamCode(error);
    if (sourceCode === 'ARCHIVE_ABORTED' || sourceCode === 'RESTORE_ABORTED') {
        return new PortableArchiveWiringError(
            'ARCHIVE_ABORTED', 'Portable Archive operation was aborted', { section }, error);
    }
    if (DISABLED_CODES.has(sourceCode)) {
        return new PortableArchiveWiringError(
            'SECTION_DISABLED', `Portable Archive section is disabled: ${section}`,
            { section, reasonCode: sourceCode }, error
        );
    }
    if (sourceCode && /(?:^|_)SESSION(?:_|$)/.test(sourceCode)) {
        return new PortableArchiveWiringError(
            sourceCode, `Portable Archive session rejected ${section}`, { section }, error);
    }
    return new PortableArchiveWiringError(fallbackCode, `Portable Archive section failed: ${section}`,
        { section, reasonCode: sourceCode ?? 'UNCLASSIFIED_FAILURE' }, error);
}
function normalizeSignal(signal) {
    if (signal === undefined || signal === null) return null;
    if (!isRecord(signal) || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'signal must implement the AbortSignal contract');
    }
    return signal;
}
const throwIfAborted = (signal, section = null) => signal?.aborted && fail('ARCHIVE_ABORTED', 'Portable Archive operation was aborted', { section });
function mergeSignals(callerSignal, lifecycleSignal) {
    if (!callerSignal) return Object.freeze({ signal: lifecycleSignal, cleanup: () => {} });
    const controller = new AbortController();
    const listeners = [];
    for (const source of [callerSignal, lifecycleSignal]) {
        const abort = () => !controller.signal.aborted && controller.abort(source.reason);
        if (source.aborted) abort();
        else {
            source.addEventListener('abort', abort, { once: true });
            listeners.push([source, abort]);
        }
    }
    return Object.freeze({ signal: controller.signal,
        cleanup: () => listeners.forEach(([source, abort]) => source.removeEventListener('abort', abort)) });
}
function exactFrozenPort(value, keys, label, section) {
    const actualKeys = isRecord(value) ? Reflect.ownKeys(value) : [];
    const exact = actualKeys.length === keys.length && keys.every(key => actualKeys.includes(key));
    if (!isRecord(value) || !Object.isFrozen(value) || !exact) {
        fail('INVALID_INTEGRATION', `${label} must be frozen with the exact production interface`, { section });
    }
}
function validateIntegration(integration, expectedSection) {
    exactFrozenPort(integration, INTEGRATION_KEYS, 'integration', expectedSection);
    if (!PORTABLE_ARCHIVE_SECTIONS.includes(integration.section)) {
        fail('INVALID_INTEGRATION', 'integration.section is not supported', { section: expectedSection });
    }
    if (typeof integration.exportSection !== 'function') {
        fail('INVALID_INTEGRATION', 'integration.exportSection must be a function', { section: expectedSection });
    }
    exactFrozenPort(integration.contributor, CONTRIBUTOR_KEYS, 'contributor', expectedSection);
    for (const method of CONTRIBUTOR_KEYS) {
        if (typeof integration.contributor[method] !== 'function') {
            fail('INVALID_INTEGRATION', `contributor.${method} must be a function`, { section: expectedSection });
        }
    }
}
function normalizeProviders(input) {
    if (!isRecord(input)) fail('INVALID_PROVIDERS', 'integrationProviders must be an object');
    const providers = new Map();
    for (const section of Reflect.ownKeys(input)) {
        if (typeof section !== 'string' || !PORTABLE_ARCHIVE_SECTIONS.includes(section)) {
            fail('INVALID_PROVIDER', 'integrationProviders contains an unsupported section', { section: String(section) });
        }
        if (typeof input[section] !== 'function') {
            fail('INVALID_PROVIDER', `Integration provider must be a function: ${section}`, { section });
        }
        providers.set(section, input[section]);
    }
    return providers;
}
function normalizeInclude(include, records) {
    if (include === undefined) {
        return PORTABLE_ARCHIVE_SECTIONS.filter(section => records.get(section)?.status === 'available');
    }
    if (!Array.isArray(include)) fail('INVALID_SELECTION', 'include must be an array');
    const seen = new Set();
    return include.map(section => {
        if (typeof section !== 'string' || !PORTABLE_ARCHIVE_SECTIONS.includes(section)) {
            fail('UNKNOWN_SECTION', `Unknown Portable Archive section: ${String(section)}`, { section: String(section) });
        }
        if (seen.has(section)) fail('DUPLICATE_SECTION', `Duplicate Portable Archive section: ${section}`, { section });
        seen.add(section);
        return section;
    });
}
/** Compose section-owned archive integrations without importing concrete modules. */
export function createPortableArchiveWiring({ integrationProviders, lifecycle = null } = {}) {
    const providers = normalizeProviders(integrationProviders);
    if (lifecycle !== null && (!isRecord(lifecycle) || typeof lifecycle.defer !== 'function')) {
        fail('INVALID_LIFECYCLE', 'lifecycle must implement defer()');
    }
    let generation = 0, state = 'idle', controller = null, records = new Map(), contributors = Object.freeze({}), availability;
    function syncSnapshots() {
        const sections = {};
        const nextContributors = {};
        for (const section of PORTABLE_ARCHIVE_SECTIONS) {
            const record = records.get(section);
            if (record) {
                sections[section] = Object.freeze({
                    status: record.status,
                    ...(record.reasonCode ? { reasonCode: record.reasonCode } : {})
                });
                if (state === 'ready' && record.status === 'available') {
                    nextContributors[section] = record.contributor;
                }
            } else if (!providers.has(section)) {
                sections[section] = Object.freeze({ status: 'missing', reasonCode: 'PROVIDER_MISSING' });
            } else {
                const status = state === 'stopped' ? 'stopped' : 'unresolved';
                sections[section] = Object.freeze({ status, reasonCode: 'WIRING_INACTIVE' });
            }
        }
        contributors = Object.freeze(nextContributors);
        availability = Object.freeze({ generation, state, sections: Object.freeze(sections) });
    }
    function assertCurrent(token) {
        if (state !== 'ready' || token !== generation) {
            fail('STALE_INTEGRATION', 'Portable Archive integration is stale', { generation: token });
        }
    }
    function wrapContributor(section, delegate, token, lifecycleSignal) {
        const invoke = method => async context => {
            assertCurrent(token);
            const linked = mergeSignals(normalizeSignal(context?.signal), lifecycleSignal);
            let result;
            try {
                throwIfAborted(linked.signal, section);
                const input = isRecord(context) ? { ...context, signal: linked.signal } : context;
                result = await delegate[method](input);
                throwIfAborted(linked.signal, section);
                assertCurrent(token);
            } catch (error) {
                linked.cleanup();
                throw translateFailure(error, 'CONTRIBUTOR_FAILED', section);
            }
            linked.cleanup();
            return result;
        };
        return Object.freeze({ snapshot: invoke('snapshot'), apply: invoke('apply'), rollback: invoke('rollback') });
    }
    function wrapExport(section, delegate, token, lifecycleSignal) {
        return async callerSignal => {
            assertCurrent(token);
            const linked = mergeSignals(normalizeSignal(callerSignal), lifecycleSignal);
            let result;
            try {
                throwIfAborted(linked.signal, section);
                result = await delegate(Object.freeze({ signal: linked.signal }));
                if (result === undefined) fail('INVALID_SECTION_DATA', `Section returned undefined: ${section}`, { section });
                throwIfAborted(linked.signal, section);
                assertCurrent(token);
            } catch (error) {
                linked.cleanup();
                throw translateFailure(error, 'SECTION_EXPORT_FAILED', section);
            }
            linked.cleanup();
            return result;
        };
    }
    async function probe(section, provider, signal) {
        let integration;
        try {
            integration = await provider(Object.freeze({ signal }));
        } catch (error) {
            if (DISABLED_CODES.has(upstreamCode(error))) {
                return { status: 'disabled', reasonCode: upstreamCode(error), error };
            }
            return { status: 'failed', reasonCode: upstreamCode(error) ?? 'PROVIDER_FAILED', error };
        }
        if (integration === null || integration === undefined) {
            return { status: 'disabled', reasonCode: 'NO_INTEGRATION', error: null };
        }
        try {
            validateIntegration(integration, section);
            return { status: 'available', integration };
        } catch (error) {
            return { status: 'invalid', reasonCode: error.code, error };
        }
    }
    async function refresh(options = {}) {
        if (!isRecord(options)) fail('INVALID_ARGUMENT', 'refresh options must be an object');
        const callerSignal = normalizeSignal(options.signal);
        controller?.abort('portable-archive-refresh');
        const nextController = new AbortController();
        controller = nextController;
        const token = ++generation;
        state = 'refreshing';
        records = new Map();
        syncSnapshots();
        const linked = mergeSignals(callerSignal, nextController.signal);
        let outcomes = [];
        try {
            throwIfAborted(linked.signal);
            outcomes = await Promise.all([...providers].map(async ([section, provider]) =>
                [section, await probe(section, provider, linked.signal)]
            ));
            if (token !== generation) fail('ARCHIVE_ABORTED', 'Refresh was superseded');
            throwIfAborted(linked.signal);
            const owners = new Map();
            for (const [expected, record] of outcomes) {
                if (record.status !== 'available') continue;
                const actual = record.integration.section;
                if (owners.has(actual)) {
                    fail('DUPLICATE_SECTION', `Multiple integrations own section: ${actual}`, { section: actual });
                }
                owners.set(actual, expected);
                if (actual !== expected) {
                    fail('SECTION_MISMATCH', `Provider ${expected} returned section ${actual}`,
                        { expectedSection: expected, actualSection: actual });
                }
            }
            const invalid = outcomes.find(([, record]) => record.status === 'invalid');
            if (invalid) throw invalid[1].error;
            records = new Map(outcomes.map(([section, record]) => {
                if (record.status !== 'available') return [section, record];
                return [section, {
                    status: 'available',
                    exportSection: wrapExport(section, record.integration.exportSection, token, nextController.signal),
                    contributor: wrapContributor(section, record.integration.contributor, token, nextController.signal)
                }];
            }));
            state = 'ready';
            syncSnapshots();
        } catch (error) {
            if (token === generation) {
                records = new Map(outcomes);
                state = error?.code === 'ARCHIVE_ABORTED' ? 'stopped' : 'failed';
                syncSnapshots();
            }
            linked.cleanup();
            throw translateFailure(error, 'REFRESH_FAILED', null);
        }
        linked.cleanup();
        return availability;
    }
    async function archiveSectionsProvider(options = {}) {
        if (!isRecord(options)) fail('INVALID_ARGUMENT', 'archive provider options must be an object');
        if (state !== 'ready') fail('WIRING_INACTIVE', 'Portable Archive wiring is not ready', { state });
        const signal = normalizeSignal(options.signal);
        throwIfAborted(signal);
        const include = normalizeInclude(options.include, records);
        const result = {};
        for (const section of include) {
            const record = records.get(section);
            if (!record) fail('MISSING_SECTION', `No provider owns Portable Archive section: ${section}`, { section });
            if (record.status === 'disabled') {
                fail('SECTION_DISABLED', `Portable Archive section is disabled: ${section}`,
                    { section, reasonCode: record.reasonCode }, record.error ?? undefined);
            }
            if (record.status === 'failed') throw translateFailure(record.error, 'SECTION_UNAVAILABLE', section);
            result[section] = await record.exportSection(signal);
        }
        return Object.freeze(result);
    }
    function stop(reason = 'portable-archive-stop') {
        if (state === 'stopped') return false;
        generation += 1;
        controller?.abort(reason);
        controller = null;
        records = new Map();
        state = 'stopped';
        syncSnapshots();
        return true;
    }
    const getContributors = () => contributors;
    const getAvailability = () => availability;
    const ports = Object.freeze({ archiveSectionsProvider,
        contributorsProvider: getContributors, availabilityProvider: getAvailability });
    const api = Object.freeze({ refresh, stop, archiveSectionsProvider, getContributors, getAvailability, ports });
    syncSnapshots();
    lifecycle?.defer(() => stop('portable-archive-lifecycle-dispose'), 'Portable Archive wiring');
    return api;
}
