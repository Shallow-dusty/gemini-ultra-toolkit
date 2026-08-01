import {
    dangerousPermissions,
    normalizeRecipeVersion,
    replaceTemplateVariables,
    resolveVariableValues,
    safeClone
} from './model.js';

/**
 * Deterministically turns a recipe version into a manual execution plan.
 * It deliberately has no DOM, queue, network, or send dependency.
 */
export function renderRecipeVersion(recipeValue, suppliedValues = {}) {
    const recipe = normalizeRecipeVersion(recipeValue);
    const variables = resolveVariableValues(recipe.variables, suppliedValues);
    const steps = recipe.steps.map((step, index) => {
        const dangerous = dangerousPermissions(step.permissions);
        return {
            index,
            id: step.id,
            title: step.title,
            prompt: replaceTemplateVariables(step.template, variables),
            permissions: safeClone(step.permissions),
            dangerousPermissions: dangerous,
            requiresConfirmation: dangerous.length > 0
        };
    });
    const dangerous = dangerousPermissions(recipe.permissions);

    return {
        recipeId: recipe.id,
        version: recipe.version,
        variables: safeClone(variables),
        steps,
        permissions: safeClone(recipe.permissions),
        dangerousPermissions: dangerous,
        requiresConfirmation: dangerous.length > 0,
        execution: 'manual',
        autoSend: false
    };
}
