import { createRecipeService } from './service.js';

/** ModuleHost descriptor.  The provided capability intentionally omits lifecycle controls. */
export function createRecipesModule(options = {}) {
    const { defaultEnabled = true, ...serviceOptions } = options;
    if (typeof defaultEnabled !== 'boolean') throw new TypeError('Recipes defaultEnabled must be boolean');

    return {
        id: 'recipes',
        defaultEnabled,
        provides: ['recipes'],
        create(context) {
            const service = createRecipeService(serviceOptions);
            context.provide('recipes', service.api);
            return {
                start() {
                    return service.start(context.session);
                },
                stop() {
                    return service.stop();
                },
                onSessionChange(nextSession) {
                    return service.switchSession(nextSession);
                }
            };
        }
    };
}
