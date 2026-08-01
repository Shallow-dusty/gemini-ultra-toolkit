import { mergePromptImport } from '../../../lib/prompt_vault_tools.js';

/** Owns portable Recipes and legacy Prompt Vault import/export boundaries. */
export class LegacyRecipeTransferController {
    constructor(dependencies) {
        this.dependencies = dependencies;
    }

    exportData(ids) {
        return this.dependencies.service().api.export(ids);
    }

    async importData(input, options = {}) {
        const { service, timestamp, addPrompt, refresh } = this.dependencies;
        const parsed = typeof input === 'string' ? JSON.parse(input) : input;
        if (parsed?.format === 'primer-pp.recipes') {
            const report = await service().api.import(parsed, { strategy: options.strategy || 'fork' });
            await refresh();
            return report;
        }
        const merged = mergePromptImport([], parsed, { nowIso: timestamp() });
        for (const prompt of merged.prompts) {
            await addPrompt(prompt.name, prompt.content, prompt.category, prompt.shortcut,
                prompt.chainSteps, prompt.recipeVariables);
        }
        return { strategy: 'legacy', imported: merged.prompts.length };
    }

    async exportFile() {
        const { document, timestamp, toast, t, Blob: BlobCtor, URL: URLApi } = this.dependencies;
        const data = JSON.stringify(await this.exportData(), null, 2);
        const blob = new BlobCtor([data], { type: 'application/json' });
        const url = URLApi.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `primer-pp-recipes-${timestamp().slice(0, 10)}.json`;
        anchor.click();
        URLApi.revokeObjectURL(url);
        toast(t('配方已导出', 'Recipes exported'));
    }

    importFile() {
        const { document, FileReader: Reader, toast, t } = this.dependencies;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new Reader();
            reader.addEventListener('load', () => {
                void this.importData(reader.result).then(
                    () => toast(t('配方已导入', 'Recipes imported')),
                    () => toast(t('导入失败：格式无效', 'Import failed: invalid format'))
                );
            });
            reader.readAsText(file);
        });
        input.click();
    }
}

export function createLegacyRecipeTransferController(dependencies) {
    return new LegacyRecipeTransferController(dependencies);
}
