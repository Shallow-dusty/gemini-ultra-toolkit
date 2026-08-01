import { createLegacyPromptVaultFacade } from '../features/recipes/legacy_facade.js';

// Keep the historical module id and public surface while the implementation lives
// in the Recipes feature. Runtime capabilities are supplied by the module host or
// tests; this compatibility export owns no UI, queue, counter, or panel singleton.
export const PromptVaultModule = createLegacyPromptVaultFacade();
