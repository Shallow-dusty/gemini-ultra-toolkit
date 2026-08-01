const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'src');
const TEST_ROOT = path.join(PROJECT_ROOT, 'tests');

function projectPath(file) {
    return path.relative(PROJECT_ROOT, file).split(path.sep).join('/');
}

function walkFiles(root, predicate) {
    const files = [];
    const visit = directory => {
        const entries = fs.readdirSync(directory, { withFileTypes: true })
            .sort((left, right) => left.name.localeCompare(right.name, 'en'));
        for (const entry of entries) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(absolute);
            else if (entry.isFile() && predicate(absolute)) files.push(absolute);
        }
    };
    visit(root);
    return files;
}

const sourceFiles = walkFiles(SOURCE_ROOT, file => file.endsWith('.js'));
const testFiles = walkFiles(TEST_ROOT, file => file.endsWith('.test.js'));
const sourceCache = new Map();

function readSource(file) {
    if (!sourceCache.has(file)) sourceCache.set(file, fs.readFileSync(file, 'utf8'));
    return sourceCache.get(file);
}

function blankRange(output, source, start, end, sentinel = false) {
    let sentinelIndex = -1;
    for (let index = start; index < end; index += 1) {
        if (source[index] === '\n' || source[index] === '\r') continue;
        output[index] = ' ';
        if (sentinel && sentinelIndex === -1) sentinelIndex = index;
    }
    // A literal argument must remain visibly non-empty. This is what keeps
    // new Date(value) distinct from the forbidden zero-argument new Date().
    if (sentinelIndex !== -1) output[sentinelIndex] = '0';
}

function previousTokenAllowsRegex(source, slashIndex) {
    let index = slashIndex - 1;
    while (index >= 0 && /\s/.test(source[index])) index -= 1;
    if (index < 0 || /[([{,:;=!?&|+\-*%^~<>]/.test(source[index])) return true;
    if (!/[A-Za-z0-9_$]/.test(source[index])) return false;
    const end = index + 1;
    while (index >= 0 && /[A-Za-z0-9_$]/.test(source[index])) index -= 1;
    return /^(?:return|case|throw|yield|await|typeof|instanceof|in|of|delete|void|new)$/.test(
        source.slice(index + 1, end)
    );
}

function quotedEnd(source, start, quote) {
    let index = start + 1;
    while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index] === quote) return index + 1;
        else index += 1;
    }
    return source.length;
}

function regexEnd(source, start) {
    let index = start + 1;
    let inClass = false;
    while (index < source.length) {
        const character = source[index];
        if (character === '\\') index += 2;
        else if (character === '[') { inClass = true; index += 1; }
        else if (character === ']') { inClass = false; index += 1; }
        else if (character === '/' && !inClass) {
            index += 1;
            while (/[A-Za-z]/.test(source[index] || '')) index += 1;
            return index;
        } else index += 1;
    }
    return source.length;
}

function lexicalMask(source, { literals }) {
    const output = [...source];
    let index = 0;
    while (index < source.length) {
        const character = source[index];
        const next = source[index + 1];
        if (character === '/' && next === '/') {
            let end = index + 2;
            while (end < source.length && source[end] !== '\n' && source[end] !== '\r') end += 1;
            blankRange(output, source, index, end);
            index = end;
        } else if (character === '/' && next === '*') {
            const close = source.indexOf('*/', index + 2);
            const end = close === -1 ? source.length : close + 2;
            blankRange(output, source, index, end);
            index = end;
        } else if (character === "'" || character === '"' || character === '`') {
            const end = quotedEnd(source, index, character);
            if (literals) blankRange(output, source, index, end, true);
            index = end;
        } else if (character === '/' && previousTokenAllowsRegex(source, index)) {
            const end = regexEnd(source, index);
            if (literals) blankRange(output, source, index, end, true);
            index = end;
        } else index += 1;
    }
    return output.join('');
}

function commentsMasked(source) {
    return lexicalMask(source, { literals: false });
}

function executableSource(source) {
    return lexicalMask(source, { literals: true });
}

