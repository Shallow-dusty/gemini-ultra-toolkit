const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let archiveApi;
let featureModule;
let createArchiveExportView;
let createLegacyExportController;
let createUsageExportController;
let createCurrentChatExportController;
let createMultiChatExportController;
let createDefaultExportSessionAdapter;
let assertExportSessionAdapter;
let isPlainObject;
let ExportModule;
let Core;
let NativeUI;
let PanelUI;
let setCurrentUser;

before(async () => {
    const src = path.join(__dirname, '..', 'src');
    archiveApi = await import(pathToFileURL(path.join(src, 'features', 'portable_archive', 'index.js')).href);
    featureModule = await import(pathToFileURL(path.join(src, 'features', 'portable_archive', 'feature.js')).href);
    ({
        createArchiveExportView,
        createLegacyExportController,
        createUsageExportController,
        createCurrentChatExportController,
        createMultiChatExportController,
        createDefaultExportSessionAdapter,
        assertExportSessionAdapter,
        isPlainObject
    } = archiveApi);
    ({ ExportModule } = await import(pathToFileURL(path.join(src, 'modules', 'export.js')).href));
    ({ Core } = await import(pathToFileURL(path.join(src, 'core.js')).href));
    ({ NativeUI } = await import(pathToFileURL(path.join(src, 'native_ui.js')).href));
    NativeUI.setLocale('en');
    ({ PanelUI } = await import(pathToFileURL(path.join(src, 'panel_ui.js')).href));
    ({ setCurrentUser } = await import(pathToFileURL(path.join(src, 'state.js')).href));
});

const CREATED_AT = '2026-08-01T00:00:00.000Z';

class FakeClassList {
    constructor(element) {
        this.element = element;
        this.values = new Set();
    }
    add(...values) { values.forEach(value => this.values.add(value)); this._sync(); }
    remove(...values) { values.forEach(value => this.values.delete(value)); this._sync(); }
    contains(value) { return this.values.has(value); }
    _sync() { this.element._className = [...this.values].join(' '); }
    setFrom(value) {
        this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
        this._sync();
    }
}

