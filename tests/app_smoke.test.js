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

        assert.match(meta, /@name\s+Primer\+\+ for Gemini™ \(v12\.0\)/);
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

    it('merges Guest data only after the new user storage has loaded', () => {
        const main = read('src/main.js');

        // The fix requires notifyUserChange() to run BEFORE the merge block,
        // so the freshly-loaded user storage is the base, not the live cm.state
        // (which still contains the soon-to-be-cloned Guest data).
        const notifyIdx = main.indexOf('ModuleRegistry.notifyUserChange(getInspectingUser())');
        const mergeIdx = main.indexOf('Merged ${guestState.total} messages from Guest session');
        assert.ok(notifyIdx !== -1, 'notifyUserChange call missing');
        assert.ok(mergeIdx !== -1, 'guest merge block missing');
        assert.ok(notifyIdx < mergeIdx, 'notifyUserChange must precede guest merge to avoid double-counting');

        // And it must run exactly once — a leftover trailing call would
        // re-load cm.state and wipe the merge that was just persisted.
        const matches = main.match(/ModuleRegistry\.notifyUserChange\(getInspectingUser\(\)\)/g) || [];
        assert.equal(matches.length, 1, 'notifyUserChange must be called exactly once in lazyDetect');
    });

    it('guards counter.attemptIncrement against inspecting-mode storage corruption', () => {
        const counter = read('src/modules/counter.js');

        // attemptIncrement must snap inspectingUser back to currentUser before
        // mutating cm.state — otherwise saveData() persists another profile's
        // totals into the current user's storage key.
        assert.match(counter, /attemptIncrement\(\)\s*\{[\s\S]*?Core\.getInspectingUser\(\)\s*!==\s*currentUser[\s\S]*?Core\.setInspectingUser\(currentUser\)[\s\S]*?this\.loadDataForUser\(currentUser\)/);
    });

    it('keeps startup rendering ordered and repairable', () => {
        const main = read('src/main.js');
        const panelUi = read('src/panel_ui.js');

        assert.match(main, /function startProgressiveDisclosure\(\)/);
        assert.match(main, /waitForGeminiReady\(\(\) => \{\s*onDOMStructureChange\(\);\s*startProgressiveDisclosure\(\);/);
        assert.doesNotMatch(main, /gc-onboarding-overlay/);
        assert.match(main, /#gemini-onboarding-modal, \.onboarding-overlay/);
        assert.match(main, /if \(ModuleRegistry\.isEnabled\('counter'\)\) \{\s*PanelUI\.create\(\);/);

        assert.match(panelUi, /_isPanelComplete\(container\)/);
        assert.match(panelUi, /existing\.remove\(\);/);
        assert.match(panelUi, /if \(CounterModule\.state\.isExpanded\)/);
        assert.match(panelUi, /Details pane render error/);
    });

    it('keeps extension icons generated from a maintainable source asset', () => {
        const source = read('src/platforms/extension/icons/source.svg');
        const iconsDir = path.join(root, 'src/platforms/extension/icons');

        assert.match(source, /viewBox="0 0 128 128"/);
        assert.match(source, /linearGradient/);
        for (const size of [16, 48, 128]) {
            const iconPath = path.join(iconsDir, `icon-${size}.png`);
            const icon = fs.readFileSync(iconPath);
            assert.equal(icon.subarray(1, 4).toString('ascii'), 'PNG');
            assert.ok(icon.length > 500);
        }
    });

    it('keeps npm audit fix pinned in the lockfile', () => {
        const lock = JSON.parse(read('package-lock.json'));
        const braceExpansion = lock.packages['node_modules/brace-expansion'];

        assert.equal(lock.packages[''].name, 'primer-pp');
        assert.equal(braceExpansion.version, '5.0.6');
    });

    it('keeps Gemini-owned DOM selectors behind GeminiAdapter', () => {
        const sourceFiles = [
            ...fs.readdirSync(path.join(root, 'src/modules'))
                .filter(file => file.endsWith('.js'))
                .map(file => `src/modules/${file}`),
            'src/core.js',
            'src/main.js',
            'src/native_ui.js',
            'src/panel_settings.js'
        ];
        const forbiddenFragments = [
            'bard-',
            'gem-nav',
            'gem-menu',
            'model-response',
            'user-query',
            'response-container',
            'conversation-container',
            'chat-window',
            'chat-container',
            'gds-pillbox',
            'data-test-id',
            'aria-label="Side Navigation"',
            'aria-label="Enter a prompt for Gemini"',
            'aria-label="Send message"',
            'aria-label="Open mode picker"',
            'aria-label="Open menu for conversation actions"',
            'href*="/gems/"',
            '.ql-editor'
        ];
        const selectorLiteral = /(?:\.(?:querySelector(?:All)?|closest|matches)|rules\.push)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
        const offenders = [];

        for (const file of sourceFiles) {
            const source = read(file);
            for (const match of source.matchAll(selectorLiteral)) {
                const literal = match[2];
                const fragment = forbiddenFragments.find(item => literal.includes(item));
                if (fragment) {
                    offenders.push(`${file}: ${fragment}`);
                }
            }
        }

        assert.deepEqual(offenders, []);
        assert.match(read('src/adapters/gemini.js'), /getSelectorHealthReport\(\)/);
        assert.match(read('src/panel_settings.js'), /GeminiAdapter\.getSelectorHealthReport\(\)/);
    });

    it('keeps Prompt Vault import available when the vault is empty', () => {
        const promptVault = read('src/modules/prompt_vault.js');
        const emptyIdx = promptVault.indexOf('if (this._prompts.length === 0)');
        const appendIdx = promptVault.indexOf('this._appendPromptIORow(container);', emptyIdx);
        const returnIdx = promptVault.indexOf('return;', emptyIdx);

        assert.ok(emptyIdx !== -1, 'empty Prompt Vault branch missing');
        assert.ok(appendIdx !== -1, 'empty Prompt Vault branch must render import/export controls');
        assert.ok(appendIdx < returnIdx, 'Prompt Vault import/export controls must render before empty-state return');
    });
});