function readQuotedValue(source, start) {
    let index = start;
    while (/\s/.test(source[index] || '')) index += 1;
    const quote = source[index];
    if (quote !== "'" && quote !== '"') return null;
    const valueStart = index + 1;
    let value = '';
    index = valueStart;
    while (index < source.length) {
        if (source[index] === '\\' && index + 1 < source.length) {
            value += source[index + 1];
            index += 2;
        } else if (source[index] === quote) {
            return { index: valueStart, value };
        } else {
            value += source[index];
            index += 1;
        }
    }
    return null;
}

function moduleSpecifiers(source) {
    const code = executableSource(source);
    const records = [];
    const seen = new Set();
    const add = record => {
        if (!record) return;
        const key = `${record.index}:${record.value}`;
        if (!seen.has(key)) { seen.add(key); records.push(record); }
    };
    const statementEnd = start => {
        const semicolon = code.indexOf(';', start);
        return semicolon === -1 ? code.length : semicolon;
    };
    const findWord = (word, start, end) => {
        const expression = new RegExp(`\\b${word}\\b`, 'g');
        expression.lastIndex = start;
        const match = expression.exec(code);
        return match && match.index < end ? match.index : -1;
    };

    for (const expression of [/^[ \t]*import\b/gm, /^[ \t]*export\b/gm]) {
        let match;
        while ((match = expression.exec(code))) {
            const keyword = expression.source.includes('import') ? 'import' : 'export';
            const keywordIndex = match.index + match[0].lastIndexOf(keyword);
            let cursor = keywordIndex + keyword.length;
            while (/\s/.test(code[cursor] || '')) cursor += 1;
            if (keyword === 'import' && code[cursor] === '(') {
                add(readQuotedValue(source, cursor + 1));
                continue;
            }
            if (keyword === 'export' && code[cursor] !== '{' && code[cursor] !== '*') continue;
            const end = statementEnd(cursor);
            const from = findWord('from', cursor, end);
            if (from !== -1) add(readQuotedValue(source, from + 4));
            else if (keyword === 'import') add(readQuotedValue(source, cursor));
        }
    }

    const requireExpression = /\brequire\b/g;
    let match;
    while ((match = requireExpression.exec(code))) {
        let cursor = match.index + match[0].length;
        while (/\s/.test(code[cursor] || '')) cursor += 1;
        if (code[cursor] !== '(') continue;
        add(readQuotedValue(source, cursor + 1));
    }
    return records.sort((left, right) => left.index - right.index);
}

function resolvedProjectImport(importer, specifier) {
    if (specifier.startsWith('.')) return projectPath(path.resolve(path.dirname(importer), specifier));
    if (specifier.startsWith('src/')) return specifier.split(path.sep).join('/');
    return null;
}

function lineNumber(source, index) {
    return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

function physicalLines(source) {
    const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalized) return 0;
    const withoutFinalNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
    return withoutFinalNewline.split('\n').length;
}

function failWithViolations(rule, summary, violations) {
    if (violations.length === 0) return;
    const sorted = violations.slice().sort((left, right) =>
        left.file.localeCompare(right.file, 'en') || left.line - right.line || left.detail.localeCompare(right.detail, 'en')
    );
    assert.fail(`${rule} ${summary}\n${sorted.map(item =>
        `- ${item.file}:${item.line} ${item.detail}`
    ).join('\n')}`);
}

function isLegacyPanelFacade(file) {
    return /^src\/panel_(?:ui|settings|dashboard)\.js$/.test(file);
}

function isUiShell(file) {
    return file.startsWith('src/ui/') || isLegacyPanelFacade(file) || new Set([
        'src/native_ui.js',
        'src/native_ui_styles.js',
        'src/guided_tour.js'
    ]).has(file);
}

function isGeminiAdapterBoundary(file) {
    if (file.startsWith('src/adapters/')) return true;
    const basename = path.posix.basename(file, '.js');
    return /^gemini(?:_[a-z0-9]+)*(?:_adapter|_bridge)$/i.test(basename);
}

