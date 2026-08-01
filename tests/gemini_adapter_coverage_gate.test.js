const { afterEach, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

let conversationMethods;
let sidebarMethods;
let transcriptInternals;
let SELECTORS;

function transcriptDocument(nodes = []) {
    return {
        querySelectorAll(selector) {
            assert.equal(selector, `${SELECTORS.USER_QUERY}, ${SELECTORS.MODEL_RESPONSE}`);
            return nodes;
        }
    };
}

function transcriptDocumentProxy(getNodes) {
    return {
        querySelectorAll(selector) {
            assert.equal(selector, `${SELECTORS.USER_QUERY}, ${SELECTORS.MODEL_RESPONSE}`);
            return getNodes();
        }
    };
}

function renderedMessage({ id = 'message-1', style = {} } = {}) {
    const attributes = new Map([['data-message-id', id]]);
    return {
        id: '',
        textContent: 'Rendered answer',
        style,
        getAttribute(name) { return attributes.get(name) || null; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        removeAttribute(name) { attributes.delete(name); },
        matches(selector) { return selector === SELECTORS.MODEL_RESPONSE; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        focus(options) { this.focusOptions = options; },
        scrollIntoView(options) { this.scrollOptions = options; }
    };
}

function conversationAdapter(chatId = 'chat-1') {
    return {
        ...conversationMethods,
        getChatId() { return chatId; }
    };
}

before(async () => {
    ({ conversationMethods } = await import('../src/adapters/gemini/conversation.js'));
    ({ sidebarMethods } = await import('../src/adapters/gemini/sidebar.js'));
    ({ transcriptInternals } = await import('../src/adapters/gemini/transcript.js'));
    ({ SELECTORS } = await import('../src/adapters/gemini/selectors.js'));
});

afterEach(() => {
    delete globalThis.document;
    delete globalThis.location;
});

describe('Gemini adapter direct ESM coverage gate', () => {
    it('captures the current transcript through the public conversation method', () => {
        globalThis.document = transcriptDocument([]);
        globalThis.location = { href: 'https://gemini.google.com/app/chat-1' };

        const capture = conversationMethods.getCurrentConversationTranscript();

        assert.deepEqual(capture.messages, []);
        assert.equal(capture.fidelity.captureMethod, 'visible-dom');
    });

    it('handles disappearing message locators and the ordinal miss explicitly', () => {
        const node = renderedMessage();
        const adapter = conversationAdapter();
        const locator = {
            kind: 'message',
            chatId: 'chat-1',
            messageId: 'message-1',
            ordinal: 0
        };

        globalThis.document = transcriptDocument([node]);
        assert.equal(adapter.hasMessageLocator({
            kind: 'message', chatId: 'chat-1', ordinal: 99
        }), false);

        let queries = 0;
        globalThis.document = transcriptDocumentProxy(() => (++queries === 1 ? [node] : []));
        assert.equal(adapter.openMessageLocator(locator), false);

        queries = 0;
        globalThis.document = transcriptDocumentProxy(() => (++queries === 1 ? [node] : []));
        assert.equal(adapter.highlightMessageLocator(locator), false);
    });

    it('highlights a stable message and restores styled and styleless nodes idempotently', () => {
        const originalStyle = {
            outline: '1px dotted red',
            outlineOffset: '1px',
            transition: 'opacity 1s'
        };
        const styled = renderedMessage({ style: { ...originalStyle } });
        const adapter = conversationAdapter();
        const locator = {
            kind: 'message', chatId: 'chat-1', messageId: 'message-1', ordinal: 0
        };
        globalThis.document = transcriptDocument([styled]);

        assert.equal(adapter.highlightMessageLocator(null), false);
        assert.equal(adapter.highlightMessageLocator({ kind: 'chat', chatId: 'chat-1' }), false);
        assert.equal(adapter.highlightMessageLocator({ ...locator, chatId: 'other-chat' }), false);

        const cleanup = adapter.highlightMessageLocator(locator);
        assert.equal(typeof cleanup, 'function');
        assert.equal(styled.getAttribute('data-primer-search-highlight'), 'active');
        assert.equal(styled.style.outline, '3px solid var(--primer-ui-color-focus, #6b7cff)');
        assert.equal(cleanup(), true);
        assert.deepEqual(styled.style, originalStyle);
        assert.equal(styled.getAttribute('data-primer-search-highlight'), null);
        assert.equal(cleanup(), false);

        const styleless = renderedMessage({ id: 'message-2', style: null });
        globalThis.document = transcriptDocument([styleless]);
        const stylelessCleanup = adapter.highlightMessageLocator({
            kind: 'message', chatId: 'chat-1', messageId: 'message-2', ordinal: 0
        });
        assert.equal(typeof stylelessCleanup, 'function');
        assert.equal(stylelessCleanup(), true);
    });

    it('opens sidebar chat locators only for valid current or clickable targets', () => {
        let clicks = 0;
        const clickable = { click() { clicks += 1; } };
        const adapter = {
            ...sidebarMethods,
            getChatId() { return 'current'; },
            scanSidebarChatLinks() { return this.items || []; },
            items: []
        };

        assert.equal(adapter.openChatLocator(null), false);
        assert.equal(adapter.openChatLocator('  '), false);
        assert.equal(adapter.openChatLocator('current'), true);
        assert.equal(adapter.openChatLocator({ chatId: 'missing' }), false);

        adapter.items = [{ id: 'target', element: null }];
        assert.equal(adapter.openChatLocator('target'), false);
        adapter.items = [{ id: 'target', element: {} }];
        assert.equal(adapter.openChatLocator({ chatId: 'target' }), false);
        adapter.items = [{ id: 'target', element: clickable }];
        assert.equal(adapter.openChatLocator({ chatId: 'target' }), true);
        assert.equal(clicks, 1);

        const withoutCurrentGetter = {
            ...sidebarMethods,
            scanSidebarChatLinks: () => [{ id: 'target', element: clickable }]
        };
        assert.equal(withoutCurrentGetter.openChatLocator('target'), true);
        assert.equal(clicks, 2);
    });

    it('waits for chat and message locators with bounded cancellation and retry outcomes', async () => {
        const sleeps = [];
        let current = 'other';
        let messageAvailable = false;
        const adapter = {
            ...sidebarMethods,
            getChatId() { return current; },
            hasMessageLocator(locator, options) {
                assert.equal(locator.kind, 'message');
                assert.deepEqual(options, { requireStable: true });
                return messageAvailable;
            }
        };
        const sleep = async interval => { sleeps.push(interval); };

        assert.equal(await adapter.waitForChatLocator(null), false);
        assert.equal(await adapter.waitForChatLocator(' '), false);
        assert.equal(await adapter.waitForChatLocator('target', {
            attempts: 0,
            interval: -1,
            sleep: null,
            signal: { aborted: true }
        }), false);
        assert.equal(await adapter.waitForChatLocator('target', {
            attempts: Number.NaN,
            interval: 0,
            sleep,
            signal: { aborted: true }
        }), false);

        current = 'target';
        assert.equal(await adapter.waitForChatLocator('target', {
            attempts: 1, interval: 0, sleep, signal: { aborted: false }
        }), true);
        assert.equal(await adapter.waitForChatLocator({ chatId: 'target', kind: 'chat' }, {
            attempts: 1, interval: 0, sleep
        }), true);

        const message = { chatId: 'target', kind: 'message', messageId: 'message-1' };
        messageAvailable = true;
        assert.equal(await adapter.waitForChatLocator(message, {
            attempts: 1, interval: 0, sleep
        }), true);

        messageAvailable = false;
        assert.equal(await adapter.waitForChatLocator(message, {
            attempts: 2, interval: 7, sleep
        }), false);
        assert.deepEqual(sleeps, [7]);

        assert.equal(await sidebarMethods.waitForChatLocator.call({
            getChatId: () => 'target'
        }, message, { attempts: 1, interval: 0, sleep }), false);

        current = 'other';
        assert.equal(await sidebarMethods.waitForChatLocator.call({}, 'target', {
            attempts: 1, interval: Number.NaN, sleep
        }), false);
    });

    it('uses the sidebar default wait function when a retry remains', async () => {
        const originalSetTimeout = globalThis.setTimeout;
        const delays = [];
        globalThis.setTimeout = (resolve, delay) => {
            delays.push(delay);
            resolve();
            return 1;
        };
        try {
            const result = await sidebarMethods.waitForChatLocator.call({
                getChatId: () => 'other'
            }, 'target', { attempts: 2, interval: 0 });
            assert.equal(result, false);
            assert.deepEqual(delays, [0]);
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }
    });

    it('normalizes an empty code node without stringifying null', () => {
        const losses = [];
        const part = transcriptInternals.partFromNode({
            textContent: null,
            getAttribute() { return null; }
        }, 'code', '', losses);

        assert.deepEqual(part, { type: 'code', text: '', language: '' });
        assert.deepEqual(losses, []);
    });
});
