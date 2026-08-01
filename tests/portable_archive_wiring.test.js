const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let PortableArchiveWiringError;
let createPortableArchiveWiring;

before(async () => {
    ({ PortableArchiveWiringError, createPortableArchiveWiring } = await import(
        pathToFileURL(path.join(__dirname, '..', 'src/app/portable_archive_wiring.js')).href
    ));
});

function codedError(code, message = code) {
    const error = new Error(message);
    if (code !== undefined) error.code = code;
    return error;
}

function expectCode(code) {
    return error => error instanceof PortableArchiveWiringError && error.code === code;
}

function integration(section, options = {}) {
    const call = (method, context) => options[method]
        ? options[method](context)
        : Promise.resolve({ method, section, context });
    const contributor = options.contributor ?? Object.freeze({
        snapshot: context => call('snapshot', context),
        apply: context => call('apply', context),
        rollback: context => call('rollback', context)
    });
    const exportSection = options.exportSection ?? (async () => options.data ?? [{ id: section }]);
    return Object.freeze({ section, exportSection, contributor });
}

describe('Portable Archive production wiring contracts', () => {
    it('validates provider registries, lifecycle ports, and the public app seam', () => {
        assert.throws(() => createPortableArchiveWiring(), expectCode('INVALID_PROVIDERS'));
        assert.throws(
            () => createPortableArchiveWiring({ integrationProviders: [] }),
            expectCode('INVALID_PROVIDERS')
        );
        assert.throws(
            () => createPortableArchiveWiring({ integrationProviders: { unknown: () => null } }),
            expectCode('INVALID_PROVIDER')
        );
        assert.throws(
            () => createPortableArchiveWiring({ integrationProviders: { chats: true } }),
            expectCode('INVALID_PROVIDER')
        );
        const symbolProviders = { chats: () => null };
        symbolProviders[Symbol('extra')] = () => null;
        assert.throws(
            () => createPortableArchiveWiring({ integrationProviders: symbolProviders }),
            expectCode('INVALID_PROVIDER')
        );
        for (const lifecycle of [false, {}, []]) {
            assert.throws(
                () => createPortableArchiveWiring({ integrationProviders: {}, lifecycle }),
                expectCode('INVALID_LIFECYCLE')
            );
        }

        const cleanups = [];
        const wiring = createPortableArchiveWiring({
            integrationProviders: {},
            lifecycle: { defer(cleanup, label) { cleanups.push({ cleanup, label }); } }
        });
        assert.equal(Object.isFrozen(wiring), true);
        assert.equal(Object.isFrozen(wiring.ports), true);
        assert.equal(wiring.ports.archiveSectionsProvider, wiring.archiveSectionsProvider);
        assert.equal(wiring.ports.contributorsProvider, wiring.getContributors);
        assert.equal(wiring.ports.availabilityProvider, wiring.getAvailability);
        assert.equal(cleanups[0].label, 'Portable Archive wiring');
        assert.equal(wiring.getAvailability().state, 'idle');
        assert.equal(wiring.getAvailability().sections.chats.status, 'missing');
        cleanups[0].cleanup();
        assert.equal(wiring.getAvailability().state, 'stopped');
    });

    it('rejects every malformed frozen integration boundary', async () => {
        const methods = Object.freeze({
            snapshot: async () => ({}),
            apply: async () => ({}),
            rollback: async () => ({})
        });
        const cases = [
            [],
            { section: 'chats', exportSection: async () => [], contributor: methods },
            Object.freeze({ section: 'chats', exportSection: async () => [] }),
            Object.freeze({ section: 'bogus', exportSection: async () => [], contributor: methods }),
            Object.freeze({ section: 'chats', exportSection: true, contributor: methods }),
            Object.freeze({ section: 'chats', exportSection: async () => [], contributor: null }),
            Object.freeze({
                section: 'chats', exportSection: async () => [],
                contributor: { snapshot: methods.snapshot, apply: methods.apply, rollback: methods.rollback }
            }),
            Object.freeze({
                section: 'chats', exportSection: async () => [],
                contributor: Object.freeze({ ...methods, extra: true })
            }),
            Object.freeze({
                section: 'chats', exportSection: async () => [],
                contributor: Object.freeze({ ...methods, apply: true })
            }),
            Object.freeze({ ...integration('chats'), extra: true })
        ];
        for (const candidate of cases) {
            const wiring = createPortableArchiveWiring({ integrationProviders: { chats: () => candidate } });
            await assert.rejects(wiring.refresh(), expectCode('INVALID_INTEGRATION'));
            assert.equal(wiring.getAvailability().state, 'failed');
            assert.equal(wiring.getAvailability().sections.chats.status, 'invalid');
            assert.deepEqual(wiring.getContributors(), {});
        }
    });

    it('enforces provider section ownership and uniqueness', async () => {
        const mismatch = createPortableArchiveWiring({
            integrationProviders: { annotations: () => integration('chats') }
        });
        await assert.rejects(mismatch.refresh(), error => (
            expectCode('SECTION_MISMATCH')(error) &&
            error.details.expectedSection === 'annotations' &&
            error.details.actualSection === 'chats'
        ));

        const duplicate = createPortableArchiveWiring({
            integrationProviders: {
                chats: () => integration('chats'),
                annotations: () => integration('chats')
            }
        });
        await assert.rejects(duplicate.refresh(), expectCode('DUPLICATE_SECTION'));
    });

    it('reports missing, disabled, failed, and session-bound provider states without placeholders', async () => {
        const noCode = new Error('provider exploded');
        const wiring = createPortableArchiveWiring({
            integrationProviders: {
                chats: () => integration('chats', { data: [] }),
                annotations: () => null,
                collections: () => undefined,
                recipes: () => { throw codedError('FEATURE_INACTIVE'); },
                preferences: () => { throw codedError('SESSION_CHANGED'); },
                insights: () => { throw noCode; }
            }
        });
        const snapshot = await wiring.refresh();
        assert.equal(snapshot.state, 'ready');
        assert.equal(Object.isFrozen(snapshot), true);
        assert.equal(Object.isFrozen(snapshot.sections), true);
        assert.deepEqual(snapshot.sections.chats, { status: 'available' });
        assert.deepEqual(snapshot.sections.annotations, { status: 'disabled', reasonCode: 'NO_INTEGRATION' });
        assert.deepEqual(snapshot.sections.collections, { status: 'disabled', reasonCode: 'NO_INTEGRATION' });
        assert.deepEqual(snapshot.sections.recipes, { status: 'disabled', reasonCode: 'FEATURE_INACTIVE' });
        assert.deepEqual(snapshot.sections.preferences, { status: 'failed', reasonCode: 'SESSION_CHANGED' });
        assert.deepEqual(snapshot.sections.insights, { status: 'failed', reasonCode: 'PROVIDER_FAILED' });
        assert.deepEqual(snapshot.sections.queue, { status: 'missing', reasonCode: 'PROVIDER_MISSING' });

        const implicit = await wiring.archiveSectionsProvider();
        assert.deepEqual(implicit, { chats: [] });
        assert.equal(Object.isFrozen(implicit), true);
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['annotations'] }),
            error => expectCode('SECTION_DISABLED')(error) && error.details.reasonCode === 'NO_INTEGRATION'
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['recipes'] }),
            error => expectCode('SECTION_DISABLED')(error) && error.cause.code === 'FEATURE_INACTIVE'
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['preferences'] }),
            expectCode('SESSION_CHANGED')
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['insights'] }),
            error => expectCode('SECTION_UNAVAILABLE')(error) &&
                error.details.reasonCode === 'UNCLASSIFIED_FAILURE' && error.cause === noCode
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['queue'] }),
            expectCode('MISSING_SECTION')
        );
    });

    it('returns exactly selected real section values through stable ports', async () => {
        const providerSignals = [];
        const exportSignals = [];
        const chats = [];
        const annotations = { version: 1, records: [] };
        const wiring = createPortableArchiveWiring({
            integrationProviders: {
                chats: context => {
                    providerSignals.push(context);
                    return integration('chats', {
                        exportSection: async ({ signal }) => { exportSignals.push(signal); return chats; }
                    });
                },
                annotations: () => integration('annotations', { data: annotations })
            }
        });
        const ports = wiring.ports;
        await wiring.refresh();
        assert.equal(Object.isFrozen(providerSignals[0]), true);
        assert.equal(providerSignals[0].signal.aborted, false);
        assert.equal(wiring.ports, ports);
        assert.deepEqual(await ports.archiveSectionsProvider({ include: ['annotations'] }), { annotations });
        assert.deepEqual(await ports.archiveSectionsProvider({ include: [] }), {});
        assert.deepEqual(await ports.archiveSectionsProvider(), { chats, annotations });
        assert.equal(exportSignals.every(signal => signal.aborted === false), true);
        assert.deepEqual(Object.keys(ports.contributorsProvider()), ['chats', 'annotations']);
        assert.equal(Object.isFrozen(ports.contributorsProvider()), true);
        assert.equal(Object.isFrozen(ports.contributorsProvider().chats), true);
        assert.equal(ports.availabilityProvider(), wiring.getAvailability());
    });

    it('validates selection, provider options, and AbortSignal inputs', async () => {
        const wiring = createPortableArchiveWiring({
            integrationProviders: { chats: () => integration('chats') }
        });
        await assert.rejects(wiring.archiveSectionsProvider(), expectCode('WIRING_INACTIVE'));
        await assert.rejects(wiring.refresh(false), expectCode('INVALID_ARGUMENT'));
        await assert.rejects(wiring.refresh({ signal: {} }), expectCode('INVALID_ABORT_SIGNAL'));
        await wiring.refresh();
        await assert.rejects(wiring.archiveSectionsProvider(false), expectCode('INVALID_ARGUMENT'));
        await assert.rejects(
            wiring.archiveSectionsProvider({ signal: { aborted: false } }),
            expectCode('INVALID_ABORT_SIGNAL')
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: true }),
            expectCode('INVALID_SELECTION')
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['bogus'] }),
            expectCode('UNKNOWN_SECTION')
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: [42] }),
            expectCode('UNKNOWN_SECTION')
        );
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['chats', 'chats'] }),
            expectCode('DUPLICATE_SECTION')
        );
        const aborted = new AbortController();
        aborted.abort('caller');
        await assert.rejects(
            wiring.archiveSectionsProvider({ include: ['chats'], signal: aborted.signal }),
            expectCode('ARCHIVE_ABORTED')
        );
    });

    it('normalizes export errors and refuses undefined section data', async () => {
        const failures = [
            ['chats', () => undefined, 'INVALID_SECTION_DATA'],
            ['annotations', () => { throw codedError('RESTORE_ABORTED'); }, 'ARCHIVE_ABORTED'],
            ['collections', () => { throw codedError('FEATURE_INACTIVE'); }, 'SECTION_DISABLED'],
            ['recipes', () => { throw codedError('READ_ONLY_SESSION'); }, 'READ_ONLY_SESSION'],
            ['preferences', () => { throw codedError('SESSION_CHANGED'); }, 'SESSION_CHANGED'],
            ['insights', () => { throw codedError('BROKEN'); }, 'SECTION_EXPORT_FAILED'],
            ['queue', () => { throw new Error('plain'); }, 'SECTION_EXPORT_FAILED']
        ];
        const providers = Object.fromEntries(failures.map(([section, exportSection]) => [
            section,
            () => integration(section, { exportSection })
        ]));
        const wiring = createPortableArchiveWiring({ integrationProviders: providers });
        await wiring.refresh();
        for (const [section, , code] of failures) {
            await assert.rejects(wiring.archiveSectionsProvider({ include: [section] }), expectCode(code));
        }
    });

    it('refreshes availability and invalidates old contributor snapshots across module toggles', async () => {
        let active = true;
        let account = 'A';
        let capturedAccount = null;
        const providers = {
            chats() {
                if (!active) throw codedError('SERVICE_INACTIVE');
                capturedAccount = account;
                return integration('chats', {
                    snapshot: async () => {
                        if (account !== capturedAccount) throw codedError('SESSION_CHANGED');
                        return { account };
                    }
                });
            }
        };
        const wiring = createPortableArchiveWiring({ integrationProviders: providers });
        const firstAvailability = await wiring.refresh();
        const firstContributors = wiring.getContributors();
        assert.deepEqual(await firstContributors.chats.snapshot({ section: 'chats' }), { account: 'A' });
        account = 'B';
        await assert.rejects(
            firstContributors.chats.snapshot({ section: 'chats' }),
            expectCode('SESSION_CHANGED')
        );
        active = false;
        const disabledAvailability = await wiring.refresh();
        assert.equal(disabledAvailability.generation > firstAvailability.generation, true);
        assert.equal(disabledAvailability.sections.chats.status, 'disabled');
        assert.deepEqual(wiring.getContributors(), {});
        await assert.rejects(
            firstContributors.chats.snapshot({ section: 'chats' }),
            expectCode('STALE_INTEGRATION')
        );
        active = true;
        await wiring.refresh();
        const current = wiring.getContributors();
        assert.notEqual(current, firstContributors);
        assert.deepEqual(await current.chats.snapshot({ section: 'chats' }), { account: 'B' });
    });

    it('passes merged lifecycle signals through every contributor method and classifies failures', async () => {
        const contexts = [];
        let failure = null;
        const invoke = async context => {
            contexts.push(context);
            if (failure) throw failure;
            return context;
        };
        const wiring = createPortableArchiveWiring({
            integrationProviders: {
                chats: () => integration('chats', { snapshot: invoke, apply: invoke, rollback: invoke })
            }
        });
        await wiring.refresh();
        const contributor = wiring.getContributors().chats;
        const caller = new AbortController();
        for (const method of ['snapshot', 'apply', 'rollback']) {
            const result = await contributor[method]({ section: 'chats', signal: caller.signal });
            assert.equal(result.section, 'chats');
            assert.notEqual(result.signal, caller.signal);
            assert.equal(result.signal.aborted, false);
        }
        assert.equal(contexts.length, 3);
        await contributor.snapshot(null);
        await assert.rejects(contributor.snapshot({ signal: {} }), expectCode('INVALID_ABORT_SIGNAL'));

        for (const [error, code] of [
            [codedError('RESTORE_ABORTED'), 'ARCHIVE_ABORTED'],
            [codedError('NOT_STARTED'), 'SECTION_DISABLED'],
            [codedError('SESSION_BOUNDARY'), 'SESSION_BOUNDARY'],
            [codedError('BROKEN'), 'CONTRIBUTOR_FAILED'],
            [new Error('plain'), 'CONTRIBUTOR_FAILED']
        ]) {
            failure = error;
            await assert.rejects(contributor.apply({ section: 'chats' }), expectCode(code));
        }
    });

    it('aborts in-flight exports and contributors on caller cancellation or refresh', async () => {
        const gates = [];
        const waitForGate = signal => new Promise(resolve => gates.push({ signal, resolve }));
        const wiring = createPortableArchiveWiring({
            integrationProviders: {
                chats: () => integration('chats', {
                    exportSection: async ({ signal }) => { await waitForGate(signal); return []; },
                    snapshot: async context => { await waitForGate(context.signal); return {}; }
                })
            }
        });
        await wiring.refresh();
        const caller = new AbortController();
        const exportPromise = wiring.archiveSectionsProvider({ include: ['chats'], signal: caller.signal });
        await Promise.resolve();
        caller.abort('cancel export');
        gates.shift().resolve();
        await assert.rejects(exportPromise, expectCode('ARCHIVE_ABORTED'));

        const oldContributor = wiring.getContributors().chats;
        const contributorPromise = oldContributor.snapshot({ section: 'chats' });
        await Promise.resolve();
        const refreshPromise = wiring.refresh();
        gates.shift().resolve();
        await assert.rejects(contributorPromise, expectCode('ARCHIVE_ABORTED'));
        await refreshPromise;
        await assert.rejects(
            oldContributor.snapshot({ section: 'chats' }),
            expectCode('STALE_INTEGRATION')
        );
    });

    it('cancels superseded refreshes and exposes idempotent stop cleanup', async () => {
        let release;
        let calls = 0;
        const wiring = createPortableArchiveWiring({
            integrationProviders: {
                chats: async () => {
                    calls += 1;
                    if (calls === 1) await new Promise(resolve => { release = resolve; });
                    return integration('chats');
                }
            }
        });
        const first = wiring.refresh();
        await Promise.resolve();
        const second = wiring.refresh();
        release();
        await assert.rejects(first, expectCode('ARCHIVE_ABORTED'));
        await second;
        const contributor = wiring.getContributors().chats;
        assert.equal(wiring.stop('test-stop'), true);
        assert.equal(wiring.stop('again'), false);
        assert.equal(wiring.getAvailability().state, 'stopped');
        assert.equal(wiring.getAvailability().sections.chats.status, 'stopped');
        assert.deepEqual(wiring.getContributors(), {});
        await assert.rejects(contributor.rollback({ section: 'chats' }), expectCode('STALE_INTEGRATION'));

        const aborted = new AbortController();
        aborted.abort();
        await assert.rejects(wiring.refresh({ signal: aborted.signal }), expectCode('ARCHIVE_ABORTED'));
        assert.equal(wiring.getAvailability().state, 'stopped');
        await wiring.refresh();
        assert.equal(wiring.getAvailability().state, 'ready');
    });
});
