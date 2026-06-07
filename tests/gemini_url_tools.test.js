const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    extractGeminiChatId,
    isGeminiConversationHref
} = require('../lib/gemini_url_tools.js');

describe('gemini_url_tools', () => {
    it('extracts chat ids from Gemini app URLs', () => {
        assert.equal(extractGeminiChatId('/app/abcDEF_123-xyz'), 'abcDEF_123-xyz');
        assert.equal(extractGeminiChatId('https://gemini.google.com/app/chat-123'), 'chat-123');
        assert.equal(extractGeminiChatId('  /app/c_123  '), 'c_123');
    });

    it('rejects non-conversation app routes and malformed values', () => {
        assert.equal(extractGeminiChatId('/app'), null);
        assert.equal(extractGeminiChatId('/app/'), null);
        assert.equal(extractGeminiChatId('/app/download'), null);
        assert.equal(extractGeminiChatId('/app/download?source=nav'), null);
        assert.equal(extractGeminiChatId('/app/chat-123/extra'), null);
        assert.equal(extractGeminiChatId('/gem/chat-123'), null);
        assert.equal(extractGeminiChatId('https://example.com/app/chat-123'), null);
        assert.equal(extractGeminiChatId('http://['), null);
        assert.equal(extractGeminiChatId(null), null);
        assert.equal(extractGeminiChatId(undefined), null);
    });

    it('exposes a boolean conversation-href predicate', () => {
        assert.equal(isGeminiConversationHref('/app/chat-123'), true);
        assert.equal(isGeminiConversationHref('/app/download'), false);
    });
});