class FakeTextNode {
    constructor(text, ownerDocument) {
        this.nodeType = 3;
        this.ownerDocument = ownerDocument;
        this.parentElement = null;
        this.textContent = String(text);
    }
    remove() {
        if (!this.parentElement) return;
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
    }
}

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = tagName.toUpperCase();
        this.nodeType = 1;
        this.ownerDocument = ownerDocument;
        this.parentElement = null;
        this.children = [];
        this.attributes = new Map();
        this.style = { cssText: '', position: '' };
        this.classList = new FakeClassList(this);
        this._className = '';
        this._text = '';
        this.id = '';
        this.type = '';
        this.name = '';
        this.value = '';
        this.checked = false;
        this.disabled = false;
        this.files = [];
        this.onclick = null;
        this.onchange = null;
    }
    set className(value) { this.classList.setFrom(value); }
    get className() { return this._className; }
    set textContent(value) { this._text = String(value ?? ''); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    get firstChild() { return this.children[0] || null; }
    get parentNode() { return this.parentElement; }
    get isConnected() {
        let current = this;
        while (current) {
            if (current === this.ownerDocument.documentElement) return true;
            current = current.parentElement;
        }
        return false;
    }
    appendChild(child) {
        if (child.parentElement) child.remove();
        child.parentElement = this;
        this.children.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    remove() {
        if (!this.parentElement) return;
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
    }
    setAttribute(name, value) {
        const stringValue = String(value);
        this.attributes.set(name, stringValue);
        if (name === 'id') this.id = stringValue;
        if (name === 'class') this.className = stringValue;
    }
    getAttribute(name) {
        if (name === 'id' && this.id) return this.id;
        if (name === 'class' && this.className) return this.className;
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    removeAttribute(name) { this.attributes.delete(name); }
    contains(candidate) {
        if (candidate === this) return true;
        return this.children.some(child => child.nodeType === 1 && child.contains(candidate));
    }
    descendants() {
        return this.children.flatMap(child => child.nodeType === 1 ? [child, ...child.descendants()] : []);
    }
    querySelectorAll(selector) {
        if (selector === '*') return this.descendants();
        const tag = selector.toUpperCase();
        return this.descendants().filter(element => element.tagName === tag);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    async click() {
        return this.onclick?.({ target: this, stopPropagation() {} });
    }
    focus() { this.ownerDocument.activeElement = this; }
}

class FakeDocument {
    constructor() {
        this.documentElement = new FakeElement('html', this);
        this.body = new FakeElement('body', this);
        this.documentElement.appendChild(this.body);
        this.title = 'Fixture title';
        this.activeElement = null;
        this.listeners = [];
    }
    createElement(tagName) { return new FakeElement(tagName, this); }
    createElementNS(_namespace, tagName) { return new FakeElement(tagName, this); }
    createTextNode(text) { return new FakeTextNode(text, this); }
    getElementById(id) {
        return [this.documentElement, ...this.documentElement.descendants()]
            .find(element => element.id === id) || null;
    }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    addEventListener(type, listener, options) { this.listeners.push({ type, listener, options }); }
}

function elementsByTag(root, tagName) {
    return [root, ...root.descendants()].filter(element => element.tagName === tagName.toUpperCase());
}

function elementsByText(root, tagName, text) {
    return elementsByTag(root, tagName).filter(element => element.textContent === text);
}

function expectFeatureCode(code) {
    return error => error instanceof archiveApi.PortableArchiveFeatureError && error.code === code;
}

function createHarness(overrides = {}) {
    const document = overrides.document === undefined ? new FakeDocument() : overrides.document;
    const downloads = [];
    const notifications = [];
    const openedDialogs = [];
    const closedDialogs = [];
    const source = { app: 'Primer++ test', version: '13.0.0', platform: 'fixture' };
    const sections = {
        chats: [{ id: 'chat-1', title: 'Rich chat', messages: [{ role: 'user', text: 'Hello' }], metadata: { model: 'pro' } }],
        annotations: [{ id: 'note-1', body: 'Note' }],
        collections: [{ id: 'folder-1', name: 'Research' }],
        recipes: [{ id: 'recipe-1', name: 'Summarize' }],
        preferences: { locale: 'en' }
    };
    const options = {
        document,
        now: () => CREATED_AT,
        getSource: () => source,
        getSections: () => sections,
        getCurrentSections: () => ({
            chats: [{ id: 'chat-1', title: 'Existing' }],
            annotations: [], collections: [], recipes: [], preferences: {}
        }),
        download: async (content, filename, type) => downloads.push({ content, filename, type }),
        notify: (message, details) => notifications.push({ message, details }),
        translate: (_zh, en) => en,
        openDialog: options => {
            openedDialogs.push(options);
            return { id: options.id, open: true };
        },
        closeDialog: (id, reason) => closedDialogs.push({ id, reason }),
        ...overrides
    };
    return {
        document,
        downloads,
        notifications,
        openedDialogs,
        closedDialogs,
        feature: archiveApi.createPortableArchiveFeature(options),
        source,
        sections
    };
}

function createLegacyControllerHarness(overrides = {}) {
    const downloads = [];
    const metadata = {
        user: 'legacy@example.test',
        chatId: 'current',
        href: 'https://gemini.google.com/app/current',
        origin: 'https://gemini.google.com',
        model: 'pro',
        ...overrides.metadata
    };
    const usage = overrides.usage === undefined ? {
        total: 4,
        totalChatsCreated: 1,
        chats: { current: 4 },
        dailyCounts: { '2026-08-01': { messages: 4, chats: 1 } },
        streaks: { current: 1, best: 2 }
    } : overrides.usage;
    const sessionAdapter = {
        getMetadata: () => metadata,
        getUsageSnapshot: () => usage,
        ...overrides.sessionAdapter
    };
    const geminiAdapter = {
        getCurrentConversationMessages: () => [{ role: 'user', text: 'Hello' }],
        getChatTitleText: () => 'Legacy chat',
        detectModelKey: () => 'flash',
        getRichResponseProbeReport: () => null,
        getInputEditor: () => null,
        ...overrides.geminiAdapter
    };
    const controller = createLegacyExportController({
        sessionAdapter,
        geminiAdapter,
        now: () => CREATED_AT,
        download: (content, filename, type) => downloads.push({ content, filename, type }),
        translate: (zh, en) => NativeUI.t(zh, en),
        notify: message => NativeUI.showToast(message),
        logger: { info: (...args) => console.info(...args), warn: (...args) => console.warn(...args) },
        document: () => globalThis.document,
        scanSidebarChats: (...args) => Core.scanSidebarChats(...args),
        sleep: milliseconds => Core.sleep(milliseconds),
        monotonicNow: () => Date.now(),
        requestRender: () => PanelUI.renderDetailsPane()
    });
    return { controller, downloads, metadata, usage, sessionAdapter, geminiAdapter };
}

describe('Portable Archive feature operations and lifecycle', () => {
    it('validates every injected boundary', () => {
        const valid = { getSource() {}, getSections() {}, now: () => CREATED_AT };
        for (const [options, message] of [
            [{ getSections() {} }, 'getSource'],
            [{ getSource() {} }, 'getSections'],
            [{ getSource() {}, getSections() {} }, 'now'],
            [{ ...valid, getCurrentSections: true }, 'getCurrentSections'],
            [{ ...valid, download: true }, 'download'],
            [{ ...valid, now: true }, 'now'],
            [{ ...valid, filename: true }, 'filename'],
            [{ ...valid, notify: true }, 'notify'],
            [{ ...valid, translate: true }, 'translate'],
            [{ ...valid, openDialog: true }, 'openDialog'],
            [{ ...valid, closeDialog: true }, 'closeDialog']
        ]) {
            assert.throws(() => archiveApi.createPortableArchiveFeature(options), new RegExp(message));
        }
        const cause = new Error('cause');
        const classified = new archiveApi.PortableArchiveFeatureError('TEST', 'test', {}, cause);
        assert.equal(classified.cause, cause);
    });

    it('starts idempotently and creates deterministic selective archives with rich metadata', async () => {
        const harness = createHarness();
        assert.equal(harness.feature.started, false);
        await assert.rejects(harness.feature.create(), expectFeatureCode('NOT_STARTED'));
        assert.equal(harness.feature.start(), harness.feature);
        assert.equal(harness.feature.start(), harness.feature);

        const archive = await harness.feature.create(['chats', 'annotations', 'preferences']);
        assert.deepEqual(Object.keys(archive.payload), ['chats', 'annotations', 'preferences']);
        assert.equal(archive.payload.chats[0].metadata.model, 'pro');
        assert.equal(archive.createdAt, CREATED_AT);
        assert.equal(archive.manifest.totalEntries, 3);
        assert.notEqual(archive.source, harness.source);

        await assert.rejects(harness.feature.create([]), expectFeatureCode('NO_SECTIONS'));
        await assert.rejects(harness.feature.create('chats'), expectFeatureCode('INVALID_SELECTION'));
        await assert.rejects(harness.feature.create(['chats', 'chats']), expectFeatureCode('INVALID_SELECTION'));
        await assert.rejects(harness.feature.create(['unknown']), expectFeatureCode('INVALID_SELECTION'));
    });

    it('previews, serializes and downloads a checksum-addressed archive', async () => {
        const harness = createHarness();
        harness.feature.start();
        const result = await harness.feature.preview(['chats']);
        assert.equal(result.preview.format, archiveApi.PORTABLE_ARCHIVE_FORMAT);
        assert.equal(result.preview.schemaVersion, 1);
        assert.equal(result.preview.createdAt, CREATED_AT);
        assert.equal(result.preview.totalEntries, 1);
        assert.equal(result.preview.sizeBytes, new TextEncoder().encode(result.serialized).length);
        assert.deepEqual(result.preview.sections, [{ name: 'chats', itemCount: 1 }]);
        assert.notEqual(result.preview.source, result.archive.source);

        const preview = await harness.feature.download(['chats']);
        assert.equal(preview.checksum, result.preview.checksum);
        assert.equal(harness.downloads.length, 1);
        assert.match(harness.downloads[0].filename, /^primer-pp-archive-2026-08-01-[a-f0-9]{8}\.json$/);
        assert.equal(harness.downloads[0].type, 'application/json');
        assert.deepEqual(JSON.parse(harness.downloads[0].content), result.archive);
    });

    it('reports missing downloads and invalid section providers', async () => {
        const withoutDownload = createHarness({ download: undefined });
        withoutDownload.feature.start();
        await assert.rejects(withoutDownload.feature.download(), expectFeatureCode('DOWNLOAD_UNAVAILABLE'));

        const invalidProvider = createHarness({ getSections: async () => [] });
        invalidProvider.feature.start();
        await assert.rejects(invalidProvider.feature.create(), expectFeatureCode('INVALID_PROVIDER'));
        const availability = await invalidProvider.feature.inspectAvailability();
        assert.equal(availability.every(section => section.available === false), true);
        assert.match(availability[0].reason, /provider must return an object/i);
    });

    it('uses the production availability snapshot without exporting disabled sections', async () => {
        let sectionReads = 0;
        const harness = createHarness({
            getSections() { sectionReads += 1; throw new Error('must not inspect by export'); },
            availability: () => ({
                generation: 4,
                state: 'ready',
                sections: {
                    chats: { status: 'available' },
                    annotations: { status: 'disabled', reasonCode: 'NOT_STARTED' },
                    collections: { status: 'missing', reasonCode: 'PROVIDER_MISSING' },
                    recipes: { status: 'available' },
                    preferences: { status: 'available' },
                    insights: { status: 'failed', reasonCode: 'BROKEN' },
                    queue: { status: 'unresolved' }
                }
            })
        });
        harness.feature.start();
        const availability = await harness.feature.inspectAvailability();
        assert.equal(sectionReads, 0);
        assert.deepEqual(availability.find(item => item.name === 'chats'), {
            name: 'chats', available: true, reason: null
        });
        assert.deepEqual(availability.find(item => item.name === 'annotations'), {
            name: 'annotations', available: false, reason: 'NOT_STARTED'
        });
        assert.equal(availability.find(item => item.name === 'queue').reason, 'unresolved');

        for (const availabilityProvider of [
            () => [],
            () => ({ sections: [] }),
            () => { throw new Error('availability failed'); }
        ]) {
            const invalid = createHarness({ availability: availabilityProvider });
            invalid.feature.start();
            const result = await invalid.feature.inspectAvailability();
            assert.equal(result.every(item => item.available === false), true);
        }

        const fallback = createHarness({ availability: () => null });
        fallback.feature.start();
        assert.equal((await fallback.feature.inspectAvailability()).some(item => item.available), true);
    });

    it('distinguishes unavailable, throwing, and valid-empty production section providers', async () => {
        for (const getSections of [() => ({}), () => ({ chats: undefined })]) {
            const harness = createHarness({ getSections });
            harness.feature.start();
            await assert.rejects(harness.feature.create(['chats']), expectFeatureCode('SECTION_UNAVAILABLE'));
        }

        const throwing = createHarness({ getSections: () => { throw new Error('provider exploded'); } });
        throwing.feature.start();
        await assert.rejects(throwing.feature.create(['chats']), /provider exploded/);

        const empty = createHarness({ getSections: () => ({ chats: [] }) });
        empty.feature.start();
        assert.deepEqual((await empty.feature.create(['chats'])).payload, { chats: [] });

        const integrated = createHarness({
            getSections: () => ({}),
            integrations: {
                chats: { section: 'chats', async exportSection() { return []; } }
            }
        });
        integrated.feature.start();
        assert.deepEqual((await integrated.feature.create(['chats'])).payload, { chats: [] });
        assert.deepEqual(
            (await integrated.feature.inspectAvailability()).find(section => section.name === 'chats'),
            { name: 'chats', available: true, reason: null }
        );

        const undefinedIntegration = createHarness({
            integrations: {
                chats: { section: 'chats', async exportSection() {} }
            }
        });
        undefinedIntegration.feature.start();
        await assert.rejects(
            undefinedIntegration.feature.create(['chats']),
            expectFeatureCode('SECTION_UNAVAILABLE')
        );
    });

    it('generates restore plans only and never exposes an apply operation', async () => {
        const harness = createHarness();
        harness.feature.start();
        const serialized = (await harness.feature.preview(['chats'])).serialized;
        const plan = await harness.feature.planRestoreText(serialized, 'replace');
        assert.equal(plan.dryRun, true);
        assert.equal(plan.strategy, 'replace');
        assert.deepEqual(plan.summary, { total: 1, insert: 0, skip: 0, replace: 1, rename: 0 });
        assert.equal('apply' in harness.feature, false);
        assert.equal('restore' in harness.feature, false);
    });

    it('cancels in-flight work on a session or stop transition', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const harness = createHarness({ getSections: async () => { await gate; return { chats: [] }; } });
        harness.feature.start();
        const pending = harness.feature.create();
        harness.feature.sessionChanged();
        release();
        await assert.rejects(pending, expectFeatureCode('OPERATION_CANCELLED'));

        let releaseSecond;
        const secondGate = new Promise(resolve => { releaseSecond = resolve; });
        const stopped = createHarness({ getSections: async () => { await secondGate; return { chats: [] }; } });
        stopped.feature.start();
        const secondPending = stopped.feature.create();
        assert.equal(stopped.feature.stop(), true);
        releaseSecond();
        await assert.rejects(secondPending, expectFeatureCode('OPERATION_CANCELLED'));
        assert.equal(stopped.feature.stop(), false);

        let releaseDigest;
        const digestGate = new Promise(resolve => { releaseDigest = resolve; });
        const realCrypto = globalThis.crypto;
        const duringChecksum = createHarness({
            cryptoProvider: {
                subtle: {
                    async digest(...args) {
                        await digestGate;
                        return realCrypto.subtle.digest(...args);
                    }
                }
            }
        });
        duringChecksum.feature.start();
        const checksumPending = duringChecksum.feature.create();
        duringChecksum.feature.sessionChanged();
        releaseDigest();
        await assert.rejects(checksumPending, expectFeatureCode('OPERATION_CANCELLED'));

        let releaseDownload;
        let signalDownload;
        const downloadGate = new Promise(resolve => { releaseDownload = resolve; });
        const downloadEntered = new Promise(resolve => { signalDownload = resolve; });
        const duringDownload = createHarness({ download: async () => { signalDownload(); await downloadGate; } });
        duringDownload.feature.start();
        const downloadPending = duringDownload.feature.download();
        await downloadEntered;
        duringDownload.feature.stop();
        releaseDownload();
        await assert.rejects(downloadPending, expectFeatureCode('OPERATION_CANCELLED'));
    });

    it('covers null-prototype provider objects and exported internal contracts', async () => {
        const nullSections = Object.create(null);
        nullSections.chats = [];
        const harness = createHarness({ getSections: () => nullSections });
        harness.feature.start();
        assert.deepEqual((await harness.feature.create()).payload, { chats: [] });
        assert.equal(featureModule.portableArchiveFeatureInternals.isPlainObject(Object.create(null)), true);
        assert.equal(featureModule.portableArchiveFeatureInternals.isPlainObject(null), false);
        assert.equal(featureModule.portableArchiveFeatureInternals.isPlainObject([]), false);
        assert.deepEqual(featureModule.portableArchiveFeatureInternals.DEFAULT_SELECTION, ['chats']);
        assert.equal(featureModule.portableArchiveFeatureInternals.DIALOG_IDS.preview, 'gc-portable-archive-preview');
    });
});

describe('Portable Archive accessible UI integration', () => {
    it('mounts semantic controls once per slot and remounts without leaks', () => {
        const harness = createHarness();
        const container = harness.document.createElement('div');
        harness.document.body.appendChild(container);
        assert.throws(() => harness.feature.mount(container), expectFeatureCode('NOT_STARTED'));
        harness.feature.start();

        const first = harness.feature.mount(container, { slot: 'details' });
        const repeated = harness.feature.mount(container, { slot: 'details' });
        assert.equal(first, repeated);
        assert.equal(first.root.tagName, 'SECTION');
        assert.equal(first.root.getAttribute('data-primer-archive-controls'), '');
        assert.equal(elementsByTag(first.root, 'fieldset').length, 2);
        assert.equal(
            elementsByTag(first.root, 'label').length,
            archiveApi.PORTABLE_ARCHIVE_SECTIONS.length + 2
        );
        assert.equal(elementsByTag(first.root, 'button').every(button => button.type === 'button'), true);
        assert.equal(first.status.getAttribute('role'), 'status');
        assert.equal(first.status.getAttribute('aria-live'), 'polite');
        assert.equal(first.checkboxes.get('chats').checked, true);
        assert.equal(first.checkboxes.get('annotations').checked, false);

        const nextContainer = harness.document.createElement('div');
        harness.document.body.appendChild(nextContainer);
        const replacement = harness.feature.mount(nextContainer, { slot: 'details' });
        assert.equal(first.root.parentElement, null);
        assert.equal(replacement.root.parentElement, nextContainer);
        assert.equal(first.unmount(), false);
        assert.equal(replacement.unmount(), true);
        assert.equal(replacement.unmount(), false);
    });

    it('opens accessible archive previews and downloads from semantic buttons', async () => {
        const harness = createHarness();
        const container = harness.document.createElement('div');
        harness.document.body.appendChild(container);
        harness.feature.start();
        const controls = harness.feature.mount(container);

        const preview = await controls.previewButton.click();
        assert.equal(preview.totalEntries, 1);
        assert.equal(harness.openedDialogs.length, 1);
        const dialog = harness.openedDialogs[0];
        assert.equal(dialog.id, 'gc-portable-archive-preview');
        assert.equal(dialog.ariaLabel, 'Portable archive preview');
        assert.equal(dialog.contentElement.tagName, 'DIV');
        assert.equal(elementsByText(dialog.contentElement, 'h2', 'Portable archive preview').length, 1);
        assert.equal(elementsByTag(dialog.contentElement, 'dl').length, 1);
        assert.equal(elementsByTag(dialog.contentElement, 'ul')[0].getAttribute('aria-label'), 'Archive contents');
        await elementsByText(dialog.contentElement, 'button', 'Close')[0].click();
        assert.deepEqual(harness.closedDialogs.at(-1), {
            id: 'gc-portable-archive-preview', reason: 'close-button'
        });

        await controls.downloadButton.click();
        assert.equal(harness.downloads.length, 1);
        assert.equal(controls.status.textContent, 'Archive downloaded');
        assert.equal(controls.status.getAttribute('role'), 'status');
        assert.equal(harness.notifications.at(-1).details.error, false);
    });

    it('shows selection and provider failures in an alert instead of hiding them', async () => {
        const harness = createHarness({ getSections: () => ({ chats: [{ id: 'x', password: 'blocked' }] }) });
        const container = harness.document.createElement('div');
        harness.document.body.appendChild(container);
        harness.feature.start();
        const controls = harness.feature.mount(container);
        await controls.previewButton.click();
        assert.equal(controls.status.getAttribute('role'), 'alert');
        assert.match(controls.status.textContent, /Sensitive data/);
        assert.equal(harness.notifications.at(-1).details.error, true);

        controls.checkboxes.get('chats').checked = false;
        await controls.downloadButton.click();
        assert.equal(controls.status.getAttribute('role'), 'alert');
        assert.match(controls.status.textContent, /Select at least one/);
    });

    it('requires a file and renders a read-only restore-plan dialog', async () => {
        const harness = createHarness();
        const container = harness.document.createElement('div');
        harness.document.body.appendChild(container);
        harness.feature.start();
        const serialized = (await harness.feature.preview(['chats'])).serialized;
        const controls = harness.feature.mount(container);

        await controls.planButton.click();
        assert.equal(controls.status.getAttribute('role'), 'alert');
        assert.match(controls.status.textContent, /Choose a portable archive/);

        controls.fileInput.files = [{ async text() { return serialized; } }];
        await controls.planButton.click();
        assert.match(harness.openedDialogs.at(-1).contentElement.textContent, /No changes to apply/);
        controls.strategy.value = 'rename';
        const plan = await controls.planButton.click();
        assert.equal(plan.dryRun, true);
        assert.equal(plan.strategy, 'rename');
        const dialog = harness.openedDialogs.at(-1);
        assert.equal(dialog.id, 'gc-portable-archive-restore-plan');
        assert.equal(elementsByText(dialog.contentElement, 'p', 'This dry run does not write or delete any data.').length, 1);
        assert.equal(elementsByTag(dialog.contentElement, 'ul')[0].getAttribute('aria-label'), 'Section plan');
        await elementsByText(dialog.contentElement, 'button', 'Close')[0].click();
        assert.deepEqual(harness.closedDialogs.at(-1), {
            id: 'gc-portable-archive-restore-plan', reason: 'close-button'
        });

        controls.fileInput.files = [{ async text() { throw undefined; } }];
        assert.equal(await controls.planButton.click(), null);
        assert.equal(controls.status.textContent, 'undefined');
        assert.equal(harness.notifications.at(-1).details.code, null);
    });

    it('requires strong confirmation, applies real contributors once, and renders progress journals', async () => {
        const calls = [];
        const contributor = {
            async snapshot(context) { calls.push(`snapshot:${context.section}`); return { before: true }; },
            async apply(context) { calls.push(`apply:${context.actions.length}`); return { applied: context.actions.length }; },
            async rollback() { calls.push('rollback'); return { restored: true }; }
        };
        const harness = createHarness({ contributors: { chats: contributor } });
        const container = harness.document.createElement('div');
        harness.document.body.appendChild(container);
        harness.feature.start();
        const serialized = (await harness.feature.preview(['chats'])).serialized;
        const controls = harness.feature.mount(container);
        controls.fileInput.files = [{ async text() { return serialized; } }];
        controls.strategy.value = 'replace';
        await controls.planButton.click();

        const dialog = harness.openedDialogs.at(-1).contentElement;
        const apply = elementsByText(dialog, 'button', 'Apply restore')[0];
        const confirmation = elementsByTag(dialog, 'input').find(input => input.type === 'text');
        assert.equal(apply.disabled, true);
        confirmation.value = 'restore';
        confirmation.oninput();
        assert.equal(apply.disabled, true);
        confirmation.value = 'RESTORE';
        confirmation.oninput();
        assert.equal(apply.disabled, false);

        const result = await apply.click();
        assert.equal(result.status, 'completed');
        assert.deepEqual(calls, ['snapshot:chats', 'apply:1']);
        assert.match(dialog.textContent, /Restore completed/);
        assert.match(dialog.textContent, /Result: completed/);
        assert.equal(elementsByTag(dialog, 'ol')[0].getAttribute('aria-label'), 'Restore journal');
        assert.ok(elementsByTag(dialog, 'ol')[0].children.length >= 4);
        assert.equal(apply.disabled, true);
        assert.equal(await apply.click(), null);
        assert.deepEqual(calls, ['snapshot:chats', 'apply:1']);
    });

    it('renders minimal external executor results and contains non-Error failures', async () => {
        const external = createHarness({
            executor: {
                sections: ['chats'],
                async execute() {
                    return {
                        status: 'external-complete',
                        failure: { message: 'external failure' },
                        rollbackErrors: [{ section: 'chats', message: 'external rollback' }]
                    };
                }
            }
        });
        const externalContainer = external.document.createElement('div');
        external.document.body.appendChild(externalContainer);
        external.feature.start();
        assert.equal(external.feature.restoreRunning, false);
        const externalText = (await external.feature.preview(['chats'])).serialized;
        const externalControls = external.feature.mount(externalContainer);
        externalControls.fileInput.files = [{ async text() { return externalText; } }];
        externalControls.strategy.value = 'replace';
        await externalControls.planButton.click();
        const externalDialog = external.openedDialogs.at(-1).contentElement;
        const resultContainer = elementsByTag(externalDialog, 'div')
            .find(element => element.getAttribute('aria-live') === 'polite');
        resultContainer.replaceChildren = function replaceChildren() { this.textContent = ''; };
        const externalConfirmation = elementsByTag(externalDialog, 'input').find(input => input.type === 'text');
        externalConfirmation.value = 'RESTORE';
        externalConfirmation.oninput();
        assert.equal((await elementsByText(externalDialog, 'button', 'Apply restore')[0].click()).status, 'external-complete');
        assert.match(externalDialog.textContent, /Result: external-complete/);
        assert.match(externalDialog.textContent, /Failure \[CONTRIBUTOR_FAILURE\]: external failure/);
        assert.match(externalDialog.textContent, /chats \[CONTRIBUTOR_FAILURE\]: external rollback/);

        const failing = createHarness({
            executor: {
                sections: ['chats'],
                async execute() { throw undefined; }
            }
        });
        const failingContainer = failing.document.createElement('div');
        failing.document.body.appendChild(failingContainer);
        failing.feature.start();
        const failingText = (await failing.feature.preview(['chats'])).serialized;
        const failingControls = failing.feature.mount(failingContainer);
        failingControls.fileInput.files = [{ async text() { return failingText; } }];
        failingControls.strategy.value = 'replace';
        await failingControls.planButton.click();
        const failingDialog = failing.openedDialogs.at(-1).contentElement;
        const failingConfirmation = elementsByTag(failingDialog, 'input').find(input => input.type === 'text');
        failingConfirmation.value = 'RESTORE';
        failingConfirmation.oninput();
        assert.equal(await elementsByText(failingDialog, 'button', 'Apply restore')[0].click(), null);
        assert.match(failingDialog.textContent, /undefined/);

        const resultFailure = new Error('execution failed');
        Object.defineProperty(resultFailure, 'result', {
            get() { throw new Error('result unavailable'); }
        });
        const exceptional = createHarness({
            executor: {
                sections: ['chats'],
                async execute() { throw resultFailure; }
            }
        });
        const exceptionalContainer = exceptional.document.createElement('div');
        exceptional.document.body.appendChild(exceptionalContainer);
        exceptional.feature.start();
        const exceptionalText = (await exceptional.feature.preview(['chats'])).serialized;
        const exceptionalControls = exceptional.feature.mount(exceptionalContainer);
        exceptionalControls.fileInput.files = [{ async text() { return exceptionalText; } }];
        exceptionalControls.strategy.value = 'replace';
        await exceptionalControls.planButton.click();
        const exceptionalDialog = exceptional.openedDialogs.at(-1).contentElement;
        const exceptionalConfirmation = elementsByTag(exceptionalDialog, 'input').find(input => input.type === 'text');
        exceptionalConfirmation.value = 'RESTORE';
        exceptionalConfirmation.oninput();
        await assert.rejects(
            elementsByText(exceptionalDialog, 'button', 'Apply restore')[0].click(),
            /result unavailable/
        );
        assert.equal(elementsByText(exceptionalDialog, 'button', 'Close')[0].disabled, false);
    });

    it('reports integration availability failures during mount readiness', async () => {
        for (const [failure, message] of [
            [new Error('integration resolver failed'), 'integration resolver failed'],
            [undefined, 'undefined']
        ]) {
            const harness = createHarness({
                integrations: async () => { throw failure; }
            });
            const container = harness.document.createElement('div');
            harness.document.body.appendChild(container);
            harness.feature.start();
            const controls = harness.feature.mount(container);
            assert.deepEqual(await controls.ready, []);
            assert.equal(controls.status.getAttribute('role'), 'alert');
            assert.equal(controls.status.textContent, message);
        }
    });

    it('shows rollback failures and lets Cancel abort an active restore without retry', async () => {
        const broken = {
            async snapshot() { return { before: true }; },
            async apply() { throw Object.assign(new Error('apply failed'), { code: 'APPLY_FAILED' }); },
            async rollback() { throw new Error('rollback failed'); }
        };
        const failed = createHarness({ contributors: { chats: broken } });
        const failedContainer = failed.document.createElement('div');
        failed.document.body.appendChild(failedContainer);
        failed.feature.start();
        const failedText = (await failed.feature.preview(['chats'])).serialized;
        const failedControls = failed.feature.mount(failedContainer);
        failedControls.fileInput.files = [{ async text() { return failedText; } }];
        failedControls.strategy.value = 'replace';
        await failedControls.planButton.click();
        const failedDialog = failed.openedDialogs.at(-1).contentElement;
        const failedConfirmation = elementsByTag(failedDialog, 'input').find(input => input.type === 'text');
        failedConfirmation.value = 'RESTORE';
        failedConfirmation.oninput();
        assert.equal(await elementsByText(failedDialog, 'button', 'Apply restore')[0].click(), null);
        assert.match(failedDialog.textContent, /Result: rollback-failed/);
        assert.match(failedDialog.textContent, /Failure \[APPLY_FAILED\]: apply failed/);
        assert.match(failedDialog.textContent, /chats \[CONTRIBUTOR_FAILURE\]: rollback failed/);
        assert.equal(elementsByTag(failedDialog, 'ul').some(list => list.getAttribute('aria-label') === 'Rollback failures'), true);

        const inverseCodes = createHarness({ contributors: { chats: {
            async snapshot() { return { before: true }; },
            async apply() { throw new Error('plain apply failure'); },
            async rollback() {
                throw Object.assign(new Error('coded rollback failure'), { code: 'ROLLBACK_CODED' });
            }
        } } });
        const inverseContainer = inverseCodes.document.createElement('div');
        inverseCodes.document.body.appendChild(inverseContainer);
        inverseCodes.feature.start();
        const inverseText = (await inverseCodes.feature.preview(['chats'])).serialized;
        const inverseControls = inverseCodes.feature.mount(inverseContainer);
        inverseControls.fileInput.files = [{ async text() { return inverseText; } }];
        inverseControls.strategy.value = 'replace';
        await inverseControls.planButton.click();
        const inverseDialog = inverseCodes.openedDialogs.at(-1).contentElement;
        const inverseConfirmation = elementsByTag(inverseDialog, 'input').find(input => input.type === 'text');
        inverseConfirmation.value = 'RESTORE';
        inverseConfirmation.oninput();
        assert.equal(await elementsByText(inverseDialog, 'button', 'Apply restore')[0].click(), null);
        assert.match(inverseDialog.textContent, /Failure \[CONTRIBUTOR_FAILURE\]: plain apply failure/);
        assert.match(inverseDialog.textContent, /chats \[ROLLBACK_CODED\]: coded rollback failure/);

        let rollbackCount = 0;
        let markApplyEntered;
        const applyEntered = new Promise(resolve => { markApplyEntered = resolve; });
        const cancellable = {
            async snapshot() { return { before: true }; },
            async apply(context) {
                markApplyEntered();
                await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true }));
                throw Object.assign(new Error('cancelled'), { code: 'RESTORE_ABORTED' });
            },
            async rollback() { rollbackCount += 1; return { restored: true }; }
        };
        const cancelled = createHarness({ contributors: { chats: cancellable } });
        const cancelledContainer = cancelled.document.createElement('div');
        cancelled.document.body.appendChild(cancelledContainer);
        cancelled.feature.start();
        const cancelledText = (await cancelled.feature.preview(['chats'])).serialized;
        const cancelledControls = cancelled.feature.mount(cancelledContainer);
        cancelledControls.fileInput.files = [{ async text() { return cancelledText; } }];
        cancelledControls.strategy.value = 'replace';
        await cancelledControls.planButton.click();
        const cancelledDialog = cancelled.openedDialogs.at(-1).contentElement;
        const cancelledConfirmation = elementsByTag(cancelledDialog, 'input').find(input => input.type === 'text');
        cancelledConfirmation.value = 'RESTORE';
        cancelledConfirmation.oninput();
        const pending = elementsByText(cancelledDialog, 'button', 'Apply restore')[0].click();
        await applyEntered;
        assert.equal(await elementsByText(cancelledDialog, 'button', 'Cancel restore')[0].click(), true);
        assert.equal(await pending, null);
        assert.equal(rollbackCount, 1);
        assert.match(cancelledDialog.textContent, /Result: aborted/);
        assert.equal(cancelled.feature.cancelRestore(), false);
    });

    it('works headlessly without a dialog adapter and reports missing DOM only for rendered previews', async () => {
        const headless = createHarness({ document: null, openDialog: undefined, closeDialog: undefined });
        headless.feature.start();
        assert.equal((await headless.feature.preview()).preview.totalEntries, 1);
        await assert.rejects(headless.feature.showPreview(), expectFeatureCode('DOM_UNAVAILABLE'));
        await assert.rejects(headless.feature.showRestorePlan((await headless.feature.preview()).serialized), expectFeatureCode('DOM_UNAVAILABLE'));

        const documentOnly = createHarness({ openDialog: undefined, closeDialog: undefined });
        documentOnly.feature.start();
        assert.equal((await documentOnly.feature.showPreview()).totalEntries, 1);
    });

    it('updates mounted status and closes both dialogs on session change and stop', () => {
        const harness = createHarness();
        const container = harness.document.createElement('div');
        harness.document.body.appendChild(container);
        harness.feature.start();
        const controls = harness.feature.mount(container);
        harness.feature.sessionChanged();
        assert.equal(controls.status.textContent, 'Session changed');
        assert.equal(harness.closedDialogs.length, 2);
        harness.feature.stop();
        assert.equal(controls.root.parentElement, null);
        assert.equal(harness.closedDialogs.length, 4);

        const noCloser = createHarness({ closeDialog: undefined });
        noCloser.feature.start();
        noCloser.feature.sessionChanged();
        assert.equal(noCloser.closedDialogs.length, 0);
    });

    it('rejects invalid mount containers and invalid default selections', () => {
        const harness = createHarness();
        harness.feature.start();
        assert.throws(() => harness.feature.mount({}), expectFeatureCode('DOM_UNAVAILABLE'));
        const container = harness.document.createElement('div');
        assert.throws(
            () => harness.feature.mount(container, { defaultSelection: [] }),
            expectFeatureCode('NO_SECTIONS')
        );
    });

    it('executes default locale, notifier and document resolution branches', async () => {
        const document = new FakeDocument();
        global.document = document;
        const feature = archiveApi.createPortableArchiveFeature({
            getSource: () => ({ app: 'defaults' }),
            getSections: () => ({ chats: [] }),
            now: () => CREATED_AT,
            download: async () => {}
        });
        feature.start();
        const ownerContainer = document.createElement('div');
        document.body.appendChild(ownerContainer);
        const ownerMount = feature.mount(ownerContainer, { slot: 'owner' });
        await ownerMount.downloadButton.click();
        assert.match(ownerMount.status.textContent, /Archive downloaded/);

        const globalContainer = new FakeElement('div', null);
        const globalMount = feature.mount(globalContainer, { slot: 'global' });
        assert.equal(globalMount.root.ownerDocument, document);

        const errorFeature = archiveApi.createPortableArchiveFeature({
            document,
            getSource: () => ({ app: 'errors' }),
            getSections: () => { throw 'plain failure'; },
            now: () => CREATED_AT
        });
        errorFeature.start();
        const errorContainer = document.createElement('div');
        document.body.appendChild(errorContainer);
        const errorMount = errorFeature.mount(errorContainer);
        await errorMount.previewButton.click();
        assert.equal(errorMount.status.textContent, 'plain failure');

        const errorObject = archiveApi.createPortableArchiveFeature({
            document,
            getSource: () => ({ app: 'errors' }),
            getSections: () => { throw new Error('ordinary failure'); },
            now: () => CREATED_AT
        });
        errorObject.start();
        const objectContainer = document.createElement('div');
        document.body.appendChild(objectContainer);
        const objectMount = errorObject.mount(objectContainer);
        await objectMount.previewButton.click();
        assert.equal(objectMount.status.textContent, 'ordinary failure');
    });
});

