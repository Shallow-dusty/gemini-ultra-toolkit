import { cloneStorageValue } from './clone.js';
import { isWritableStorageScope, resolveStorageKey } from './keys.js';
import { createMigrationPlan } from './migrations.js';

export const STORAGE_ENVELOPE_FORMAT = 'primer-pp.storage';

export class ReadOnlyStorageScopeError extends Error {
    constructor() {
        super('Inspection storage scopes are read-only');
        this.name = 'ReadOnlyStorageScopeError';
    }
}

export class RevisionConflictError extends Error {
    constructor(expected, actual) {
        super(`Storage revision conflict: expected ${expected}, received ${actual}`);
        this.name = 'RevisionConflictError';
        this.expected = expected;
        this.actual = actual;
    }
}

export class UnsupportedSchemaVersionError extends Error {
    constructor(stored, supported) {
        super(`Stored schema ${stored} is newer than supported schema ${supported}`);
        this.name = 'UnsupportedSchemaVersionError';
        this.stored = stored;
        this.supported = supported;
    }
}

export class StorageValidationError extends Error {
    constructor() {
        super('Storage value failed repository validation');
        this.name = 'StorageValidationError';
    }
}

function assertRevision(revision, label = 'Revision') {
    if (!Number.isInteger(revision) || revision < 0) {
        throw new TypeError(`${label} must be a non-negative integer`);
    }
}

function assertSchemaVersion(version) {
    if (!Number.isInteger(version) || version < 0) {
        throw new TypeError('Schema version must be a non-negative integer');
    }
}

export function createStorageEnvelope(data, schemaVersion, revision = 0) {
    assertSchemaVersion(schemaVersion);
    assertRevision(revision);
    return {
        format: STORAGE_ENVELOPE_FORMAT,
        schemaVersion,
        revision,
        data: cloneStorageValue(data)
    };
}

export function isStorageEnvelope(value) {
    return Boolean(value)
        && typeof value === 'object'
        && value.format === STORAGE_ENVELOPE_FORMAT
        && Number.isInteger(value.schemaVersion)
        && value.schemaVersion >= 0
        && Number.isInteger(value.revision)
        && value.revision >= 0
        && Object.prototype.hasOwnProperty.call(value, 'data');
}

function assertPort(port) {
    for (const method of ['get', 'set', 'update', 'subscribe', 'flush']) {
        if (!port || typeof port[method] !== 'function') {
            throw new TypeError(`Storage repository port must implement ${method}()`);
        }
    }
}

/**
 * A schema-aware repository over one already-resolved storage key.
 *
 * Envelope upgrades intentionally use the existing key, so an older release
 * cannot read a value after its first envelope write. Integrators must upgrade
 * every reader/writer for that key together and treat downgrade after first
 * write as unsupported (or provide an explicit compatibility adapter).
 */
export class StorageRepository {
    constructor({
        port,
        key,
        scope,
        schemaVersion,
        migrations = {},
        legacyVersion = 0,
        defaultValue = undefined,
        validate = () => true
    }) {
        assertPort(port);
        if (typeof key !== 'string' || key.length === 0) throw new TypeError('Repository key is required');
        assertSchemaVersion(schemaVersion);
        assertSchemaVersion(legacyVersion);
        if (!scope || typeof scope.kind !== 'string') throw new TypeError('Repository scope is required');
        if (typeof validate !== 'function') throw new TypeError('Repository validator must be a function');

        this.port = port;
        this.key = key;
        this.scope = scope;
        this.schemaVersion = schemaVersion;
        this.legacyVersion = legacyVersion;
        this.defaultValue = cloneStorageValue(defaultValue);
        this.validate = validate;
        this.migrationPlan = migrations?.targetVersion === schemaVersion
            && typeof migrations.migrate === 'function'
            ? migrations
            : createMigrationPlan(schemaVersion, migrations);
    }

    async get() {
        return (await this.getSnapshot()).data;
    }

