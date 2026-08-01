const { afterEach, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

let SELECTORS;
let captureVisibleTranscript;
let renderedMessageNodes;
let stableMessageId;
let transcriptInternals;
let limits;

function richNode(kind, { text = '', attrs = {}, parent = null } = {}) {
    const selectorByKind = {
        code: () => SELECTORS.TRANSCRIPT_CODE,
        math: () => SELECTORS.TRANSCRIPT_MATH,
        link: () => SELECTORS.TRANSCRIPT_LINK,
        citation: () => SELECTORS.TRANSCRIPT_CITATION,
        source: () => SELECTORS.TRANSCRIPT_SOURCE,
        tool: () => SELECTORS.TRANSCRIPT_TOOL
    };
    return {
        textContent: text,
        parentElement: parent,
        getAttribute(name) { return attrs[name] ?? null; },
        matches(selector) { return selectorByKind[kind]?.() === selector; },
        querySelectorAll() { return []; }
    };
}

function messageNode({ role = 'model', text = '', id = '', responseId = '', rich = [], unsupported = 0,
    richFailure = false, unsupportedFailure = false, userTarget = null } = {}) {
    const node = {
        id,
        textContent: text,
        parentElement: null,
        getAttribute(name) {
            if (name === 'data-response-id') return responseId || null;
            return null;
        },
        matches(selector) { return role === 'user' && selector === SELECTORS.USER_QUERY; },
        querySelector(selector) { return selector === SELECTORS.USER_QUERY_TEXT ? userTarget : null; },
        querySelectorAll(selector) {
            if (selector === SELECTORS.TRANSCRIPT_RICH_PART) {
                if (richFailure) throw new Error('rich query failed');
                return rich;
            }
            if (selector === SELECTORS.TRANSCRIPT_UNSUPPORTED_RICH) {
                if (unsupportedFailure) throw new Error('unsupported query failed');
                return Array.from({ length: unsupported }, () => ({}));
            }
            return [];
        }
    };
    for (const part of rich) if (!part.parentElement) part.parentElement = node;
    return node;
}

function documentFor(nodes) {
    return {
        querySelectorAll(selector) {
            assert.equal(selector, `${SELECTORS.USER_QUERY}, ${SELECTORS.MODEL_RESPONSE}`);
            return nodes;
        }
    };
}

before(async () => {
    ({ SELECTORS } = await import('../src/adapters/gemini/selectors.js'));
    ({
        captureVisibleTranscript,
        renderedMessageNodes,
        stableMessageId,
        transcriptInternals
    } = await import('../src/adapters/gemini/transcript.js'));
    ({ TRANSCRIPT_LIMITS: limits } = require('../lib/transcript_fidelity.js'));
});

afterEach(() => {
    delete globalThis.document;
    delete globalThis.location;
});

describe('Gemini adapter canonical visible transcript capture', () => {
    it('preserves ordered code, math, links, citations, tools, and sources without raw DOM', () => {
        const model = messageNode({ text: 'Rendered answer', responseId: 'stable-response' });
        const outerCode = richNode('code', {
            text: '  const answer = 42;\r\n', attrs: { class: 'language-js' }, parent: model
        });
        const nestedCode = richNode('code', { text: 'duplicate', parent: outerCode });
        const neutralWrapper = richNode('unknown', { parent: model });
        const wrappedLink = richNode('link', {
            text: 'Wrapped', attrs: { href: 'https://example.test/wrapped' }, parent: neutralWrapper
        });
        const parts = [
            outerCode,
            nestedCode,
            wrappedLink,
            richNode('math', { text: 'rendered x', attrs: { 'data-latex': 'x^2' }, parent: model }),
            richNode('math', { text: 'rendered y', parent: model }),
            richNode('link', {
                text: 'Docs', attrs: { href: 'https://user:pass@example.test/docs?q=secret#frag' }, parent: model
            }),
            richNode('citation', {
                text: 'Citation', attrs: { href: 'https://example.test/cite', 'data-citation': 'cite-1' }, parent: model
            }),
            richNode('tool', {
                text: 'Search result', attrs: { 'data-tool-name': 'Search', 'data-tool-status': 'done' }, parent: model
            }),
            richNode('source', {
                text: 'Primary source', attrs: { href: 'https://example.test/source', 'data-source-id': 'source-1' }, parent: model
            }),
            richNode('link', { attrs: { href: 'javascript:blocked()' }, parent: model }),
            richNode('unknown', { text: 'not selected', parent: model })
        ];
        model.querySelectorAll = selector => {
            if (selector === SELECTORS.TRANSCRIPT_RICH_PART) return parts;
            if (selector === SELECTORS.TRANSCRIPT_UNSUPPORTED_RICH) return [{}, {}];
            return [];
        };
        const userText = { textContent: 'Question' };
        const user = messageNode({ role: 'user', text: 'ignored shell', userTarget: userText, id: 'stable-user' });

        const capture = captureVisibleTranscript(documentFor([user, model]), 'https://gemini.google.com/app/chat');
        assert.deepEqual(capture.messages.map(item => item.id), ['stable-user', 'stable-response']);
        assert.deepEqual(capture.messages.map(item => item.text), ['Question', 'Rendered answer']);
        assert.deepEqual(capture.messages[1].structure.parts.map(part => part.type), [
            'code', 'link', 'math', 'math', 'link', 'citation', 'tool', 'source'
        ]);
        assert.equal(capture.messages[1].structure.parts[0].text, '  const answer = 42;\n');
        assert.equal(capture.messages[1].structure.parts[0].language, 'js');
        assert.equal(capture.messages[1].structure.parts[1].href, 'https://example.test/wrapped');
        assert.equal(capture.messages[1].structure.parts[2].notation, 'tex');
        assert.equal(capture.messages[1].structure.parts[3].notation, 'rendered-text');
        assert.equal(capture.messages[1].structure.parts[4].href, 'https://example.test/docs');
        assert.equal(capture.messages[1].structure.parts[5].sourceId, 'cite-1');
        assert.equal(capture.messages[1].structure.parts[6].name, 'Search');
        assert.equal(capture.messages[1].structure.parts[7].sourceId, 'source-1');
        assert.equal(capture.fidelity.status, 'partial');
        assert.deepEqual(capture.fidelity.observed, { messages: 2, structuredMessages: 1, parts: 8 });
        const losses = new Map(capture.fidelity.losses.map(loss => [loss.code, loss.count]));
        assert.equal(losses.get('URL_METADATA_STRIPPED'), 2);
        assert.equal(losses.get('UNSUPPORTED_RICH_CONTENT'), 3);
        assert.equal(losses.get('NON_ALLOWLIST_METADATA_OMITTED'), 1);
        assert.deepEqual(structuredClone(capture), JSON.parse(JSON.stringify(capture)));
        assert.doesNotMatch(JSON.stringify(capture), /pass|secret|javascript/i);
    });

    it('reports every bounded loss and survives rollout-invalid rich selectors', () => {
        const long = 'x'.repeat(limits.maxMessageCharacters + 2);
        const nodes = Array.from({ length: limits.maxMessages + 1 }, (_value, index) => messageNode({
            role: 'user',
            text: long,
            userTarget: { textContent: index === 0 ? long : `message ${index}` },
            richFailure: index === 1,
            unsupportedFailure: index === 1
        }));
        const capture = captureVisibleTranscript(documentFor(nodes));
        assert.equal(capture.messages.length, limits.maxMessages);
        assert.equal(capture.messages[0].text.length, limits.maxMessageCharacters);
        const losses = new Map(capture.fidelity.losses.map(loss => [loss.code, loss.count]));
        assert.equal(losses.get('MESSAGE_LIMIT_REACHED'), 1);
        assert.equal(losses.get('MESSAGE_TEXT_TRUNCATED'), 2);
        assert.equal(losses.get('UNSUPPORTED_RICH_CONTENT'), 2);

        const root = messageNode({ text: 'root' });
        const tooMany = Array.from({ length: limits.maxPartsPerMessage + 2 }, () =>
            richNode('tool', { text: 'tool', parent: root }));
        root.querySelectorAll = selector => selector === SELECTORS.TRANSCRIPT_RICH_PART ? tooMany : [];
        const partLimited = captureVisibleTranscript(documentFor([root]));
        assert.equal(partLimited.messages[0].structure.parts.length, limits.maxPartsPerMessage);
        assert.equal(partLimited.fidelity.losses.find(loss => loss.code === 'PART_LIMIT_REACHED').count, 2);
    });

    it('covers public helpers and default browser boundaries', () => {
        const doc = documentFor([]);
        assert.deepEqual(renderedMessageNodes(doc), []);
        assert.equal(stableMessageId({ getAttribute: name => name === 'data-message-id' ? 'message' : null }), 'message');
        assert.equal(stableMessageId({ getAttribute: name => name === 'data-response-id' ? 'response' : null }), 'response');
        assert.equal(stableMessageId({ getAttribute: () => null, id: 'element' }), 'element');
        assert.equal(stableMessageId({}), null);

        const losses = [];
        assert.equal(transcriptInternals.boundedText('ok', 3, losses, 'PART_TEXT_TRUNCATED'), 'ok');
        assert.equal(transcriptInternals.boundedText('long', 2, losses, 'PART_TEXT_TRUNCATED'), 'lo');
        assert.deepEqual(losses, [{ code: 'PART_TEXT_TRUNCATED', count: 2 }]);
        const explicit = richNode('code', { attrs: { 'data-language': 'typescript' } });
        assert.equal(transcriptInternals.codeLanguage(explicit), 'typescript');
        assert.equal(transcriptInternals.codeLanguage(richNode('code')), '');
        assert.equal(transcriptInternals.classifyPart(richNode('unknown')), null);
        assert.equal(transcriptInternals.metadataText({ getAttribute: () => '' }, 'one', 'two'), '');

        globalThis.document = doc;
        globalThis.location = { href: 'https://gemini.google.com/app/test' };
        assert.deepEqual(captureVisibleTranscript().messages, []);

        const emptyUser = messageNode({ role: 'user', text: '', userTarget: null });
        assert.deepEqual(captureVisibleTranscript(documentFor([emptyUser])).messages, []);
    });
});