describe('legacy Export to Archive compatibility bridge', () => {
    function configuredExport(document, overrides = {}) {
        const downloads = [];
        const toasts = [];
        const usage = {
            total: 7,
            totalChatsCreated: 2,
            chats: { c1: 4 },
            dailyCounts: { '2026-08-01': { messages: 7, chats: 2, byModel: { pro: 7 } } },
            streaks: { current: 1, best: 3 }
        };
        const sessionAdapter = {
            getMetadata: () => ({
                user: 'archive-fixture@example.test',
                chatId: 'chat-1',
                href: 'https://gemini.google.com/app/chat-1',
                origin: 'https://gemini.google.com',
                locale: 'en-US',
                platform: 'userscript',
                model: 'pro'
            }),
            getUsageSnapshot: () => usage,
            ...overrides.sessionAdapter
        };
        const geminiAdapter = {
            getCurrentConversationMessages: () => [
                { id: 'm1', role: 'user', text: 'Hello' },
                { id: 'm2', role: 'model', text: 'Hi' }
            ],
            getChatTitleText: () => 'Fixture chat',
            getRichResponseProbeReport: () => ({ hasRichContent: true, codeBlockCount: 1 }),
            detectModelKey: () => 'flash',
            getInputEditor: () => null,
            ...overrides.geminiAdapter
        };
        ExportModule.destroy();
        ExportModule.configure({
            sessionAdapter,
            geminiAdapter,
            archiveSectionsProvider: overrides.archiveSectionsProvider || (() => ({
                annotations: [{ id: 'note-1', body: 'Note' }],
                collections: [], recipes: [], preferences: { locale: 'en' }
            })),
            now: () => CREATED_AT
        });
        ExportModule._download = (content, filename, type) => downloads.push({ content, filename, type });
        const originalToast = NativeUI.showToast;
        NativeUI.showToast = message => toasts.push(message);
        ExportModule.init();
        return { downloads, toasts, usage, sessionAdapter, geminiAdapter, restoreToast: () => { NativeUI.showToast = originalToast; } };
    }

    it('removes the Counter singleton import and retains the legacy public format surface', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'export.js'), 'utf8');
        assert.doesNotMatch(source, /CounterModule|from ['"]\.\/counter\.js['"]/);
        for (const method of [
            'exportJSON', 'doExportCSV', 'doExportMarkdown',
            'exportCurrentChatJSON', 'exportCurrentChatCSV', 'exportCurrentChatMarkdown',
            'exportCurrentChatText', 'exportCurrentChatHTML', 'exportCurrentChatDOCX',
            'exportSelectedChatsJSON', 'exportSelectedChatsCSV', 'exportSelectedChatsMarkdown',
            'exportSelectedChatsText', 'exportSelectedChatsHTML', 'exportSelectedChatsDOCX'
        ]) {
            assert.equal(typeof ExportModule[method], 'function', method);
        }
        assert.equal(ExportModule.id, 'export');
    });

    it('executes every production Export facade port through the direct ESM module', async () => {
        const document = new FakeDocument();
        global.document = document;
        const source = pathToFileURL(path.join(__dirname, '..', 'src', 'modules', 'export.js')).href;
        const { ExportModule: defaults } = await import(`${source}?facade-defaults=${Date.now()}`);
        const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
        const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        const originalScan = Core.scanSidebarChats;
        const originalSleep = Core.sleep;
        const originalHeader = NativeUI.getChatHeader;
        const originalDialog = NativeUI.openDialog;
        const originalCloseDialog = NativeUI.closeDialog;
        const originalComputedStyle = global.getComputedStyle;
        const originalRender = PanelUI.renderDetailsPane;
        const row = {
            dispatchEvent() {},
            click() {}
        };
        const chat = { id: 'chat-1', title: 'Fixture chat', href: '/app/chat-1', element: row };
        let tick = 0;
        Object.defineProperty(globalThis, 'performance', {
            configurable: true,
            value: { now: () => { tick += 250; return tick; } }
        });
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: { language: 'en-US' }
        });
        Core.scanSidebarChats = () => [chat];
        Core.sleep = async () => {};
        global.getComputedStyle = () => ({ position: 'static' });
        const headerParent = document.createElement('div');
        const header = document.createElement('div');
        headerParent.appendChild(header);
        document.body.appendChild(headerParent);
        NativeUI.getChatHeader = () => header;
        const opened = [];
        NativeUI.openDialog = options => {
            opened.push(options);
            return { id: options.id, open: true, close() { this.open = false; return true; } };
        };
        NativeUI.closeDialog = () => true;
        let renders = 0;
        PanelUI.renderDetailsPane = () => { renders += 1; };

        let harness;
        try {
            const defaultTranscript = defaults._getCurrentTranscript();
            assert.equal(defaultTranscript.title, 'Fixture title');
            assert.match(defaultTranscript.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
            assert.match(defaults._now(), /^\d{4}-\d{2}-\d{2}T/);
            Object.defineProperty(globalThis, 'performance', { configurable: true, value: null });
            assert.equal(await defaults._waitForChatReady('missing', 0), false);
            defaults.destroy();

            Object.defineProperty(globalThis, 'performance', {
                configurable: true,
                value: { now: () => { tick += 250; return tick; } }
            });
            harness = configuredExport(document);
            assert.equal(ExportModule._getUsageSnapshot(), harness.usage);
            assert.equal(ExportModule._getGeminiAdapter(), harness.geminiAdapter);
            assert.equal(ExportModule.removeNativeUI(), undefined);
            ExportModule.injectNativeUI();
            const nativeButton = document.getElementById('gc-export-native');
            ExportModule._toggleExportMenu(nativeButton);
            ExportModule._toggleExportMenu(nativeButton);

            const details = document.createElement('div');
            document.body.appendChild(details);
            ExportModule.renderToDetailsPane(details);
            const refresh = elementsByText(details, 'button', 'Refresh')[0];
            await refresh.click();
            assert.ok(renders > 0);
            const settings = document.createElement('div');
            ExportModule.renderExportButtons(settings);
            assert.match(ExportModule.getOnboarding().en.features, /archive/i);
            const panelButton = ExportModule._panelButton('Covered', () => {});
            assert.equal(ExportModule._buttonRow([panelButton]).children[0], panelButton);

            assert.match(ExportModule._getFilePrefix(), /^primer-pp-archive-fixture-/);
            assert.match(ExportModule._getChatFilePrefix(), /chat-1$/);
            assert.match(ExportModule._getBulkFilePrefix(), /selected-chats$/);
            assert.equal(ExportModule._cloneChatMeta(chat).id, 'chat-1');
            ExportModule._rememberBulkChat(chat);
            ExportModule._toggleBulkChat(chat);
            assert.deepEqual(ExportModule._getSelectedBulkChats().map(item => item.id), ['chat-1']);
            assert.equal(ExportModule._resolveBulkChatForNavigation(chat).id, 'chat-1');
            assert.equal(ExportModule._absoluteChatHref(chat), 'https://gemini.google.com/app/chat-1');
            assert.equal(await ExportModule._waitForChatReady('chat-1', 1000), true);
            await ExportModule._navigateToBulkChat(chat);
            assert.equal(ExportModule._getCurrentChatReference().id, 'chat-1');
            await ExportModule._restoreOriginalChat(chat);
            assert.equal(ExportModule._captureBulkTranscript(chat, CREATED_AT).chatId, 'chat-1');
            assert.equal(ExportModule._failedBulkTranscript(chat, CREATED_AT, 'failed').status, 'failed');

            assert.equal(ExportModule._getCurrentTranscript().chatId, 'chat-1');
            assert.equal(ExportModule._insertTextIntoEditor('draft'), false);
            assert.equal(ExportModule._insertCurrentTranscriptPacket(), undefined);
            ExportModule._downloadCurrentTranscript('json');
            assert.equal((await ExportModule._collectSelectedTranscripts()).chats.length, 1);
            await ExportModule._downloadSelectedTranscripts('json');
            await ExportModule._insertSelectedTranscriptPacket();
            for (const action of [
                'exportSelectedChatsJSON', 'exportSelectedChatsCSV', 'exportSelectedChatsMarkdown',
                'exportSelectedChatsText', 'exportSelectedChatsHTML', 'exportSelectedChatsDOCX'
            ]) await ExportModule[action]();

            const portable = await ExportModule.createPortableArchive(['chats']);
            await ExportModule.previewPortableArchive(['chats']);
            await ExportModule.downloadPortableArchive(['chats']);
            await assert.rejects(ExportModule.planPortableArchiveRestore('{}', 'skip'));
            assert.equal(portable.payload.chats.length, 1);
            assert.ok(opened.length > 0);

            const directDownload = ExportModule._download;
            directDownload('direct', 'direct.txt', 'text/plain');
            assert.equal(ExportModule._sessionAdapter, harness.sessionAdapter);
            assert.equal(ExportModule._geminiAdapter, harness.geminiAdapter);
            assert.equal(typeof ExportModule._archiveSectionsProvider, 'function');
            assert.equal(ExportModule._contributorsProvider, null);
            assert.equal(ExportModule._availabilityProvider, null);
            assert.ok(ExportModule._archiveFeature);
            const archiveControls = document.createElement('div');
            document.body.appendChild(archiveControls);
            const archiveMount = ExportModule._archiveFeature.mount(archiveControls, {
                defaultSelection: ['chats']
            });
            await archiveMount.ready;
            await archiveMount.previewButton.click();
            assert.match(harness.toasts.at(-1), /archive preview/i);
            assert.equal(archiveMount.unmount(), true);
            assert.equal(typeof ExportModule._now, 'function');
            assert.ok(ExportModule._bulkSelected instanceof Set);
            assert.equal(typeof ExportModule._bulkSelectedMeta, 'object');
            ExportModule._bulkExporting = true;
            assert.equal(ExportModule._bulkExporting, true);
            ExportModule._bulkCancelRequested = true;
            assert.equal(ExportModule._bulkCancelRequested, true);
            ExportModule._bulkProgress = { current: 1, total: 1, title: 'Fixture' };
            assert.equal(ExportModule._bulkProgress.title, 'Fixture');
            ExportModule._bulkExporting = false;
            ExportModule._bulkCancelRequested = false;

            const failingDownload = ExportModule._download;
            ExportModule._download = () => { throw new Error('menu failure'); };
            ExportModule._toggleExportMenu(nativeButton);
            await elementsByTag(document.getElementById('gc-export-menu'), 'button')[0].click();
            await Promise.resolve();
            ExportModule._download = failingDownload;
            assert.equal(await ExportModule._runArchiveAction(() => { throw 'plain failure'; }), null);

            const fallbackAdapter = {
                getMetadata: () => ({ chatId: 'chat-1' }),
                getUsageSnapshot: () => harness.usage
            };
            Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: '' } });
            ExportModule.configure({ sessionAdapter: fallbackAdapter, geminiAdapter: harness.geminiAdapter });
            assert.deepEqual(ExportModule._getArchiveSource(), {
                app: 'Primer++ for Gemini', version: '13.0', platform: 'gemini-web',
                locale: 'en', origin: 'https://gemini.google.com', capture: 'visible-session'
            });
            assert.match(ExportModule._now(), /^\d{4}-\d{2}-\d{2}T/);
            ExportModule._clearBulkSelection();
            assert.deepEqual(ExportModule._getSelectedBulkChats(), []);
        } finally {
            defaults.destroy();
            ExportModule.destroy();
            harness?.restoreToast();
            Core.scanSidebarChats = originalScan;
            Core.sleep = originalSleep;
            NativeUI.getChatHeader = originalHeader;
            NativeUI.openDialog = originalDialog;
            NativeUI.closeDialog = originalCloseDialog;
            global.getComputedStyle = originalComputedStyle;
            PanelUI.renderDetailsPane = originalRender;
            if (performanceDescriptor) Object.defineProperty(globalThis, 'performance', performanceDescriptor);
            else delete globalThis.performance;
            if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
            else delete globalThis.navigator;
        }
    });

    it('publishes a stable bounded Bulk Lifecycle archive capability with a persisted checkpoint', async () => {
        const document = new FakeDocument();
        global.document = document;
        const originalScan = Core.scanSidebarChats;
        const originalSleep = Core.sleep;
        Core.scanSidebarChats = () => [{
            id: 'chat-1', title: 'Fixture chat', href: '/app/chat-1', element: null
        }];
        Core.sleep = async () => {};
        const harness = configuredExport(document);
        const capability = ExportModule.capabilities['archive.bulk-lifecycle'];
        assert.equal(Object.isFrozen(ExportModule.capabilities), true);
        assert.equal(Object.isFrozen(capability), true);
        ExportModule._selectVisibleBulkChats([{ id: 'prior', title: 'Prior', href: '/app/prior' }]);
        try {
            const controller = new AbortController();
            const result = await capability.archive([
                { id: 'chat-1', title: 'Fixture chat', href: '/app/chat-1', ignored: true }
            ], {
                signal: controller.signal,
                scope: { kind: 'visible-sidebar', sessionKey: 'must-not-export' },
                capturedAt: CREATED_AT
            });
            assert.equal(result.accepted, true);
            assert.equal(result.checkpoint.kind, 'portable-archive');
            assert.equal(result.checkpoint.persisted, true);
            assert.equal(result.checkpoint.id, `sha256:${result.checkpoint.checksum.value}`);
            assert.deepEqual(result.checkpoint.selectedIds, ['chat-1']);
            assert.equal(harness.downloads.length, 1);
            assert.match(harness.downloads[0].filename, /^primer-pp-bulk-archive-2026-08-01-[a-f0-9]{8}\.json$/);
            const saved = JSON.parse(harness.downloads[0].content);
            assert.deepEqual(saved.payload.chats.map(chat => chat.chatId), ['chat-1']);
            assert.equal(saved.source.capture, 'explicit-bulk-lifecycle');
            assert.equal(JSON.stringify(saved).includes('must-not-export'), false);
            assert.deepEqual([...ExportModule._bulkSelected], ['prior']);

            ExportModule.destroy();
            await assert.rejects(capability.archive([
                { id: 'chat-1', title: 'Fixture chat' }
            ], { signal: controller.signal, scope: { kind: 'visible-sidebar' }, capturedAt: CREATED_AT }),
            error => error.code === 'ARCHIVE_UNAVAILABLE');
            ExportModule.init();
            assert.equal(ExportModule.capabilities['archive.bulk-lifecycle'], capability);
        } finally {
            Core.scanSidebarChats = originalScan;
            Core.sleep = originalSleep;
            harness.restoreToast();
            ExportModule.destroy();
        }
    });

    it('keeps the Archive vertical layered, bounded, and explicitly clocked', () => {
        const root = path.join(__dirname, '..');
        const featureDirectory = path.join(root, 'src', 'features', 'portable_archive');
        const featureFiles = fs.readdirSync(featureDirectory)
            .filter(name => name.endsWith('.js'))
            .map(name => ({ name, source: fs.readFileSync(path.join(featureDirectory, name), 'utf8') }));
        const featureSource = featureFiles.map(file => file.source).join('\n');
        const facade = fs.readFileSync(path.join(root, 'src', 'modules', 'export.js'), 'utf8');

        assert.doesNotMatch(
            featureSource,
            /from\s+['"][^'"]*(?:panel_ui|core|native_ui)\.js['"]/
        );
        assert.doesNotMatch(featureSource, /Date\.now\(\)|new Date\(\)/);
        assert.match(facade, /PanelUI/);
        assert.match(facade, /scanSidebarChats/);
        assert.ok(facade.split(/\r?\n/).length <= 260, 'Export facade must stay thin');
        assert.ok(featureFiles.every(file => file.source.split(/\r?\n/).length <= 300));
        assert.ok(featureFiles.find(file => file.name === 'feature.js').source.split(/\r?\n/).length <= 180);
        assert.ok(featureFiles.find(file => file.name === 'legacy_export_controller.js').source.split(/\r?\n/).length <= 100);

        const archiveDomain = featureFiles.find(file => file.name === 'archive.js').source;
        assert.doesNotMatch(archiveDomain, /new Date\(\)/);
        assert.match(archiveDomain, /options\.clock/);
    });

    it('validates adapters and can reconfigure a running Archive feature', () => {
        assert.throws(() => ExportModule.configure({ sessionAdapter: {} }), /getMetadata/);
        assert.throws(() => ExportModule.configure({ sessionAdapter: { getMetadata() {}, getUsageSnapshot: true } }), /getUsageSnapshot/);
        assert.throws(() => ExportModule.configure({ sessionAdapter: { getMetadata() {}, getUsageStreaks: true } }), /getUsageStreaks/);
        assert.throws(() => ExportModule.configure({ geminiAdapter: null }), /geminiAdapter/);
        assert.throws(() => ExportModule.configure({ archiveSectionsProvider: true }), /archiveSectionsProvider/);
        assert.throws(() => ExportModule.configure({ contributorsProvider: true }), /contributorsProvider/);
        assert.throws(() => ExportModule.configure({ availabilityProvider: true }), /availabilityProvider/);
        assert.throws(() => ExportModule.configure({ now: true }), /now/);

        const document = new FakeDocument();
        global.document = document;
        const harness = configuredExport(document);
        const first = ExportModule._archiveFeature;
        ExportModule.configure({
            sessionAdapter: harness.sessionAdapter,
            geminiAdapter: harness.geminiAdapter,
            now: () => CREATED_AT
        });
        assert.notEqual(ExportModule._archiveFeature, first);
        assert.equal(ExportModule._archiveFeature.started, true);
        harness.restoreToast();
        ExportModule.destroy();
    });

    it('preserves usage JSON, CSV and Markdown through an injected snapshot adapter', () => {
        const document = new FakeDocument();
        global.document = document;
        const harness = configuredExport(document);
        ExportModule.exportJSON();
        ExportModule.doExportCSV();
        ExportModule.doExportMarkdown();
        assert.equal(harness.downloads.length, 3);
        assert.deepEqual(JSON.parse(harness.downloads[0].content), {
            total: 7,
            totalChatsCreated: 2,
            chats: { c1: 4 },
            dailyCounts: harness.usage.dailyCounts,
            exportedAt: harness.downloads[0].content.match(/"exportedAt": "([^"]+)/)[1]
        });
        assert.match(harness.downloads[0].filename, /^primer-pp-archive-fixture-2026-/);
        assert.match(harness.downloads[1].content, /Date,Messages,Chats/);
        assert.match(harness.downloads[2].content, /archive-fixture@example\.test/);
        assert.match(harness.downloads[2].content, /Current Streak.*1/);
        harness.restoreToast();
        ExportModule.destroy();
    });

    it('keeps a read-only persisted-usage fallback without importing Counter', () => {
        const document = new FakeDocument();
        global.document = document;
        setCurrentUser('persisted-fixture@example.test');
        const values = new Map([
            ['gemini_store_persisted-fixture@example.test', {
                total: 3,
                totalChatsCreated: 1,
                chats: { c1: 3 },
                dailyCounts: { '2026-08-01': { messages: 3, chats: 1 } }
            }],
            ['gemini_reset_hour', 0]
        ]);
        global.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
        const downloads = [];
        ExportModule.destroy();
        ExportModule.configure({
            geminiAdapter: {
                getCurrentConversationMessages: () => [],
                getChatTitleText: () => '',
                detectModelKey: () => null,
                getRichResponseProbeReport: () => null,
                getInputEditor: () => null
            },
            now: () => CREATED_AT
        });
        ExportModule._download = (content, filename, type) => downloads.push({ content, filename, type });
        ExportModule.init();
        ExportModule.exportJSON();
        ExportModule.doExportMarkdown();
        assert.equal(JSON.parse(downloads[0].content).total, 3);
        assert.match(downloads[1].content, /Best Streak/);
        ExportModule.destroy();
        setCurrentUser('Guest');
        delete global.GM_getValue;
    });

    it('keeps every current-chat download format and adds rich archive metadata', async () => {
        const document = new FakeDocument();
        global.document = document;
        const harness = configuredExport(document);
        ExportModule.exportCurrentChatJSON();
        ExportModule.exportCurrentChatCSV();
        ExportModule.exportCurrentChatMarkdown();
        ExportModule.exportCurrentChatText();
        ExportModule.exportCurrentChatHTML();
        ExportModule.exportCurrentChatDOCX();
        assert.equal(harness.downloads.length, 6);
        assert.deepEqual(harness.downloads.map(item => item.type), [
            'application/json',
            'text/csv',
            'text/markdown',
            'text/plain',
            'text/html',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]);
        assert.match(harness.downloads[0].content, /Fixture chat/);
        assert.ok(harness.downloads[5].content instanceof Uint8Array);

        const archive = await ExportModule.createPortableArchive(['chats', 'annotations', 'preferences']);
        assert.equal(archive.payload.chats[0].metadata.captureMethod, 'legacy-text');
        assert.ok(archive.payload.chats[0].fidelity.losses.some(
            loss => loss.code === 'STRUCTURED_CAPTURE_UNAVAILABLE'
        ));
        assert.equal(archive.payload.chats[0].metadata.visibleMessageCount, 2);
        assert.equal(archive.payload.chats[0].metadata.model, 'pro');
        assert.equal(archive.payload.chats[0].metadata.richResponse.codeBlockCount, 1);
        assert.equal(archive.source.platform, 'userscript');
        assert.equal(JSON.stringify(archive).includes('archive-fixture@example.test'), false);
        harness.restoreToast();
        ExportModule.destroy();
    });

    it('shows a visible message when usage insights are unavailable or asynchronous', () => {
        const document = new FakeDocument();
        global.document = document;
        const unavailable = configuredExport(document, { sessionAdapter: { getUsageSnapshot: () => null } });
        assert.equal(ExportModule.exportJSON(), undefined);
        assert.match(unavailable.toasts.at(-1), /Local usage insights are unavailable/);
        unavailable.restoreToast();
        ExportModule.destroy();

        const asyncHarness = configuredExport(document, { sessionAdapter: { getUsageSnapshot: async () => ({}) } });
        assert.throws(() => ExportModule.exportJSON(), /must be synchronous/);
        asyncHarness.restoreToast();
        ExportModule.destroy();
    });

    it('rejects invalid metadata/providers and credential-bearing archives visibly', async () => {
        const document = new FakeDocument();
        global.document = document;
        const badMetadata = configuredExport(document, { sessionAdapter: { getMetadata: () => [] } });
        assert.throws(() => ExportModule._getSessionMetadata(), /must return an object/);
        badMetadata.restoreToast();
        ExportModule.destroy();

        const badProvider = configuredExport(document, { archiveSectionsProvider: async () => [] });
        await assert.rejects(ExportModule.createPortableArchive(), /must return an object/);
        badProvider.restoreToast();
        ExportModule.destroy();

        const sensitive = configuredExport(document, {
            archiveSectionsProvider: () => ({ annotations: [{ id: 'note', clientSecret: 'blocked' }] })
        });
        await assert.rejects(ExportModule.createPortableArchive(['annotations']), error => error.code === 'SENSITIVE_FIELD');
        assert.equal(await ExportModule._runArchiveAction(() => { throw new Error('visible failure'); }), null);
        assert.equal(sensitive.toasts.at(-1), 'visible failure');
        sensitive.restoreToast();
        ExportModule.destroy();
    });

    it('keeps the native button idempotent and uses semantic menu controls', async () => {
        const document = new FakeDocument();
        global.document = document;
        global.getComputedStyle = () => ({ position: 'static' });
        const header = document.createElement('div');
        document.body.appendChild(header);
        const originalGetChatHeader = NativeUI.getChatHeader;
        NativeUI.getChatHeader = () => header;
        const harness = configuredExport(document);

        ExportModule.injectNativeUI();
        ExportModule.injectNativeUI();
        const button = document.getElementById('gc-export-native');
        assert.ok(button);
        assert.equal(button.tagName, 'BUTTON');
        assert.equal(button.type, 'button');
        assert.equal(button.getAttribute('aria-haspopup'), 'menu');
        assert.equal(button.getAttribute('aria-expanded'), 'false');
        assert.equal(document.body.children.filter(child => child.id === 'gc-export-native').length, 1);

        await button.click();
        const menu = document.getElementById('gc-export-menu');
        assert.equal(menu.getAttribute('role'), 'menu');
        assert.equal(button.getAttribute('aria-expanded'), 'true');
        assert.equal(elementsByTag(menu, 'button').every(item => item.getAttribute('role') === 'menuitem'), true);
        await button.click();
        assert.equal(document.getElementById('gc-export-menu'), null);
        assert.equal(button.getAttribute('aria-expanded'), 'false');

        NativeUI.getChatHeader = originalGetChatHeader;
        harness.restoreToast();
        ExportModule.destroy();
    });

    it('mounts the Archive panel with labels and unmounts it on destroy', () => {
        const document = new FakeDocument();
        global.document = document;
        const harness = configuredExport(document);
        const originalScan = Core.scanSidebarChats;
        Core.scanSidebarChats = () => [];
        const container = document.createElement('div');
        document.body.appendChild(container);
        ExportModule.renderToDetailsPane(container);
        const archiveSection = container.children.find(child => child.getAttribute('data-primer-archive-controls') === '');
        assert.ok(archiveSection);
        assert.equal(elementsByText(archiveSection, 'h3', 'Portable Archive').length, 1);
        assert.equal(
            elementsByTag(archiveSection, 'label').length,
            archiveApi.PORTABLE_ARCHIVE_SECTIONS.length + 2
        );
        ExportModule.onUserChange();
        ExportModule.destroy();
        assert.equal(archiveSection.parentElement, null);
        Core.scanSidebarChats = originalScan;
        harness.restoreToast();
    });
});

