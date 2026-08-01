const WHITESPACE = /^\s+$/u;

function segmentGraphemes(value) {
    return Array.from(
        new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value),
        entry => entry.segment
    );
}

/**
 * Build the normalized search text together with source-code-point offsets.
 * Offsets are computed per base-plus-mark cluster so compatibility expansion,
 * combining marks and surrogate pairs never leak UTF-16 positions into UI
 * snippets.
 */
export function projectSearchText(value) {
    const original = String(value ?? '');
    const sourceSegments = segmentGraphemes(original);
    const normalizedPoints = [];
    const offsets = [];
    let index = 0;

    while (index < sourceSegments.length) {
        const start = index;
        if (WHITESPACE.test(sourceSegments[index])) {
            while (index < sourceSegments.length && WHITESPACE.test(sourceSegments[index])) index += 1;
            if (normalizedPoints.length > 0 && normalizedPoints.at(-1) !== ' ') {
                normalizedPoints.push(' ');
                offsets.push({ start, end: index });
            }
            continue;
        }

        index += 1;
        const normalizedCluster = sourceSegments.slice(start, index).join('')
            .normalize('NFKC')
            .toLocaleLowerCase('und');
        for (const point of Array.from(normalizedCluster)) {
            normalizedPoints.push(point);
            offsets.push({ start, end: index });
        }
    }

    if (normalizedPoints.at(-1) === ' ') {
        normalizedPoints.pop();
        offsets.pop();
    }
    return { original, sourceSegments, normalized: normalizedPoints.join(''), normalizedPoints, offsets };
}

/** Normalizes case, compatibility characters and whitespace for matching. */
export function normalizeSearchText(value) {
    return projectSearchText(value).normalized;
}

/**
 * Deterministic Unicode tokenizer. Alphabetic/number runs become word tokens;
 * CJK runs additionally emit code points and bigrams without browser-specific
 * segmentation.
 */
export function tokenizeSearchText(value) {
    const normalized = normalizeSearchText(value);
    if (!normalized) return [];
    const tokens = [];
    const seen = new Set();
    const append = token => {
        if (token && !seen.has(token)) {
            seen.add(token);
            tokens.push(token);
        }
    };
    const cjk = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;
    const runs = normalized.match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu
    ) || [];
    for (const run of runs) {
        if (cjk.test(run)) {
            const points = Array.from(run);
            for (const point of points) append(point);
            for (let index = 0; index + 1 < points.length; index += 1) {
                append(points[index] + points[index + 1]);
            }
        } else {
            append(run);
        }
    }
    return tokens;
}

export function compileFields(fields) {
    const compiled = {};
    for (const [name, original] of Object.entries(fields)) {
        const normalized = normalizeSearchText(original);
        const tokenSet = new Set(tokenizeSearchText(normalized));
        compiled[name] = Object.freeze({
            original,
            normalized,
            tokens: Object.freeze({ has: token => tokenSet.has(token) })
        });
    }
    return Object.freeze(compiled);
}
