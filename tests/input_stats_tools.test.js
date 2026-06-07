const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    formatInputStats,
    getInputStats,
    normalizeInputText
} = require('../lib/input_stats_tools.js');

describe('input_stats_tools', () => {
    it('normalizes prompt text line endings without trimming user input', () => {
        assert.equal(normalizeInputText('one\r\ntwo\rthree'), 'one\ntwo\nthree');
        assert.equal(normalizeInputText(null), '');
        assert.equal(normalizeInputText('  keep spaces  '), '  keep spaces  ');
    });

    it('counts characters, non-whitespace characters, and visible lines', () => {
        assert.deepEqual(getInputStats('Hi Gemini\n第二行'), {
            characters: 13,
            nonWhitespaceCharacters: 11,
            lines: 2,
            isEmpty: false
        });
        assert.deepEqual(getInputStats('   \n\t'), {
            characters: 5,
            nonWhitespaceCharacters: 0,
            lines: 2,
            isEmpty: true
        });
        assert.deepEqual(getInputStats(''), {
            characters: 0,
            nonWhitespaceCharacters: 0,
            lines: 0,
            isEmpty: true
        });
    });

    it('formats stats for native input counter labels', () => {
        assert.equal(formatInputStats('A'), '1 char · 1 line');
        assert.equal(formatInputStats('A\nB'), '3 chars · 2 lines');
        assert.equal(formatInputStats('你好', { locale: 'zh' }), '2 字 · 1 行');
        assert.equal(formatInputStats({ characters: 0, lines: 0 }, { locale: 'en' }), '0 chars · 0 lines');
    });
});
