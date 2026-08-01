const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const uiDir = path.join(rootDir, 'src', 'ui');
const expectedSources = [
    'components.js',
    'dialog_manager.js',
    'index.js',
    'locale.js',
    'root.js',
    'tokens.js'
];

const expectedExports = {
    'components.js': ['Button', 'FormField', 'IconButton', 'Switch', 'Tabs', 'ToastRegion'],
    'dialog_manager.js': ['DialogManager', 'createDialogManager'],
    'locale.js': ['DEFAULT_UI_MESSAGES', 'createLocaleStore', 'normalizeLocale'],
    'root.js': ['UI_ROOT_ATTRIBUTES', 'createUiRoot'],
    'tokens.js': [
        'BASE_UI_CSS',
        'DESIGN_TOKENS',
        'TOKEN_PREFIX',
        'UI_NAMESPACE',
        'createTokenCss',
        'resolveTokens',
        'tokenVar'
    ]
};

test('the UI coverage gate imports every real ESM source file', async () => {
    const packageJson = JSON.parse(await readFile(path.join(rootDir, 'src', 'package.json'), 'utf8'));
    assert.equal(packageJson.type, 'module');

    const sources = (await readdir(uiDir))
        .filter(file => file.endsWith('.js'))
        .sort();
    assert.deepEqual(sources, expectedSources);

    const imported = new Map();
    for (const source of sources) {
        imported.set(source, await import(pathToFileURL(path.join(uiDir, source)).href));
    }

    for (const [source, exports] of Object.entries(expectedExports)) {
        assert.deepEqual(Object.keys(imported.get(source)).sort(), [...exports].sort());
    }
    assert.deepEqual(
        Object.keys(imported.get('index.js')).sort(),
        Object.values(expectedExports).flat().sort()
    );
});

test('the behavioral UI suite cannot hide source coverage behind a bundle', async () => {
    const harness = await readFile(path.join(rootDir, 'tests', 'ui_foundation.test.js'), 'utf8');
    assert.match(harness, /await import\(entry\)/);
    assert.doesNotMatch(harness, /\b(?:buildSync|esbuild)\b|bundle\s*:\s*true/);
});
