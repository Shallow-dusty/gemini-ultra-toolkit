const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let createProductionPortableArchive;
let createPortableArchiveOperations;
let createLegacyArchiveProviderBridge;
let createMultiChatExportController;

before(async () => {
    ({ createProductionPortableArchive } = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'app', 'portable_archive_production.js'
    )).href));
    ({ createPortableArchiveOperations } = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'portable_archive', 'archive_operations.js'
    )).href));
    ({ createLegacyArchiveProviderBridge } = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'portable_archive', 'legacy_provider_bridge.js'
    )).href));
    ({ createMultiChatExportController } = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'portable_archive', 'multi_chat_export_controller.js'
    )).href));
});

const SECTIONS = Object.freeze([
    'chats', 'annotations', 'collections', 'recipes', 'insights', 'queue'
]);

function productionFixture() {
    const contributor = () => Object.freeze({
        async snapshot() { return {}; },
        async apply() { return {}; },
        async rollback() { return {}; }
    });
    const sectionOwners = Object.fromEntries(SECTIONS.map(section => {
        const integration = Object.freeze({
            section,
            async exportSection() { return []; },
            contributor: contributor()
        });
        return [section, {
            id: `module-${section}`,
            getPortableArchiveIntegration: () => integration
        }];
    }));
    const defaultModel = {
        id: 'default-model',
        STORAGE_KEY: 'gemini_default_model',
        capability: { get: () => 'pro', set: value => value }
    };
    const uiTweaks = {
        id: 'ui-tweaks',
        STORAGE_KEY: 'gemini_ui_tweaks',
        capability: {
            get: () => ({
                tabTitle: { enabled: false },
                ctrlEnter: { enabled: true },
                inputCounter: { enabled: false },
                chatWidth: { enabled: true, value: 900 },
                sidebarWidth: { enabled: false, value: 280 }
            }),
            set: value => value
        }
    };
    const modules = Object.fromEntries([
        ...Object.values(sectionOwners), defaultModel, uiTweaks
    ].map(module => [module.id, module]));
    const identity = { current: 'user@example.test', inspecting: 'user@example.test' };
    const registry = {
        modules,
        isEnabled: () => true,
        async notifyUserChange(user) { return user; },
        async stageDesiredModules(value) { return value; },
        getDesiredModulesPreference: () => []
    };
    const options = {
        registry,
        storage: {
            get: (_key, fallback) => structuredClone(fallback),
            set() {},
            async flush() {}
        },
        core: {
            getTheme: () => 'glass',
            setTheme() {},
            getCurrentUser: () => identity.current,
            getInspectingUser: () => identity.inspecting,
            getTempUser: () => 'Guest'
        },
        nativeUI: {
            getLocale: () => 'en-US',
            setLocale() {},
            t: (_zh, en) => en
        },
        defaultModel,
        uiTweaks,
        sectionOwners,
        notifications: { show() {} }
    };
    return { options, identity, defaultModel, uiTweaks };
}

function archiveOperations(overrides = {}) {
    return createPortableArchiveOperations({
        limits: undefined,
        cryptoProvider: undefined,
        requireStarted: () => 7,
        assertCurrent: generation => assert.equal(generation, 7),
        getAvailability: undefined,
        getIntegrations: async () => new Map(),
        getSections: async () => ({}),
        getCurrentSections: async () => ({}),
        getSource: async () => ({ app: 'coverage' }),
        now: () => '2026-08-01T00:00:00.000Z',
        filename: () => 'coverage.json',
        download: async () => {},
        ...overrides
    });
}

async function bridgeChats(transcript, provided) {
    const bridge = createLegacyArchiveProviderBridge({ getTranscript: () => transcript });
    bridge.configure({ archiveSectionsProvider: () => ({ chats: provided }) });
    return (await bridge.getSections({ include: ['chats'] })).chats;
}

