import { closestAny, matchesAny, matchesNativeChildListMutation } from './dom.js';
import { SELECTORS } from './selectors.js';

export const mutationMethods = Object.freeze({
    matchesSidebarMutation(mutation) {
        return matchesNativeChildListMutation(mutation, SELECTORS.SIDEBAR_MUTATION_ROOT.split(', '));
    },

    matchesInputAreaMutation(mutation) {
        return Boolean(mutation && mutation.type === 'childList'
            && closestAny(mutation.target, SELECTORS.INPUT_MUTATION_ROOT.split(', ')));
    },

    matchesHeaderMutation(mutation) {
        return Boolean(mutation && mutation.type === 'childList'
            && closestAny(mutation.target, SELECTORS.HEADER_MUTATION_ROOT.split(', ')));
    },

    matchesModelMutation(mutation) {
        if (!mutation) return false;
        if (mutation.type === 'attributes') {
            return matchesAny(mutation.target, SELECTORS.MODEL_MUTATION_TARGET_MATCH.split(', '));
        }
        return mutation.type === 'childList'
            && Boolean(closestAny(mutation.target, SELECTORS.INPUT_MUTATION_ROOT.split(', ')));
    },

    matchesFoldersSidebarMutation(mutation) {
        return this.matchesSidebarMutation(mutation);
    }
});
