import { GLOBAL_KEYS, PANEL_ID } from './constants.js';
import { NativeUI } from './native_ui.js';
import { createTourController } from './ui/shell/tour_controller.js';

const STEPS = Object.freeze([
    { sel: `#${PANEL_ID}`, zh: '这是 Primer++ 控制面板，可拖拽移动', en: 'This is the Primer++ control panel, drag to move' },
    { sel: '#g-user-capsule', zh: '当前登录用户，点击可切换查看其他用户数据', en: 'Current user, click to switch viewing other users' },
    { sel: '#g-big-display', zh: '今日消息计数，实时更新', en: 'Today\'s message count, updates in real-time' },
    { sel: '#g-model-badge', zh: '当前模型显示（Flash/Thinking/Pro）', en: 'Current model display (Flash/Thinking/Pro)' },
    { sel: '#g-quota-wrap', zh: '配额进度条，可在设置中自定义上限', en: 'Quota progress bar, customize limit in settings' },
    { sel: '#g-action-btn', zh: '功能菜单：设置、仪表盘、导出等', en: 'Action menu: settings, dashboard, export, etc.' },
    { sel: '#g-details-pane', zh: '详情区域，展示各模块的详细信息', en: 'Details pane showing module-specific information' }
]);

let storagePort = null;

function configurePorts(ports = {}) {
    if (!ports || typeof ports !== 'object' || Array.isArray(ports)) {
        throw new TypeError('Guided tour ports must be an object');
    }
    if (Object.hasOwn(ports, 'storage')) {
        const { storage } = ports;
        if (storage != null && (
            typeof storage !== 'object'
            || typeof storage.get !== 'function'
            || typeof storage.set !== 'function'
        )) throw new TypeError('Guided tour storage port requires get() and set()');
        storagePort = storage;
    }
    return Object.freeze({ storage: storagePort });
}

const controller = createTourController({
    steps: STEPS,
    ui: NativeUI,
    getDocument: () => document,
    getWindow: () => window,
    getComputedStyle: element => (
        typeof globalThis.getComputedStyle === 'function' ? globalThis.getComputedStyle(element) : null
    ),
    getRequestAnimationFrame: () => globalThis.requestAnimationFrame,
    getCancelAnimationFrame: () => globalThis.cancelAnimationFrame,
    schedule: (callback, delay) => globalThis.setTimeout(callback, delay),
    readSeen: () => storagePort?.get(GLOBAL_KEYS.TOUR_SEEN, false) ?? false,
    writeSeen: value => storagePort?.set(GLOBAL_KEYS.TOUR_SEEN, value)
});

controller.configurePorts = configurePorts;
export const GuidedTour = controller;