describe('Portable Archive direct-source coverage gate', () => {
    it('fails closed for every invalid production owner and preference identity shape', () => {
        for (const sectionOwners of [null, 'not-an-object', []]) {
            const { options } = productionFixture();
            assert.throws(
                () => createProductionPortableArchive({ ...options, sectionOwners }),
                /sectionOwners must be an object/
            );
        }

        for (const defaultModel of [
            null,
            { id: 42, STORAGE_KEY: 'model', capability: { get() {}, set() {} } },
            { id: 'model', STORAGE_KEY: 42, capability: { get() {}, set() {} } }
        ]) {
            const { options } = productionFixture();
            assert.throws(
                () => createProductionPortableArchive({ ...options, defaultModel }),
                /legacy module and storage identities/
            );
        }
    });

    it('rejects either unregistered preference owner without evaluating it as live', () => {
        {
            const { options, defaultModel } = productionFixture();
            const registry = {
                ...options.registry,
                modules: { ...options.registry.modules, [defaultModel.id]: {} }
            };
            assert.throws(
                () => createProductionPortableArchive({ ...options, registry }),
                /preference modules must be registered legacy modules/
            );
        }
        {
            const { options, uiTweaks } = productionFixture();
            const registry = {
                ...options.registry,
                modules: { ...options.registry.modules, [uiTweaks.id]: {} }
            };
            assert.throws(
                () => createProductionPortableArchive({ ...options, registry }),
                /preference modules must be registered legacy modules/
            );
        }
        {
            const { options } = productionFixture();
            assert.throws(
                () => createProductionPortableArchive({
                    ...options,
                    registry: { ...options.registry, modules: undefined }
                }),
                /preference modules must be registered legacy modules/
            );
        }
    });

    it('normalizes falsy and whitespace-only production session identities to Guest', async () => {
        const { options, identity } = productionFixture();
        const production = createProductionPortableArchive(options);
        await production.wiring.refresh();
        const contributor = production.wiring.getContributors().preferences;
        const context = { section: 'preferences', plan: {}, actions: [], signal: null };

        identity.current = '';
        identity.inspecting = '';
        assert.deepEqual((await contributor.snapshot(context)).scope, {
            kind: 'session', sessionUserId: 'Guest', targetUserId: 'Guest', readOnly: false
        });

        identity.current = '   ';
        identity.inspecting = '   ';
        assert.deepEqual((await contributor.snapshot(context)).scope, {
            kind: 'session', sessionUserId: 'Guest', targetUserId: 'Guest', readOnly: false
        });
    });

    it('reports availability errors without messages and absent reason records deterministically', async () => {
        const providerFailure = archiveOperations({
            getAvailability: async () => { throw null; }
        });
        const failed = await providerFailure.inspectAvailability();
        assert.equal(failed.every(record => !record.available && record.reason === 'null'), true);

        const missingRecords = archiveOperations({
            getAvailability: async () => ({ sections: {} })
        });
        const missing = await missingRecords.inspectAvailability();
        assert.equal(missing.every(record => (
            !record.available && record.reason === 'PROVIDER_MISSING'
        )), true);
    });

    it('merges provider and transcript metadata independently and skips it when both are absent', async () => {
        const providerOnly = await bridgeChats(
            { chatId: 'same', messages: [{ role: 'user', text: 'visible' }] },
            [{ id: 'same', metadata: { indexed: true }, messages: [] }]
        );
        assert.deepEqual(providerOnly[0].metadata, { indexed: true });

        const transcriptOnly = await bridgeChats(
            {
                chatId: 'same', metadata: { model: 'detected' },
                messages: [{ role: 'user', text: 'visible' }]
            },
            [{ id: 'same', messages: [] }]
        );
        assert.deepEqual(transcriptOnly[0].metadata, { model: 'detected' });

        const neither = await bridgeChats(
            { chatId: 'same', messages: [{ role: 'user', text: 'visible' }] },
            [{ id: 'same', messages: [] }]
        );
        assert.equal(Object.hasOwn(neither[0], 'metadata'), false);
    });

    it('handles empty and unmatched visible transcripts without inventing provider records', async () => {
        assert.deepEqual(await bridgeChats(
            { chatId: '', messages: [] },
            []
        ), []);
        assert.deepEqual(await bridgeChats(
            { chatId: 'visible', messages: [] },
            [{ id: 'indexed', messages: [] }]
        ), [{ id: 'indexed', messages: [] }]);

        const visible = { chatId: 'visible', messages: [{ role: 'user', text: 'draft' }] };
        assert.deepEqual(await bridgeChats(
            visible,
            [{ id: 'indexed', messages: [] }]
        ), [{ id: 'indexed', messages: [] }, visible]);
    });

    it('marks sanitized URLs as fidelity loss and resolves every model metadata source', () => {
        const metadata = {
            chatId: 'one',
            href: 'https://user:pass@example.test/app/one?q=secret#fragment',
            model: 'explicit'
        };
        const adapter = {
            getCurrentConversationMessages: () => [{ role: 'user', text: 'Hello' }],
            getChatTitleText: () => 'One',
            detectModelKey: () => { throw new Error('explicit model must short-circuit detection'); }
        };
        const usage = {
            getSessionMetadata: () => metadata,
            getGeminiAdapter: () => adapter,
            now: () => '2026-08-01T00:00:00.000Z',
            getBulkFilePrefix: () => 'coverage',
            download() {}
        };
        const controller = createMultiChatExportController({
            usage,
            current: {},
            monotonicNow: () => 0
        });

        let capture = controller.capture({ id: 'one', title: 'One' }, usage.now());
        assert.equal(capture.href, 'https://example.test/app/one');
        assert.equal(capture.metadata.model, 'explicit');
        assert.equal(capture.fidelity.losses.some(loss => loss.code === 'URL_METADATA_STRIPPED'), true);

        metadata.href = 'https://example.test/app/one';
        metadata.model = '';
        adapter.detectModelKey = () => 'detected';
        capture = controller.capture({ id: 'one', title: 'One' }, usage.now());
        assert.equal(capture.metadata.model, 'detected');
        assert.equal(capture.fidelity.losses.some(loss => loss.code === 'URL_METADATA_STRIPPED'), false);

        delete adapter.detectModelKey;
        capture = controller.capture({ id: 'one', title: 'One' }, usage.now());
        assert.equal(capture.metadata.model, null);
    });
});
