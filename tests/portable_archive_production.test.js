const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let createProductionPortableArchive;
before(async () => {
    ({ createProductionPortableArchive } = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'app', 'portable_archive_production.js'
    )).href));
});

const UI_TWEAKS = Object.freeze({
    tabTitle: Object.freeze({ enabled: false }),
    ctrlEnter: Object.freeze({ enabled: true }),
    inputCounter: Object.freeze({ enabled: false }),
    chatWidth: Object.freeze({ enabled: true, value: 900 }),
    sidebarWidth: Object.freeze({ enabled: false, value: 280 })
});

function integration(section, exportCalls) {
    const contributor = Object.freeze({
        async snapshot() { return { section, value: [] }; },
        async apply() { return { section, applied: true }; },
        async rollback() { return { section, restored: true }; }
    });
    return Object.freeze({
        section,
        async exportSection({ signal }) {
            exportCalls.push([section, signal]);
            return [{ id: `${section}-1` }];
        },
        contributor
    });
}

function fixture() {
    const exportCalls = [];
    const values = new Map([
        ['gemini_default_model', 'thinking'],
        ['gemini_ui_tweaks', structuredClone(UI_TWEAKS)]
    ]);
    const ids = {
        chats: 'quote-reply', annotations: 'chat-notes', collections: 'folders',
        recipes: 'prompt-vault', insights: 'counter', queue: 'message-queue'
    };
    const sectionOwners = Object.fromEntries(Object.entries(ids).map(([section, id]) => {
        const port = integration(section, exportCalls);
        return [section, { id, getPortableArchiveIntegration: () => port }];
    }));
    let preferredModel = 'pro';
    let uiTweaks = structuredClone(UI_TWEAKS);
    const defaultModel = {
        id: 'default-model', STORAGE_KEY: 'gemini_default_model',
        capability: {
            get: () => preferredModel,
            set(value) {
                preferredModel = value;
                values.set('gemini_default_model', value);
                return value;
            }
        }
    };
    const uiModule = {
        id: 'ui-tweaks', STORAGE_KEY: 'gemini_ui_tweaks',
        capability: {
            get: () => structuredClone(uiTweaks),
            set(value) {
                uiTweaks = structuredClone(value);
                values.set('gemini_ui_tweaks', structuredClone(value));
                return structuredClone(uiTweaks);
            }
        }
    };
    const modules = Object.fromEntries([
        ...Object.values(sectionOwners), defaultModel, uiModule,
        { id: 'export' }, { id: 'batch-delete' }
    ].map(module => [module.id, module]));
    const enabled = new Set(Object.keys(modules));
    const desired = Object.keys(modules);
    let pending = null;
    const registryEvents = [];
    const registry = {
        modules,
        isEnabled: id => enabled.has(id),
        async notifyUserChange(user) { registryEvents.push(['session', user]); return user; },
        async stageDesiredModules(value) {
            pending = [...value];
            registryEvents.push(['stage', [...value]]);
            return { desiredModules: [...value], reloadRequired: true };
        },
        getDesiredModulesPreference: () => [...(pending || desired)]
    };
    let flushes = 0;
    const storage = {
        get: (key, fallback) => values.has(key) ? structuredClone(values.get(key)) : structuredClone(fallback),
        set: (key, value) => values.set(key, structuredClone(value)),
        async flush() { flushes += 1; }
    };
    let theme = 'glass';
    let locale = 'en-US';
    let currentUser = 'user@example.test';
    let inspectingUser = currentUser;
    const core = {
        getTheme: () => theme,
        setTheme: value => { theme = value; },
        getCurrentUser: () => currentUser,
        getInspectingUser: () => inspectingUser,
        getTempUser: () => 'Guest'
    };
    const nativeUI = {
        getLocale: () => locale,
        setLocale: value => { locale = value; },
        t: (zh, en) => `${zh}|${en}`
    };
    const notices = [];
    const notifications = { show: message => notices.push(message) };
    const create = () => createProductionPortableArchive({
        registry, storage, core, nativeUI, defaultModel, uiTweaks: uiModule,
        sectionOwners, notifications
    });
    return {
        create, registry, enabled, registryEvents, storage, core, nativeUI, defaultModel,
        uiModule, sectionOwners, exportCalls, notices,
        get pending() { return pending && [...pending]; },
        get flushes() { return flushes; },
        get theme() { return theme; },
        get locale() { return locale; },
        get preferredModel() { return preferredModel; },
        get uiTweaks() { return structuredClone(uiTweaks); },
        set currentUser(value) { currentUser = value; },
        set inspectingUser(value) { inspectingUser = value; }
    };
}

function restoreContext(snapshot, value) {
    return {
        section: 'preferences',
        plan: {},
        snapshot,
        actions: [{
            section: 'preferences', action: 'replace',
            incomingIdentity: 'preferences', targetIdentity: 'preferences', identityPatch: null,
            value
        }],
        signal: null
    };
}