describe('Archive export session adapter boundaries', () => {
    it('classifies plain values and validates optional adapter methods directly', () => {
        assert.equal(isPlainObject(null), false);
        assert.equal(isPlainObject(1), false);
        assert.equal(isPlainObject([]), false);
        assert.equal(isPlainObject(new Date()), false);
        assert.equal(isPlainObject({}), true);
        assert.equal(isPlainObject(Object.create(null)), true);

        assert.doesNotThrow(() => assertExportSessionAdapter({ getMetadata() {} }));
        assert.doesNotThrow(() => assertExportSessionAdapter({
            getMetadata() {}, getUsageSnapshot() {}, getUsageStreaks() {}
        }));
        assert.throws(() => assertExportSessionAdapter(null), /getMetadata/);
        assert.throws(() => assertExportSessionAdapter({ getMetadata: true }), /getMetadata/);
        const defaults = createDefaultExportSessionAdapter();
        assert.equal(defaults.getMetadata().user, 'Guest');
        assert.equal(defaults.getMetadata().chatId, null);
        assert.equal(defaults.getUsageSnapshot(), null);
    });

    it('reads the default compatibility schema defensively and remains read-only', () => {
        const originalLocation = global.location;
        const originalGetter = global.GM_getValue;
        const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
        try {
            global.location = {
                href: 'https://gemini.google.com/app/default-adapter',
                origin: 'https://gemini.google.com'
            };
            const adapter = createDefaultExportSessionAdapter({
                getCurrentUser: () => Core.getCurrentUser(),
                getChatId: () => Core.getChatId()
            });

            setCurrentUser('Guest');
            assert.equal(adapter.getUsageSnapshot(), null);
            setCurrentUser('default-adapter@example.test');
            delete global.GM_getValue;
            assert.equal(adapter.getUsageSnapshot(), null);

            global.GM_getValue = () => { throw new Error('storage unavailable'); };
            assert.equal(adapter.getUsageSnapshot(), null);
            assert.deepEqual(adapter.getUsageStreaks({ dailyCounts: {} }), { current: 0, best: 0 });

            global.GM_getValue = key => key === 'gemini_reset_hour' ? null : [];
            assert.equal(adapter.getUsageSnapshot(), null);
            assert.deepEqual(adapter.getUsageStreaks({ dailyCounts: {} }), { current: 0, best: 0 });

            global.GM_getValue = key => key === 'gemini_reset_hour' ? 0 : ({
                total: 'invalid',
                totalChatsCreated: Infinity,
                chats: [],
                dailyCounts: null
            });
            assert.deepEqual(adapter.getUsageSnapshot(), {
                total: 0, totalChatsCreated: 0, chats: {}, dailyCounts: {}
            });

            global.GM_getValue = key => key === 'gemini_reset_hour' ? 0 : ({
                total: 3,
                totalChatsCreated: 2,
                chats: { current: 3 },
                dailyCounts: { '2026-08-01': { messages: 3, chats: 1 } }
            });
            const snapshot = adapter.getUsageSnapshot();
            assert.equal(snapshot.total, 3);
            assert.deepEqual(snapshot.chats, { current: 3 });
            assert.equal(adapter.getMetadata().user, 'default-adapter@example.test');
            assert.equal(adapter.getMetadata().platform, 'gemini-web');
            assert.match(adapter.getMetadata().href, /default-adapter/);
            Object.defineProperty(global, 'navigator', {
                value: { language: '' }, configurable: true, writable: true
            });
            assert.equal(adapter.getMetadata().locale, 'en');
        } finally {
            setCurrentUser('Guest');
            if (originalGetter === undefined) delete global.GM_getValue;
            else global.GM_getValue = originalGetter;
            if (originalLocation === undefined) delete global.location;
            else global.location = originalLocation;
            if (originalNavigator) Object.defineProperty(global, 'navigator', originalNavigator);
            else delete global.navigator;
        }
    });
});

