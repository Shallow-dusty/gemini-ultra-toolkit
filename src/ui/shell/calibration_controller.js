import { FormField } from '../components.js';
import { createModalShell, createSection, createShellButton } from './modal_shell.js';

function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`Calibration ${label} must be a function`);
    return value;
}

function numericField(documentRef, value, label) {
    const input = documentRef.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = String(value);
    input.className = 'settings-select settings-number-input';
    const field = FormField({ document: documentRef, label, control: input });
    field.element.className += ' settings-row';
    return { input, field };
}

export function openCalibrationController(options = {}) {
    const documentRef = options.document || globalThis.document;
    if (!documentRef?.createElement) throw new TypeError('Calibration requires a DOM document');
    for (const [label, value] of [
        ['createIcon', options.createIcon],
        ['getTheme', options.getTheme],
        ['updatePanel', options.updatePanel],
        ['refreshDetails', options.refreshDetails]
    ]) requireFunction(value, label);
    const { core, counter, logger, ui } = options;
    if (!core || !counter || !logger || !ui) throw new TypeError('Calibration requires application dependencies');

    const dialogId = 'gemini-calibrate-modal';
    if (ui.getDialog(dialogId)) return undefined;
    const todayKey = core.getDayKey(counter.resetHour);
    const currentChatId = core.getChatId();
    let dialogHandle = null;
    let unsubscribe = null;
    const controls = [];
    const close = () => dialogHandle?.close('programmatic');

    const shell = createModalShell({
        document: documentRef,
        createIcon: options.createIcon,
        title: ui.t('校准数据', 'Calibrate Data'),
        closeLabel: ui.t('关闭校准', 'Close calibration'),
        onClose: close
    });
    controls.push(shell);
    core.applyTheme(shell.modal, options.getTheme());

    const values = createSection(documentRef, ui.t('调整数值', 'Adjust Values'));
    const today = numericField(
        documentRef,
        counter.state.dailyCounts[todayKey]?.messages || 0,
        ui.t('今日消息', 'Today Messages')
    );
    const total = numericField(documentRef, counter.state.total, ui.t('总消息数', 'Lifetime Total'));
    const chats = numericField(documentRef, counter.state.totalChatsCreated, ui.t('创建对话数', 'Chats Created'));
    controls.push(today.field, total.field, chats.field);
    values.section.append(today.field.element, total.field.element, chats.field.element);
    shell.body.appendChild(values.section);

    let chat = null;
    let chatSection = null;
    if (currentChatId) {
        chatSection = createSection(documentRef, ui.t('当前对话', 'Current Chat'));
        chat = numericField(
            documentRef,
            counter.state.chats[currentChatId] || 0,
            ui.t('对话消息数', 'Chat Messages')
        );
        controls.push(chat.field);
        const hint = documentRef.createElement('div');
        hint.className = 'calibration-chat-hint';
        hint.textContent = `ID: ${currentChatId.slice(0, 12)}...`;
        chatSection.section.append(chat.field.element, hint);
        shell.body.appendChild(chatSection.section);
    }

    const apply = createShellButton({
        document: documentRef,
        label: ui.t('应用校准', 'Apply Calibration'),
        variant: 'primary',
        className: 'settings-btn calibration-apply',
        onPress() {
            const todayValue = Number.parseInt(today.input.value, 10) || 0;
            const totalValue = Number.parseInt(total.input.value, 10) || 0;
            const chatsValue = Number.parseInt(chats.input.value, 10) || 0;
            counter.ensureTodayEntry();
            counter.state.dailyCounts[todayKey].messages = todayValue;
            counter.state.total = totalValue;
            counter.state.totalChatsCreated = chatsValue;
            if (chat && currentChatId) {
                counter.state.chats[currentChatId] = Number.parseInt(chat.input.value, 10) || 0;
            }
            counter.saveData();
            options.updatePanel();
            if (counter.state.isExpanded) options.refreshDetails();
            logger.info('Data calibrated', {
                today: todayValue,
                total: totalValue,
                chats: chatsValue,
                chatId: currentChatId || null
            });
            close();
        }
    });
    controls.push(apply);
    shell.body.appendChild(apply.element);
    const note = documentRef.createElement('div');
    note.className = 'settings-version';
    note.textContent = ui.t('手动调整计数器数值', 'Manually adjust counter values');
    shell.body.appendChild(note);

    function localize() {
        shell.title.textContent = ui.t('校准数据', 'Calibrate Data');
        shell.closeButton.setAttribute('aria-label', ui.t('关闭校准', 'Close calibration'));
        shell.closeButton.title = ui.t('关闭校准', 'Close calibration');
        values.heading.textContent = ui.t('调整数值', 'Adjust Values');
        today.field.setLabel(ui.t('今日消息', 'Today Messages'));
        total.field.setLabel(ui.t('总消息数', 'Lifetime Total'));
        chats.field.setLabel(ui.t('创建对话数', 'Chats Created'));
        if (chatSection && chat) {
            chatSection.heading.textContent = ui.t('当前对话', 'Current Chat');
            chat.field.setLabel(ui.t('对话消息数', 'Chat Messages'));
        }
        apply.setLabel(ui.t('应用校准', 'Apply Calibration'));
        note.textContent = ui.t('手动调整计数器数值', 'Manually adjust counter values');
    }

    dialogHandle = ui.openDialog({
        id: dialogId,
        ariaLabel: ui.t('校准数据', 'Calibrate data'),
        overlayClass: 'settings-overlay',
        contentElement: shell.modal,
        initialFocus: shell.closeButton,
        onClose() {
            unsubscribe?.();
            unsubscribe = null;
            for (const control of controls) control.destroy?.();
        }
    });
    unsubscribe = ui.subscribeLocale(localize);
    return dialogHandle;
}