describe('production Portable Archive assembly', () => {
    it('binds only registered enabled legacy modules and refreshes after session changes', async () => {
        const fx = fixture();
        const production = fx.create();
        assert.deepEqual(Object.keys(production.exportPorts), [
            'archiveSectionsProvider', 'contributorsProvider', 'availabilityProvider'
        ]);
        assert.equal(production.wiring.getAvailability().state, 'idle');
        await production.wiring.refresh();
        assert.equal(production.wiring.getAvailability().sections.queue.status, 'available');
        fx.exportCalls.length = 0;
        const sections = await production.exportPorts.archiveSectionsProvider({ include: ['recipes'] });
        assert.deepEqual(Object.keys(sections), ['recipes']);
        assert.deepEqual(fx.exportCalls.map(([section]) => section), ['recipes']);

        fx.enabled.delete('message-queue');
        await production.wiring.refresh();
        assert.equal(production.wiring.getAvailability().sections.queue.status, 'disabled');
        await assert.rejects(
            production.exportPorts.archiveSectionsProvider({ include: ['queue'] }),
            error => error.code === 'SECTION_DISABLED'
        );
        assert.equal(await production.notifySession('next@example.test'), 'next@example.test');
        assert.deepEqual(fx.registryEvents.at(-1), ['session', 'next@example.test']);
        assert.equal(production.wiring.getAvailability().state, 'ready');
        assert.equal(production.wiring.stop(), true);
    });

    it('exports and restores persisted preferences while staging module ids for the next reload', async () => {
        const fx = fixture();
        fx.enabled.delete('default-model');
        fx.enabled.delete('ui-tweaks');
        const production = fx.create();
        await production.wiring.refresh();
        const exported = (await production.exportPorts.archiveSectionsProvider({
            include: ['preferences']
        })).preferences;
        assert.equal(exported.defaultModel, 'thinking');
        assert.deepEqual(exported.uiTweaks, UI_TWEAKS);
        const contributor = production.exportPorts.contributorsProvider().preferences;
        const base = { section: 'preferences', plan: {}, actions: [], signal: null };
        const snapshot = await contributor.snapshot(base);
        const replacement = {
            ...exported,
            theme: 'paper',
            locale: 'zh-CN',
            defaultModel: 'flash',
            uiTweaks: { ...structuredClone(UI_TWEAKS), tabTitle: { enabled: true } },
            enabledModules: ['export', 'default-model']
        };
        const result = await contributor.apply(restoreContext(snapshot, replacement));
        assert.equal(result.section, 'preferences');
        assert.equal(fx.theme, 'paper');
        assert.equal(fx.locale, 'zh-CN');
        assert.equal(fx.preferredModel, 'flash');
        assert.equal(fx.uiTweaks.tabTitle.enabled, true);
        assert.deepEqual(fx.pending, ['export', 'default-model']);
        assert.equal(fx.enabled.has('message-queue'), true, 'active modules remain unchanged');
        assert.equal(fx.flushes, 1);
        assert.match(fx.notices[0], /下次重载.*next reload/);

        await contributor.rollback({ ...base, snapshot });
        assert.deepEqual(fx.pending, snapshot.preferences.enabledModules);
        assert.equal(fx.theme, snapshot.preferences.theme);
        assert.equal(fx.locale, snapshot.preferences.locale);
        assert.equal(fx.preferredModel, snapshot.preferences.defaultModel);
    });

    it('enforces live session and inspection boundaries for Preferences restore', async () => {
        const fx = fixture();
        const production = fx.create();
        await production.wiring.refresh();
        const contributor = production.wiring.getContributors().preferences;
        const base = { section: 'preferences', plan: {}, actions: [], signal: null };
        const snapshot = await contributor.snapshot(base);
        fx.inspectingUser = 'other@example.test';
        await assert.rejects(
            contributor.apply(restoreContext(snapshot, snapshot.preferences)),
            error => error.code === 'SESSION_BOUNDARY' && error.cause?.code === 'SESSION_BOUNDARY'
        );

        const inspection = await contributor.snapshot(base);
        await assert.rejects(
            contributor.apply(restoreContext(inspection, inspection.preferences)),
            error => error.code === 'READ_ONLY_SESSION'
        );
        fx.currentUser = 'Guest';
        fx.inspectingUser = '';
        const guest = await contributor.snapshot(base);
        assert.deepEqual(guest.scope, {
            kind: 'session', sessionUserId: 'Guest', targetUserId: 'Guest', readOnly: false
        });
    });

    it('rejects incomplete production ports and unregistered module owners', () => {
        assert.throws(() => createProductionPortableArchive(), /registry/);
        const fx = fixture();
        assert.throws(() => createProductionPortableArchive({
            registry: fx.registry, storage: fx.storage, core: fx.core, nativeUI: fx.nativeUI,
            defaultModel: fx.defaultModel, uiTweaks: fx.uiModule,
            sectionOwners: { ...fx.sectionOwners, chats: { ...fx.sectionOwners.chats } },
            notifications: { show() {} }
        }), /registered legacy module/);
        assert.throws(() => createProductionPortableArchive({
            registry: fx.registry, storage: fx.storage, core: fx.core, nativeUI: fx.nativeUI,
            defaultModel: fx.defaultModel, uiTweaks: fx.uiModule,
            sectionOwners: { chats: fx.sectionOwners.chats }, notifications: { show() {} }
        }), /exact production sections/);
    });
});