describe('Legacy export compatibility controller', () => {
    it('owns adapter state, filenames, selection metadata, and navigation-safe URLs', () => {
        const harness = createLegacyControllerHarness();
        const { controller } = harness;
        const originalScan = Core.scanSidebarChats;
        try {
            assert.equal(controller.configure(), controller);
            assert.equal(controller.sessionAdapter, harness.sessionAdapter);
            assert.equal(controller.geminiAdapter, harness.geminiAdapter);
            assert.equal(typeof controller.now, 'function');
            assert.equal(controller.getGeminiAdapter(), harness.geminiAdapter);
            assert.equal(controller.getUsageSnapshot(), harness.usage);
            assert.match(controller.getFilePrefix(), /^primer-pp-legacy-/);
            assert.match(controller.getChatFilePrefix(), /-current$/);
            assert.match(controller.getBulkFilePrefix(), /-selected-chats$/);
            assert.throws(() => controller.setDownload(null), /must be a function/);
            assert.equal(controller.setDownload(() => {}), controller);

            assert.deepEqual(controller.cloneChatMeta(), {
                id: '', title: 'Untitled', href: '', element: null
            });
            const visibleElement = { click() {} };
            const visible = { id: 'one', title: 'One', href: '/app/one', element: visibleElement };
            const hidden = { id: 'two', title: 'Two', href: '/app/two' };
            controller.rememberBulkChat(null);
            controller.toggleBulkChat(null);
            controller.rememberBulkChat(hidden);
            controller.toggleBulkChat(hidden);
            controller.toggleBulkChat(hidden);
            controller.selectVisibleBulkChats([visible, hidden]);
            assert.equal(controller.bulkSelected.size, 2);
            assert.equal(controller.bulkSelectedMeta.one.element, visibleElement);

            Core.scanSidebarChats = () => [visible];
            assert.deepEqual(controller.getSelectedBulkChats().map(chat => chat.id), ['one', 'two']);
            assert.equal(controller.resolveBulkChatForNavigation(hidden), hidden);
            assert.equal(controller.resolveBulkChatForNavigation({ ...visible, title: 'Pinned title' }).title, 'Pinned title');
            assert.equal(controller.resolveBulkChatForNavigation({ ...visible, title: '' }).title, 'One');
            assert.equal(controller.absoluteChatHref(null), '');
            assert.equal(controller.absoluteChatHref({ href: '/app/one' }), 'https://gemini.google.com/app/one');
            assert.equal(controller.absoluteChatHref({ href: 'http://[' }), '');

            controller.bulkExporting = true;
            controller.bulkCancelRequested = true;
            controller.bulkProgress = { current: 1, total: 2, title: 'One' };
            assert.equal(controller.bulkExporting, true);
            assert.equal(controller.bulkCancelRequested, true);
            assert.equal(controller.bulkProgress.title, 'One');
            assert.ok(controller.bulkSelectedMeta.two);
            controller.resetSessionState();
            assert.equal(controller.bulkExporting, false);
            assert.equal(controller.bulkCancelRequested, false);
            assert.deepEqual(controller.bulkProgress, { current: 0, total: 0, title: '' });
            assert.equal(controller.bulkSelected.size, 0);

            const fallback = createLegacyControllerHarness({
                metadata: { user: '', chatId: '', origin: '' }
            }).controller;
            assert.match(fallback.getFilePrefix(), /^primer-pp-unknown-/);
            assert.match(fallback.getChatFilePrefix(), /-current-chat$/);
            const secondUserFallback = createLegacyControllerHarness({
                metadata: { user: '@example.test' }
            }).controller;
            assert.match(secondUserFallback.getFilePrefix(), /^primer-pp-unknown-/);
            const invalidClock = createLegacyControllerHarness().controller;
            invalidClock.configure({ now: () => 'not-a-date' });
            assert.match(invalidClock.getFilePrefix(), /unknown-date/);
        } finally {
            Core.scanSidebarChats = originalScan;
        }
    });

    it('waits for stable chats and handles navigation and restoration boundaries', async () => {
        const harness = createLegacyControllerHarness();
        const { controller } = harness;
        const originalNow = Date.now;
        const originalSleep = Core.sleep;
        const originalScan = Core.scanSidebarChats;
        const originalMouseEvent = global.MouseEvent;
        let time = 0;
        try {
            Date.now = () => time;
            Core.sleep = async milliseconds => { time += milliseconds; };
            Core.scanSidebarChats = () => [];

            assert.equal(await controller.waitForChatReady('current', 2000), true);
            harness.geminiAdapter.getCurrentConversationMessages = () => [];
            time = 0;
            assert.equal(await controller.waitForChatReady('current', 2000), true);

            harness.metadata.chatId = 'different';
            time = 0;
            assert.equal(await controller.waitForChatReady('missing', 500), false);
            harness.metadata.chatId = 'missing';
            time = 0;
            assert.equal(await controller.waitForChatReady('missing', 0), true);

            await assert.rejects(controller.navigateToBulkChat({ id: 'new' }), /not available/);
            const events = [];
            global.MouseEvent = class {
                constructor(type, options) { this.type = type; this.options = options; }
            };
            const row = {
                dispatchEvent: event => events.push(event.type),
                click: () => { events.push('click'); harness.metadata.chatId = 'new'; }
            };
            controller.waitForChatReady = async () => true;
            await controller.navigateToBulkChat({ id: 'new', element: row });
            assert.deepEqual(events, ['mouseenter', 'click']);
            controller.waitForChatReady = async () => false;
            await assert.rejects(controller.navigateToBulkChat({ id: 'new', element: row }), /Timed out/);

            harness.metadata.chatId = '';
            assert.equal(controller.getCurrentChatReference(), null);
            harness.metadata.chatId = 'current';
            const currentRow = { id: 'current', title: 'Current row', href: '/app/current', element: row };
            Core.scanSidebarChats = () => [currentRow];
            assert.equal(controller.getCurrentChatReference().title, 'Current row');
            Core.scanSidebarChats = () => [];
            assert.equal(controller.getCurrentChatReference().title, 'Legacy chat');

            await controller.restoreOriginalChat(null);
            await controller.restoreOriginalChat({ id: 'current' });
            harness.metadata.chatId = 'other';
            await controller.restoreOriginalChat({ id: 'current' });
            let restored = 0;
            Core.scanSidebarChats = () => [{ id: 'current', element: { click: () => { restored++; } } }];
            controller.waitForChatReady = async (_id, timeout) => { assert.equal(timeout, 6000); return true; };
            await controller.restoreOriginalChat({ id: 'current' });
            assert.equal(restored, 1);
        } finally {
            Date.now = originalNow;
            Core.sleep = originalSleep;
            Core.scanSidebarChats = originalScan;
            if (originalMouseEvent === undefined) delete global.MouseEvent;
            else global.MouseEvent = originalMouseEvent;
        }
    });

    it('captures exported, empty, and failed bulk records without leaking state', () => {
        const harness = createLegacyControllerHarness();
        const { controller } = harness;
        const exported = controller.captureBulkTranscript({ id: 'one', title: 'One' }, CREATED_AT);
        assert.equal(exported.status, 'exported');
        assert.equal(exported.title, 'Legacy chat');
        harness.geminiAdapter.getCurrentConversationMessages = () => [];
        harness.geminiAdapter.getChatTitleText = () => '';
        assert.equal(controller.captureBulkTranscript({ id: 'two', title: 'Two' }, CREATED_AT).status, 'empty');
        assert.equal(controller.captureBulkTranscript({ id: 'three', title: '' }, CREATED_AT).title, 'Gemini conversation');
        assert.match(controller.failedBulkTranscript({ id: 'bad', title: '', href: '/app/bad' }, CREATED_AT, 'failed').href, /app\/bad/);
        assert.equal(controller.failedBulkTranscript({ id: 'bad', title: 'Bad' }, CREATED_AT, new Error('boom')).error, 'boom');
    });

    it('inserts transcript packets through textarea and contenteditable fallbacks', () => {
        const document = new FakeDocument();
        global.document = document;
        const originalInputEvent = global.InputEvent;
        const originalToast = NativeUI.showToast;
        const toasts = [];
        global.InputEvent = class {
            constructor(type, options) { this.type = type; Object.assign(this, options); }
        };
        NativeUI.showToast = message => toasts.push(message);
        try {
            const harness = createLegacyControllerHarness();
            const { controller } = harness;
            assert.equal(controller.insertTextIntoEditor('missing'), false);

            const acceptedEditor = {
                value: 'A', selectionStart: 1, selectionEnd: 1,
                focus() {},
                dispatchEvent(event) {
                    if (event.type === 'beforeinput') this.value += event.data;
                    return true;
                }
            };
            harness.geminiAdapter.getInputEditor = () => acceptedEditor;
            assert.equal(controller.insertTextIntoEditor('B'), true);
            assert.equal(acceptedEditor.value, 'AB');

            const textarea = {
                value: 'abcd', selectionStart: 1, selectionEnd: 3,
                focus() {}, events: [],
                dispatchEvent(event) { this.events.push(event.type); return false; }
            };
            harness.geminiAdapter.getInputEditor = () => textarea;
            assert.equal(controller.insertTextIntoEditor('X'), true);
            assert.equal(textarea.value, 'aXd');
            assert.deepEqual([textarea.selectionStart, textarea.selectionEnd], [2, 2]);
            assert.deepEqual(textarea.events, ['beforeinput', 'input']);

            const noSelection = {
                value: 'a', selectionStart: null, selectionEnd: null,
                focus() {}, dispatchEvent: () => false
            };
            harness.geminiAdapter.getInputEditor = () => noSelection;
            controller.insertTextIntoEditor('b');
            assert.equal(noSelection.value, 'ab');

            const richEditor = {
                textContent: '', children: [],
                focus() {}, dispatchEvent: () => false,
                appendChild(child) { this.children.push(child); this.textContent += child.textContent; }
            };
            harness.geminiAdapter.getInputEditor = () => richEditor;
            assert.equal(controller.insertTextIntoEditor('Rich'), true);
            assert.equal(richEditor.children[0].tagName, 'P');

            controller.getCurrentTranscript = () => ({ messages: [] });
            controller.insertCurrentTranscriptPacket();
            assert.match(toasts.at(-1), /No visible chat messages/);
            controller.getCurrentTranscript = () => ({
                chatId: 'one', title: 'One', href: '', exportedAt: CREATED_AT,
                messages: [{ role: 'user', text: 'Hello' }]
            });
            controller.insertTextIntoEditor = () => false;
            controller.insertCurrentTranscriptPacket();
            controller.insertTextIntoEditor = text => { assert.match(text, /Current Gemini transcript/); return true; };
            controller.insertCurrentTranscriptPacket();
            assert.match(toasts.at(-1), /Chat packet inserted/);
        } finally {
            NativeUI.showToast = originalToast;
            if (originalInputEvent === undefined) delete global.InputEvent;
            else global.InputEvent = originalInputEvent;
        }
    });

    it('covers current-chat default ports and metadata fallback ordering', () => {
        assert.throws(() => createCurrentChatExportController(), /usage\/session/);
        const document = new FakeDocument();
        document.title = 'Document fallback';
        global.document = document;
        const originalLocation = global.location;
        const originalInputEvent = global.InputEvent;
        global.location = { href: 'https://gemini.google.com/app/location-fallback' };
        global.InputEvent = class {
            constructor(type, init) { this.type = type; Object.assign(this, init); }
        };
        const metadata = { chatId: '', href: '' };
        let editor = null;
        const adapter = {
            getCurrentConversationMessages: () => [{ role: 'user', text: 'Hello' }],
            getChatTitleText: () => '',
            detectModelKey: () => 'detected',
            getInputEditor: () => editor
        };
        const usage = {
            getSessionMetadata: () => metadata,
            getGeminiAdapter: () => adapter,
            now: () => CREATED_AT,
            getChatFilePrefix: () => 'fixture',
            download() {}
        };
        try {
            const current = createCurrentChatExportController({ usage });
            let transcript = current.getCurrentTranscript();
            assert.equal(transcript.title, 'Document fallback');
            assert.match(transcript.href, /location-fallback/);
            assert.equal(transcript.metadata.model, 'detected');
            assert.equal(transcript.metadata.richResponse, null);
            assert.equal(current.insertTextIntoEditor('missing'), false);

            document.title = '';
            metadata.chatId = 'chat-id';
            transcript = current.getCurrentTranscript();
            assert.equal(transcript.title, 'chat-id');
            metadata.chatId = '';
            delete global.location;
            adapter.detectModelKey = () => null;
            transcript = current.getCurrentTranscript();
            assert.equal(transcript.title, 'Gemini conversation');
            assert.equal(transcript.href, '');
            assert.equal(transcript.metadata.model, null);

            editor = {
                value: '', selectionStart: 0, selectionEnd: 0,
                focus() {}, dispatchEvent: () => false
            };
            current.insertTextIntoEditor('default events');
            current.getCurrentTranscript = () => ({
                messages: [{ role: 'user', text: 'Hello' }],
                title: 'One', chatId: 'one', href: '', exportedAt: CREATED_AT
            });
            current.insertTextIntoEditor = () => true;
            current.insertCurrentTranscriptPacket();
        } finally {
            if (originalLocation === undefined) delete global.location;
            else global.location = originalLocation;
            if (originalInputEvent === undefined) delete global.InputEvent;
            else global.InputEvent = originalInputEvent;
        }
    });

    it('covers empty and fallback current-chat formats plus the browser downloader', () => {
        const document = new FakeDocument();
        global.document = document;
        const originalToast = NativeUI.showToast;
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        const toasts = [];
        try {
            NativeUI.showToast = message => toasts.push(message);
            const empty = createLegacyControllerHarness({
                geminiAdapter: { getCurrentConversationMessages: () => [] }
            });
            empty.controller.downloadCurrentTranscript('json');
            assert.match(toasts.at(-1), /No visible chat messages/);

            const harness = createLegacyControllerHarness();
            harness.controller.downloadCurrentTranscript('unexpected');
            assert.equal(harness.downloads[0].type, 'text/plain');

            let revoked = '';
            URL.createObjectURL = blob => { assert.ok(blob instanceof Blob); return 'blob:test'; };
            URL.revokeObjectURL = url => { revoked = url; };
            const browserController = createLegacyExportController({
                sessionAdapter: harness.sessionAdapter,
                geminiAdapter: harness.geminiAdapter,
                now: () => CREATED_AT,
                monotonicNow: () => 0,
                translate: (_zh, en) => en,
                notify: message => NativeUI.showToast(message)
            });
            browserController.download('body', 'fixture.txt', 'text/plain');
            assert.equal(revoked, 'blob:test');
            assert.match(toasts.at(-1), /fixture\.txt/);
        } finally {
            NativeUI.showToast = originalToast;
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });

    it('covers usage-controller default ports and empty format branches', () => {
        const document = new FakeDocument();
        global.document = document;
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        try {
            let revoked = false;
            URL.createObjectURL = () => 'blob:defaults';
            URL.revokeObjectURL = () => { revoked = true; };
            assert.throws(() => createUsageExportController(), /now must be a function/);
            const defaults = createUsageExportController({ now: () => CREATED_AT });
            assert.equal(defaults.sessionAdapter, null);
            assert.equal(defaults.geminiAdapter, null);
            assert.equal(defaults.now(), CREATED_AT);
            assert.throws(() => defaults.getSessionMetadata(), /must return an object/);
            const sessionAdapter = {
                getMetadata: () => ({ user: 'default@example.test', chatId: '' }),
                getUsageSnapshot: () => null
            };
            defaults.configure({ sessionAdapter, geminiAdapter: {}, now: () => CREATED_AT });
            defaults.download('body', 'default.txt', 'text/plain');
            assert.equal(revoked, true);
            assert.equal(defaults.exportJSON(), undefined);
            assert.equal(defaults.doExportCSV(), undefined);
            assert.equal(defaults.doExportMarkdown(), undefined);

            const downloads = [];
            const noStreaks = createUsageExportController({
                sessionAdapter: {
                    getMetadata: () => ({ user: 'nostreak@example.test' }),
                    getUsageSnapshot: () => ({
                        total: 0, totalChatsCreated: 0, chats: {}, dailyCounts: {}
                    })
                },
                geminiAdapter: {},
                now: () => CREATED_AT,
                download: (...args) => downloads.push(args)
            });
            noStreaks.doExportMarkdown();
            assert.equal(downloads.length, 1);
        } finally {
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });

    it('collects selected transcripts, reports failures, and always restores lifecycle state', async () => {
        const harness = createLegacyControllerHarness();
        const { controller } = harness;
        const originalRender = PanelUI.renderDetailsPane;
        const originalSleep = Core.sleep;
        const originalToast = NativeUI.showToast;
        const toasts = [];
        let renders = 0;
        let restores = 0;
        try {
            PanelUI.renderDetailsPane = () => { renders++; };
            Core.sleep = async () => {};
            NativeUI.showToast = message => toasts.push(message);

            controller.bulkExporting = true;
            assert.equal(await controller.collectSelectedTranscripts(), null);
            controller.bulkExporting = false;
            controller.getSelectedBulkChats = () => [];
            assert.equal(await controller.collectSelectedTranscripts(), null);
            assert.match(toasts.at(-1), /Select chats/);

            const selected = [
                { id: 'one', title: 'One', href: '/app/one' },
                { id: 'two', title: 'Two', href: '/app/two' }
            ];
            controller.getSelectedBulkChats = () => selected;
            controller.getCurrentChatReference = () => ({ id: 'original' });
            controller.resolveBulkChatForNavigation = chat => chat;
            controller.navigateToBulkChat = async chat => {
                if (chat.id === 'two') throw new Error('navigation failed');
            };
            controller.captureBulkTranscript = chat => ({ ...chat, status: 'exported', messages: [{ role: 'user', text: 'ok' }] });
            controller.restoreOriginalChat = async chat => { assert.equal(chat.id, 'original'); restores++; };
            const result = await controller.collectSelectedTranscripts();
            assert.equal(result.chats.length, 2);
            assert.equal(result.chats[0].status, 'exported');
            assert.equal(result.chats[1].status, 'failed');
            assert.equal(result.chats[1].error, 'navigation failed');
            assert.equal(restores, 1);
            assert.equal(controller.bulkExporting, false);
            assert.ok(renders >= 3);

            controller.navigateToBulkChat = async () => { controller.bulkCancelRequested = true; };
            controller.captureBulkTranscript = chat => ({ ...chat, status: 'exported', messages: [] });
            assert.equal(await controller.collectSelectedTranscripts(), null);
            assert.match(toasts.at(-1), /Export canceled/);
            assert.equal(restores, 2);
        } finally {
            PanelUI.renderDetailsPane = originalRender;
            Core.sleep = originalSleep;
            NativeUI.showToast = originalToast;
        }
    });

    it('covers multi-chat default ports and reference fallbacks', async () => {
        assert.throws(() => createMultiChatExportController(), /usage and current-chat/);
        assert.throws(() => createMultiChatExportController({ usage: {} }), /usage and current-chat/);
        assert.throws(() => createMultiChatExportController({ usage: {}, current: {} }), /monotonicNow/);
        const originalLocation = global.location;
        const originalMouseEvent = global.MouseEvent;
        const metadata = { chatId: 'current', href: '', origin: '' };
        let messages = [{ role: 'user', text: 'Hello' }];
        const adapter = {
            getCurrentConversationMessages: () => messages,
            getChatTitleText: () => ''
        };
        const usage = {
            getSessionMetadata: () => metadata,
            getGeminiAdapter: () => adapter,
            now: () => CREATED_AT,
            getBulkFilePrefix: () => 'bulk',
            download() {}
        };
        const current = { insertTextIntoEditor: () => true };
        try {
            global.location = {
                href: 'https://gemini.google.com/app/location-chat',
                origin: 'https://gemini.google.com'
            };
            global.MouseEvent = class {
                constructor(type, init) { this.type = type; this.init = init; }
            };
            const defaults = createMultiChatExportController({ usage, current, monotonicNow: () => Date.now() });
            assert.deepEqual(defaults.getSelectedChats(), []);
            assert.equal(await defaults.collect(), null);
            defaults.getSelectedChats = () => [{ id: 'bad', title: 'Bad', href: '/app/bad' }];
            defaults.getCurrentReference = () => null;
            defaults.resolveForNavigation = chat => chat;
            defaults.navigate = async () => { throw new Error('default logger warning'); };
            defaults.restoreOriginal = async () => {};
            const failed = await defaults.collect();
            assert.equal(failed.chats[0].status, 'failed');
            defaults.collect = async () => ({
                exportedAt: CREATED_AT,
                chats: [{
                    chatId: 'one', title: 'One', href: '', exportedAt: CREATED_AT,
                    status: 'exported', messages: [{ role: 'user', text: 'Hello' }]
                }]
            });
            await defaults.insertSelectedPacket();

            const visible = { id: 'current', title: 'Visible', href: '/app/current', element: null };
            const multi = createMultiChatExportController({
                usage,
                current,
                monotonicNow: () => Date.now(),
                scanSidebarChats: () => [visible]
            });
            assert.equal(multi.resolveForNavigation({ ...visible, title: '' }).title, 'Visible');
            assert.equal(multi.absoluteHref({ href: '/app/current' }), 'https://gemini.google.com/app/current');
            assert.equal(multi.getCurrentReference().title, 'Visible');
            const noVisible = createMultiChatExportController({
                usage,
                current,
                monotonicNow: () => Date.now(),
                scanSidebarChats: () => []
            });
            const reference = noVisible.getCurrentReference();
            assert.equal(reference.title, 'current');
            assert.match(reference.href, /location-chat/);
            const captured = noVisible.capture({ id: 'one', title: 'One' }, CREATED_AT);
            assert.match(captured.href, /location-chat/);
            delete global.location;
            assert.equal(noVisible.getCurrentReference().href, '');
            assert.equal(noVisible.capture({ id: 'one', title: 'One' }, CREATED_AT).href, '');

            metadata.chatId = 'other';
            let entered = false;
            const row = {
                dispatchEvent: event => { entered = event.type === 'mouseenter'; },
                click: () => { metadata.chatId = 'new'; }
            };
            const navigationDefaults = createMultiChatExportController({
                usage, current, monotonicNow: () => Date.now()
            });
            navigationDefaults.waitForReady = async () => true;
            await navigationDefaults.navigate({ id: 'new', element: row });
            assert.equal(entered, true);

            metadata.chatId = 'other';
            let staleClicks = 0;
            let freshClicks = 0;
            let hovered = false;
            const staleRow = {
                dispatchEvent() { hovered = true; },
                click() { staleClicks += 1; }
            };
            const freshRow = {
                dispatchEvent() {},
                click() { freshClicks += 1; metadata.chatId = 'fresh'; }
            };
            const staleRecovery = createMultiChatExportController({
                usage,
                current,
                monotonicNow: () => Date.now(),
                scanSidebarChats: () => [{
                    id: 'fresh', title: 'Fresh', href: '/app/fresh', element: hovered ? freshRow : staleRow
                }]
            });
            staleRecovery.waitForReady = async () => true;
            await staleRecovery.navigate({ id: 'fresh', title: 'Fresh', href: '/app/fresh', element: staleRow });
            assert.equal(staleClicks, 0);
            assert.equal(freshClicks, 1);

            metadata.chatId = 'other';
            let retryScan = 0;
            const firstFresh = { dispatchEvent() {}, click() {} };
            const retryFresh = { dispatchEvent() {}, click() { metadata.chatId = 'retry'; } };
            const retryRecovery = createMultiChatExportController({
                usage,
                current,
                monotonicNow: () => Date.now(),
                scanSidebarChats: () => [{
                    id: 'retry', title: 'Retry', href: '/app/retry',
                    element: retryScan++ < 2 ? firstFresh : retryFresh
                }]
            });
            retryRecovery.waitForReady = async () => true;
            await retryRecovery.navigate({ id: 'retry', element: firstFresh });
            assert.equal(metadata.chatId, 'retry');
        } finally {
            if (originalLocation === undefined) delete global.location;
            else global.location = originalLocation;
            if (originalMouseEvent === undefined) delete global.MouseEvent;
            else global.MouseEvent = originalMouseEvent;
        }
    });

    it('serializes every selected-chat format and handles packet outcomes', async () => {
        const harness = createLegacyControllerHarness();
        const { controller } = harness;
        const originalToast = NativeUI.showToast;
        const toasts = [];
        const bulk = {
            app: 'Primer++ for Gemini',
            exportedAt: CREATED_AT,
            chats: [{
                chatId: 'one', title: 'One', selectedTitle: 'One', href: '',
                exportedAt: CREATED_AT, status: 'exported',
                messages: [{ role: 'user', text: 'Hello' }]
            }]
        };
        try {
            NativeUI.showToast = message => toasts.push(message);
            controller.collectSelectedTranscripts = async () => null;
            assert.equal(await controller.downloadSelectedTranscripts('json'), undefined);
            assert.equal(await controller.insertSelectedTranscriptPacket(), undefined);

            controller.collectSelectedTranscripts = async () => bulk;
            for (const format of ['json', 'csv', 'markdown', 'text', 'html', 'docx', 'unexpected']) {
                await controller.downloadSelectedTranscripts(format);
            }
            assert.deepEqual(harness.downloads.map(item => item.type), [
                'application/json', 'text/csv', 'text/markdown', 'text/plain', 'text/html',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'
            ]);

            controller.collectSelectedTranscripts = async () => ({ ...bulk, chats: [] });
            await controller.insertSelectedTranscriptPacket();
            assert.match(toasts.at(-1), /No selected chat messages/);
            controller.collectSelectedTranscripts = async () => bulk;
            controller.insertTextIntoEditor = () => false;
            await controller.insertSelectedTranscriptPacket();
            controller.insertTextIntoEditor = text => { assert.match(text, /Selected Gemini transcript/); return true; };
            await controller.insertSelectedTranscriptPacket();
            assert.match(toasts.at(-1), /Selected chat packet inserted/);
        } finally {
            NativeUI.showToast = originalToast;
        }
    });
});

describe('Archive and export DOM view', () => {
    function createViewHarness(overrides = {}) {
        const calls = [];
        const controller = {
            bulkSelected: new Set(),
            bulkSelectedMeta: {},
            bulkExporting: false,
            bulkCancelRequested: false,
            bulkProgress: { current: 0, total: 0, title: '' },
            exportJSON: () => calls.push('usage-json'),
            doExportCSV: () => calls.push('usage-csv'),
            doExportMarkdown: () => calls.push('usage-md'),
            downloadCurrentTranscript: format => calls.push(`chat-${format}`),
            insertCurrentTranscriptPacket: () => calls.push('chat-packet'),
            downloadSelectedTranscripts: format => calls.push(`bulk-${format}`),
            insertSelectedTranscriptPacket: () => calls.push('bulk-packet'),
            selectVisibleBulkChats(chats) { chats.forEach(chat => this.bulkSelected.add(chat.id)); calls.push('select-all'); },
            clearBulkSelection() { this.bulkSelected.clear(); calls.push('clear'); },
            rememberBulkChat: chat => calls.push(`remember-${chat.id}`),
            toggleBulkChat(chat) {
                if (this.bulkSelected.has(chat.id)) this.bulkSelected.delete(chat.id);
                else this.bulkSelected.add(chat.id);
                calls.push(`toggle-${chat.id}`);
            },
            ...overrides.controller
        };
        const archive = {
            mounts: [], previews: [], downloads: [],
            mount(container, options) { this.mounts.push({ container, options }); },
            showPreview(include) { this.previews.push(include); calls.push('archive-preview'); },
            download(include) { this.downloads.push(include); calls.push('archive-download'); }
        };
        const actions = [];
        const view = createArchiveExportView({
            controller,
            ensureArchiveFeature: () => archive,
            runArchiveAction: action => { actions.push(action); return action(); },
            translate: (_zh, en) => en,
            notify: message => NativeUI.showToast(message),
            getChatHeader: () => NativeUI.getChatHeader(),
            removeById: id => NativeUI.remove(id),
            icon: id => {
                const element = globalThis.document.createElement('span');
                element.setAttribute('data-icon', id);
                return element;
            },
            computedStyle: element => getComputedStyle(element),
            scanSidebarChats: (...args) => Core.scanSidebarChats(...args),
            invalidateSidebarCache: () => Core.invalidateSidebarCache(),
            requestRender: () => PanelUI.renderDetailsPane()
        });
        return { view, controller, archive, calls, actions };
    }

    it('validates collaborators and handles native mount boundary branches', () => {
        assert.throws(() => createArchiveExportView({
            controller: null, ensureArchiveFeature() {}, runArchiveAction() {}
        }), /controller/);
        assert.throws(() => createArchiveExportView({
            controller: {}, ensureArchiveFeature: null, runArchiveAction() {}
        }), /action adapters/);
        assert.throws(() => createArchiveExportView({
            controller: {}, ensureArchiveFeature() {}, runArchiveAction: null
        }), /action adapters/);

        const document = new FakeDocument();
        global.document = document;
        const originalHeader = NativeUI.getChatHeader;
        const originalComputed = global.getComputedStyle;
        try {
            const harness = createViewHarness();
            NativeUI.getChatHeader = () => null;
            harness.view.injectNativeUI();
            const detached = document.createElement('div');
            NativeUI.getChatHeader = () => detached;
            harness.view.injectNativeUI();

            const parent = document.createElement('div');
            const header = document.createElement('div');
            parent.appendChild(header);
            document.body.appendChild(parent);
            NativeUI.getChatHeader = () => header;
            global.getComputedStyle = () => ({ position: 'relative' });
            harness.view.injectNativeUI();
            harness.view.injectNativeUI();
            assert.equal(parent.style.position, '');
            assert.ok(document.getElementById('gc-export-native'));
            harness.view.removeNativeUI();
            harness.view.removeNativeUI();
            assert.equal(document.getElementById('gc-export-native'), null);
        } finally {
            NativeUI.getChatHeader = originalHeader;
            global.getComputedStyle = originalComputed;
        }
    });

    it('executes every default DOM-view port without framework imports', async () => {
        const document = new FakeDocument();
        global.document = document;
        const originalComputed = global.getComputedStyle;
        global.getComputedStyle = () => ({ position: 'static' });
        const raw = createViewHarness().controller;
        const archive = { mount() {}, showPreview() {}, download() {} };
        try {
            const defaults = createArchiveExportView({
                controller: raw,
                ensureArchiveFeature: () => archive,
                runArchiveAction: action => action()
            });
            defaults.injectNativeUI();
            const emptyContainer = document.createElement('div');
            defaults.renderToDetailsPane(emptyContainer);

            const parent = document.createElement('div');
            const header = document.createElement('div');
            parent.appendChild(header);
            document.body.appendChild(parent);
            const nativeDefaults = createArchiveExportView({
                controller: raw,
                ensureArchiveFeature: () => archive,
                runArchiveAction: action => action(),
                getChatHeader: () => header
            });
            nativeDefaults.injectNativeUI();
            const button = document.getElementById('gc-export-native');
            assert.equal(button.title, 'Export conversation');
            await button.click();
            raw.exportJSON = () => { throw new Error('ignored by default notifier'); };
            await elementsByTag(document.getElementById('gc-export-menu'), 'button')[0].click();
            await Promise.resolve();
            await button.click();
            nativeDefaults.removeNativeUI();

            const visible = [{ id: 'one', title: 'One' }];
            const callbackDefaults = createArchiveExportView({
                controller: raw,
                ensureArchiveFeature: () => archive,
                runArchiveAction: action => action(),
                scanSidebarChats: () => visible
            });
            const populated = document.createElement('div');
            callbackDefaults.renderToDetailsPane(populated);
            await elementsByText(populated, 'button', 'All')[0].click();
            await elementsByText(populated, 'button', 'Clear')[0].click();
            await elementsByText(populated, 'button', 'Refresh')[0].click();
            elementsByTag(populated, 'input')[0].onchange({ stopPropagation() {} });
        } finally {
            global.getComputedStyle = originalComputed;
        }
    });

    it('executes every semantic menu action and closes by item or outside click', async () => {
        const document = new FakeDocument();
        global.document = document;
        const originalToast = NativeUI.showToast;
        const toasts = [];
        NativeUI.showToast = message => toasts.push(message);
        try {
            const parent = document.createElement('div');
            const anchor = document.createElement('button');
            parent.appendChild(anchor);
            document.body.appendChild(parent);
            const harness = createViewHarness();

            for (let index = 0; index < 11; index++) {
                harness.view.toggleExportMenu(anchor);
                const menu = document.getElementById('gc-export-menu');
                const items = elementsByTag(menu, 'button');
                assert.equal(items.length, 11);
                await items[index].click();
                await Promise.resolve();
                assert.equal(document.getElementById('gc-export-menu'), null);
            }
            assert.deepEqual(harness.calls, [
                'usage-json', 'usage-csv', 'usage-md',
                'chat-json', 'chat-csv', 'chat-markdown', 'chat-text', 'chat-html', 'chat-docx',
                'chat-packet', 'archive-preview'
            ]);

            harness.controller.exportJSON = () => { throw new Error('menu failure'); };
            harness.view.toggleExportMenu(anchor);
            await elementsByTag(document.getElementById('gc-export-menu'), 'button')[0].click();
            await Promise.resolve();
            assert.equal(toasts.at(-1), 'menu failure');
            harness.controller.exportJSON = () => { throw 'string failure'; };
            harness.view.toggleExportMenu(anchor);
            await elementsByTag(document.getElementById('gc-export-menu'), 'button')[0].click();
            await Promise.resolve();
            assert.equal(toasts.at(-1), 'string failure');

            harness.view.toggleExportMenu(anchor);
            let menu = document.getElementById('gc-export-menu');
            let listener = document.listeners.at(-1).listener;
            listener({ target: anchor });
            assert.equal(document.getElementById('gc-export-menu'), menu);
            listener({ target: menu.children[0] });
            assert.equal(document.getElementById('gc-export-menu'), menu);
            listener({ target: document.body });
            assert.equal(document.getElementById('gc-export-menu'), null);
            assert.equal(anchor.getAttribute('aria-expanded'), 'false');

            harness.view.toggleExportMenu(anchor);
            menu = document.getElementById('gc-export-menu');
            menu.remove();
            harness.view.toggleExportMenu(anchor);
            assert.ok(document.getElementById('gc-export-menu'));
            harness.view.toggleExportMenu(anchor);
            assert.equal(document.getElementById('gc-export-menu'), null);
        } finally {
            NativeUI.showToast = originalToast;
        }
    });

    it('renders non-empty selections, active progress, and every details action', async () => {
        const document = new FakeDocument();
        global.document = document;
        const originalScan = Core.scanSidebarChats;
        const originalInvalidate = Core.invalidateSidebarCache;
        const originalRender = PanelUI.renderDetailsPane;
        let renders = 0;
        let invalidations = 0;
        try {
            const chats = [
                { id: 'one', title: 'One', href: '/app/one' },
                { id: 'two', title: 'Two', href: '/app/two' }
            ];
            Core.scanSidebarChats = () => chats;
            Core.invalidateSidebarCache = () => { invalidations++; };
            PanelUI.renderDetailsPane = () => { renders++; };
            const harness = createViewHarness();
            harness.controller.bulkSelected.add('one');
            const container = document.createElement('div');
            document.body.appendChild(container);
            harness.view.renderToDetailsPane(container);
            assert.equal(harness.archive.mounts.length, 1);
            assert.deepEqual(harness.archive.mounts[0].options, { slot: 'details' });
            assert.equal(elementsByTag(container, 'label').length, 2);
            const checkboxes = elementsByTag(container, 'input');
            assert.equal(checkboxes[0].checked, true);
            checkboxes[0].onchange({ stopPropagation() {} });
            assert.ok(harness.calls.includes('toggle-one'));

            for (const label of ['All', 'Clear', 'Refresh']) {
                await elementsByText(container, 'button', label)[0].click();
            }
            assert.ok(harness.calls.includes('select-all'));
            assert.ok(harness.calls.includes('clear'));
            assert.equal(invalidations, 1);

            harness.controller.bulkSelected.add('one');
            const enabled = document.createElement('div');
            harness.view.renderToDetailsPane(enabled);
            const buttons = elementsByTag(enabled, 'button');
            for (const label of ['JSON', 'CSV', 'MD', 'TXT', 'HTML', 'DOCX', 'Packet']) {
                const matches = buttons.filter(button => button.textContent === label && !button.disabled);
                for (const button of matches) await button.click();
            }
            assert.ok(harness.calls.includes('bulk-json'));
            assert.ok(harness.calls.includes('bulk-csv'));
            assert.ok(harness.calls.includes('bulk-markdown'));
            assert.ok(harness.calls.includes('bulk-text'));
            assert.ok(harness.calls.includes('bulk-html'));
            assert.ok(harness.calls.includes('bulk-docx'));
            assert.ok(harness.calls.includes('bulk-packet'));

            harness.controller.bulkExporting = true;
            harness.controller.bulkProgress = { current: 1, total: 2, title: 'One' };
            const progressContainer = document.createElement('div');
            harness.view.renderToDetailsPane(progressContainer);
            const status = elementsByTag(progressContainer, 'div').find(element => element.getAttribute('role') === 'status');
            assert.match(status.textContent, /Exporting 1\/2: One/);
            await elementsByText(progressContainer, 'button', 'Cancel')[0].click();
            assert.equal(harness.controller.bulkCancelRequested, true);
            assert.ok(renders >= 4);
        } finally {
            Core.scanSidebarChats = originalScan;
            Core.invalidateSidebarCache = originalInvalidate;
            PanelUI.renderDetailsPane = originalRender;
        }
    });

    it('returns onboarding copy and wires every settings action through its adapter', async () => {
        const document = new FakeDocument();
        global.document = document;
        const harness = createViewHarness();
        const onboarding = harness.view.getOnboarding();
        assert.match(onboarding.zh.guide, /DOCX/);
        assert.match(onboarding.en.guide, /dry-run plan/);

        const container = document.createElement('div');
        harness.view.renderExportButtons(container);
        const buttons = elementsByTag(container, 'button');
        assert.equal(buttons.length, 9);
        for (const button of buttons) await button.click();
        assert.deepEqual(harness.calls, [
            'usage-json', 'usage-csv', 'usage-md',
            'chat-markdown', 'chat-csv', 'chat-html', 'chat-docx',
            'archive-preview', 'archive-download'
        ]);
        assert.equal(harness.actions.length, 2);
    });
});
