import { confirmationPhrase } from './snapshot.js';
import { appendText, makeButton } from './view.js';

/** Owns preview, typed confirmation, second confirmation, Escape, and focus. */
export class BulkConfirmationFlow {
    constructor({ document: documentRef, dialogs, translate } = {}) {
        if (!documentRef || typeof documentRef.createElement !== 'function') {
            throw new TypeError('BulkConfirmationFlow requires a document');
        }
        if (!dialogs || typeof dialogs.open !== 'function') {
            throw new TypeError('BulkConfirmationFlow requires a dialog manager');
        }
        if (typeof translate !== 'function') throw new TypeError('BulkConfirmationFlow translate must be a function');
        this.document = documentRef;
        this.dialogs = dialogs;
        this.t = translate;
        this.previewDialog = null;
        this.confirmDialog = null;
    }

    close(reason) {
        const preview = this.previewDialog;
        const confirm = this.confirmDialog;
        this.previewDialog = null;
        this.confirmDialog = null;
        if (preview?.open) preview.close(reason);
        if (confirm?.open) confirm.close(reason);
    }

    open(snapshot, { hasArchive, onConfirm }) {
        if (this.previewDialog?.open) return this.previewDialog;
        const phrase = confirmationPhrase(snapshot.items.length);
        const content = this.document.createElement('div');
        content.className = 'primer-bulk-preview';
        const summary = appendText(
            this.document,
            content,
            'p',
            this.t(
                `将处理 ${snapshot.items.length} 个明确选择的对话。`,
                `${snapshot.items.length} explicitly selected conversation(s) will be processed.`
            )
        );
        summary.id = 'primer-bulk-preview-summary';
        appendText(
            this.document,
            content,
            'p',
            this.t(`当前运行范围：${snapshot.scope.label}`, `Current run scope: ${snapshot.scope.label}`)
        );
        appendText(
            this.document,
            content,
            'p',
            hasArchive
                ? this.t('删除前将先创建归档；归档被拒绝或失败时不会删除。', 'An archive will be created before deletion. Rejection or failure blocks deletion.')
                : this.t('当前没有归档能力；将明确报告为未归档。', 'No archive capability is available; this run will be reported as unarchived.')
        );
        const archiveChoice = this.document.createElement('input');
        archiveChoice.id = 'primer-bulk-archive-first';
        archiveChoice.type = 'checkbox';
        archiveChoice.checked = Boolean(hasArchive);
        archiveChoice.disabled = !hasArchive;
        const archiveLabel = this.document.createElement('label');
        archiveLabel.setAttribute('for', archiveChoice.id);
        archiveLabel.textContent = hasArchive
            ? this.t('先归档所选对话', 'Archive selected conversations first')
            : this.t('先归档（当前不可用）', 'Archive first (currently unavailable)');
        content.append(archiveChoice, archiveLabel);
        const list = this.document.createElement('ul');
        for (const item of snapshot.items) appendText(this.document, list, 'li', item.title);
        content.append(list);
        const label = this.document.createElement('label');
        label.setAttribute('for', 'primer-bulk-confirmation-phrase');
        label.textContent = this.t(`输入 ${phrase} 继续`, `Type ${phrase} to continue`);
        const input = this.document.createElement('input');
        input.id = 'primer-bulk-confirmation-phrase';
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-describedby', summary.id);
        const actions = this.document.createElement('div');
        actions.className = 'primer-bulk-actions';
        let handle;
        const cancel = makeButton(this.document, this.t('取消', 'Cancel'), () => handle.close('cancel'));
        const proceed = makeButton(
            this.document,
            this.t('继续到二次确认', 'Continue to final confirmation'),
            () => {
                if (input.value !== phrase) return;
                handle.close('continue');
                this._openFinal(snapshot, onConfirm, archiveChoice.checked && !archiveChoice.disabled);
            },
            { danger: true, disabled: true }
        );
        input.addEventListener('input', () => { proceed.disabled = input.value !== phrase; });
        actions.append(cancel, proceed);
        content.append(label, input, actions);
        handle = this.dialogs.open({
            id: 'primer-bulk-lifecycle-preview',
            title: this.t('删除预览', 'Deletion preview'),
            content,
            describedBy: summary.id,
            initialFocus: input,
            closeOnEscape: true,
            restoreFocus: true,
            onClose: (_reason, closed) => {
                if (this.previewDialog === closed) this.previewDialog = null;
            }
        });
        this.previewDialog = handle;
        return handle;
    }

    _openFinal(snapshot, onConfirm, archiveRequested) {
        const content = this.document.createElement('div');
        const warning = appendText(
            this.document,
            content,
            'p',
            this.t(
                `最后确认：只删除快照仍匹配的 ${snapshot.items.length} 个对话；${archiveRequested ? '先归档' : '不归档'}。`,
                `Final confirmation: delete only the ${snapshot.items.length} conversation(s) that still match the snapshot; ${archiveRequested ? 'archive first' : 'do not archive'}.`
            )
        );
        warning.id = 'primer-bulk-final-warning';
        const actions = this.document.createElement('div');
        let handle;
        const cancel = makeButton(this.document, this.t('返回', 'Go back'), () => handle.close('cancel'));
        const confirm = makeButton(
            this.document,
            this.t('立即删除', 'Delete now'),
            () => {
                handle.close('confirm');
                onConfirm(snapshot, { archiveRequested });
            },
            { danger: true }
        );
        actions.append(cancel, confirm);
        content.append(actions);
        handle = this.dialogs.open({
            id: 'primer-bulk-lifecycle-final-confirmation',
            title: this.t('不可撤销的二次确认', 'Irreversible final confirmation'),
            content,
            describedBy: warning.id,
            initialFocus: cancel,
            closeOnEscape: true,
            closeOnBackdrop: false,
            restoreFocus: true,
            onClose: (_reason, closed) => {
                if (this.confirmDialog === closed) this.confirmDialog = null;
            }
        });
        this.confirmDialog = handle;
        return handle;
    }
}
