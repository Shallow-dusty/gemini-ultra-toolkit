const { afterEach, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixtureRoot = path.join(__dirname, 'fixtures', 'gemini-current');
let GeminiAdapter;

function splitTopLevel(value, separator) {
    const parts = [];
    let start = 0;
    let bracketDepth = 0;
    let quote = null;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quote) {
            if (char === quote && value[index - 1] !== '\\') quote = null;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '[') bracketDepth += 1;
        else if (char === ']') bracketDepth -= 1;
        else if (bracketDepth === 0 && separator(char)) {
            const part = value.slice(start, index).trim();
            if (part) parts.push(part);
            start = index + 1;
        }
    }
    const tail = value.slice(start).trim();
    if (tail) parts.push(tail);
    return parts;
}

function splitSelectorList(selector) {
    return splitTopLevel(selector, char => char === ',');
}

function splitDescendantSelector(selector) {
    return splitTopLevel(selector, char => /\s/.test(char));
}

function parseAttributeSelector(content) {
    const match = content.trim().match(
        /^([^\s~|^$*=\]]+)\s*(?:(\^=|\*=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))\s*(i)?)?$/i
    );
    if (!match) throw new Error(`Unsupported fixture selector attribute: [${content}]`);
    return {
        name: match[1],
        operator: match[2] || null,
        value: match[3] ?? match[4] ?? match[5] ?? null,
        insensitive: Boolean(match[6])
    };
}

function matchesCompound(element, selector) {
    let rest = selector.trim();
    const tag = rest.match(/^(\*|[a-zA-Z][\w-]*)/);
    if (tag) {
        if (tag[1] !== '*' && element.tagName !== tag[1].toUpperCase()) return false;
        rest = rest.slice(tag[0].length);
    }

    while (rest) {
        if (rest[0] === '.') {
            const token = rest.match(/^\.([\w-]+)/);
            if (!token || !element.classList.contains(token[1])) return false;
            rest = rest.slice(token[0].length);
            continue;
        }
        if (rest[0] === '#') {
            const token = rest.match(/^#([\w-]+)/);
            if (!token || element.id !== token[1]) return false;
            rest = rest.slice(token[0].length);
            continue;
        }
        if (rest[0] === '[') {
            const end = rest.indexOf(']');
            if (end === -1) return false;
            const attribute = parseAttributeSelector(rest.slice(1, end));
            const raw = element.getAttribute(attribute.name);
            if (raw == null) return false;
            if (attribute.operator) {
                let actual = raw;
                let expected = attribute.value;
                if (attribute.insensitive) {
                    actual = actual.toLowerCase();
                    expected = expected.toLowerCase();
                }
                if (attribute.operator === '=' && actual !== expected) return false;
                if (attribute.operator === '*=' && !actual.includes(expected)) return false;
                if (attribute.operator === '^=' && !actual.startsWith(expected)) return false;
            }
            rest = rest.slice(end + 1);
            continue;
        }
        throw new Error(`Unsupported fixture selector fragment: ${rest}`);
    }
    return true;
}

function matchesComplex(element, selector) {
    const parts = splitDescendantSelector(selector);
    if (parts.length === 0 || !matchesCompound(element, parts.at(-1))) return false;
    let ancestor = element.parentElement;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
        while (ancestor && !matchesCompound(ancestor, parts[index])) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
    }
    return true;
}

function matchesSelector(element, selector) {
    return splitSelectorList(selector).some(candidate => matchesComplex(element, candidate));
}

class FixtureClassList {
    constructor(values = []) { this.values = new Set(values); }
    contains(value) { return this.values.has(value); }
    [Symbol.iterator]() { return this.values[Symbol.iterator](); }
}

class FixtureElement {
    constructor(definition, ownerDocument) {
        this.key = definition.key;
        this.tagName = definition.tag.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.nodeType = 1;
        this.parentElement = null;
        this.children = [];
        this._text = definition.text || '';
        this._attributes = new Map(Object.entries(definition.attrs || {}).map(([key, value]) => [key, String(value)]));
        this.classList = new FixtureClassList(definition.classes || []);
        if (definition.classes?.length) this._attributes.set('class', definition.classes.join(' '));
        if (this._attributes.has('id')) this.id = this._attributes.get('id');
        else this.id = '';
        this.disabled = this._attributes.has('disabled');
    }

    get textContent() {
        return this._text + this.children.map(child => child.textContent).join('');
    }

    set textContent(value) {
        this._text = String(value);
        this.children = [];
    }

    getAttribute(name) { return this._attributes.has(name) ? this._attributes.get(name) : null; }
    matches(selector) { return matchesSelector(this, selector); }
    focus(options) { this.focusedWith = options || true; }
    scrollIntoView(options) { this.scrolledWith = options || true; }
    dispatchEvent(event) { this.dispatchedEvents = [...(this.dispatchedEvents || []), event]; return true; }

    closest(selector) {
        let candidate = this;
        while (candidate) {
            if (candidate.matches(selector)) return candidate;
            candidate = candidate.parentElement;
        }
        return null;
    }

    descendants() {
        return this.children.flatMap(child => [child, ...child.descendants()]);
    }

