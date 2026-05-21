import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';
import { getCurrentTheme } from '../state.js';
import { createIcon } from '../icons.js';
import { CounterModule } from './counter.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { formatLocalDate } from '../../lib/date_utils.js';

export const PromptVaultModule = {
    id: 'prompt-vault',
    name: NativeUI.t('提示词金库', 'Prompt Vault'),
    description: NativeUI.t('保存和快速插入常用 Prompt 模板', 'Save & quickly insert prompt templates'),
    iconId: 'gem',
    defaultEnabled: false,

    STORAGE_KEY: 'gemini_prompt_vault',
    _prompts: [],

    _getStorageKey() {
        const user = Core.getCurrentUser();
        return user && user.includes('@') ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
    },

    init() {
        let prompts;
        try { prompts = GM_getValue(this._getStorageKey(), []); }
        catch (e) { prompts = []; }
        this._prompts = prompts;
        Logger.info('PromptVaultModule initialized', { count: this._prompts.length });
    },
    destroy() {
        const fab = document.getElementById('gv-fab');
        if (fab) fab.remove();
        this.removeNativeUI();
    },
    onUserChange() {
        let prompts;
        try { prompts = GM_getValue(this._getStorageKey(), []); }
        catch (e) { prompts = []; }
        this._prompts = prompts;
        PanelUI.renderDetailsPane();
    },

    // --- Native UI: Quick menu button near input area ---
    injectNativeUI() {
        const NATIVE_ID = 'gc-vault-native';
        if (document.getElementById(NATIVE_ID)) return;

        const trailing = GeminiAdapter.getInputTrailingActions();
        if (!trailing) return;

        const btn = document.createElement('button');
        btn.id = NATIVE_ID;
        btn.className = 'gc-input-btn';
        btn.appendChild(createIcon('gem', 16));
        btn.title = 'Prompt Vault';
        btn.onclick = (e) => {
            e.stopPropagation();
            this._toggleQuickMenu(btn);
        };

        trailing.insertBefore(btn, trailing.firstChild);
    },

    removeNativeUI() {
        NativeUI.remove('gc-vault-native');
        NativeUI.remove('gc-vault-menu');
        if (this._menuAbort) { this._menuAbort.abort(); this._menuAbort = null; }
    },

    _toggleQuickMenu(anchorBtn) {
        const MENU_ID = 'gc-vault-menu';
        const existing = document.getElementById(MENU_ID);
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.className = 'gc-dropdown-menu';
        menu.style.cssText = 'position:fixed;bottom:60px;max-height:300px;overflow-y:auto;min-width:200px;';

        // Position near the button
        const rect = anchorBtn.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';

        if (this._prompts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'gc-dropdown-item';
            empty.style.cssText = 'color:#9aa0a6;font-size:12px;';
            empty.textContent = NativeUI.t('\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u63D0\u793A\u8BCD', 'No saved prompts yet');
            menu.appendChild(empty);
        } else {
            // Sort by usage frequency (most used first), then group by category
            const sorted = [...this._prompts].sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0));
            const categories = {};
            sorted.forEach(p => {
                const cat = p.category || 'General';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(p);
            });

            let count = 0;
            Object.entries(categories).forEach(([catName, prompts]) => {
                if (count >= 8) return;
                const catLabel = document.createElement('div');
                catLabel.style.cssText = 'padding:4px 16px;font-size:9px;color:#9aa0a6;text-transform:uppercase;letter-spacing:0.5px;';
                catLabel.textContent = catName;
                menu.appendChild(catLabel);

                prompts.forEach(p => {
                    if (count >= 8) return;
                    const item = document.createElement('div');
                    item.className = 'gc-dropdown-item';
                    item.style.fontSize = '12px';
                    item.textContent = p.name;
                    item.title = p.content.substring(0, 80);
                    item.onclick = (e) => {
                        e.stopPropagation();
                        menu.remove();
                        this.insertPrompt(p.content);
                    };
                    menu.appendChild(item);
                    count++;
                });
            });
        }

        // "Manage prompts" link at bottom
        const divider = document.createElement('div');
        divider.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);margin:4px 0;';
        menu.appendChild(divider);
        const manageLink = document.createElement('div');
        manageLink.className = 'gc-dropdown-item';
        manageLink.style.cssText = 'font-size:11px;color:#8ab4f8;';
        manageLink.textContent = NativeUI.t('\u7BA1\u7406\u63D0\u793A\u8BCD...', 'Manage prompts...');
        manageLink.onclick = (e) => {
            e.stopPropagation();
            menu.remove();
            // Open panel details pane to Prompt Vault tab
            const cm = CounterModule;
            if (!cm.state.isExpanded) {
                PanelUI.toggleDetails();
            }
        };
        menu.appendChild(manageLink);

        document.body.appendChild(menu);

        // Close on outside click (with AbortController for cleanup)
        if (this._menuAbort) this._menuAbort.abort();
        this._menuAbort = new AbortController();
        const signal = this._menuAbort.signal;
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && e.target !== anchorBtn) {
                    menu.remove();
                    if (this._menuAbort) { this._menuAbort.abort(); this._menuAbort = null; }
                }
            }, { capture: true, signal });
        }, 0);
    },

    _save() {
        try { GM_setValue(this._getStorageKey(), this._prompts); } catch (e) { /* silent */ }
    },

    addPrompt(name, content, category) {
        this._prompts.push({
            id: 'p_' + Date.now(),
            name: name || 'Untitled',
            content: content || '',
            category: category || 'General',
            createdAt: new Date().toISOString()
        });
        this._save();
    },

    deletePrompt(id) {
        this._prompts = this._prompts.filter(p => p.id !== id);
        this._save();
    },

    updatePrompt(id, updates) {
        const p = this._prompts.find(p => p.id === id);
        if (p) Object.assign(p, updates);
        this._save();
    },

    insertPrompt(content) {
        const editor = GeminiAdapter.getInputEditor();
        if (!editor) return;
        editor.focus();
        // Place cursor at end
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        // Insert via InputEvent for Quill/ProseMirror compatibility
        const inputEvent = new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: content,
            bubbles: true,
            cancelable: true,
            composed: true
        });
        const accepted = editor.dispatchEvent(inputEvent);
        if (!accepted || editor.textContent.trim() === '') {
            // Fallback: direct DOM manipulation
            const p = document.createElement('p');
            p.textContent = content;
            editor.appendChild(p);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // Update usage stats
        const prompt = this._prompts.find(pr => pr.content === content);
        if (prompt) {
            prompt.usedCount = (prompt.usedCount || 0) + 1;
            prompt.lastUsedAt = new Date().toISOString();
            this._save();
        }
        Logger.info('Prompt inserted');
    },

    getOnboarding() {
        return {
            zh: {
                rant: '\u6BCF\u6B21\u6253\u5F00 Gemini \u90FD\u8981\u91CD\u65B0\u6572\u4E00\u904D\u201C\u4F60\u662F\u4E00\u4E2A\u8D44\u6DF1\u67B6\u6784\u5E08...\u201D\uFF0CGoogle \u89C9\u5F97\u4F60\u7684\u624B\u6307\u4E0D\u9700\u8981\u4F11\u606F\u3002ChatGPT 2023 \u5E74\u5C31\u6709 Custom Instructions \u4E86\uFF0CGemini \u8868\u793A\uFF1A\u6211\u4EEC\u4E0D\u4E00\u6837\uFF0C\u6211\u4EEC\u8BA9\u7528\u6237\u6BCF\u6B21\u90FD\u4ECE\u96F6\u5F00\u59CB\uFF0C\u8FD9\u53EB\u201C\u65B0\u9C9C\u611F\u201D\u3002',
                features: '\u8F93\u5165\u6846\u65C1\u6DFB\u52A0 \uD83D\uDC8E \u6309\u94AE\uFF0C\u70B9\u51FB\u5F39\u51FA\u63D0\u793A\u8BCD\u5FEB\u6377\u83DC\u5355\uFF0C\u4E00\u952E\u63D2\u5165\u5E38\u7528\u63D0\u793A\u8BCD\u3002\u652F\u6301\u5206\u7C7B\u7BA1\u7406\u3001\u7F16\u8F91\u3001\u4F7F\u7528\u7EDF\u8BA1\u3002',
                guide: '1. \u70B9\u51FB\u8F93\u5165\u6846\u65C1\u7684 \uD83D\uDC8E \u2192 2. \u9009\u62E9\u63D0\u793A\u8BCD\u63D2\u5165 \u2192 3. \u5982\u9700\u7BA1\u7406\u63D0\u793A\u8BCD\uFF0C\u70B9\u51FB\u83DC\u5355\u5E95\u90E8\u201C\u7BA1\u7406\u63D0\u793A\u8BCD\u201D'
            },
            en: {
                rant: "Every time you open Gemini you retype 'You are a senior architect...' because Google thinks your fingers need exercise. ChatGPT had Custom Instructions in 2023. Gemini says: we're different, we let users start from scratch every time. It's called 'freshness'.",
                features: 'Adds a \uD83D\uDC8E button near the input box. Click to open a prompt quick menu and insert saved prompts with one click. Supports categories, editing, and usage stats.',
                guide: '1. Click \uD83D\uDC8E near the input box \u2192 2. Select a prompt to insert \u2192 3. To manage prompts, click "Manage prompts" at the bottom'
            }
        };
    },

    renderToDetailsPane(container) {
        const title = document.createElement('div');
        title.className = 'section-title';
        title.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
        const titleText = document.createElement('span');
        titleText.textContent = 'Prompt Vault';
        const addBtn = document.createElement('span');
        addBtn.style.cssText = 'font-size: 12px; cursor: pointer; opacity: 0.6;';
        addBtn.textContent = '+';
        addBtn.title = 'Add new prompt';
        addBtn.onclick = (e) => {
            e.stopPropagation();
            this.showPromptEditor(null);
        };
        title.appendChild(titleText);
        title.appendChild(addBtn);
        container.appendChild(title);

        if (this._prompts.length === 0) {
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size: 10px; color: var(--text-sub); opacity: 0.6; padding: 4px 8px;';
            hint.textContent = 'No saved prompts. Click + to add.';
            container.appendChild(hint);
            return;
        }

        // Group by category
        const categories = {};
        this._prompts.forEach(p => {
            const cat = p.category || 'General';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(p);
        });

        Object.entries(categories).forEach(([catName, prompts]) => {
            const catLabel = document.createElement('div');
            catLabel.style.cssText = 'font-size: 9px; color: var(--text-sub); opacity: 0.5; padding: 4px 8px 2px; text-transform: uppercase; letter-spacing: 0.5px;';
            catLabel.textContent = catName;
            container.appendChild(catLabel);

            prompts.forEach(p => {
                const row = document.createElement('div');
                row.className = 'detail-row';
                row.title = p.content.length > 100 ? p.content.slice(0, 100) + '...' : p.content;

                const nameEl = document.createElement('span');
                nameEl.style.cssText = 'flex: 1; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                nameEl.textContent = p.name;

                const actions = document.createElement('div');
                actions.style.cssText = 'display: flex; gap: 4px; opacity: 0;';
                row.onmouseenter = () => actions.style.opacity = '1';
                row.onmouseleave = () => actions.style.opacity = '0';

                const insertBtn = document.createElement('span');
                insertBtn.style.cssText = 'cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;';
                insertBtn.appendChild(createIcon('copy', 12));
                insertBtn.title = 'Insert into chat';
                insertBtn.onclick = (e) => { e.stopPropagation(); this.insertPrompt(p.content); };

                const editBtn = document.createElement('span');
                editBtn.style.cssText = 'cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;';
                editBtn.appendChild(createIcon('edit', 12));
                editBtn.onclick = (e) => { e.stopPropagation(); this.showPromptEditor(p); };

                const delBtn = document.createElement('span');
                delBtn.style.cssText = 'cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;';
                delBtn.appendChild(createIcon('trash', 12));
                delBtn.onclick = (e) => { e.stopPropagation(); this.deletePrompt(p.id); PanelUI.renderDetailsPane(); };

                actions.appendChild(insertBtn);
                actions.appendChild(editBtn);
                actions.appendChild(delBtn);
                row.appendChild(nameEl);
                row.appendChild(actions);

                // Click to insert
                row.onclick = (e) => { e.stopPropagation(); this.insertPrompt(p.content); };

                container.appendChild(row);
            });
        });

        // Import/Export buttons
        const ioRow = document.createElement('div');
        ioRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

        const exportBtn = document.createElement('button');
        exportBtn.style.cssText = 'flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;';
        exportBtn.textContent = NativeUI.t('导出', 'Export');
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            this._exportPrompts();
        };

        const importBtn = document.createElement('button');
        importBtn.style.cssText = 'flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;';
        importBtn.textContent = NativeUI.t('导入', 'Import');
        importBtn.onclick = (e) => {
            e.stopPropagation();
            this._importPrompts();
        };

        ioRow.appendChild(exportBtn);
        ioRow.appendChild(importBtn);
        container.appendChild(ioRow);
    },

    _exportPrompts() {
        const data = JSON.stringify(this._prompts, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `primer-pp-prompts-${formatLocalDate(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
        NativeUI.showToast(NativeUI.t('提示词已导出', 'Prompts exported'));
    },

    _importPrompts() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const imported = JSON.parse(ev.target.result);
                    if (!Array.isArray(imported)) throw new Error('Invalid format');
                    let added = 0;
                    imported.forEach(p => {
                        if (p.name && p.content) {
                            this._prompts.push({
                                id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                                name: p.name,
                                content: p.content,
                                category: p.category || 'General',
                                createdAt: p.createdAt || new Date().toISOString(),
                                usedCount: p.usedCount || 0
                            });
                            added++;
                        }
                    });
                    this._save();
                    PanelUI.renderDetailsPane();
                    NativeUI.showToast(NativeUI.t(`已导入 ${added} 条提示词`, `Imported ${added} prompts`));
                } catch (err) {
                    NativeUI.showToast(NativeUI.t('导入失败: 格式无效', 'Import failed: invalid format'));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    showPromptEditor(existing) {
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';

        // ESC to close + cleanup on all close paths
        const escHandler = (e) => { if (e.key === 'Escape') closeOverlay(); };
        document.addEventListener('keydown', escHandler);
        const closeOverlay = () => { document.removeEventListener('keydown', escHandler); overlay.remove(); };
        overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };

        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        Core.applyTheme(modal, getCurrentTheme());

        const header = document.createElement('div');
        header.className = 'settings-header';
        const h3 = document.createElement('h3');
        h3.textContent = existing ? 'Edit Prompt' : 'New Prompt';
        const closeBtn = document.createElement('span');
        closeBtn.className = 'settings-close';
        closeBtn.textContent = '';
        closeBtn.appendChild(createIcon('x', 16));
        closeBtn.onclick = () => closeOverlay();
        header.appendChild(h3);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'settings-body';

        const nameInput = document.createElement('input');
        nameInput.className = 'settings-select';
        nameInput.style.cssText = 'width: 100%; margin-bottom: 8px; padding: 8px; box-sizing: border-box;';
        nameInput.placeholder = 'Prompt name';
        nameInput.value = existing ? existing.name : '';

        const catInput = document.createElement('input');
        catInput.className = 'settings-select';
        catInput.style.cssText = 'width: 100%; margin-bottom: 8px; padding: 8px; box-sizing: border-box;';
        catInput.placeholder = 'Category (e.g. Coding, Writing)';
        catInput.value = existing ? existing.category : 'General';

        const contentArea = document.createElement('textarea');
        contentArea.style.cssText = 'width: 100%; height: 120px; padding: 8px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #fff); resize: vertical; box-sizing: border-box; font-family: inherit;';
        contentArea.placeholder = 'Enter your prompt template...';
        contentArea.value = existing ? existing.content : '';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'settings-btn';
        saveBtn.style.cssText = 'background: var(--accent, #8ab4f8); color: #000; font-weight: 500; margin-top: 8px;';
        saveBtn.textContent = existing ? 'Save' : 'Create';
        saveBtn.onclick = () => {
            const name = nameInput.value.trim() || 'Untitled';
            const content = contentArea.value.trim();
            const category = catInput.value.trim() || 'General';
            if (!content) return;
            if (existing) {
                this.updatePrompt(existing.id, { name, content, category });
            } else {
                this.addPrompt(name, content, category);
            }
            closeOverlay();
            PanelUI.renderDetailsPane();
        };

        body.appendChild(nameInput);
        body.appendChild(catInput);
        body.appendChild(contentArea);
        body.appendChild(saveBtn);
        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        nameInput.focus();
    }
};
