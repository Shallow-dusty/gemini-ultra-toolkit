export const UI_NAMESPACE = 'primer-ui';
export const TOKEN_PREFIX = `--${UI_NAMESPACE}-`;

const DEFAULT_TOKEN_VALUES = {
    'color-canvas': '#f7f8fc',
    'color-surface': '#ffffff',
    'color-surface-elevated': '#ffffff',
    'color-text': '#202124',
    'color-text-muted': '#5f6368',
    'color-border': '#dfe3eb',
    'color-accent': '#4f63d9',
    'color-accent-hover': '#3f51c6',
    'color-accent-soft': '#eef0ff',
    'color-danger': '#b3261e',
    'color-danger-soft': '#fce8e6',
    'color-focus': '#6b7cff',
    'color-overlay': 'rgb(17 24 39 / 48%)',
    'font-family': "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    'font-size-xs': '0.75rem',
    'font-size-sm': '0.8125rem',
    'font-size-md': '0.875rem',
    'font-size-lg': '1rem',
    'font-weight-medium': '500',
    'font-weight-strong': '650',
    'line-height': '1.45',
    'space-1': '0.25rem',
    'space-2': '0.5rem',
    'space-3': '0.75rem',
    'space-4': '1rem',
    'space-5': '1.25rem',
    'space-6': '1.5rem',
    'radius-sm': '0.5rem',
    'radius-md': '0.75rem',
    'radius-lg': '1rem',
    'radius-pill': '999px',
    'control-height-sm': '2rem',
    'control-height-md': '2.75rem',
    'icon-size': '1.125rem',
    'shadow-popover': '0 10px 32px rgb(15 23 42 / 16%)',
    'shadow-dialog': '0 24px 80px rgb(15 23 42 / 26%)',
    'motion-fast': '120ms',
    'motion-normal': '180ms',
    'z-portal': '2147483000',
    'z-toast': '2147483100',
    'z-dialog': '2147483200'
};

export const DESIGN_TOKENS = Object.freeze({ ...DEFAULT_TOKEN_VALUES });

function assertTokenValue(name, value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`Token "${name}" must be a non-empty string`);
    }
    if (/[;{}]/.test(value)) {
        throw new TypeError(`Token "${name}" contains an unsafe CSS delimiter`);
    }
}

export function tokenVar(name) {
    if (!Object.prototype.hasOwnProperty.call(DESIGN_TOKENS, name)) {
        throw new RangeError(`Unknown Primer UI token: ${name}`);
    }
    return `${TOKEN_PREFIX}${name}`;
}

export function resolveTokens(overrides = {}) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        throw new TypeError('Token overrides must be an object');
    }

    const resolved = { ...DESIGN_TOKENS };
    for (const [name, value] of Object.entries(overrides)) {
        if (!Object.prototype.hasOwnProperty.call(DESIGN_TOKENS, name)) {
            throw new RangeError(`Unknown Primer UI token: ${name}`);
        }
        assertTokenValue(name, value);
        resolved[name] = value.trim();
    }
    return Object.freeze(resolved);
}

export function createTokenCss(overrides = {}) {
    const declarations = Object.entries(resolveTokens(overrides))
        .map(([name, value]) => `  ${tokenVar(name)}: ${value};`)
        .join('\n');
    return `:host, [data-${UI_NAMESPACE}-root] {\n${declarations}\n}`;
}

