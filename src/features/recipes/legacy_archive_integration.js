import { normalizeRecipeState, safeClone } from './model.js';
import { createRecipesRestoreContributor, RECIPES_RESTORE_SECTION } from './restore_contributor.js';

function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
}
function assertSignal(signal) {
    if (signal === undefined || signal === null) return;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        failure('INVALID_ABORT_SIGNAL', 'Recipes archive signal must implement AbortSignal');
    }
    if (signal.aborted) failure('RESTORE_ABORTED', 'Recipes archive inspection was aborted');
}

/** Create a read-only export seam plus a session-bound transactional contributor. */
export function createLegacyRecipesArchiveIntegration({ isStarted, activeSessionId, repository }) {
    if (!isStarted()) failure('FEATURE_INACTIVE', 'Recipes are not active');
    const sessionId = activeSessionId();
    const port = createRecipesRestoreContributor({ repository });
    const assertBound = () => {
        if (!isStarted()) failure('FEATURE_INACTIVE', 'Recipes are not active');
        if (activeSessionId() !== sessionId) {
            failure('SESSION_CHANGED', 'Recipes account changed after archive integration');
        }
    };
    const invoke = method => async context => {
        assertBound();
        const result = await port[method](context);
        assertBound();
        return safeClone(result, `Recipes archive ${method} result`);
    };
    const contributor = Object.freeze({
        snapshot: invoke('snapshot'),
        apply: invoke('apply'),
        rollback: invoke('rollback')
    });
    const exportSection = async ({ signal } = {}) => {
        assertSignal(signal);
        assertBound();
        const state = normalizeRecipeState(await repository.get(), sessionId);
        assertSignal(signal);
        assertBound();
        return safeClone(state.records, 'Recipes archive section');
    };
    return Object.freeze({ section: RECIPES_RESTORE_SECTION, exportSection, contributor });
}
