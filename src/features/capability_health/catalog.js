import { deepFreeze } from './contract.js';

const MODULE_REQUIREMENTS = deepFreeze([
    { id: 'batch-delete', required: ['sidebar'], optional: ['export-anchors'] },
    { id: 'chat-notes', optional: ['chat-header', 'messages'] },
    { id: 'counter', optional: [], nativeCapability: 'usage', nativePolicy: 'augment' },
    { id: 'default-model', required: ['model-picker'] },
    { id: 'export', optional: ['export-anchors', 'messages', 'sidebar'] },
    { id: 'folders', required: ['sidebar'], nativeCapability: 'notebooks', nativePolicy: 'augment' },
    { id: 'message-queue', required: ['composer'] },
    // Local recipes complement Gemini Skills/Gems; native ownership must not disable or replace them.
    { id: 'prompt-vault', optional: ['composer'], nativeCapability: 'skills', nativePolicy: 'augment' },
    // Selected-text quoting complements native chat search instead of duplicating its navigation role.
    { id: 'quote-reply', required: ['composer'], optional: ['messages'], nativeCapability: 'search', nativePolicy: 'augment' },
    { id: 'ui-tweaks', optional: ['chat-header', 'composer', 'mutation-zones'] }
]);

export function createGeminiModuleCapabilityCatalog({ isEnabled = () => true } = {}) {
    if (typeof isEnabled !== 'function') throw new TypeError('isEnabled must be a function');
    return deepFreeze(MODULE_REQUIREMENTS.map(requirement => ({
        id: requirement.id,
        version: '13',
        enabled: () => isEnabled(requirement.id),
        selectors: {
            required: requirement.required || [],
            optional: requirement.optional || []
        },
        ...(requirement.nativeCapability ? {
            nativeCapability: requirement.nativeCapability,
            nativePolicy: requirement.nativePolicy
        } : {})
    })));
}