    querySelectorAll(selector) {
        const seen = new Set();
        return this.descendants().filter(element => {
            if (!element.matches(selector) || seen.has(element)) return false;
            seen.add(element);
            return true;
        });
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FixtureDocument {
    constructor(fixture) {
        this.fixture = fixture;
        this.defaultView = {
            InputEvent: class FixtureInputEvent {
                constructor(type, init) { this.type = type; Object.assign(this, init); }
            }
        };
        this.execCommand = () => false;
        this.nodes = new Map();
        for (const definition of fixture.nodes) {
            this.nodes.set(definition.key, new FixtureElement(definition, this));
        }
        for (const definition of fixture.nodes) {
            if (!definition.parent) continue;
            const node = this.nodes.get(definition.key);
            const parent = this.nodes.get(definition.parent);
            node.parentElement = parent;
            parent.children.push(node);
        }
        this.body = this.nodes.get('body');
    }

    allElements() { return [this.body, ...this.body.descendants()]; }
    querySelectorAll(selector) { return this.allElements().filter(element => element.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function readFixture(name) {
    return JSON.parse(fs.readFileSync(path.join(fixtureRoot, `${name}.json`), 'utf8'));
}

function installFixture(name) {
    const fixture = readFixture(name);
    const document = new FixtureDocument(fixture);
    const location = new URL(fixture.location);
    globalThis.document = document;
    globalThis.location = location;
    globalThis.window = {
        document,
        location,
        innerWidth: fixture.viewport.width,
        innerHeight: fixture.viewport.height,
        devicePixelRatio: fixture.viewport.dpr
    };
    document.defaultView = globalThis.window;
    document.defaultView.InputEvent = class FixtureInputEvent {
        constructor(type, init) { this.type = type; Object.assign(this, init); }
    };
    return document;
}

function appendFixtureNode(document, definition, parentKey = 'body') {
    const node = new FixtureElement(definition, document);
    const parent = document.nodes.get(parentKey);
    node.parentElement = parent;
    parent.children.push(node);
    document.nodes.set(definition.key, node);
    return node;
}

function capabilityMap(report, key) {
    return new Map(report[key].map(capability => [capability.id, capability]));
}

before(async () => {
    ({ GeminiAdapter } = await import('../src/adapters/gemini.js'));
});

afterEach(() => {
    delete globalThis.document;
    delete globalThis.location;
    delete globalThis.window;
});

describe('GeminiAdapter current DOM fixture', () => {
    it('prefers current data-test and semantic anchors across every integration surface', () => {
        const document = installFixture('current-full');

        assert.equal(GeminiAdapter.SELECTORS.MODE_BTN[0], '[data-test-id="bard-mode-menu-button"]');
        assert.deepEqual(GeminiAdapter.SELECTORS.MUTATION_ATTRIBUTE_FILTER, [
            'aria-label', 'alt', 'class', 'data-test-id'
        ]);
        assert.equal(Object.isFrozen(GeminiAdapter.SELECTORS.MUTATION_ATTRIBUTE_FILTER), true);
        assert.equal(GeminiAdapter.getSidebar().key, 'sidebar');
        assert.equal(GeminiAdapter.getInputArea().key, 'composer');
        assert.equal(GeminiAdapter.getInputEditor().key, 'editor');
        assert.equal(GeminiAdapter.getInputTrailingActions().key, 'input-actions');
        assert.equal(GeminiAdapter.getSendButton().key, 'send');
        assert.equal(GeminiAdapter.getModelSwitch().key, 'mode-button');
        assert.equal(GeminiAdapter.detectModelKey(), 'flash');
        assert.equal(GeminiAdapter.getChatHeader().key, 'header');
        assert.equal(GeminiAdapter.getChatTitleText(), 'Current fixture title');
        assert.equal(GeminiAdapter.getChatId(), 'chat_current_2026');
        assert.equal(GeminiAdapter.isReady(), true);

        const chats = GeminiAdapter.scanSidebarChatLinks();
        assert.equal(chats.length, 1);
        assert.equal(chats[0].id, 'chat_fixture_1');
        assert.equal(chats[0].title, 'Fixture conversation');
        assert.equal(GeminiAdapter.getChatRowMoreButton(chats[0].element).key, 'chat-row-menu');
        const ownedChoice = appendFixtureNode(document, {
            key: 'primer-bulk-choice',
            tag: 'label',
            attrs: { 'data-primer-sidebar-control': 'bulk-lifecycle' }
        }, 'chat-link');
        appendFixtureNode(document, {
            key: 'primer-bulk-choice-text',
            tag: 'span',
            text: 'Fixture conversation'
        }, 'primer-bulk-choice');
        chats[0].element.children = [
            ownedChoice,
            ...chats[0].element.children.filter(child => child !== ownedChoice)
        ];
        assert.equal(GeminiAdapter.scanSidebarChatLinks()[0].title, 'Fixture conversation');

        assert.deepEqual(
            GeminiAdapter.getCurrentConversationMessages().map(({ role, text }) => ({ role, text })),
            [
                { role: 'user', text: 'Fixture user message' },
                { role: 'model', text: 'Fixture model responseconst fixture = true;' }
            ]
        );
        assert.equal(GeminiAdapter.isInsideInputEditor(document.nodes.get('editor')), true);
        assert.equal(GeminiAdapter.isInsideMainChatArea(document.nodes.get('model-message')), true);
        assert.equal(GeminiAdapter.isInsideChatContent(document.nodes.get('code')), true);
    });

    it('reports available current integrations and keeps Gemini-native features separate', () => {
        installFixture('current-full');
        const report = GeminiAdapter.getCapabilityProbeReport();
        const adapter = capabilityMap(report, 'adapterCapabilities');
        const native = capabilityMap(report, 'nativeCapabilities');

        for (const id of ['readiness', 'sidebar', 'composer', 'model-picker', 'mutation-zones', 'chat-header', 'messages', 'message-navigation', 'title', 'export-anchors']) {
            assert.equal(adapter.get(id).status, 'available', id);
            assert.equal(adapter.get(id).owner, 'primer-adapter');
            assert.equal(adapter.get(id).extensionFeature, false);
        }
        for (const id of ['new-chat', 'temporary-chat', 'images', 'videos', 'library', 'notebooks', 'search', 'usage', 'spark', 'skills']) {
            assert.equal(native.get(id).status, 'native-owned', id);
            assert.equal(native.get(id).quality, 'available', id);
            assert.equal(native.get(id).owner, 'gemini-native');
            assert.equal(native.get(id).kind, 'native-feature');
            assert.equal(native.get(id).extensionFeature, false);
        }
        assert.equal(report.policy.nativeFeaturesAreExtensionFeatures, false);
        assert.deepEqual(report.theme, {
            mode: 'dark',
            hostPresent: true,
            evidence: ['body.dark-theme', '.theme-host', '.theme-host:dark']
        });
        assert.equal(report.summary.total, 20);
        assert.equal(report.summary.available, 10);
        assert.equal(report.summary.nativeOwned, 10);
        assert.equal(report.summary.degraded, 0);
        assert.equal(report.summary.unavailable, 0);

        const serialized = JSON.stringify(report);
        assert.doesNotMatch(serialized, /Fixture conversation|Fixture user message|@/);
    });

    it('embeds the capability report in the existing privacy-conservative runtime probe', () => {
        installFixture('current-full');
        const report = GeminiAdapter.getRuntimeProbeReport();

        assert.equal(report.page.host, 'gemini.google.com');
        assert.equal(report.page.pathKind, 'conversation');
        assert.equal(report.capabilityProbe.schemaVersion, 2);
        assert.equal(report.probes.sidebar.chatCount, 1);
        assert.equal(report.probes.input.editorPresent, true);
        assert.equal(report.probes.model.detectedKey, 'flash');
        assert.equal(report.probes.header.anchorPresent, true);
        assert.equal(report.probes.conversation.visibleMessageCount, 2);
        assert.equal(report.probes.conversation.richResponse.hasRichContent, true);
    });
});

describe('GeminiAdapter fallback and unavailable fixtures', () => {
    it('retains legacy fallbacks but labels their integration quality degraded', () => {
        installFixture('legacy-fallback');
        const report = GeminiAdapter.getCapabilityProbeReport();
        const adapter = capabilityMap(report, 'adapterCapabilities');
        const native = capabilityMap(report, 'nativeCapabilities');

        assert.equal(GeminiAdapter.getInputEditor().key, 'editor');
        assert.equal(GeminiAdapter.getModelSwitch().key, 'mode-button');
        assert.equal(GeminiAdapter.detectModelKey(), 'pro');
        assert.equal(GeminiAdapter.getChatHeader().key, 'title');
        assert.equal(GeminiAdapter.getChatTitleText(), 'Legacy fixture title');
        assert.equal(GeminiAdapter.getCurrentConversationMessages().length, 2);
        for (const capability of adapter.values()) assert.equal(capability.status, 'degraded', capability.id);
        for (const capability of native.values()) assert.equal(capability.status, 'unavailable', capability.id);
    });

    it('returns unavailable instead of guessing from unrelated DOM or account text', () => {
        installFixture('unavailable');
        const report = GeminiAdapter.getCapabilityProbeReport();

        assert.equal(GeminiAdapter.isReady(), false);
        assert.equal(GeminiAdapter.getInputEditor(), null);
        assert.equal(GeminiAdapter.getSidebar(), null);
        assert.equal(GeminiAdapter.getChatTitleText(), '');
        assert.equal(report.summary.available, 0);
        assert.equal(report.summary.degraded, 0);
        assert.equal(report.summary.unavailable, 20);
        assert.ok([...report.adapterCapabilities, ...report.nativeCapabilities]
            .every(capability => capability.status === 'unavailable'));
        assert.deepEqual(GeminiAdapter.getActiveToolMode(), { active: false, label: '' });
        assert.equal(GeminiAdapter.getSidebarOverflowContainer(), null);
        const runtime = GeminiAdapter.getRuntimeProbeReport();
        assert.equal(runtime.page.pathKind, 'other');
        assert.equal(runtime.probes.sidebar.firstRowActionPresent, false);
    });

    it('labels URL/control-only native surfaces degraded and still assigns them to Gemini', () => {
        const document = installFixture('native-semantic-fallback');
        appendFixtureNode(document, { key: 'data-theme-host', tag: 'div', classes: ['theme-host'], attrs: { 'data-theme': 'dark' } });
        const report = GeminiAdapter.getCapabilityProbeReport();

        assert.equal(GeminiAdapter.isNewChatUrl(), true);
        assert.equal(GeminiAdapter.getRuntimeProbeReport().page.pathKind, 'new-chat');
        for (const capability of report.nativeCapabilities) {
            assert.equal(capability.status, 'native-owned', capability.id);
            assert.equal(capability.quality, 'degraded', capability.id);
            assert.equal(capability.owner, 'gemini-native');
            assert.equal(capability.extensionFeature, false);
            assert.match(capability.reason, /semantic URL\/control fallback/);
        }
        assert.equal(report.theme.mode, 'dark');
    });
});

describe('GeminiAdapter preserved public fallbacks', () => {
    it('normalizes multilingual model labels without guessing unknown values', () => {
        const normalize = GeminiAdapter._normalizeModelText;
        assert.equal(normalize(null), null);
        assert.equal(normalize(42), null);
        for (const value of ['Thinking', '思考', '사고']) assert.equal(normalize(value), 'thinking');
        for (const value of ['Gemini Pro', '专业', 'プロ', '프로']) assert.equal(normalize(value), 'pro');
        for (const value of ['Flash', 'Fast', '快速', '高速', '빠른']) assert.equal(normalize(value), 'flash');
        assert.equal(normalize('Experimental model'), null);
    });

    it('keeps account detection bounded to account anchors and preserves tier fallbacks', () => {
        const document = installFixture('unavailable');
        const account = appendFixtureNode(document, {
            key: 'account',
            tag: 'a',
            text: 'Ultra',
            attrs: { 'aria-label': 'Google Account fixture@example.invalid' }
        });
        assert.equal(GeminiAdapter.detectUserEmail(), 'fixture@example.invalid');
        assert.equal(GeminiAdapter.detectAccountTier(), 'ultra');

        account._text = 'Pro';
        assert.equal(GeminiAdapter.detectAccountTier(), 'pro');
        account._text = '';
        account._attributes.set('aria-label', 'Google Account');
        appendFixtureNode(document, {
            key: 'avatar',
            tag: 'img',
            attrs: { alt: 'alternate@example.invalid' }
        });
        const pill = appendFixtureNode(document, {
            key: 'tier-pill',
            tag: 'button',
            classes: ['gds-pillbox-button'],
            text: 'Ultra'
        });
        assert.equal(GeminiAdapter.detectUserEmail(), 'alternate@example.invalid');
        assert.equal(GeminiAdapter.detectAccountTier(), 'ultra');
        pill._text = 'Pro';
        assert.equal(GeminiAdapter.detectAccountTier(), 'pro');
        pill._text = '';
        assert.equal(GeminiAdapter.detectAccountTier(), 'free');

        const originalAll = document.querySelectorAll.bind(document);
        document.querySelectorAll = () => { throw new Error('fixture query failure'); };
        assert.equal(GeminiAdapter.detectUserEmail(), null);
        document.querySelectorAll = originalAll;
        const originalOne = document.querySelector.bind(document);
        document.querySelector = () => { throw new Error('fixture query failure'); };
        assert.equal(GeminiAdapter.detectAccountTier(), 'free');
        document.querySelector = originalOne;

        const noEmailDocument = installFixture('unavailable');
        appendFixtureNode(noEmailDocument, {
            key: 'account-without-email', tag: 'div', attrs: { 'aria-label': 'Account settings' }
        });
        assert.equal(GeminiAdapter.detectUserEmail(), null);

        const noLabelQuery = noEmailDocument.querySelectorAll.bind(noEmailDocument);
        noEmailDocument.querySelectorAll = selector => selector === GeminiAdapter.SELECTORS.USER_AREAS
            ? [{ getAttribute() { return null; } }]
            : noLabelQuery(selector);
        assert.equal(GeminiAdapter.detectUserEmail(), null);
    });

    it('recognizes send controls by state and semantics and resolves their closest button', () => {
        const document = installFixture('unavailable');
        const makeButton = (key, attrs = {}, classes = []) => new FixtureElement({ key, tag: 'button', attrs, classes }, document);
        assert.equal(GeminiAdapter.isSendButtonElement(null), false);
        const disabled = makeButton('disabled', { 'aria-label': 'Send message', disabled: '' });
        assert.equal(GeminiAdapter.isSendButtonElement(disabled), false);
        assert.equal(GeminiAdapter.isSendButtonElement(makeButton('class-send', {}, ['send-button'])), true);
        for (const label of ['Send message', 'Send', 'Send prompt', '发送', '送信', '전송', '보내기']) {
            assert.equal(GeminiAdapter.isSendButtonElement(makeButton(`send-${label}`, { 'aria-label': label })), true, label);
        }
        assert.equal(GeminiAdapter.isSendButtonElement(makeButton('other', { 'aria-label': 'Save' })), false);
        assert.equal(GeminiAdapter.isSendButtonElement(makeButton('unnamed')), false);

        const button = makeButton('closest', { 'aria-label': 'Send prompt' });
        const icon = new FixtureElement({ key: 'send-icon', tag: 'span' }, document);
        icon.parentElement = button;
        button.children.push(icon);
        assert.equal(GeminiAdapter.getClosestSendButton(icon), button);
        assert.equal(GeminiAdapter.getClosestSendButton(document.body), null);
    });

    it('preserves URL, title, sidebar, tool-mode, and style fallback behavior', () => {
        let document = installFixture('legacy-fallback');
        assert.equal(GeminiAdapter.isNewChatUrl(), false);
        globalThis.location = new URL('https://gemini.google.com/app');
        globalThis.window.location = globalThis.location;
        assert.equal(GeminiAdapter.isNewChatUrl(), true);
        globalThis.location = new URL('https://gemini.google.com/app?fixture=1');
        globalThis.window.location = globalThis.location;
        assert.equal(GeminiAdapter.isNewChatUrl(), true);
        delete globalThis.window;
        assert.equal(GeminiAdapter.getChatId(), null);

        document = installFixture('unavailable');
        const a11yTitle = appendFixtureNode(document, {
            key: 'a11y-title', tag: 'h1', classes: ['cdk-visually-hidden'], text: 'A11y fixture title'
        });
        assert.equal(GeminiAdapter.getChatTitleText(), 'A11y fixture title');
        a11yTitle._text = 'Conversation with Gemini';
        const firstQuery = appendFixtureNode(document, {
            key: 'fallback-query', tag: 'div', classes: ['query-text'], text: 'x'.repeat(80)
        });
        assert.equal(GeminiAdapter.getChatTitleText(), 'x'.repeat(50));
        a11yTitle.classList = new FixtureClassList();
        const firstMessageReport = GeminiAdapter.getCapabilityProbeReport();
        assert.equal(capabilityMap(firstMessageReport, 'adapterCapabilities').get('title').status, 'degraded');
        firstQuery._text = '';
        assert.equal(GeminiAdapter.getChatTitleText(), '');
        const detachedHeaderButton = new FixtureElement({
            key: 'detached-header-button', tag: 'button', attrs: { 'data-test-id': 'conversation-actions-menu-button' }
        }, document);
        const originalHeaderQuery = document.querySelector.bind(document);
        document.querySelector = selector => selector === 'button[data-test-id="conversation-actions-menu-button"]'
            ? detachedHeaderButton
            : originalHeaderQuery(selector);
        assert.equal(GeminiAdapter.getChatHeader(), detachedHeaderButton);
        document.querySelector = originalHeaderQuery;

        const directUserMessage = appendFixtureNode(document, {
            key: 'direct-user-message', tag: 'user-query', text: 'Direct user text'
        });
        const emptyModelMessage = appendFixtureNode(document, {
            key: 'empty-model-message', tag: 'model-response', text: ''
        });
        assert.deepEqual(GeminiAdapter.getCurrentConversationMessages().map(message => message.text), ['Direct user text']);
        assert.equal(emptyModelMessage.textContent, '');

        const sidebar = appendFixtureNode(document, { key: 'fallback-sidebar', tag: 'bard-sidenav' });
        const overflow = appendFixtureNode(document, { key: 'overflow', tag: 'div', classes: ['overflow-container'] }, 'fallback-sidebar');
        assert.equal(GeminiAdapter.getSidebarOverflowContainer(), overflow);
        const untitledLink = appendFixtureNode(document, { key: 'untitled-link', tag: 'a', attrs: { href: '/app/untitled_fixture' } }, 'fallback-sidebar');
        const emptyTitleLink = appendFixtureNode(document, { key: 'empty-title-link', tag: 'a', attrs: { href: '/app/empty_title_fixture' } }, 'fallback-sidebar');
        appendFixtureNode(document, { key: 'empty-title-span', tag: 'span', text: '' }, 'empty-title-link');
        appendFixtureNode(document, { key: 'invalid-link', tag: 'a', attrs: { href: '/app/not/a-chat' } }, 'fallback-sidebar');
        assert.equal(GeminiAdapter.scanSidebarChatLinks().find(chat => chat.element === untitledLink).title, 'Untitled');
        assert.equal(GeminiAdapter.scanSidebarChatLinks().find(chat => chat.element === emptyTitleLink).title, 'Untitled');
        assert.equal(GeminiAdapter.getChatRowMoreButton(null), null);
        assert.equal(GeminiAdapter.getChatRowMoreButton(untitledLink), null);
        const detachedChat = new FixtureElement({ key: 'detached-chat', tag: 'a', attrs: { href: '/app/detached' } }, document);
        assert.equal(GeminiAdapter.getChatRowMoreButton(detachedChat), null);

        const composer = appendFixtureNode(document, { key: 'tool-composer', tag: 'div', attrs: { 'data-test-id': 'textarea-wrapper' } });
        const tool = appendFixtureNode(document, {
            key: 'tool', tag: 'button', text: 'Deep Research', attrs: { 'aria-pressed': 'true' }
        }, 'tool-composer');
        assert.deepEqual(GeminiAdapter.getActiveToolMode(), { active: true, label: 'Deep Research' });
        assert.deepEqual(GeminiAdapter.getVisibleToolModeEntries(), [{ index: 0, label: 'Deep Research', active: true }]);
        const originalToolQuery = document.querySelectorAll.bind(document);
        document.querySelectorAll = selector => selector === GeminiAdapter.SELECTORS.TOOL_MODE_CANDIDATE
            ? [{
                textContent: 'Canvas',
                getAttribute(name) { return name === 'aria-current' ? 'true' : null; }
            }]
            : originalToolQuery(selector);
        assert.deepEqual(GeminiAdapter.getVisibleToolModeEntries(), [{ index: 0, label: 'Canvas', active: true }]);
        document.querySelectorAll = originalToolQuery;
        assert.equal(GeminiAdapter.isInsideInputEditor(tool), false);
        assert.equal(GeminiAdapter.getModelSwitchLabel(), '');
        assert.equal(GeminiAdapter.getRichResponseProbeReport().hasRichContent, false);

        assert.deepEqual(GeminiAdapter.buildUITweakCssRules(), []);
        const rules = GeminiAdapter.buildUITweakCssRules({ chatWidth: 900, sidebarWidth: 320, hideGems: true });
        assert.equal(rules.length, 3);
        assert.match(rules[0], /max-width: 900px/);
        assert.match(rules[1], /width: 320px/);
        assert.match(rules[2], /display: none/);
        assert.deepEqual(GeminiAdapter.buildUITweakCssRules({ chatWidth: NaN, sidebarWidth: Infinity, hideGems: false }), []);
        assert.equal(sidebar.key, 'fallback-sidebar');
    });

    it('keeps model menu, delete menu, and confirm dialog fallbacks reachable', () => {
        let document = installFixture('unavailable');
        const modeButton = appendFixtureNode(document, { key: 'mode', tag: 'button', text: 'Unknown', attrs: { 'data-test-id': 'bard-mode-menu-button' } });
        appendFixtureNode(document, { key: 'flash-lite', tag: 'gem-menu-item', text: 'Flash-Lite', attrs: { role: 'menuitem', 'data-test-id': 'bard-mode-option-flash-lite', 'data-mode-id': 'lite' } });
        const flash = appendFixtureNode(document, { key: 'flash', tag: 'gem-menu-item', text: 'Flash', attrs: { role: 'menuitem', 'data-test-id': 'bard-mode-option-flash', 'data-mode-id': 'flash' } });
        const thinking = appendFixtureNode(document, { key: 'thinking', tag: 'gem-menu-item', text: 'Thinking', attrs: { role: 'menuitem', 'data-test-id': 'bard-mode-option-thinking', 'data-active': 'true' } });
        appendFixtureNode(document, { key: 'unknown-option', tag: 'gem-menu-item', text: 'Experimental', classes: ['selected'], attrs: { role: 'menuitem', 'data-test-id': 'bard-mode-option-experimental' } });
        assert.equal(GeminiAdapter.detectModelKey(), 'thinking');
        assert.equal(GeminiAdapter.getModelMenuOptions().length, 4);
        assert.equal(GeminiAdapter.findModelMenuItem('flash'), flash);
        assert.equal(GeminiAdapter.findModelMenuItem('thinking'), thinking);
        assert.equal(GeminiAdapter.findModelMenuItem('missing'), null);
        modeButton._text = 'Flash';
        assert.equal(GeminiAdapter.detectModelKey(), 'flash');
        modeButton._text = '';
        assert.equal(GeminiAdapter.getModelSwitchLabel(), '');
        const originalQuery = document.querySelector.bind(document);
        document.querySelector = () => { throw new Error('fixture model query failure'); };
        assert.equal(GeminiAdapter.detectModelKey(), null);
        document.querySelector = originalQuery;

        const originalAll = document.querySelectorAll.bind(document);
        document.querySelectorAll = selector => selector === GeminiAdapter.SELECTORS.MODE_MENU_ITEM
            ? [{
                textContent: null,
                getAttribute() { return null; }
            }]
            : originalAll(selector);
        assert.deepEqual(GeminiAdapter.getModelMenuOptions().map(({ label, active }) => ({ label, active })), [
            { label: '', active: false }
        ]);
        document.querySelectorAll = originalAll;

        const overlay = appendFixtureNode(document, { key: 'overlay', tag: 'div', classes: ['cdk-overlay-pane'] });
        const menu = appendFixtureNode(document, { key: 'menu', tag: 'div', attrs: { role: 'menu' } }, 'overlay');
        const deleteById = appendFixtureNode(document, { key: 'delete-id', tag: 'button', text: 'Remove', attrs: { 'data-test-id': 'delete-button', role: 'menuitem' } }, 'menu');
        assert.equal(GeminiAdapter.getMenuPanel(), menu);
        assert.equal(GeminiAdapter.getDeleteMenuItem(), deleteById);

        document = installFixture('unavailable');
        const textDelete = appendFixtureNode(document, { key: 'delete-text', tag: 'button', text: '删除', attrs: { role: 'menuitem' } });
        assert.equal(GeminiAdapter.getDeleteMenuItem(), textDelete);
        textDelete._text = 'Keep';
        assert.equal(GeminiAdapter.getDeleteMenuItem(), null);
        const originalMenuPanel = GeminiAdapter.getMenuPanel;
        GeminiAdapter.getMenuPanel = () => ({
            querySelector() { return null; },
            querySelectorAll() { return [{ textContent: null }]; }
        });
        assert.equal(GeminiAdapter.getDeleteMenuItem(), null);
        GeminiAdapter.getMenuPanel = originalMenuPanel;

        const dialog = appendFixtureNode(document, { key: 'dialog', tag: 'div', attrs: { role: 'dialog' } });
        const cancel = appendFixtureNode(document, { key: 'cancel', tag: 'button', text: 'Cancel' }, 'dialog');
        const confirm = appendFixtureNode(document, { key: 'confirm', tag: 'button', text: 'Confirm' }, 'dialog');
        assert.equal(GeminiAdapter.getConfirmDialog(), dialog);
        const ownedRoot = appendFixtureNode(document, {
            key: 'owned-dialog-root', tag: 'div', attrs: { 'data-primer-owned': '' }
        });
        appendFixtureNode(document, { key: 'owned-dialog', tag: 'div', attrs: { role: 'dialog' } }, 'owned-dialog-root');
        const hiddenDialog = appendFixtureNode(document, {
            key: 'hidden-dialog', tag: 'div', attrs: { role: 'alertdialog', 'aria-hidden': 'true' }
        });
        assert.equal(GeminiAdapter.getConfirmDialog(), dialog, 'Primer-owned and hidden dialogs are ignored');
        assert.equal(ownedRoot.getAttribute('data-primer-owned'), '');
        assert.equal(hiddenDialog.getAttribute('aria-hidden'), 'true');
        assert.equal(GeminiAdapter.getDialogConfirmButton(), confirm);
        confirm._text = 'Keep';
        assert.equal(GeminiAdapter.getDialogConfirmButton(dialog), null);
        document = installFixture('unavailable');
        assert.equal(GeminiAdapter.getDialogConfirmButton(null), null);
        assert.equal(cancel.key, 'cancel');
    });
});

describe('GeminiAdapter high-level navigation and composer ports', () => {
    it('creates stable current-chat locators and only succeeds after locating a rendered target', () => {
        const document = installFixture('current-full');
        const user = document.nodes.get('user-message');
        const userText = document.nodes.get('user-message-text');
        const model = document.nodes.get('model-message');
        const main = document.nodes.get('main');

        assert.equal(GeminiAdapter.getCurrentHref(), 'https://gemini.google.com/app/chat_current_2026');
        assert.deepEqual(GeminiAdapter.getMessageLocatorForNode(user), {
            kind: 'message', chatId: 'chat_current_2026', messageId: 'fixture-user-message', ordinal: 0
        });
        assert.deepEqual(GeminiAdapter.getMessageLocatorForNode(document.nodes.get('code')), {
            kind: 'message', chatId: 'chat_current_2026', messageId: 'fixture-model-message', ordinal: 1
        });
        assert.deepEqual(GeminiAdapter.getMessageLocatorForNode(main), {
            kind: 'chat', chatId: 'chat_current_2026'
        });
        assert.equal(GeminiAdapter.getMessageLocatorForNode(document.body), null);

        const ghost = new FixtureElement({ key: 'ghost', tag: 'user-query' }, document);
        ghost.parentElement = main;
        assert.deepEqual(GeminiAdapter.getMessageLocatorForNode(ghost), {
            kind: 'chat', chatId: 'chat_current_2026'
        });

        const idMessage = appendFixtureNode(document, {
            key: 'id-message', tag: 'model-response', attrs: { id: 'fixture-dom-id' }, text: 'ID message'
        }, 'main');
        assert.equal(GeminiAdapter.getMessageLocatorForNode(idMessage).messageId, 'fixture-dom-id');

        const noIdMessage = appendFixtureNode(document, {
            key: 'no-id-message', tag: 'model-response', text: 'No ID message'
        }, 'main');
        assert.equal(GeminiAdapter.getMessageLocatorForNode(noIdMessage).messageId, null);

        assert.equal(GeminiAdapter.openMessageLocator(null), false);
        assert.equal(GeminiAdapter.openMessageLocator({ kind: 'chat' }), false);
        assert.equal(GeminiAdapter.openMessageLocator({ kind: 'chat', chatId: 'other' }), false);
        assert.equal(GeminiAdapter.openMessageLocator({ kind: 'unknown', chatId: 'chat_current_2026' }), false);
        assert.equal(GeminiAdapter.openMessageLocator({ kind: 'chat', chatId: 'chat_current_2026' }), true);
        userText.hasAttribute = name => userText._attributes.has(name);
        userText.setAttribute = (name, value) => userText._attributes.set(name, String(value));
        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'fixture-user-message'
        }), true);
        assert.deepEqual(user.scrolledWith, { block: 'center', behavior: 'auto' });
        assert.deepEqual(userText.focusedWith, { preventScroll: true });
        assert.equal(userText.getAttribute('tabindex'), '-1');

        userText.setAttribute('tabindex', '0');
        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'fixture-user-message'
        }), true);
        assert.equal(userText.getAttribute('tabindex'), '0');

        const originalUserTextFocus = userText.focus;
        userText.focus = undefined;
        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'fixture-user-message'
        }), true);
        userText.focus = originalUserTextFocus;

        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'missing', ordinal: 1
        }), false);
        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'm_1', ordinal: 1
        }), true);
        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'm_1', ordinal: 1
        }, { requireStable: true }), false);
        assert.equal(model.focusedWith.preventScroll, true);
        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'missing', ordinal: 99
        }), false);
        assert.equal(GeminiAdapter.openMessageLocator({
            kind: 'message', chatId: 'chat_current_2026', ordinal: -1
        }), false);
        assert.equal(GeminiAdapter.jumpToMessage({
            kind: 'message', chatId: 'chat_current_2026', messageId: 'fixture-model-message'
        }), true);
    });

    it('inserts text into textarea and contenteditable composers without sending', () => {
        let document = installFixture('unavailable');
        const textarea = appendFixtureNode(document, {
            key: 'textarea', tag: 'textarea', attrs: { 'data-test-id': 'textarea-inner' }
        });
        textarea.value = 'abcd';
        textarea.selectionStart = 1;
        textarea.selectionEnd = 3;

        assert.equal(GeminiAdapter.insertComposerText('X'), true);
        assert.equal(textarea.value, 'aXd');
        assert.equal(textarea.dispatchedEvents[0].type, 'input');
        assert.equal(textarea.dispatchedEvents[0].data, 'X');
        delete textarea.selectionStart;
        delete textarea.selectionEnd;
        assert.equal(GeminiAdapter.insertComposerText('!'), true);
        assert.equal(textarea.value, 'aXd!');
        assert.equal(GeminiAdapter.insertComposerText('replace', { replace: true }), true);
        assert.equal(textarea.value, 'replace');

        const originalEditor = GeminiAdapter.getInputEditor;
        const detachedTextarea = {
            ownerDocument: null,
            value: '',
            selectionStart: 0,
            selectionEnd: 0,
            focus() {},
            dispatchEvent(event) { this.event = event; return true; }
        };
        GeminiAdapter.getInputEditor = () => detachedTextarea;
        assert.equal(GeminiAdapter.insertComposerText('detached'), true);
        assert.equal(detachedTextarea.value, 'detached');
        assert.equal(detachedTextarea.event.type, 'input');
        GeminiAdapter.getInputEditor = originalEditor;

        document = installFixture('unavailable');
        const rich = appendFixtureNode(document, {
            key: 'rich-editor', tag: 'div', text: 'A', attrs: { 'data-test-id': 'textarea-inner', contenteditable: 'true' }
        });
        assert.equal(GeminiAdapter.insertComposerText('B'), true);
        assert.equal(rich.textContent, 'AB');
        assert.equal(GeminiAdapter.insertComposerText('C', { replace: true }), true);
        assert.equal(rich.textContent, 'C');
        document.execCommand = () => true;
        assert.equal(GeminiAdapter.insertComposerText('D'), true);
        assert.equal(rich.textContent, 'C', 'successful native insertion is not duplicated');

        rich.dispatchEvent = undefined;
        assert.equal(GeminiAdapter.insertComposerText('E', { replace: true }), true);
        document.defaultView = {};
        rich.dispatchEvent = () => true;
        assert.equal(GeminiAdapter.insertComposerText('F', { replace: true }), true);

        document = installFixture('unavailable');
        const emptyRich = appendFixtureNode(document, {
            key: 'empty-rich-editor', tag: 'div', attrs: { 'data-test-id': 'textarea-inner', contenteditable: 'true' }
        });
        assert.equal(GeminiAdapter.insertComposerText('first'), true);
        assert.equal(emptyRich.textContent, 'first');

        assert.equal(GeminiAdapter.insertComposerText(''), false);
        assert.equal(GeminiAdapter.insertComposerText(null), false);
        document = installFixture('unavailable');
        assert.equal(GeminiAdapter.insertComposerText('missing'), false);

        const originalEditorFallback = GeminiAdapter.getInputEditor;
        GeminiAdapter.getInputEditor = () => ({ focus() {}, getAttribute() { return null; } });
        assert.equal(GeminiAdapter.insertComposerText('unsupported'), false);
        GeminiAdapter.getInputEditor = originalEditorFallback;
    });

    it('keeps URL and diagnostics fallbacks explicit when globals are absent or malformed', () => {
        const document = installFixture('unavailable');
        const currentLocation = globalThis.location;
        delete globalThis.location;
        assert.equal(GeminiAdapter.getCurrentHref(), globalThis.window.location.href);

        globalThis.location = { href: 'not a URL' };
        assert.equal(GeminiAdapter.isNewChatUrl(), false);
        assert.equal(GeminiAdapter.getChatId(), null);

        Object.defineProperty(globalThis, 'location', {
            configurable: true,
            get() { throw new Error('location unavailable'); }
        });
        assert.equal(GeminiAdapter.getCurrentHref(), '');
        Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: currentLocation });

        delete globalThis.location;
        delete globalThis.window;
        const report = GeminiAdapter.getRuntimeProbeReport();
        assert.equal(report.page.host, '');
        assert.deepEqual(report.page.viewport, { width: 0, height: 0, dpr: 1 });

        globalThis.document = document;
    });
});

