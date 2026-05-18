import { GLOBAL_KEYS, PANEL_ID } from './constants.js';
import { NativeUI } from './native_ui.js';

const STEPS = [
    { sel: '#' + PANEL_ID, zh: '这是 Primer++ 控制面板，可拖拽移动', en: 'This is the Primer++ control panel, drag to move' },
    { sel: '#g-user-capsule', zh: '当前登录用户，点击可切换查看其他用户数据', en: 'Current user, click to switch viewing other users' },
    { sel: '#g-big-display', zh: '今日消息计数，实时更新', en: 'Today\'s message count, updates in real-time' },
    { sel: '#g-model-badge', zh: '当前模型显示（Flash/Thinking/Pro）', en: 'Current model display (Flash/Thinking/Pro)' },
    { sel: '#g-quota-wrap', zh: '配额进度条，可在设置中自定义上限', en: 'Quota progress bar, customize limit in settings' },
    { sel: '#g-action-btn', zh: '功能菜单：设置、仪表盘、导出等', en: 'Action menu: settings, dashboard, export, etc.' },
    { sel: '#g-details-pane', zh: '详情区域，展示各模块的详细信息', en: 'Details pane showing module-specific information' },
];

export const GuidedTour = {
    _current: 0,
    _overlay: null,
    _tooltip: null,
    _onKey: null,
    _onResize: null,
    _onComplete: null,

    hasSeen() {
        try { return !!GM_getValue(GLOBAL_KEYS.TOUR_SEEN, false); }
        catch { return false; }
    },

    markSeen() {
        try { GM_setValue(GLOBAL_KEYS.TOUR_SEEN, true); } catch {}
    },

    start(onComplete) {
        if (this._overlay) return;
        this._onComplete = onComplete || null;
        this._current = 0;

        // Overlay (spotlight hole via box-shadow). The class enables the
        // prefers-reduced-motion override added in native_ui_styles.
        const ov = document.createElement('div');
        ov.className = 'gc-tour-overlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;border-radius:8px;transition:top .3s,left .3s,width .3s,height .3s,box-shadow .3s;';
        document.body.appendChild(ov);
        this._overlay = ov;

        // Tooltip
        const tt = document.createElement('div');
        tt.className = 'gc-tour-tooltip';
        tt.style.cssText = 'position:fixed;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;border:1px solid rgba(138,180,248,0.3);border-radius:10px;padding:14px 16px;max-width:280px;font-size:13px;line-height:1.5;box-shadow:0 8px 32px rgba(0,0,0,0.4);';
        document.body.appendChild(tt);
        this._tooltip = tt;

        // Click-through blocker (captures clicks outside spotlight)
        const blocker = document.createElement('div');
        blocker.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483645;';
        blocker.onclick = (e) => { e.stopPropagation(); e.preventDefault(); };
        document.body.appendChild(blocker);
        this._blocker = blocker;

        this._onKey = (e) => {
            if (e.key === 'Escape') this.stop();
            else if (e.key === 'ArrowRight') this.next();
            else if (e.key === 'ArrowLeft') this.prev();
        };
        this._onResize = () => this._showStep(this._current);
        document.addEventListener('keydown', this._onKey);
        window.addEventListener('resize', this._onResize);

        this._showStep(0);
    },

    stop() {
        if (this._overlay) { this._overlay.remove(); this._overlay = null; }
        if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
        if (this._blocker) { this._blocker.remove(); this._blocker = null; }
        if (this._onKey) { document.removeEventListener('keydown', this._onKey); this._onKey = null; }
        if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
        this.markSeen();
        const cb = this._onComplete;
        this._onComplete = null;
        if (cb) setTimeout(cb, 500);
    },

    next() {
        if (this._current < STEPS.length - 1) this._showStep(++this._current);
        else this.stop();
    },

    prev() {
        if (this._current > 0) this._showStep(--this._current);
    },

    _showStep(i) {
        const step = STEPS[i];
        const el = document.querySelector(step.sel);
        if (!el) { this.next(); return; }

        const r = el.getBoundingClientRect();
        const pad = 6;

        // Position spotlight
        const ov = this._overlay;
        ov.style.top = (r.top - pad) + 'px';
        ov.style.left = (r.left - pad) + 'px';
        ov.style.width = (r.width + pad * 2) + 'px';
        ov.style.height = (r.height + pad * 2) + 'px';
        ov.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.6)';

        // Build tooltip content
        const tt = this._tooltip;
        tt.replaceChildren();

        const text = document.createElement('div');
        text.textContent = NativeUI.t(step.zh, step.en);
        text.style.marginBottom = '12px';
        tt.appendChild(text);

        const nav = document.createElement('div');
        nav.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

        const counter = document.createElement('span');
        counter.style.cssText = 'font-size:11px;opacity:0.6;';
        counter.textContent = `${i + 1} / ${STEPS.length}`;
        nav.appendChild(counter);

        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;gap:6px;';

        const btnStyle = 'padding:4px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;';

        if (i > 0) {
            const prevBtn = document.createElement('button');
            prevBtn.style.cssText = btnStyle + 'background:rgba(255,255,255,0.1);color:#e0e0e0;';
            prevBtn.textContent = NativeUI.t('上一步', 'Prev');
            prevBtn.onclick = () => this.prev();
            btnWrap.appendChild(prevBtn);
        }

        const skipBtn = document.createElement('button');
        skipBtn.style.cssText = btnStyle + 'background:rgba(255,255,255,0.1);color:#e0e0e0;';
        skipBtn.textContent = NativeUI.t('跳过', 'Skip');
        skipBtn.onclick = () => this.stop();
        btnWrap.appendChild(skipBtn);

        const nextBtn = document.createElement('button');
        nextBtn.style.cssText = btnStyle + 'background:#8ab4f8;color:#1a1a2e;font-weight:600;';
        nextBtn.textContent = i < STEPS.length - 1 ? NativeUI.t('下一步', 'Next') : NativeUI.t('完成', 'Done');
        nextBtn.onclick = () => this.next();
        btnWrap.appendChild(nextBtn);

        nav.appendChild(btnWrap);
        tt.appendChild(nav);

        // Position tooltip below or above target
        const gap = 12;
        const ttRect = tt.getBoundingClientRect();
        let top = r.bottom + gap + pad;
        if (top + ttRect.height > window.innerHeight) {
            top = r.top - pad - gap - ttRect.height;
        }
        let left = r.left + (r.width - ttRect.width) / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - ttRect.width - 8));
        top = Math.max(8, top);
        tt.style.top = top + 'px';
        tt.style.left = left + 'px';
    },
};
