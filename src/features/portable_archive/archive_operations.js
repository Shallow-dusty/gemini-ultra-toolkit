import { PORTABLE_ARCHIVE_SECTIONS } from './constants.js';
import {
    createPortableArchive,
    parsePortableArchive,
    serializePortableArchive
} from './archive.js';
import { planPortableArchiveRestore } from './restore_plan.js';
import {
    DEFAULT_SELECTION,
    archivePreview,
    fail,
    isPlainObject,
    normalizeSelection
} from './feature_contract.js';

/** Application operations; lifecycle ownership remains in feature.js. */
export function createPortableArchiveOperations(options) {
    const archiveOptions = () => ({
        limits: options.limits,
        cryptoProvider: options.cryptoProvider,
        sensitivePolicy: 'reject'
    });

    async function collectSections(selection, provider) {
        const integrations = await options.getIntegrations();
        const fallback = selection.filter(name => typeof integrations.get(name)?.exportSection !== 'function');
        let provided = {};
        if (fallback.length) {
            provided = await provider({ include: [...fallback] });
            if (!isPlainObject(provided)) {
                fail('INVALID_PROVIDER', 'Archive section provider must return an object');
            }
        }
        const sections = {};
        for (const name of selection) {
            const integration = integrations.get(name);
            const value = typeof integration?.exportSection === 'function'
                ? await integration.exportSection({ signal: null })
                : Object.hasOwn(provided, name) ? provided[name] : undefined;
            if (value === undefined) {
                fail('SECTION_UNAVAILABLE', `Archive section is unavailable: ${name}`, { section: name });
            }
            sections[name] = value;
        }
        return sections;
    }

    async function inspectAvailability() {
        const operationGeneration = options.requireStarted();
        if (typeof options.getAvailability === 'function') {
            let snapshot;
            try {
                snapshot = await options.getAvailability();
                if (snapshot !== null && (!isPlainObject(snapshot) || !isPlainObject(snapshot.sections))) {
                    fail('INVALID_PROVIDER', 'Archive availability provider must return a snapshot');
                }
            } catch (error) {
                options.assertCurrent(operationGeneration);
                return PORTABLE_ARCHIVE_SECTIONS.map(name => ({
                    name,
                    available: false,
                    reason: error?.message || String(error)
                }));
            }
            if (snapshot !== null) {
                options.assertCurrent(operationGeneration);
                return PORTABLE_ARCHIVE_SECTIONS.map(name => {
                    const record = snapshot.sections[name];
                    const available = isPlainObject(record) && record.status === 'available';
                    return {
                        name,
                        available,
                        reason: available ? null : String(record?.reasonCode || record?.status || 'PROVIDER_MISSING')
                    };
                });
            }
        }
        const integrations = await options.getIntegrations();
        const fallback = PORTABLE_ARCHIVE_SECTIONS.filter(
            name => typeof integrations.get(name)?.exportSection !== 'function'
        );
        let provided = {};
        let providerError = null;
        if (fallback.length) {
            try {
                provided = await options.getSections({ include: [...fallback], inspection: true });
                if (!isPlainObject(provided)) {
                    fail('INVALID_PROVIDER', 'Archive section provider must return an object');
                }
            } catch (error) {
                providerError = error;
            }
        }
        options.assertCurrent(operationGeneration);
        return PORTABLE_ARCHIVE_SECTIONS.map(name => {
            if (typeof integrations.get(name)?.exportSection === 'function') {
                return { name, available: true, reason: null };
            }
            if (!providerError && Object.hasOwn(provided, name) && provided[name] !== undefined) {
                return { name, available: true, reason: null };
            }
            return {
                name,
                available: false,
                reason: providerError?.message || String(providerError || `No provider returned ${name}`)
            };
        });
    }

    async function create(selection = DEFAULT_SELECTION) {
        const operationGeneration = options.requireStarted();
        const include = normalizeSelection(selection);
        const [source, sections] = await Promise.all([
            options.getSource(),
            collectSections(include, options.getSections)
        ]);
        options.assertCurrent(operationGeneration);
        const archive = await createPortableArchive({
            createdAt: options.now(),
            source,
            sections,
            include
        }, archiveOptions());
        options.assertCurrent(operationGeneration);
        return archive;
    }

    async function preview(selection = DEFAULT_SELECTION) {
        const operationGeneration = options.requireStarted();
        const archive = await create(selection);
        const serialized = await serializePortableArchive(archive, archiveOptions());
        options.assertCurrent(operationGeneration);
        return { archive, serialized, preview: archivePreview(archive, serialized) };
    }

    async function download(selection = DEFAULT_SELECTION) {
        if (!options.download) fail('DOWNLOAD_UNAVAILABLE', 'Archive download is unavailable');
        const operationGeneration = options.requireStarted();
        const result = await preview(selection);
        options.assertCurrent(operationGeneration);
        await options.download(result.serialized, options.filename(result.archive), 'application/json');
        options.assertCurrent(operationGeneration);
        return result.preview;
    }

    async function planRestoreText(text, strategy = 'skip') {
        const operationGeneration = options.requireStarted();
        const validation = await parsePortableArchive(text, archiveOptions());
        options.assertCurrent(operationGeneration);
        const included = PORTABLE_ARCHIVE_SECTIONS.filter(name => Object.hasOwn(validation.archive.payload, name));
        const existing = await collectSections(included, options.getCurrentSections);
        options.assertCurrent(operationGeneration);
        const plan = await planPortableArchiveRestore(validation.archive, existing, {
            ...archiveOptions(),
            strategy
        });
        options.assertCurrent(operationGeneration);
        return plan;
    }

    return Object.freeze({ create, preview, download, inspectAvailability, planRestoreText });
}
