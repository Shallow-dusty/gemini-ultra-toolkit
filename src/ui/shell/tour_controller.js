import { Button } from '../components.js';

function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
    return value;
}

export function createTourController(options = {}) {
    const steps = options.steps;
    if (!Array.isArray(steps) || steps.length === 0) throw new TypeError('Tour requires steps');
    const getDocument = requireFunction(options.getDocument, 'Tour getDocument');
    const getWindow = requireFunction(options.getWindow, 'Tour getWindow');
    const ui = options.ui;
    if (!ui) throw new TypeError('Tour requires ui');
    const readSeen = options.readSeen || (() => false);
    const writeSeen = options.writeSeen || (() => {});
    const schedule = options.schedule || ((callback, delay) => globalThis.setTimeout(callback, delay));
    const getStyle = options.getComputedStyle || (() => null);
    const getRequestFrame = options.getRequestAnimationFrame || (() => null);
    const getCancelFrame = options.getCancelAnimationFrame || (() => null);
    for (const [value, label] of [[readSeen, 'readSeen'], [writeSeen, 'writeSeen'], [schedule, 'schedule'], [getStyle, 'getComputedStyle']]) {
        requireFunction(value, `Tour ${label}`);
    }

    const controller = {
        _current: 0,
        _overlay: null,
        _tooltip: null,
        _blocker: null,
        _onKey: null,
        _onResize: null,
        _onComplete: null,
        _returnFocus: null,
        _repositionFrame: null,
        _localeUnsubscribe: null,
        _controls: [],

        hasSeen() {
            try { return Boolean(readSeen()); }
            catch { return false; }
        },

        markSeen() {
            try { writeSeen(true); } catch {}
        },

        start(onComplete) {
            if (this._overlay) return false;
            const documentRef = getDocument();
            const windowRef = getWindow();
            ui.closeAllDialogs('tour');
            this._onComplete = typeof onComplete === 'function' ? onComplete : null;
            this._current = 0;
            this._returnFocus = documentRef.activeElement || null;
            ui._activeTour = this;

            const overlay = documentRef.createElement('div');
            overlay.className = 'gc-tour-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;border-radius:8px;transition:top .3s,left .3s,width .3s,height .3s,box-shadow .3s;';
            const tooltip = documentRef.createElement('section');
            tooltip.className = 'gc-tour-tooltip';
            tooltip.setAttribute('role', 'dialog');
            tooltip.setAttribute('aria-modal', 'false');
            tooltip.setAttribute('aria-label', ui.t('Primer++ 引导教程', 'Primer++ guided tour'));
            tooltip.style.cssText = 'position:fixed;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;border:1px solid rgba(138,180,248,0.3);border-radius:10px;padding:14px 16px;max-width:280px;font-size:13px;line-height:1.5;box-shadow:0 8px 32px rgba(0,0,0,0.4);';
            const blocker = documentRef.createElement('div');
            blocker.setAttribute('aria-hidden', 'true');
            blocker.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483645;';
            blocker.onclick = event => { event.stopPropagation(); event.preventDefault(); };
            documentRef.body.append(overlay, tooltip, blocker);
            this._overlay = overlay;
            this._tooltip = tooltip;
            this._blocker = blocker;

            this._onKey = event => {
                if (!['Escape', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
                event.preventDefault();
                event.stopPropagation?.();
                if (event.key === 'Escape') this.stop();
                else if (event.key === 'ArrowRight') this.next();
                else this.prev();
            };
            this._onResize = () => {
                if (!this._showAvailable(this._current, 1)) this.stop();
            };
            documentRef.addEventListener('keydown', this._onKey);
            windowRef.addEventListener('resize', this._onResize);
            this._localeUnsubscribe = ui.subscribeLocale(() => this._showStep(this._current, false));
            if (!this._showAvailable(0, 1)) this.stop();
            return true;
        },

        stop() {
            const documentRef = getDocument();
            const windowRef = getWindow();
            if (ui._activeTour === this) ui._activeTour = null;
            this._overlay?.remove();
            this._tooltip?.remove();
            this._blocker?.remove();
            this._overlay = null;
            this._tooltip = null;
            this._blocker = null;
            if (this._onKey) documentRef.removeEventListener('keydown', this._onKey);
            if (this._onResize) windowRef.removeEventListener('resize', this._onResize);
            this._onKey = null;
            this._onResize = null;
            const cancelFrame = getCancelFrame();
            if (this._repositionFrame != null && typeof cancelFrame === 'function') cancelFrame(this._repositionFrame);
            this._repositionFrame = null;
            this._localeUnsubscribe?.();
            this._localeUnsubscribe = null;
            this._destroyControls();
            this.markSeen();
            const returnFocus = this._returnFocus;
            this._returnFocus = null;
            if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') {
                returnFocus.focus({ preventScroll: true });
            }
            const complete = this._onComplete;
            this._onComplete = null;
            if (complete) schedule(complete, 500);
        },

        next() {
            if (!this._showAvailable(this._current + 1, 1)) this.stop();
        },

        prev() { this._showAvailable(this._current - 1, -1); },

        _destroyControls() {
            for (const control of this._controls) control.destroy();
            this._controls = [];
        },

        _showAvailable(start, direction) {
            const cancelFrame = getCancelFrame();
            if (this._repositionFrame != null && typeof cancelFrame === 'function') {
                cancelFrame(this._repositionFrame);
                this._repositionFrame = null;
            }
            for (let index = start; index >= 0 && index < steps.length; index += direction) {
                if (this._showStep(index)) {
                    this._current = index;
                    return true;
                }
            }
            return false;
        },

        _showStep(index, allowScroll = true) {
            if (!this._overlay || !this._tooltip) return false;
            const documentRef = getDocument();
            const windowRef = getWindow();
            const step = steps[index];
            if (!step) return false;
            const element = documentRef.querySelector(step.sel);
            if (!element || element.hidden || element.getAttribute?.('aria-hidden') === 'true' || element.isConnected === false) {
                return false;
            }
            const computed = getStyle(element);
            if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) return false;
            const rect = element.getBoundingClientRect();
            if (!rect || rect.width <= 0 || rect.height <= 0) return false;
            const viewportWidth = windowRef.innerWidth || documentRef.documentElement?.clientWidth || 0;
            const viewportHeight = windowRef.innerHeight || documentRef.documentElement?.clientHeight || 0;
            const outside = rect.bottom <= 0 || rect.right <= 0
                || rect.top >= viewportHeight || rect.left >= viewportWidth;
            if (outside) {
                if (!allowScroll || typeof element.scrollIntoView !== 'function') return false;
                element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
                const retry = () => {
                    this._repositionFrame = null;
                    if (!this._showStep(index, false) && !this._showAvailable(index + 1, 1)) this.stop();
                };
                const requestFrame = getRequestFrame();
                if (typeof requestFrame === 'function') this._repositionFrame = requestFrame(retry);
                else return this._showStep(index, false);
                return true;
            }

            const padding = 6;
            this._overlay.style.top = `${rect.top - padding}px`;
            this._overlay.style.left = `${rect.left - padding}px`;
            this._overlay.style.width = `${rect.width + padding * 2}px`;
            this._overlay.style.height = `${rect.height + padding * 2}px`;
            this._overlay.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.6)';

            const tooltip = this._tooltip;
            this._destroyControls();
            tooltip.replaceChildren();
            const text = documentRef.createElement('div');
            text.textContent = ui.t(step.zh, step.en);
            text.style.marginBottom = '12px';
            const navigation = documentRef.createElement('div');
            navigation.className = 'gc-tour-navigation';
            navigation.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
            const counter = documentRef.createElement('span');
            counter.style.cssText = 'font-size:11px;opacity:0.6;';
            counter.textContent = `${index + 1} / ${steps.length}`;
            const actions = documentRef.createElement('div');
            actions.className = 'gc-tour-actions';
            actions.style.cssText = 'display:flex;gap:6px;';

            if (index > 0) {
                const previous = Button({ document: documentRef, label: ui.t('上一步', 'Prev'), onPress: () => this.prev() });
                previous.element.className += ' gc-tour-button';
                this._controls.push(previous);
                actions.appendChild(previous.element);
            }
            const skip = Button({ document: documentRef, label: ui.t('跳过', 'Skip'), onPress: () => this.stop() });
            skip.element.className += ' gc-tour-button';
            const next = Button({
                document: documentRef,
                label: index < steps.length - 1 ? ui.t('下一步', 'Next') : ui.t('完成', 'Done'),
                variant: 'primary',
                onPress: () => this.next()
            });
            next.element.className += ' gc-tour-button';
            this._controls.push(skip, next);
            actions.append(skip.element, next.element);
            navigation.append(counter, actions);
            tooltip.append(text, navigation);

            const gap = 12;
            const tooltipRect = tooltip.getBoundingClientRect();
            let top = rect.bottom + gap + padding;
            if (top + tooltipRect.height > windowRef.innerHeight) {
                top = rect.top - padding - gap - tooltipRect.height;
            }
            let left = rect.left + (rect.width - tooltipRect.width) / 2;
            left = Math.max(8, Math.min(left, windowRef.innerWidth - tooltipRect.width - 8));
            tooltip.style.top = `${Math.max(8, top)}px`;
            tooltip.style.left = `${left}px`;
            next.element.focus({ preventScroll: true });
            return true;
        }
    };
    return controller;
}
