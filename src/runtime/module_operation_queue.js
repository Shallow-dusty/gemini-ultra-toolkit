import { ModuleHostError } from './module_host_error.js';

/** Serialize host transitions and reject lifecycle-hook reentry without deadlock. */
export class ModuleOperationQueue {
    constructor(assertActive) {
        this.assertActive = assertActive;
        this.tail = Promise.resolve();
        this.activeHook = null;
    }

    reentrantError(operation, moduleId) {
        return new ModuleHostError(
            'REENTRANT_OPERATION',
            `Cannot ${operation} while module "${this.activeHook.moduleId}" is running its ${this.activeHook.name} hook`,
            {
                operation,
                moduleId,
                activeModuleId: this.activeHook.moduleId,
                activeHook: this.activeHook.name
            }
        );
    }

    assertCanRun(operation, moduleId) {
        if (this.activeHook) throw this.reentrantError(operation, moduleId);
    }

    schedule(operation, moduleId, callback, allowDisposed = false) {
        if (this.activeHook) return Promise.reject(this.reentrantError(operation, moduleId));
        const run = this.tail.then(() => {
            if (!allowDisposed) this.assertActive();
            return callback();
        });
        this.tail = run.catch(() => undefined);
        return run;
    }

    async runHook(record, name, callback) {
        const previousHook = this.activeHook;
        this.activeHook = { moduleId: record.descriptor.id, name };
        try {
            return await callback();
        } finally {
            this.activeHook = previousHook;
        }
    }
}
