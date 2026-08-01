import {
    buildPromptVariables,
    findPromptByShortcut,
    formatPromptContextPacket,
    getQuickMenuSections,
    sortPromptsForDisplay
} from '../../../lib/prompt_vault_tools.js';
import { openQueuePermissionPreview, openRecipeVariablesDialog } from './legacy_ui.js';

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

export function combineRecipePlanSteps(plan) {
    if (plan.steps.length <= 1) return plan.steps[0]?.prompt || '';
    return plan.steps.map((step, index) => `Step ${index + 1}\n${step.prompt}`).join('\n\n---\n\n');
}

export function recipePlanQueueEntries(plan) {
    return plan.steps.map((step, index) => ({
        title: plan.steps.length === 1 ? step.title : `${step.title} ${index + 1}/${plan.steps.length}`,
        text: step.prompt,
        promptId: plan.recipeId,
        stepIndex: index + 1,
        totalSteps: plan.steps.length
    }));
}

/** Owns composer insertion, quick access, and explicit queue handoff UI. */
export class LegacyRecipeComposerController {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this._slashAbort = null;
        this._slashEditor = null;
    }

    templateVariables() {
        const { adapter, document, window, timestamp } = this.dependencies;
        let selectedText = '';
        let chatTitle = '';
        let model = '';
        try { selectedText = window?.getSelection?.()?.toString().trim() || ''; } catch { /* optional */ }
        try { chatTitle = adapter.getChatTitleText?.() || document.title || ''; } catch { chatTitle = document.title || ''; }
        try { model = adapter.detectModelKey?.() || ''; } catch { /* optional */ }
        return buildPromptVariables({ selectedText, chatTitle, model, now: new Date(timestamp()) });
    }

    valuesForRecipe(recipe, supplied = {}) {
        const builtins = this.templateVariables();
        const values = {};
        for (const variable of recipe.variables) {
            if (hasOwn(supplied, variable.name)) values[variable.name] = supplied[variable.name];
            else if (hasOwn(builtins, variable.name)) values[variable.name] = builtins[variable.name];
        }
        return values;
    }

    missingRequiredVariables(recipe, values) {
        return recipe.variables.filter(variable =>
            variable.required && !hasOwn(variable, 'default') && !hasOwn(values, variable.name));
    }

    async insertPrompt(content, promptId = null, suppliedValues = {}) {
        const { service, recipeIdForPrompt, trackDialog, markUsed, t, document, ui } = this.dependencies;
        const recipeId = promptId ? await recipeIdForPrompt(promptId) : null;
        if (!recipeId) return this.insertText(String(content || ''));
        const recipe = await service().api.get(recipeId);
        const values = this.valuesForRecipe(recipe, suppliedValues);
        if (this.missingRequiredVariables(recipe, values).length) {
            let dialog;
            dialog = openRecipeVariablesDialog({
                document,
                ui,
                recipe,
                initialValues: values,
                t,
                onClose: () => this.dependencies.releaseDialog(dialog),
                onSubmit: nextValues => { void this.insertPrompt(content, promptId, nextValues); }
            });
            trackDialog(dialog);
            return false;
        }
        const plan = await service().api.render(recipeId, values);
        if (plan.autoSend !== false) throw new Error('Recipes must never auto-send');
        const inserted = this.insertText(combineRecipePlanSteps(plan));
        if (inserted) await markUsed(promptId);
        return inserted;
    }

    insertText(text) {
        const { capabilities, adapter, document, window, toast, t } = this.dependencies;
        const composer = capabilities().composer;
        if (composer && typeof composer.insertDraft === 'function') return composer.insertDraft(text) !== false;
        const editor = adapter.getInputEditor?.();
        if (!editor) {
            toast(t('未找到 Gemini 输入框', 'Gemini input box not found'));
            return false;
        }
        editor.focus?.();
        const before = 'value' in editor ? editor.value : editor.textContent;
        const EventCtor = window?.InputEvent || globalThis.InputEvent;
        const event = EventCtor ? new EventCtor('beforeinput', {
            inputType: 'insertText', data: text, bubbles: true, cancelable: true, composed: true
        }) : null;
        const accepted = event ? editor.dispatchEvent(event) : false;
        const after = 'value' in editor ? editor.value : editor.textContent;
        if (accepted && after !== before) return true;
        if ('value' in editor) {
            const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
            const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : editor.value.length;
            editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
            editor.selectionStart = editor.selectionEnd = start + text.length;
        } else {
            const paragraph = document.createElement('p');
            paragraph.textContent = text;
            editor.appendChild(paragraph);
        }
        const InputCtor = window?.Event || globalThis.Event;
        if (InputCtor) editor.dispatchEvent(new InputCtor('input', { bubbles: true }));
        return true;
    }

    async queuePrompt(prompt, suppliedValues = {}) {
        const { capabilities, toast, t, recipeIdForPrompt, service, trackDialog, document, ui } = this.dependencies;
        if (!capabilities().queue) {
            toast(t('请先启用 Message Queue', 'Enable Message Queue first'));
            return false;
        }
        const recipeId = await recipeIdForPrompt(prompt.id);
        const recipe = await service().api.get(recipeId);
        const values = this.valuesForRecipe(recipe, suppliedValues);
        if (this.missingRequiredVariables(recipe, values).length) {
            let dialog;
            dialog = openRecipeVariablesDialog({
                document,
                ui,
                recipe,
                initialValues: values,
                t,
                onClose: () => this.dependencies.releaseDialog(dialog),
                onSubmit: nextValues => { void this.queuePrompt(prompt, nextValues); }
            });
            trackDialog(dialog);
            return false;
        }
        const plan = await service().api.render(recipeId, values);
        let dialog;
        dialog = openQueuePermissionPreview({
            document,
            ui,
            plan,
            t,
            onClose: () => this.dependencies.releaseDialog(dialog),
            onConfirm: confirmed => { void this.confirmQueueHandoff(confirmed, prompt.id); }
        });
        trackDialog(dialog);
        return true;
    }

    async confirmQueueHandoff(plan, promptId) {
        const { capabilities, timestamp, markUsed, toast, t } = this.dependencies;
        if (plan.autoSend !== false) throw new Error('Queue handoff requires a non-sending recipe plan');
        const queue = capabilities().queue;
        if (!queue) return false;
        const entries = recipePlanQueueEntries(plan);
        let added = 0;
        if (typeof queue.enqueueEntries === 'function') {
            added = await queue.enqueueEntries(entries, {
                idPrefix: `pv_${plan.recipeId}_${timestamp().replace(/\D/g, '')}`
            });
        } else if (typeof queue.enqueue === 'function') {
            for (const entry of entries) {
                await queue.enqueue(entry);
                added += 1;
            }
        } else {
            throw new TypeError('Message Queue capability must implement enqueueEntries() or enqueue()');
        }
        if (added > 0) await markUsed(promptId);
        toast(t(`已加入 ${added} 条队列`, `Queued ${added} item(s)`));
        return added;
    }

    injectNativeUI() {
        const { document, adapter, t } = this.dependencies;
        const id = 'gc-vault-native';
        if (document.getElementById?.(id)) {
            this.bindSlashExpansion();
            return;
        }
        const trailing = adapter.getInputTrailingActions?.();
        if (!trailing) return;
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.id = id;
        trigger.className = 'gc-input-btn';
        trigger.textContent = '◆';
        trigger.setAttribute('aria-label', t('打开提示词配方', 'Open prompt recipes'));
        trigger.setAttribute('aria-expanded', 'false');
        trigger.addEventListener('click', event => {
            event.stopPropagation?.();
            this.toggleQuickMenu(trigger);
        });
        trailing.insertBefore(trigger, trailing.firstChild || null);
        this.bindSlashExpansion();
    }

    removeNativeUI() {
        const { document } = this.dependencies;
        document.getElementById?.('gc-vault-native')?.remove();
        document.getElementById?.('gc-vault-menu')?.remove();
        this._slashAbort?.abort();
        this._slashAbort = null;
        this._slashEditor = null;
    }

    toggleQuickMenu(anchor) {
        const { document, prompts, t, capabilities, mountedPane, toast } = this.dependencies;
        const existing = document.getElementById?.('gc-vault-menu');
        if (existing) {
            existing.remove();
            anchor.setAttribute('aria-expanded', 'false');
            return;
        }
        const menu = document.createElement('div');
        menu.id = 'gc-vault-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', t('提示词配方', 'Prompt recipes'));
        for (const section of getQuickMenuSections(prompts(), { limit: 8 })) {
            const heading = document.createElement('div');
            heading.setAttribute('role', 'presentation');
            heading.textContent = section.label;
            menu.appendChild(heading);
            for (const prompt of section.prompts) {
                const item = document.createElement('button');
                item.type = 'button';
                item.setAttribute('role', 'menuitem');
                item.textContent = `${prompt.name}${prompt.shortcut ? ` /${prompt.shortcut}` : ''}`;
                item.addEventListener('click', () => {
                    menu.remove();
                    anchor.setAttribute('aria-expanded', 'false');
                    void this.insertPrompt(prompt.content, prompt.id);
                });
                menu.appendChild(item);
            }
        }
        const manage = document.createElement('button');
        manage.type = 'button';
        manage.setAttribute('role', 'menuitem');
        manage.textContent = t('管理配方…', 'Manage recipes…');
        manage.addEventListener('click', () => {
            menu.remove();
            anchor.setAttribute('aria-expanded', 'false');
            if (typeof capabilities().shell?.openModule === 'function') capabilities().shell.openModule('prompt-vault');
            else if (mountedPane()?.focus) mountedPane().focus();
            else toast(t('请打开 Primer++ 详情面板管理配方', 'Open the Primer++ details panel to manage recipes'));
        });
        menu.appendChild(manage);
        document.body.appendChild(menu);
        anchor.setAttribute('aria-expanded', 'true');
    }

    bindSlashExpansion() {
        const { adapter, prompts, toast, t } = this.dependencies;
        const editor = adapter.getInputEditor?.();
        if (!editor || editor === this._slashEditor) return;
        this._slashAbort?.abort();
        this._slashEditor = editor;
        this._slashAbort = new AbortController();
        editor.addEventListener('keydown', event => {
            if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
            const currentText = (editor.value || editor.textContent || '').trim();
            const prompt = findPromptByShortcut(prompts(), currentText);
            if (!prompt) return;
            event.preventDefault();
            if ('value' in editor) editor.value = '';
            else editor.textContent = '';
            void this.insertPrompt(prompt.content, prompt.id);
            toast(t(`已展开 /${prompt.shortcut}`, `Expanded /${prompt.shortcut}`));
        }, { signal: this._slashAbort.signal });
    }

    selectedPacketItems() {
        const { packetSelection, prompts } = this.dependencies;
        const selected = new Set(packetSelection());
        return sortPromptsForDisplay(prompts()).filter(prompt => selected.has(prompt.id)).slice(0, 8);
    }

    async insertSelectedPromptPacket() {
        const text = formatPromptContextPacket(this.selectedPacketItems(), this.templateVariables(), {
            label: 'Selected Gemini prompt packet'
        });
        if (!text) return false;
        return this.insertText(text);
    }
}

export function createLegacyRecipeComposerController(dependencies) {
    return new LegacyRecipeComposerController(dependencies);
}
