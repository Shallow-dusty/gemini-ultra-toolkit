import { cloneStorageValue } from './clone.js';

function assertVersion(version, label) {
    if (!Number.isInteger(version) || version < 0) {
        throw new TypeError(`${label} must be a non-negative integer`);
    }
}

/**
 * Build a synchronous migration plan.  Step N migrates data from N to N + 1.
 * Every step receives and returns an isolated clone. Migration functions are
 * required by contract to be deterministic and side-effect-free; this layer
 * enforces the observable parts of that contract (synchronous execution,
 * deterministic context, and no mutation of persisted input).
 */
export function createMigrationPlan(targetVersion, steps = {}) {
    assertVersion(targetVersion, 'Target schema version');
    const normalizedSteps = new Map();
    const entries = steps instanceof Map ? [...steps.entries()] : Object.entries(steps);

    for (const [rawVersion, migrate] of entries) {
        const version = Number(rawVersion);
        assertVersion(version, 'Migration source version');
        if (typeof migrate !== 'function') {
            throw new TypeError(`Migration ${version} -> ${version + 1} must be a function`);
        }
        normalizedSteps.set(version, migrate);
    }

    return Object.freeze({
        targetVersion,
        migrate(data, sourceVersion) {
            assertVersion(sourceVersion, 'Source schema version');
            if (sourceVersion > targetVersion) {
                throw new RangeError(`Stored schema ${sourceVersion} is newer than supported schema ${targetVersion}`);
            }

            let current = cloneStorageValue(data);
            for (let version = sourceVersion; version < targetVersion; version += 1) {
                const step = normalizedSteps.get(version);
                if (!step) throw new Error(`Missing migration ${version} -> ${version + 1}`);
                const context = Object.freeze({ fromVersion: version, toVersion: version + 1 });
                const next = step(cloneStorageValue(current), context);
                if (next && typeof next.then === 'function') {
                    throw new TypeError(`Migration ${version} -> ${version + 1} must be synchronous and pure`);
                }
                current = cloneStorageValue(next);
            }
            return cloneStorageValue(current);
        }
    });
}
