import { SELECTORS } from './selectors.js';
import { isPrimerOwnedNode } from './dom.js';

function hasAffirmativeLabel(element) {
    const text = (element.textContent || '').trim().toLowerCase();
    return text.includes('delete') || text.includes('删除') || text.includes('削除') || text.includes('삭제')
        || text.includes('confirm') || text.includes('确认') || text.includes('確認') || text.includes('확인');
}

export const dialogMethods = Object.freeze({
    getMenuPanel() {
        return document.querySelector(SELECTORS.MENU_PANEL);
    },

    getDeleteMenuItem() {
        const panel = this.getMenuPanel() || document;
        const current = panel.querySelector(SELECTORS.DELETE_BUTTON);
        if (current) return current;
        return Array.from(panel.querySelectorAll(SELECTORS.MENU_ITEM)).find(hasAffirmativeLabel) || null;
    },

    getConfirmDialog() {
        const dialogs = Array.from(document.querySelectorAll(SELECTORS.DIALOG));
        return dialogs.reverse().find(dialog =>
            !isPrimerOwnedNode(dialog) &&
            dialog.hidden !== true &&
            dialog.getAttribute?.('aria-hidden') !== 'true'
        ) || null;
    },

    getDialogConfirmButton(dialog) {
        const root = dialog || this.getConfirmDialog();
        return root
            ? (Array.from(root.querySelectorAll(SELECTORS.DIALOG_CONFIRM_BTNS)).find(hasAffirmativeLabel) || null)
            : null;
    }
});
