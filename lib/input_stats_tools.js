function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function normalizeInputText(value) {
    return toText(value).replace(/\r\n?/g, '\n');
}

function countCharacters(text) {
    return Array.from(text).length;
}

function getInputStats(value) {
    const text = normalizeInputText(value);
    const trimmed = text.trim();
    return {
        characters: countCharacters(text),
        nonWhitespaceCharacters: Array.from(text).filter(char => !/\s/u.test(char)).length,
        lines: text.length ? text.split('\n').length : 0,
        isEmpty: trimmed.length === 0
    };
}

function pluralize(count, singular, plural) {
    return count === 1 ? singular : plural;
}

function formatInputStats(value, opts = {}) {
    const stats = typeof value === 'object' && value && Number.isFinite(value.characters)
        ? value
        : getInputStats(value);
    const locale = opts.locale === 'zh' ? 'zh' : 'en';
    if (locale === 'zh') {
        return `${stats.characters} 字 · ${stats.lines} 行`;
    }
    return `${stats.characters} ${pluralize(stats.characters, 'char', 'chars')} · ${stats.lines} ${pluralize(stats.lines, 'line', 'lines')}`;
}

module.exports = {
    formatInputStats,
    getInputStats,
    normalizeInputText
};