    async getSnapshot() {
        const stored = await this.port.get(this.key);
        return this._snapshotFromStored(stored);
    }

    async set(data, options = {}) {
        this._assertWritable();
        const isolatedData = cloneStorageValue(data);
        this._validate(isolatedData);
        const expectedRevision = options.expectedRevision;
        if (expectedRevision !== undefined) assertRevision(expectedRevision, 'Expected revision');

        const stored = await this.port.update(this.key, (current) => {
            const snapshot = this._snapshotFromStored(current);
            this._assertExpectedRevision(expectedRevision, snapshot.revision);
            return createStorageEnvelope(isolatedData, this.schemaVersion, snapshot.revision + 1);
        });
        return this._snapshotFromStored(stored);
    }

    async update(updater, options = {}) {
        this._assertWritable();
        if (typeof updater !== 'function') throw new TypeError('Repository updater must be a function');
        const expectedRevision = options.expectedRevision;
        if (expectedRevision !== undefined) assertRevision(expectedRevision, 'Expected revision');

        const stored = await this.port.update(this.key, async (current) => {
            const snapshot = this._snapshotFromStored(current);
            this._assertExpectedRevision(expectedRevision, snapshot.revision);
            const nextData = await updater(cloneStorageValue(snapshot.data), {
                schemaVersion: snapshot.schemaVersion,
                revision: snapshot.revision
            });
            this._validate(nextData);
            return createStorageEnvelope(nextData, this.schemaVersion, snapshot.revision + 1);
        });
        return this._snapshotFromStored(stored);
    }

    subscribe(listener, options = {}) {
        if (typeof listener !== 'function') throw new TypeError('Repository listener must be a function');
        const onError = typeof options.onError === 'function' ? options.onError : () => {};

        return this.port.subscribe(this.key, (event) => {
            try {
                const current = this._snapshotFromStored(event.newValue);
                const previous = this._snapshotFromStored(event.oldValue);
                listener(cloneStorageValue(current), Object.freeze({
                    key: this.key,
                    source: event.source,
                    previous: cloneStorageValue(previous)
                }));
            } catch (error) {
                onError(error);
            }
        });
    }

    flush() {
        return this.port.flush();
    }

    _snapshotFromStored(stored) {
        if (stored === undefined) {
            this._validate(this.defaultValue);
            return createStorageEnvelope(this.defaultValue, this.schemaVersion, 0);
        }

        if (stored?.format === STORAGE_ENVELOPE_FORMAT && !isStorageEnvelope(stored)) {
            throw new TypeError('Malformed Primer++ storage envelope');
        }

        const envelope = isStorageEnvelope(stored)
            ? stored
            : createStorageEnvelope(stored, this.legacyVersion, 0);
        if (envelope.schemaVersion > this.schemaVersion) {
            throw new UnsupportedSchemaVersionError(envelope.schemaVersion, this.schemaVersion);
        }

        const data = this.migrationPlan.migrate(envelope.data, envelope.schemaVersion);
        this._validate(data);
        return createStorageEnvelope(data, this.schemaVersion, envelope.revision);
    }

    _assertWritable() {
        if (!isWritableStorageScope(this.scope)) throw new ReadOnlyStorageScopeError();
    }

    _assertExpectedRevision(expected, actual) {
        // This is optimistic concurrency within one StoragePort. Backends
        // without compare-and-swap remain last-write-wins across browser tabs.
        if (expected !== undefined && expected !== actual) {
            throw new RevisionConflictError(expected, actual);
        }
    }

    _validate(data) {
        const result = this.validate(cloneStorageValue(data), Object.freeze({
            key: this.key,
            schemaVersion: this.schemaVersion
        }));
        if (result && typeof result.then === 'function') {
            throw new TypeError('Repository validator must be synchronous and pure');
        }
        if (result === false) throw new StorageValidationError();
    }
}

export function createScopedRepository({ slot, scope, ...options }) {
    return new StorageRepository({
        ...options,
        scope,
        key: resolveStorageKey(slot, scope)
    });
}
