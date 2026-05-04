const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('app smoke checks', () => {
    it('keeps public branding and disclaimer aligned', () => {
        const meta = read('src/meta.txt');
        const manifest = JSON.parse(read('src/platforms/extension/manifest.json'));
        const readme = read('README.md');
        const constants = read('src/constants.js');

        assert.match(meta, /@name\s+Primer\+\+ for Gemini™ \(v11\.0\)/);
        assert.equal(manifest.name, 'Primer++ for Gemini™');
        assert.match(manifest.description, /Unofficial community extension for Gemini™/);
        assert.match(readme, /Primer\+\+ is an unofficial community extension/);
        assert.match(constants, /APP_NAME = 'Primer\+\+ for Gemini\\u2122'/);
        assert.match(constants, /TRADEMARK_NOTICE = 'Primer\+\+ is an unofficial community extension/);
    });

    it('keeps extension manifest scoped to Gemini with minimal permissions', () => {
        const manifest = JSON.parse(read('src/platforms/extension/manifest.json'));

        assert.deepEqual(manifest.permissions.sort(), ['contextMenus', 'storage']);
        assert.deepEqual(manifest.content_scripts[0].matches, ['https://gemini.google.com/*']);
        assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
        assert.equal(manifest.manifest_version, 3);
    });

    it('keeps basic keyboard accessibility guards in panel styles and modals', () => {
        const panelUi = read('src/panel_ui.js');
        const panelSettings = read('src/panel_settings.js');
        const panelDashboard = read('src/panel_dashboard.js');
        const nativeUi = read('src/native_ui.js');

        assert.match(panelUi, /:focus-visible/);
        assert.match(panelUi, /prefers-reduced-motion: reduce/);
        assert.match(panelUi, /settingsBtn\.style\.width = '44px'/);
        assert.match(nativeUi, /trapFocus\(container\)/);
        assert.match(panelSettings, /NativeUI\.trapFocus\(modal\)/);
        assert.match(panelDashboard, /NativeUI\.trapFocus\(modal\)/);
    });

    it('keeps npm audit fix pinned in the lockfile', () => {
        const lock = JSON.parse(read('package-lock.json'));
        const braceExpansion = lock.packages['node_modules/brace-expansion'];

        assert.equal(lock.packages[''].name, 'primer-pp');
        assert.equal(braceExpansion.version, '5.0.5');
    });
});
