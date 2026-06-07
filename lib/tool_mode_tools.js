function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function normalizeText(value) {
    return toText(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function detectToolModeLabel(text) {
    const value = normalizeText(text);
    if (!value) return '';
    if (/\bdeep research\b/.test(value) || value.includes('深度研究') || value.includes('深入研究')) return 'Deep Research';
    if (/\bcanvas\b/.test(value) || value.includes('画布')) return 'Canvas';
    if (/\bspark\b/.test(value)) return 'Spark';
    if (/\baudio overview\b/.test(value) || value.includes('音频概览') || value.includes('音訊總覽')) return 'Audio Overview';
    if (/\bimage\b/.test(value) || /\bimagen\b/.test(value) || value.includes('图片') || value.includes('圖像') || value.includes('画像')) return 'Image';
    if (/\bvideo\b/.test(value) || /\bveo\b/.test(value) || value.includes('视频') || value.includes('影片')) return 'Video';
    return '';
}

function classTextFromState(state = {}) {
    if (Array.isArray(state.classList)) return state.classList.join(' ');
    return toText(state.className);
}

function isActiveToolModeState(state = {}) {
    const source = state && typeof state === 'object' ? state : {};
    if (source.ariaPressed === 'true') return true;
    if (source.ariaCurrent === 'true') return true;
    if (source.dataActive === 'true') return true;
    return /\b(active|selected|checked)\b/.test(classTextFromState(source));
}

function getToolModeState(candidate = {}) {
    const label = detectToolModeLabel(`${toText(candidate.text)} ${toText(candidate.ariaLabel)}`);
    return {
        active: !!label && isActiveToolModeState(candidate),
        label
    };
}

module.exports = {
    detectToolModeLabel,
    getToolModeState,
    isActiveToolModeState
};