export const BASE_UI_CSS = `
:host {
  color: var(--primer-ui-color-text);
  color-scheme: light;
  font-family: var(--primer-ui-font-family);
  font-size: var(--primer-ui-font-size-md);
  line-height: var(--primer-ui-line-height);
  text-rendering: optimizeLegibility;
}

*, *::before, *::after { box-sizing: border-box; }
button, input, textarea, select { font: inherit; }

[data-primer-ui-surface] { position: relative; isolation: isolate; }
[data-primer-ui-portal] {
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: var(--primer-ui-z-portal);
}
[data-primer-ui-portal] > * { pointer-events: auto; }

.primer-ui-button {
  align-items: center;
  appearance: none;
  background: var(--primer-ui-color-surface);
  border: 1px solid var(--primer-ui-color-border);
  border-radius: var(--primer-ui-radius-pill);
  color: var(--primer-ui-color-text);
  cursor: pointer;
  display: inline-flex;
  font-weight: var(--primer-ui-font-weight-medium);
  gap: var(--primer-ui-space-2);
  justify-content: center;
  min-height: var(--primer-ui-control-height-md);
  padding: 0 var(--primer-ui-space-4);
  transition: background var(--primer-ui-motion-fast) ease, border-color var(--primer-ui-motion-fast) ease;
}
.primer-ui-button:hover:not(:disabled) { background: var(--primer-ui-color-accent-soft); }
.primer-ui-button[data-variant="primary"] {
  background: var(--primer-ui-color-accent);
  border-color: var(--primer-ui-color-accent);
  color: #fff;
}
.primer-ui-button[data-variant="primary"]:hover:not(:disabled) { background: var(--primer-ui-color-accent-hover); }
.primer-ui-button[data-variant="danger"] {
  background: var(--primer-ui-color-danger-soft);
  border-color: transparent;
  color: var(--primer-ui-color-danger);
}
.primer-ui-button[data-size="sm"] { min-height: var(--primer-ui-control-height-sm); padding-inline: var(--primer-ui-space-3); }
.primer-ui-button:disabled { cursor: not-allowed; opacity: 0.5; }
.primer-ui-button:focus-visible,
.primer-ui-switch__control:focus-visible,
.primer-ui-tab:focus-visible,
.primer-ui-dialog:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--primer-ui-color-focus) 42%, transparent);
  outline-offset: 2px;
}

.primer-ui-icon-button { inline-size: var(--primer-ui-control-height-md); padding: 0; }
.primer-ui-icon-button[data-size="sm"] { inline-size: var(--primer-ui-control-height-sm); }
.primer-ui-icon-button__icon { block-size: var(--primer-ui-icon-size); inline-size: var(--primer-ui-icon-size); }

.primer-ui-switch { align-items: center; cursor: pointer; display: inline-flex; gap: var(--primer-ui-space-3); }
.primer-ui-switch[data-disabled="true"] { cursor: not-allowed; opacity: 0.55; }
.primer-ui-switch__control {
  appearance: none;
  background: var(--primer-ui-color-border);
  border: 0;
  border-radius: var(--primer-ui-radius-pill);
  block-size: 1.25rem;
  cursor: inherit;
  inline-size: 2.25rem;
  margin: 0;
  position: relative;
  transition: background var(--primer-ui-motion-fast) ease;
}
.primer-ui-switch__control::after {
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgb(15 23 42 / 24%);
  content: '';
  inset-block-start: 0.1875rem;
  inset-inline-start: 0.1875rem;
  block-size: 0.875rem;
  inline-size: 0.875rem;
  position: absolute;
  transition: transform var(--primer-ui-motion-fast) ease;
}
.primer-ui-switch__control:checked { background: var(--primer-ui-color-accent); }
.primer-ui-switch__control:checked::after { transform: translateX(1rem); }

.primer-ui-tabs__list {
  align-items: center;
  border-bottom: 1px solid var(--primer-ui-color-border);
  display: flex;
  gap: var(--primer-ui-space-1);
  overflow-x: auto;
}
.primer-ui-tab {
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--primer-ui-color-text-muted);
  cursor: pointer;
  min-height: var(--primer-ui-control-height-md);
  padding: 0 var(--primer-ui-space-3);
}
.primer-ui-tab[aria-selected="true"] { border-bottom-color: var(--primer-ui-color-accent); color: var(--primer-ui-color-text); }
.primer-ui-tab:disabled { cursor: not-allowed; opacity: 0.45; }
.primer-ui-tabpanel { padding-block: var(--primer-ui-space-4); }

.primer-ui-form-field { display: grid; gap: var(--primer-ui-space-1); }
.primer-ui-form-field__label { font-weight: var(--primer-ui-font-weight-medium); }
.primer-ui-form-field__description { color: var(--primer-ui-color-text-muted); font-size: var(--primer-ui-font-size-sm); }
.primer-ui-form-field__error { color: var(--primer-ui-color-danger); font-size: var(--primer-ui-font-size-sm); }

.primer-ui-toast-region {
  display: grid;
  gap: var(--primer-ui-space-2);
  inset-block-end: var(--primer-ui-space-5);
  inset-inline-end: var(--primer-ui-space-5);
  max-inline-size: min(24rem, calc(100vw - 2 * var(--primer-ui-space-5)));
  position: absolute;
  z-index: var(--primer-ui-z-toast);
}
.primer-ui-toast {
  align-items: start;
  background: var(--primer-ui-color-surface-elevated);
  border: 1px solid var(--primer-ui-color-border);
  border-radius: var(--primer-ui-radius-md);
  box-shadow: var(--primer-ui-shadow-popover);
  display: flex;
  gap: var(--primer-ui-space-3);
  padding: var(--primer-ui-space-3) var(--primer-ui-space-4);
}
.primer-ui-toast[data-tone="danger"] { border-color: var(--primer-ui-color-danger); }
.primer-ui-toast__message { flex: 1; }

.primer-ui-dialog-layer {
  align-items: center;
  background: var(--primer-ui-color-overlay);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: var(--primer-ui-space-5);
  position: absolute;
  z-index: var(--primer-ui-z-dialog);
}
.primer-ui-dialog {
  background: var(--primer-ui-color-surface-elevated);
  border: 1px solid var(--primer-ui-color-border);
  border-radius: var(--primer-ui-radius-lg);
  box-shadow: var(--primer-ui-shadow-dialog);
  color: var(--primer-ui-color-text);
  max-block-size: min(44rem, calc(100vh - 2 * var(--primer-ui-space-5)));
  max-inline-size: 36rem;
  min-inline-size: min(24rem, calc(100vw - 2 * var(--primer-ui-space-5)));
  overflow: auto;
  padding: var(--primer-ui-space-5);
}
.primer-ui-dialog__title { font-size: var(--primer-ui-font-size-lg); font-weight: var(--primer-ui-font-weight-strong); margin: 0 0 var(--primer-ui-space-4); }

@media (prefers-color-scheme: dark) {
  :host(:not([data-primer-theme])),
  [data-primer-ui-root]:not([data-primer-theme]) {
    --primer-ui-color-canvas: #111318;
    --primer-ui-color-surface: #1b1e25;
    --primer-ui-color-surface-elevated: #242832;
    --primer-ui-color-text: #f1f3f4;
    --primer-ui-color-text-muted: #aab0ba;
    --primer-ui-color-border: #3a404d;
    --primer-ui-color-accent: #9ca7ff;
    --primer-ui-color-accent-hover: #b2baff;
    --primer-ui-color-accent-soft: #303652;
    --primer-ui-color-danger: #ffb4ab;
    --primer-ui-color-danger-soft: #4b2422;
  }
}

:host([data-primer-theme="glass"]),
:host([data-primer-theme="cyber"]),
[data-primer-ui-root][data-primer-theme="glass"],
[data-primer-ui-root][data-primer-theme="cyber"] {
  --primer-ui-color-canvas: #111318;
  --primer-ui-color-surface: #1b1e25;
  --primer-ui-color-surface-elevated: #242832;
  --primer-ui-color-text: #f1f3f4;
  --primer-ui-color-text-muted: #aab0ba;
  --primer-ui-color-border: #3a404d;
  --primer-ui-color-accent: #9ca7ff;
  --primer-ui-color-accent-hover: #b2baff;
  --primer-ui-color-accent-soft: #303652;
  --primer-ui-color-danger: #ffb4ab;
  --primer-ui-color-danger-soft: #4b2422;
}

:host([data-primer-theme="paper"]),
[data-primer-ui-root][data-primer-theme="paper"] {
  --primer-ui-color-canvas: #f7f8fc;
  --primer-ui-color-surface: #ffffff;
  --primer-ui-color-surface-elevated: #ffffff;
  --primer-ui-color-text: #202124;
  --primer-ui-color-text-muted: #5f6368;
  --primer-ui-color-border: #dfe3eb;
  --primer-ui-color-accent: #4f63d9;
  --primer-ui-color-accent-hover: #3f51c6;
  --primer-ui-color-accent-soft: #eef0ff;
  --primer-ui-color-danger: #b3261e;
  --primer-ui-color-danger-soft: #fce8e6;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}
`;
