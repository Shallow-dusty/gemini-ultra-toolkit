import { normalizePrompt } from '../../../lib/prompt_vault_tools.js';
import { openLegacyRecipeEditor, renderRecipesManager } from './legacy_ui.js';

/** Owns the accessible Recipes manager surface and its dialog lifecycle. */
export class LegacyRecipesManagerController {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.mountedPane = null;
        this.dialogs = new Set();
        this.renderGeneration = 0;
    }

    async render(container) {
        const { service, document, t } = this.dependencies;
        this.mountedPane = container;
        const generation = ++this.renderGeneration;
        container.textContent = t('正在加载配方…', 'Loading recipes…');
        const recipes = await service().api.list();
        const items = [];
        for (const recipe of recipes) {
            const history = await service().api.history(recipe.id);
            const diff = history.length > 1
                ? await service().api.diff(recipe.id, history.at(-2).version, recipe.version)
                : { changed: false, changes: [] };
            items.push({ recipe, history, diff });
        }
        if (generation !== this.renderGeneration || this.mountedPane !== container) return null;
        return renderRecipesManager({
            document,
            container,
            items,
            t,
            onAction: action => { void this.handleAction(action); }
        });
    }

    async refresh() {
        if (this.mountedPane) await this.render(this.mountedPane);
    }

    async handleAction(action) {
        const {
            service, prompts, insertPrompt, queuePrompt, deletePrompt, importFile, exportFile
        } = this.dependencies;
        if (action.type === 'create') return this.showEditor(null);
        if (action.type === 'import') return importFile();
        if (action.type === 'export') return exportFile();
        const recipe = await service().api.get(action.id);
        const prompt = prompts().find(item => item.id === recipe.provenance.sourceId || item.id === recipe.id)
            || normalizePrompt({ id: recipe.id, name: recipe.title, content: recipe.steps[0].template });
        if (action.type === 'insert') return insertPrompt(prompt.content, prompt.id);
        if (action.type === 'queue-preview') return queuePrompt(prompt);
        if (action.type === 'edit') return this.showEditor({ ...prompt, recipeVariables: recipe.variables });
        if (action.type === 'delete') return deletePrompt(prompt.id);
        return undefined;
    }

    showEditor(existing) {
        const { document, t, ui, updatePrompt, addPrompt } = this.dependencies;
        let dialog;
        dialog = openLegacyRecipeEditor({
            document,
            ui,
            existing,
            t,
            onClose: () => this.releaseDialog(dialog),
            onSave: draft => {
                if (existing) void updatePrompt(existing.id, draft);
                else void addPrompt(draft.name, draft.content, draft.category, draft.shortcut,
                    draft.chainSteps, draft.recipeVariables);
            }
        });
        return this.trackDialog(dialog);
    }

    trackDialog(dialog) {
        this.dialogs.add(dialog);
        return dialog;
    }

    releaseDialog(dialog) {
        return this.dialogs.delete(dialog);
    }

    closeDialogs(reason) {
        for (const dialog of [...this.dialogs]) dialog.close(reason);
        this.dialogs.clear();
    }

    appendImportExport(container) {
        const { document, t, importFile, exportFile } = this.dependencies;
        const group = document.createElement('div');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', t('配方导入导出', 'Recipe import and export'));
        for (const [label, action] of [
            [t('导入', 'Import'), importFile],
            [t('导出', 'Export'), () => { void exportFile(); }]
        ]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', action);
            group.appendChild(button);
        }
        container.appendChild(group);
        return group;
    }

    dispose(reason) {
        this.closeDialogs(reason);
        this.mountedPane = null;
        this.renderGeneration += 1;
    }
}

export function createLegacyRecipesManagerController(dependencies) {
    return new LegacyRecipesManagerController(dependencies);
}