function isGmBoundary(file) {
    if (/^src\/(?:platforms|storage|adapters)\//.test(file)) return true;
    const basename = path.posix.basename(file);
    return /^legacy_[^/]*(?:repository|adapter|adapters|runtime|environment)\.js$/.test(basename)
        || /(?:^|_)(?:adapter|adapters|runtime)\.js$/.test(basename)
        || basename === 'debug_utils.js';
}

const PURE_EFFECTS = Object.freeze([
    { name: 'global browser surface', expression: /\bglobalThis\s*\.\s*(?:document|window|location|history|navigator|localStorage|sessionStorage)\b/g },
    { name: 'DOM API', expression: /\b(?:document|window)\s*\.\s*(?:querySelector(?:All)?|getElementById|createElement(?:NS)?|createTextNode|addEventListener|removeEventListener|activeElement|body|head|documentElement|getComputedStyle|matchMedia)\b/g },
    { name: 'DOM constructor', expression: /\b(?:MutationObserver|ResizeObserver|IntersectionObserver|HTMLElement|HTML[A-Za-z]+Element|CustomEvent|InputEvent|KeyboardEvent|MouseEvent|FileReader)\b/g },
    { name: 'navigation API', expression: /\b(?:window\s*\.\s*(?:open|location|history)|location\s*\.\s*(?:href|pathname|search|hash|origin|assign|replace|reload)|history\s*\.\s*(?:pushState|replaceState|back|forward|go))\b/g },
    { name: 'storage API', expression: /\bGM_[A-Za-z][A-Za-z0-9_]*\b|\b(?:localStorage|sessionStorage|indexedDB)\s*\.|\bchrome\s*\.\s*storage\b/g },
    { name: 'implicit wall clock', expression: /\bDate\s*\.\s*now\b|\bnew\s+Date\s*\(\s*\)/g },
    { name: 'ambient randomness', expression: /\bMath\s*\.\s*random\b|\b(?:globalThis\s*\.\s*)?crypto\s*\.\s*(?:randomUUID|getRandomValues)\b/g }
]);

describe('v13 dependency direction contracts', () => {
    it('[ARCH-DEP-01] keeps features below main, panels, and concrete module facades', () => {
        const violations = [];
        for (const file of sourceFiles.filter(item => projectPath(item).startsWith('src/features/'))) {
            const source = readSource(file);
            for (const imported of moduleSpecifiers(source)) {
                const target = resolvedProjectImport(file, imported.value);
                if (!target || (!target.startsWith('src/modules/') && target !== 'src/main.js' && !isLegacyPanelFacade(target))) continue;
                violations.push({
                    file: projectPath(file), line: lineNumber(source, imported.index),
                    detail: `imports forbidden upper-layer target ${target} via ${JSON.stringify(imported.value)}`
                });
            }
        }
        failWithViolations('[ARCH-DEP-01]', 'feature source must not import main, legacy panels, or src/modules/**.', violations);
    });

    it('[ARCH-DEP-02] keeps the generic and legacy UI shells feature-agnostic', () => {
        const violations = [];
        for (const file of sourceFiles.filter(item => isUiShell(projectPath(item)))) {
            const source = readSource(file);
            for (const imported of moduleSpecifiers(source)) {
                const target = resolvedProjectImport(file, imported.value);
                if (!target || (!target.startsWith('src/modules/') && !target.startsWith('src/features/'))) continue;
                violations.push({
                    file: projectPath(file), line: lineNumber(source, imported.index),
                    detail: `imports concrete implementation ${target} via ${JSON.stringify(imported.value)}`
                });
            }
        }
        failWithViolations('[ARCH-DEP-02]', 'UI shells must receive descriptors, ports, and render callbacks instead of concrete features/modules.', violations);
    });
});

describe('v13 platform and Gemini boundary contracts', () => {
    it('[ARCH-GEMINI-01] confines raw Gemini selectors and host data IDs to explicit adapters', () => {
        const markers = [
            { name: 'Gemini data ID', expression: /data-(?:test|message|response|mode|source)-id|data-testid|data-citation/i },
            { name: 'Gemini host element', expression: /(?:^|[^A-Za-z0-9_-])(?:user-query|model-response|response-container|conversations-list|gem-nav-list-item|input-area-v2|gem-menu-item|gem-icon-button|mat-dialog)(?:[^A-Za-z0-9_-]|$)/i },
            { name: 'Gemini host class', expression: /\.(?:conversation-container|conversation-title|chat-window|query-text|user-query-text|bard-mode-[A-Za-z0-9_-]+)\b/i },
            { name: 'Gemini app-route selector', expression: /\[\s*href[^\]\r\n]*\/app\//i }
        ];
        const violations = [];
        for (const file of sourceFiles) {
            const relative = projectPath(file);
            if (isGeminiAdapterBoundary(relative)) continue;
            const source = readSource(file);
            const visible = commentsMasked(source).split(/\r\n|\r|\n/);
            visible.forEach((line, index) => {
                for (const marker of markers) {
                    if (!marker.expression.test(line)) continue;
                    violations.push({ file: relative, line: index + 1, detail: `contains raw ${marker.name}` });
                    break;
                }
            });
        }
        failWithViolations('[ARCH-GEMINI-01]', 'raw Gemini selectors belong in src/adapters/** or an explicitly named gemini_*adapter|bridge.js boundary.', violations);
    });

    it('[ARCH-GM-01] confines GM_* access to explicit platform, storage, adapter, legacy runtime, or debug boundaries', () => {
        const violations = [];
        for (const file of sourceFiles) {
            const relative = projectPath(file);
            if (isGmBoundary(relative)) continue;
            const source = readSource(file);
            const code = executableSource(source);
            const expression = /\bGM_[A-Za-z][A-Za-z0-9_]*\b/g;
            let match;
            while ((match = expression.exec(code))) {
                violations.push({
                    file: relative, line: lineNumber(source, match.index),
                    detail: `accesses ${match[0]} outside an approved boundary`
                });
            }
        }
        failWithViolations('[ARCH-GM-01]', 'main/core/logger/state/panel/UI and thin module facades must inject storage/platform ports instead of reading GM_* directly.', violations);
    });
});

describe('v13 pure feature logic contracts', () => {
    it('[ARCH-PURE-01] keeps named domain/model/query/runner/snapshot/canonical/executor/plan roles deterministic', () => {
        const pureRole = /(?:^|_)(?:domain|model|query|queries|ranking|aggregation|runner|snapshot|canonical|executor|plan|planner)$/;
        const candidates = sourceFiles.filter(file => {
            const relative = projectPath(file);
            return relative.startsWith('src/features/') && pureRole.test(path.posix.basename(relative, '.js'));
        });
        assert.ok(candidates.length >= 10, '[ARCH-PURE-01] expected named pure-role feature sources; the contract must not become vacuous.');

        const forbiddenImports = /^(?:src\/(?:adapters|ui)\/|src\/features\/.*(?:repository|storage_adapter|legacy_runtime)\.js$|src\/storage\/(?!clone\.js$))/;
        const violations = [];
        for (const file of candidates) {
            const source = readSource(file);
            for (const imported of moduleSpecifiers(source)) {
                const target = resolvedProjectImport(file, imported.value);
                if (target && forbiddenImports.test(target)) {
                    violations.push({
                        file: projectPath(file), line: lineNumber(source, imported.index),
                        detail: `pure role imports side-effect boundary ${target}`
                    });
                }
            }
            const code = executableSource(source);
            for (const effect of PURE_EFFECTS) {
                const expression = new RegExp(effect.expression.source, effect.expression.flags);
                let match;
                while ((match = expression.exec(code))) {
                    violations.push({
                        file: projectPath(file), line: lineNumber(source, match.index),
                        detail: `uses ${effect.name}: ${match[0].replace(/\s+/g, ' ')}`
                    });
                }
            }
        }
        failWithViolations('[ARCH-PURE-01]', 'pure roles may parse explicit dates, but must inject clocks/ID factories and must not read DOM, navigation, storage, GM_*, or random globals.', violations);
    });

    it('[ARCH-SCAN-01] distinguishes local records and explicit Date parsing from ambient effects', () => {
        const legal = executableSource(`
            export function filter(document, window, value) {
                const parsed = new Date(value);
                const literal = new Date('2026-08-01T00:00:00.000Z');
                return document.kind && window.from && parsed && literal;
            }
        `);
        for (const effect of PURE_EFFECTS) {
            assert.doesNotMatch(legal, new RegExp(effect.expression.source, effect.expression.flags),
                `[ARCH-SCAN-01] legal injected/local fixture was mistaken for ${effect.name}`);
        }
        const ambient = executableSource('const stamp = new Date(); const id = crypto.randomUUID();');
        assert.match(ambient, PURE_EFFECTS.find(effect => effect.name === 'implicit wall clock').expression);
        assert.match(ambient, PURE_EFFECTS.find(effect => effect.name === 'ambient randomness').expression);
        assert.equal(projectPath(path.join(PROJECT_ROOT, 'src', 'features', 'fixture.js')), 'src/features/fixture.js');
    });
});

describe('v13 source responsibility budgets', () => {
    it('[ARCH-SIZE-01] keeps facades and feature responsibilities physically bounded', () => {
        const budgets = [
            { name: 'thin module facade', max: 300, matches: file => /^src\/modules\/[^/]+\.js$/.test(file), reason: 'modules only compose legacy ports and lifecycle hooks' },
            { name: 'application entry', max: 250, matches: file => file === 'src/main.js', reason: 'main only bootstraps the composition root' },
            { name: 'feature responsibility', max: 500, matches: file => file.startsWith('src/features/'), reason: 'feature logic is split by domain/controller/view/adapter responsibility' },
            { name: 'legacy panel facade', max: 500, matches: isLegacyPanelFacade, reason: 'legacy panel files delegate to generic src/ui/shell controllers' },
            { name: 'declarative style exception', max: 650, matches: file => new Set(['src/native_ui_styles.js', 'src/ui/shell/panel_styles.js']).has(file), reason: 'bounded exception for declarative CSS template strings only' }
        ];
        const matchedCounts = new Map(budgets.map(budget => [budget.name, 0]));
        const violations = [];
        for (const file of sourceFiles) {
            const relative = projectPath(file);
            const lines = physicalLines(readSource(file));
            for (const budget of budgets) {
                if (!budget.matches(relative)) continue;
                matchedCounts.set(budget.name, matchedCounts.get(budget.name) + 1);
                if (lines > budget.max) {
                    violations.push({
                        file: relative, line: lines,
                        detail: `${budget.name} is ${lines} physical lines (max ${budget.max}); ${budget.reason}`
                    });
                }
            }
        }
        for (const [name, count] of matchedCounts) {
            if (count === 0) violations.push({ file: '<tree>', line: 0, detail: `${name} budget matched no files` });
        }
        failWithViolations('[ARCH-SIZE-01]', 'responsibility budgets are evidence-backed; CSS-string exceptions remain explicit and bounded.', violations);
    });
});

describe('v13 behavioral-test source integrity', () => {
    it('[ARCH-TEST-01] forbids bundle/transform harnesses from standing in for direct source behavior coverage', () => {
        const violations = [];
        for (const file of testFiles) {
            const relative = projectPath(file);
            if (relative === 'tests/build_pipeline.test.js') continue;
            const source = readSource(file);
            for (const imported of moduleSpecifiers(source)) {
                const target = resolvedProjectImport(file, imported.value);
                if (!/^esbuild(?:$|\/)/.test(imported.value)
                    && !/^scripts\/build(?:_core)?(?:\.js)?$/.test(target || '')) continue;
                violations.push({
                    file: relative, line: lineNumber(source, imported.index),
                    detail: `imports build/transform harness ${JSON.stringify(imported.value)}`
                });
            }
        }
        failWithViolations('[ARCH-TEST-01]', 'only tests/build_pipeline.test.js may exercise the build tool; behavior tests must import source directly.', violations);
    });
});
