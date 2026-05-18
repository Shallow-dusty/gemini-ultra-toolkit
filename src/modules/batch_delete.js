import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';

export const BatchDeleteModule = {
    id: 'batch-delete',
    name: NativeUI.t('批量删除', 'Batch Delete'),
    description: NativeUI.t('在面板中批量选择并删除对话', 'Batch select and delete chats from panel'),
    icon: '\uD83D\uDDD1\uFE0F',
    iconId: 'trash',
    defaultEnabled: false,

    _selected: new Set(),
    _deleting: false,
    _progress: { current: 0, total: 0 },
    _batchMode: false,

    init() {
        this._selected = new Set();
        this._batchMode = false;
        Logger.info('BatchDeleteModule initialized');
    },

    destroy() {
        this._selected.clear();
        this._deleting = false;
        this._batchMode = false;
        this.removeNativeUI();
    },

    onUserChange() {
        this._selected.clear();
        this._batchMode = false;
        // The already-injected toolbar still reflects the prior session's
        // batch state ("N selected" / active toolbar) until forced to rebuild.
        this.removeNativeUI();
        NativeUI.markDirty(this.id);
        NativeUI.tick();
    },

    // --- Native UI: Sidebar batch toolbar ---
    injectNativeUI() {
        const TOOLBAR_ID = 'gc-batch-toolbar';
        if (document.getElementById(TOOLBAR_ID)) return;

        const sidebar = NativeUI.getSidebar();
        if (!sidebar) return;

        const toolbar = document.createElement('div');
        toolbar.id = TOOLBAR_ID;
        toolbar.className = 'gc-sidebar-toolbar';

        if (this._batchMode) {
            this._renderBatchToolbar(toolbar);
        } else {
            const enterBtn = document.createElement('button');
            enterBtn.className = 'gc-sidebar-btn full-width';
            enterBtn.textContent = NativeUI.t('\u6279\u91CF\u7BA1\u7406', 'Batch Manage');
            enterBtn.onclick = () => {
                this._batchMode = true;
                this._refreshNativeUI();
            };
            toolbar.appendChild(enterBtn);
        }

        // Insert into overflow-container (avoid CSS Grid issues on parent)
        if (!sidebar) return;
        const overflowC = sidebar.querySelector('.overflow-container') || sidebar;
        const folderFilter = document.getElementById('gc-folder-filter');
        if (folderFilter && folderFilter.parentElement === overflowC) {
            overflowC.insertBefore(toolbar, folderFilter.nextSibling);
        } else {
            overflowC.prepend(toolbar);
        }
    },

    removeNativeUI() {
        NativeUI.remove('gc-batch-toolbar');
        // Remove all injected checkboxes
        document.querySelectorAll('.gc-batch-check').forEach(el => el.remove());
        this._batchMode = false;
    },

    _refreshNativeUI() {
        NativeUI.remove('gc-batch-toolbar');
        document.querySelectorAll('.gc-batch-check').forEach(el => el.remove());
        this.injectNativeUI();
        if (this._batchMode) this._injectCheckboxes();
    },

    _renderBatchToolbar(toolbar) {
        toolbar.className = 'gc-sidebar-toolbar gc-sidebar-toolbar-active';

        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = 'gc-sidebar-btn';
        selectAllBtn.textContent = NativeUI.t('\u5168\u9009', 'Select All');
        selectAllBtn.onclick = () => {
            const chats = this._scanChats();
            chats.forEach(c => this._selected.add(c.id));
            this._refreshNativeUI();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'gc-sidebar-btn';
        cancelBtn.textContent = NativeUI.t('\u53D6\u6D88', 'Cancel');
        cancelBtn.onclick = () => {
            this._batchMode = false;
            this._selected.clear();
            this._refreshNativeUI();
        };

        const countLabel = document.createElement('span');
        countLabel.className = 'gc-count-label';
        countLabel.textContent = NativeUI.t('\u5DF2\u9009 ' + this._selected.size + ' \u4E2A', this._selected.size + ' selected');

        toolbar.appendChild(selectAllBtn);
        toolbar.appendChild(cancelBtn);
        toolbar.appendChild(countLabel);

        if (this._selected.size > 0) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'gc-sidebar-btn danger';
            deleteBtn.textContent = NativeUI.t('\u5220\u9664', 'Delete');
            deleteBtn.onclick = () => {
                NativeUI.showConfirm(
                    NativeUI.t('确认删除选中的 ' + this._selected.size + ' 个对话？', 'Delete ' + this._selected.size + ' selected conversation(s)?'),
                    () => this._batchDelete(),
                    { confirmText: NativeUI.t('删除', 'Delete'), danger: true }
                );
            };
            toolbar.appendChild(deleteBtn);
        }
    },

    _injectCheckboxes() {
        const chats = Core.scanSidebarChats();
        chats.forEach(chat => {
            if (chat.element.querySelector('.gc-batch-check')) return;
            const check = document.createElement('div');
            check.className = 'gc-batch-check';
            const isChecked = this._selected.has(chat.id);
            check.dataset.checked = isChecked ? 'true' : 'false';
            check.textContent = isChecked ? '\u2713' : '';
            check.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this._selected.has(chat.id)) {
                    this._selected.delete(chat.id);
                } else {
                    this._selected.add(chat.id);
                }
                this._refreshNativeUI();
            };
            chat.element.insertBefore(check, chat.element.firstChild);
        });
    },

    _scanChats() {
        return Core.scanSidebarChats();
    },

    async _deleteChat(chatElement) {
        try {
            // Step 1: Hover to reveal three-dot menu
            chatElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            await this._sleep(300);

            // Step 2: Find the three-dot/more button (appears on hover)
            const menuBtn = chatElement.querySelector(
                'button[data-test-id*="menu"], mat-icon[data-mat-icon-name="more_vert"], ' +
                'button[aria-label*="more" i], button[aria-label*="options" i], ' +
                'button[aria-label*="更多" i], button[aria-label*="その他" i], button[aria-label*="더보기" i]'
            );
            if (!menuBtn) {
                // Try parent-level search
                const parent = chatElement.closest('mat-list-item, [role="listitem"]') || chatElement.parentElement;
                const altBtn = parent?.querySelector('button[data-test-id*="menu"], button[aria-label*="more" i], button[aria-label*="更多" i]');
                if (altBtn) {
                    altBtn.click();
                } else {
                    throw new Error('Menu button not found');
                }
            } else {
                const clickTarget = menuBtn.closest('button') || menuBtn;
                clickTarget.click();
            }
            await this._sleep(400);

            // Step 3: Find "Delete" option in the opened menu (scoped to overlay)
            const menuPanel = document.querySelector('.cdk-overlay-pane [role="menu"], .cdk-overlay-container [role="menu"], .mat-mdc-menu-panel');
            const menuScope = menuPanel || document;
            const menuItems = menuScope.querySelectorAll('[role="menuitem"], mat-menu-item, button.mat-mdc-menu-item');
            let deleteBtn = null;
            menuItems.forEach(item => {
                const text = item.textContent.trim().toLowerCase();
                if (text.includes('delete') || text.includes('删除') || text.includes('削除') || text.includes('삭제')) {
                    deleteBtn = item;
                }
            });

            if (!deleteBtn) throw new Error('Delete option not found');
            deleteBtn.click();
            await this._sleep(400);

            // Step 4: Confirm in dialog — scope search to visible dialog first
            const dialog = document.querySelector('mat-dialog-container, .mdc-dialog, [role="dialog"], [role="alertdialog"]');
            if (!dialog) throw new Error('Dialog not found');
            const confirmBtns = dialog.querySelectorAll('button.confirm-button, button[data-test-id*="confirm"], mat-dialog-actions button, .mdc-dialog__actions button, [role="dialog"] button, [role="alertdialog"] button');
            let confirmed = false;
            for (const btn of confirmBtns) {
                const text = btn.textContent.trim().toLowerCase();
                if (text.includes('delete') || text.includes('删除') || text.includes('削除') || text.includes('삭제') ||
                    text.includes('confirm') || text.includes('确认') || text.includes('確認') || text.includes('확인')) {
                    btn.click();
                    confirmed = true;
                    break;
                }
            }
            if (!confirmed) {
                throw new Error('Confirm button not found');
            }
            await this._sleep(300);
            return true;
        } catch (e) {
            Logger.warn('Delete failed', { error: e.message });
            // Close any open menu
            document.body.click();
            await this._sleep(200);
            return false;
        }
    },

    async _batchDelete() {
        if (this._deleting || this._selected.size === 0) return;
        this._deleting = true;
        this._progress = { current: 0, total: this._selected.size };

        const chats = this._scanChats();
        const toDelete = chats.filter(c => this._selected.has(c.id));
        let deleted = 0;
        let failed = 0;

        for (const chat of toDelete) {
            this._progress.current++;
            PanelUI.renderDetailsPane();
            const ok = await this._deleteChat(chat.element);
            if (ok) {
                deleted++;
                this._selected.delete(chat.id);
            } else {
                failed++;
            }
            await this._sleep(500);
        }

        this._deleting = false;
        this._selected.clear();
        Logger.info('Batch delete complete', { deleted, failed });
        PanelUI.renderDetailsPane();
    },

    _sleep(ms) {
        return Core.sleep(ms);
    },

    renderToDetailsPane(container) {
        const section = document.createElement('div');
        section.className = 'gf-section';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600;font-size:13px;color:var(--text-main);';
        title.textContent = 'Batch Delete';
        header.appendChild(title);

        if (this._deleting) {
            const progress = document.createElement('span');
            progress.style.cssText = 'font-size:11px;color:var(--accent);';
            progress.textContent = 'Deleting ' + this._progress.current + '/' + this._progress.total + '...';
            header.appendChild(progress);
        } else if (this._selected.size > 0) {
            const deleteBtn = document.createElement('button');
            deleteBtn.style.cssText = 'background:#ea4335;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;';
            deleteBtn.textContent = 'Delete ' + this._selected.size + ' chats';
            deleteBtn.onclick = () => {
                NativeUI.showConfirm(
                    NativeUI.t('确认删除选中的 ' + this._selected.size + ' 个对话？此操作不可撤销。', 'Delete ' + this._selected.size + ' chats? This cannot be undone.'),
                    () => this._batchDelete(),
                    { confirmText: NativeUI.t('删除', 'Delete'), danger: true }
                );
            };
            header.appendChild(deleteBtn);
        }
        section.appendChild(header);

        // Chat list with checkboxes
        const chats = this._scanChats();
        if (chats.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:12px;color:var(--text-sub);text-align:center;padding:12px;';
            empty.textContent = NativeUI.t('\u4FA7\u680F\u4E2D\u672A\u53D1\u73B0\u5BF9\u8BDD\u9879', 'No conversations found in sidebar');
            section.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.style.cssText = 'max-height:200px;overflow-y:auto;';
            chats.forEach(chat => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:12px;color:var(--text-main);';
                row.onmouseenter = () => { row.style.background = 'var(--row-hover)'; };
                row.onmouseleave = () => { row.style.background = ''; };

                const check = document.createElement('div');
                const isChecked = this._selected.has(chat.id);
                check.style.cssText = 'width:16px;height:16px;border-radius:3px;border:2px solid ' + (isChecked ? 'var(--accent)' : 'var(--text-sub)') + ';background:' + (isChecked ? 'var(--accent)' : 'transparent') + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;';
                check.textContent = isChecked ? '\u2713' : '';

                const label = document.createElement('span');
                label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
                label.textContent = chat.title;

                row.onclick = () => {
                    if (this._selected.has(chat.id)) {
                        this._selected.delete(chat.id);
                    } else {
                        this._selected.add(chat.id);
                    }
                    PanelUI.renderDetailsPane();
                };

                row.appendChild(check);
                row.appendChild(label);
                list.appendChild(row);
            });
            section.appendChild(list);
        }

        // Select all / Deselect all buttons
        if (chats.length > 0 && !this._deleting) {
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
            const selectAll = document.createElement('button');
            selectAll.style.cssText = 'background:var(--btn-bg);color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;';
            selectAll.textContent = 'Select All';
            selectAll.onclick = () => {
                chats.forEach(c => this._selected.add(c.id));
                PanelUI.renderDetailsPane();
            };
            const deselectAll = document.createElement('button');
            deselectAll.style.cssText = 'background:var(--btn-bg);color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;';
            deselectAll.textContent = 'Deselect All';
            deselectAll.onclick = () => {
                this._selected.clear();
                PanelUI.renderDetailsPane();
            };
            actions.appendChild(selectAll);
            actions.appendChild(deselectAll);
            section.appendChild(actions);
        }

        container.appendChild(section);
    },

    getOnboarding() {
        return {
            zh: {
                rant: 'Gemini \u7684\u5220\u9664\u5BF9\u8BDD\u529F\u80FD\uFF1A\u6253\u5F00\u83DC\u5355 \u2192 \u70B9\u5220\u9664 \u2192 \u786E\u8BA4 \u2192 \u7B49\u5F85\u3002\u4E00\u4E2A\u5BF9\u8BDD\u8981 4 \u6B21\u70B9\u51FB\u3002\u4F60\u6709 50 \u4E2A\u6D4B\u8BD5\u5BF9\u8BDD\u8981\u6E05\u7406\uFF1F\u90A3\u5C31\u70B9 200 \u6B21\u5427\uFF0CGoogle \u5DE5\u7A0B\u5E08\u663E\u7136\u6CA1\u6709\u6E05\u7406\u8FC7\u81EA\u5DF1\u7684\u5BF9\u8BDD\u5217\u8868\u3002\u4E5F\u53EF\u80FD\u4ED6\u4EEC\u5199\u4E86\u4E2A\u5185\u90E8\u5DE5\u5177\uFF0C\u53EA\u662F\u61D2\u5F97\u7ED9\u4F60\u7528\u3002',
                features: '\u5728\u4FA7\u8FB9\u680F\u6DFB\u52A0\u6279\u91CF\u7BA1\u7406\u5DE5\u5177\u680F\u3002\u6FC0\u6D3B\u540E\u6BCF\u4E2A\u5BF9\u8BDD\u51FA\u73B0\u590D\u9009\u6846\uFF0C\u52FE\u9009\u540E\u4E00\u952E\u6279\u91CF\u5220\u9664\u3002\u652F\u6301\u5168\u9009/\u53CD\u9009\u3002',
                guide: '1. \u70B9\u51FB\u4FA7\u8FB9\u680F\u7684\u201C\uD83D\uDDD1\uFE0F \u6279\u91CF\u7BA1\u7406\u201D \u2192 2. \u52FE\u9009\u8981\u5220\u9664\u7684\u5BF9\u8BDD \u2192 3. \u70B9\u51FB\u201C\u5220\u9664\u201D \u2192 4. \u786E\u8BA4'
            },
            en: {
                rant: "Deleting a Gemini conversation: open menu \u2192 click delete \u2192 confirm \u2192 wait. 4 clicks per conversation. Have 50 test chats to clean up? That's 200 clicks. Google engineers clearly never clean up their own conversation lists. Or maybe they have an internal tool, they just can't be bothered to give it to you.",
                features: 'Adds a batch management toolbar to the sidebar. When activated, checkboxes appear on each conversation for one-click batch deletion. Supports select all/deselect.',
                guide: '1. Click "\uD83D\uDDD1\uFE0F Batch Manage" in the sidebar \u2192 2. Check conversations to delete \u2192 3. Click "Delete" \u2192 4. Confirm'
            }
        };
    }
};
