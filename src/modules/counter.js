import { Core } from '../core.js';
import {
    LegacyCounterController,
    configureCounterModule as configureLegacyCounterController
} from '../features/insights/legacy_counter_controller.js';

const facade = {
    attemptIncrement() {
        const currentUser = LegacyCounterController._deps.core.getCurrentUser();
        if (LegacyCounterController._deps.core === Core && Core.getInspectingUser() !== currentUser) {
            Core.setInspectingUser(currentUser);
            void this.loadDataForUser(currentUser);
            return false;
        }
        return LegacyCounterController.attemptIncrement();
    }
};

export const CounterModule = new Proxy(facade, {
    get(target, property, receiver) {
        return Reflect.has(target, property)
            ? Reflect.get(target, property, receiver)
            : Reflect.get(LegacyCounterController, property, LegacyCounterController);
    },
    set(_target, property, value) {
        return Reflect.set(LegacyCounterController, property, value, LegacyCounterController);
    }
});

export function configureCounterModule(dependencies) {
    configureLegacyCounterController(dependencies);
    return CounterModule;
}