describe('GeminiAdapter current mutation zones', () => {
    it('matches current sidebar, composer, header, and model records while preserving Primer-owned suppression', () => {
        const document = installFixture('current-full');
        const sidebar = document.nodes.get('sidebar');
        const nativeRow = document.nodes.get('chat-row');
        const composer = document.nodes.get('textarea-inner');
        const editor = document.nodes.get('editor');
        const header = document.nodes.get('header');
        const headerMenu = document.nodes.get('header-menu');
        const modeButton = document.nodes.get('mode-button');
        const primerNode = new FixtureElement({ key: 'primer', tag: 'div', classes: ['gc-fixture-owned'] }, document);
        primerNode.parentElement = sidebar;
        const primerTarget = new FixtureElement({ key: 'primer-target', tag: 'div', attrs: { id: 'gf-primer-target' } }, document);
        primerTarget.parentElement = sidebar;
        const primerGcId = new FixtureElement({ key: 'primer-gc-id', tag: 'div', attrs: { id: 'gc-primer-id' } }, document);
        primerGcId.parentElement = sidebar;
        const primerGfClass = new FixtureElement({ key: 'primer-gf-class', tag: 'div', classes: ['gf-fixture-owned'] }, document);
        primerGfClass.parentElement = sidebar;
        const primerTextNode = { nodeType: 3, parentElement: primerNode };
        const nativeTextNode = { nodeType: 3, parentElement: nativeRow };

        const nativeSidebarMutation = { type: 'childList', target: sidebar, addedNodes: [nativeRow], removedNodes: [] };
        const primerSidebarMutation = { type: 'childList', target: sidebar, addedNodes: [primerNode], removedNodes: [] };
        assert.equal(GeminiAdapter.matchesSidebarMutation(nativeSidebarMutation), true);
        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation(nativeSidebarMutation), true);
        assert.equal(GeminiAdapter.matchesSidebarMutation(primerSidebarMutation), false);
        assert.equal(GeminiAdapter.matchesFoldersSidebarMutation(primerSidebarMutation), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: primerTarget, addedNodes: [nativeRow] }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar, addedNodes: [primerGcId] }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar, addedNodes: [primerGfClass] }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar, addedNodes: [primerTextNode] }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar, addedNodes: [nativeTextNode] }), true);
        const nativeWithoutClassList = { nodeType: 1, id: '', closest() { return null; } };
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar, addedNodes: [nativeWithoutClassList] }), true);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar, addedNodes: [null] }), true);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar, removedNodes: [nativeRow] }), true);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: sidebar }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation(null), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'attributes', target: sidebar }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList' }), false);
        assert.equal(GeminiAdapter.matchesSidebarMutation({ type: 'childList', target: document.body, addedNodes: [nativeRow] }), false);
        assert.equal(GeminiAdapter.matchesInputAreaMutation({ type: 'childList', target: composer, addedNodes: [editor] }), true);
        assert.ok(!GeminiAdapter.matchesInputAreaMutation(null));
        assert.equal(GeminiAdapter.matchesInputAreaMutation({ type: 'attributes', target: composer }), false);
        assert.equal(GeminiAdapter.matchesHeaderMutation({ type: 'childList', target: header, addedNodes: [headerMenu] }), true);
        assert.ok(!GeminiAdapter.matchesHeaderMutation(null));
        assert.equal(GeminiAdapter.matchesHeaderMutation({ type: 'attributes', target: header }), false);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'attributes', target: modeButton }), true);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'attributes', target: document.body }), false);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'attributes', target: {} }), false);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'attributes', target: { matches() { throw new Error('invalid fixture selector'); } } }), false);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'childList', target: composer }), true);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'childList', target: {} }), false);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'childList', target: { closest() { throw new Error('invalid fixture selector'); } } }), false);
        assert.equal(GeminiAdapter.matchesModelMutation(null), false);
        assert.equal(GeminiAdapter.matchesModelMutation({ type: 'characterData', target: modeButton }), false);

        const originalQuery = document.querySelector.bind(document);
        document.querySelector = selector => {
            if (selector === 'bard-sidenav') throw new Error('invalid fixture selector');
            return originalQuery(selector);
        };
        assert.equal(GeminiAdapter.getSidebar(), null);
        document.querySelector = originalQuery;

        const modelMessage = document.nodes.get('model-message');
        const originalDescendants = modelMessage.querySelectorAll.bind(modelMessage);
        modelMessage.querySelectorAll = () => { throw new Error('invalid rich selector'); };
        assert.ok(GeminiAdapter.getRichResponseProbeReport().responseRootCount > 0);
        modelMessage.querySelectorAll = originalDescendants;
    });
});
