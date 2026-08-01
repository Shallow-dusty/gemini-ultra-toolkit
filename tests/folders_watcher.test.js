const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');

function importSource(relativePath) {
    return import(pathToFileURL(path.join(root, relativePath)).href);
}

function fakeElement({ owned = false, sidebar = false, parentElement = null } = {}) {
    const classes = owned ? ['gf-sidebar-dot'] : [];
    return {
        nodeType: 1,
        id: '',
        classList: classes,
        parentElement,
        closest(selector) {
            if (owned && /primer-owned|gc-|gf-/.test(selector)) return this;
            if (sidebar && /Side Navigation|bard-sidenav|navigation|sidenav-with-history/.test(selector)) return this;
            return parentElement?.closest?.(selector) || null;
        }
    };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('Folders sidebar watcher hardening', () => {
    it('matches only native child-list changes inside the Gemini sidebar', async () => {
        const { GeminiAdapter } = await importSource('src/adapters/gemini.js');
        const sidebarTarget = fakeElement({ sidebar: true });
        const nativeNode = fakeElement({ parentElement: sidebarTarget });
        const ownedNode = fakeElement({ owned: true, parentElement: sidebarTarget });
        const ownedTarget = fakeElement({ owned: true, sidebar: true });

        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation({
            type: 'childList', target: sidebarTarget, addedNodes: [nativeNode], removedNodes: []
        }), true);
        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation({
            type: 'childList', target: sidebarTarget, addedNodes: [ownedNode], removedNodes: []
        }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({
            type: 'childList', target: sidebarTarget, addedNodes: [ownedNode], removedNodes: []
        }), false);
        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation({
            type: 'childList', target: ownedTarget, addedNodes: [nativeNode], removedNodes: []
        }), false);
        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation({
            type: 'attributes', target: sidebarTarget, addedNodes: [nativeNode], removedNodes: []
        }), false);
        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation({
            type: 'childList', target: sidebarTarget, addedNodes: [], removedNodes: []
        }), false);
        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation({
            type: 'childList', target: fakeElement(), addedNodes: [nativeNode], removedNodes: []
        }), false);
    });

    it('coalesces repeated watcher notifications and suppresses callbacks after destroy', async () => {
        const previousObserver = globalThis.MutationObserver;
        const previousDocument = globalThis.document;
        const observers = [];

        class FakeMutationObserver {
            constructor(callback) {
                this.callback = callback;
                this.disconnected = false;
                observers.push(this);
            }
            observe() {}
            disconnect() { this.disconnected = true; }
        }

        globalThis.MutationObserver = FakeMutationObserver;
        globalThis.document = { body: {} };
        try {
            const { DOMWatcher } = await importSource('src/dom_watcher.js');
            let calls = 0;
            DOMWatcher.init();
            DOMWatcher.register('folders-test', {
                match: mutation => mutation.type === 'childList',
                callback: () => { calls++; },
                debounce: 15
            });

            const mutation = { type: 'childList' };
            observers[0].callback([mutation]);
            observers[0].callback([mutation]);
            observers[0].callback([mutation]);
            await sleep(35);
            assert.equal(calls, 1);

            observers[0].callback([mutation]);
            DOMWatcher.destroy();
            await sleep(35);
            assert.equal(calls, 1);
            assert.equal(observers[0].disconnected, true);
        } finally {
            if (previousObserver === undefined) delete globalThis.MutationObserver;
            else globalThis.MutationObserver = previousObserver;
            if (previousDocument === undefined) delete globalThis.document;
            else globalThis.document = previousDocument;
        }
    });

    it('coalesces real controller refresh requests and makes pending work inert after module destroy', async () => {
        const [{ createCollectionsController, COLLECTIONS_SCHEMA }, { createFoldersCompatibilityModule }] = await Promise.all([
            importSource('src/features/collections/index.js'),
            importSource('src/modules/folders.js')
        ]);
        const tasks = new Map();
        let nextTask = 1;
        let scans = 0;
        let stops = 0;
        const snapshot = {
            schema: COLLECTIONS_SCHEMA,
            version: 1,
            sessionId: 'Guest',
            collections: [],
            memberships: [],
            native: {
                notebooks: {
                    available: false,
                    ownership: 'native',
                    officialEntryPolicy: 'preserve',
                    observedAt: '2026-08-01T00:00:00.000Z'
                }
            }
        };
        const service = {
            async start() {},
            async switchSession() {},
            async stop() { stops += 1; },
            async getSnapshot() { return structuredClone(snapshot); },
            async create() {}, async update() {}, async move() {}, async remove() {},
            async setManualMembership() {}, async setManualMemberships() {}, async setNotebooksAvailability() {},
            async exportJson() { return '{}'; }, async importJson() {}, async flush() {}
        };
        const view = {
            root: null,
            mount() { return true; }, unmount() { return true; }, render() {},
            renderSidebar() { return false; }, clearSidebar() {}, ensureStyles() {}, removeStyles() {}
        };
        const adapter = {
            scanSidebarChats() { scans += 1; return []; },
            getSidebarContainer() { return null; },
            matchesSidebarMutation() { return false; },
            openChat() { return false; },
            getNotebooksAvailability() { return false; }
        };
        const observer = { register() {}, unregister() {} };
        const controller = createCollectionsController({
            service, view, adapter, observer, clock: () => '2026-08-01T00:00:00.000Z',
            schedule(callback) {
                const id = nextTask++;
                tasks.set(id, async () => { tasks.delete(id); return callback(); });
                return id;
            },
            cancelSchedule(id) { tasks.delete(id); },
            initialDelay: 20
        });
        const module = createFoldersCompatibilityModule({
            runtimeFactory: () => ({ controller, service, view, adapter }),
            sessionProvider: () => 'Guest',
            logger: {}
        });

        await module.init();
        const baseline = scans;
        module._scheduleSidebarRefresh(15);
        module._scheduleSidebarRefresh(15);
        module._scheduleSidebarRefresh(15);
        assert.equal(tasks.size, 1);
        const current = [...tasks.values()][0];
        await current();
        assert.equal(scans, baseline + 1);

        module._scheduleSidebarRefresh(15);
        const stale = [...tasks.values()][0];
        assert.equal(await module.destroy(), true);
        await stale();
        assert.equal(scans, baseline + 1);
        assert.equal(controller.active, false);
        assert.equal(tasks.size, 0);
        assert.equal(stops, 1);
    });
});
