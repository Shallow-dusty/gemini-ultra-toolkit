import { Core } from '../core.js';
import { Logger } from '../logger.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { createIcon } from '../icons.js';
import { createLegacyMessageQueueModule } from '../features/message_queue/index.js';

const labels = Object.freeze({
    name: NativeUI.t('消息队列', 'Message Queue'),
    description: NativeUI.t(
        '本地排队发送 Prompt，支持暂停、取消和重排',
        'Queue prompts locally with pause, cancel, and reorder controls'
    ),
    sendInterval: NativeUI.t('发送间隔', 'Send interval')
});

/** Thin registry facade; the injected view retains `input.type = 'number'`. */
export function createMessageQueueModule(overrides = {}) {
    return createLegacyMessageQueueModule({
        environment: globalThis,
        core: Core,
        logger: Logger,
        nativeUI: NativeUI,
        panelUI: PanelUI,
        adapter: GeminiAdapter,
        createIcon,
        labels,
        ...overrides
    });
}

export const MessageQueueModule = createMessageQueueModule();

// A descriptive compatibility alias for integrations that used the domain
// operation name while the v12 panel exposed setIntervalMs.
MessageQueueModule.setQueueInterval = intervalMs => MessageQueueModule.setIntervalMs(intervalMs);
