const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'panel_ui.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'panel_settings.js'), 'utf8');
const layoutSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'shell', 'panel_layout.js'), 'utf8');
const detailsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'shell', 'details_controller.js'), 'utf8');
const presenterSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'shell', 'panel_presenter.js'), 'utf8');
const settingsControllerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'shell', 'settings_controller.js'), 'utf8');
const modalShellSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'shell', 'modal_shell.js'), 'utf8');
const componentSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'components.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'shell', 'panel_styles.js'), 'utf8');

function sourceBetween(startMarker, endMarker) {
    const start = panelSource.indexOf(startMarker);
    const end = panelSource.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
    assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
    return panelSource.slice(start, end);
}

describe('main panel semantic controls', () => {
    it('exposes the details disclosure as a named button with synchronized state', () => {
        assert.match(layoutSource, /const toggleHandle = IconButton\(/);
        assert.match(layoutSource, /toggle\.setAttribute\('aria-controls', 'g-details-pane'\)/);
        assert.match(layoutSource, /toggle\.setAttribute\('aria-expanded', String\(expanded\)\)/);
        assert.match(layoutSource, /translate\('展开详情', 'Show details'\)/);
        assert.match(layoutSource, /toggle\.setAttribute\('aria-expanded', String\(isExpanded\)\)/);
        assert.match(layoutSource, /pane\.setAttribute\('aria-hidden', String\(!isExpanded\)\)/);
        assert.match(layoutSource, /pane\.inert = !isExpanded/);
        assert.doesNotMatch(layoutSource, /createElement\('span'\)[\s\S]*?aria-controls/);
    });

    it('implements the ARIA tab pattern and complete horizontal keyboard navigation', () => {
        assert.match(detailsSource, /widget = Tabs\(/);
        assert.match(detailsSource, /widget\.list\.className \+= ' details-tab-bar'/);
        assert.match(componentSource, /list\.setAttribute\('role', 'tablist'\)/);
        assert.match(componentSource, /const tab = documentRef\.createElement\('button'\)/);
        assert.match(componentSource, /tab\.setAttribute\('role', 'tab'\)/);
        assert.match(componentSource, /tab\.setAttribute\('aria-controls', panel\.id\)/);
        assert.match(componentSource, /candidate\.tab\.setAttribute\('aria-selected', String\(selected\)\)/);
        assert.match(componentSource, /candidate\.tab\.tabIndex = selected \? 0 : -1/);
        assert.match(componentSource, /panel\.setAttribute\('aria-labelledby', tab\.id\)/);
        assert.doesNotMatch(detailsSource, /record\.tab\.id\s*=/);

        for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
            assert.match(componentSource, new RegExp(`'${key}'`));
        }
        assert.match(componentSource, /event\.preventDefault\(\)/);
        assert.match(componentSource, /select\(enabled\[nextIndex\]\.id, \{ focus: true \}\)/);
    });

    it('uses pressed buttons for profile, theme, and statistic choices', () => {
        assert.match(presenterSource, /for \(const id of users\)[\s\S]*?documentRef\.createElement\('button'\)[\s\S]*?aria-pressed/);
        assert.match(presenterSource, /for \(const \[key, theme\] of Object\.entries\(core\.getThemes\(\)\)\)[\s\S]*?aria-pressed/);
        assert.match(presenterSource, /function selectableRow[\s\S]*?documentRef\.createElement\('button'\)/);
        assert.match(presenterSource, /row\.setAttribute\('aria-pressed'/);
    });

    it('keeps icon-only settings named and raises panel readability and hit targets', () => {
        assert.match(presenterSource, /settings\.setAttribute\('aria-label', t\('打开设置', 'Open settings'\)\)/);
        assert.match(styleSource, /width: min\(264px, calc\(100vw - 24px\)\)/);
        assert.match(styleSource, /--panel-control-height: max\(var\(--primer-ui-control-height-md, 40px\), 44px\)/);
        assert.match(styleSource, /font-family: var\(--primer-ui-font-family/);
        assert.match(styleSource, /font-size: var\(--primer-ui-font-size-sm, 13px\)/);
        assert.match(styleSource, /\.gemini-toggle-btn:focus-visible/);
        assert.match(styleSource, /\.details-tab:focus-visible/);
        assert.match(styleSource, /\.settings-btn[\s\S]*?min-height: 44px/);
        assert.match(styleSource, /\.dash-close \{ width: 44px; height: 44px/);
        const quotaLabelRule = styleSource.match(/\.quota-label\s*\{[^}]*\}/)?.[0] || '';
        const sectionTitleRule = styleSource.match(/\.section-title\s*\{[^}]*\}/)?.[0] || '';
        assert.match(quotaLabelRule, /color: var\(--text-sub\)/);
        assert.match(sectionTitleRule, /color: var\(--text-sub\)/);
        assert.doesNotMatch(quotaLabelRule, /opacity:/);
        assert.doesNotMatch(sectionTitleRule, /opacity:/);
    });

    it('waits for module lifecycle transitions and exposes real settings controls', () => {
        assert.match(settingsSource, /openSettingsController/);
        assert.match(settingsControllerSource, /toggle = register\(controls, createShellSwitch\(/);
        assert.match(componentSource, /control\.setAttribute\('role', 'switch'\)/);
        assert.match(componentSource, /control\.setAttribute\('aria-checked'/);
        assert.match(settingsControllerSource, /onChange: requestToggle/);
        assert.match(settingsControllerSource, /toggle\.setDisabled\(true\)/);
        assert.match(settingsControllerSource, /toggle\.control\.setAttribute\('aria-busy', 'true'\)/);
        assert.match(settingsControllerSource, /await registry\.toggle\(module\.id, requested\)/);
        assert.match(settingsControllerSource, /toggle\.control\.classList\.toggle\('on', enabled\)/);
        assert.match(settingsControllerSource, /catch \(error\)/);
        assert.match(settingsControllerSource, /toggle\.control\.removeAttribute\('aria-busy'\)/);
        assert.match(settingsControllerSource, /const actual = registry\.isEnabled\(module\.id\)/);
        assert.match(settingsControllerSource, /if \(changed && !closed\) render\(\)/);
        assert.match(settingsControllerSource, /data-module-settings-id/);
        assert.match(settingsControllerSource, /createShellButton\(\{[\s\S]*?className: 'onboarding-info-btn'/);
        assert.match(modalShellSource, /const closeHandle = IconButton\(/);
        assert.match(settingsControllerSource, /const debugToggle = register\(controls, createShellSwitch\(/);
    });

    it('renders injected capability health without coupling the shell to feature implementations', () => {
        assert.match(panelSource, /configureShellPorts\(ports = \{\}\)/);
        assert.match(panelSource, /capabilityHealth: validateCapabilityHealthPort/);
        assert.match(settingsSource, /capabilityHealth: panel\.getShellPort\?\.\('capabilityHealth'\)/);
        assert.match(settingsControllerSource, /normalizeCapabilityPresentation/);
        for (const state of ['available', 'degraded', 'unavailable', 'unknown']) {
            assert.match(settingsControllerSource, new RegExp(`'${state}'`));
        }
        assert.match(settingsControllerSource, /'Gemini native'/);
        assert.match(settingsControllerSource, /'Extension supplement'/);
        assert.match(settingsControllerSource, /capabilityHealth\.subscribe\(/);
        assert.match(settingsControllerSource, /aria-live', 'polite'/);
        assert.doesNotMatch(settingsControllerSource, /capability_health|\.\/\.\.\/\.\.\/modules\//);
    });

    it('keeps keyboard, ARIA, and theme semantics inside reusable shell contracts', () => {
        assert.match(modalShellSource, /IconButton\(/);
        assert.match(settingsControllerSource, /core\.applyTheme\(modal, options\.getTheme\(\)\)/);
        assert.match(settingsControllerSource, /role', 'status'/);
        assert.match(componentSource, /control\.setAttribute\('role', 'switch'\)/);
        assert.match(styleSource, /\.module-capability-status\[data-capability-state='degraded'\]/);
        assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);
    });
});
