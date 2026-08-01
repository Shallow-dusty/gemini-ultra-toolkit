import { RecipesError, fail } from './errors.js';
import {
    RECIPES_SCHEMA_VERSION,
    RECIPE_EXPORT_FORMAT,
    RECIPE_EXPORT_VERSION,
    RECIPE_IMPORT_STRATEGIES,
    createEmptyRecipeState,
    createRecipeVersion,
    diffRecipeVersions,
    normalizeImportStrategy,
    normalizeProvenance,
    normalizeRecipeExport,
    normalizeRecipeId,
    normalizeRecipeRecord,
    normalizeRecipeState,
    normalizeRecipeVersion,
    safeClone
} from './model.js';
import { renderRecipeVersion } from './renderer.js';

const REVISION_FIELDS = new Set([
    'title', 'description', 'variables', 'steps', 'permissions', 'provenance'
]);

function defaultSessionId(session) {
    if (typeof session === 'string' && session.trim()) return session.trim();
    if (session && typeof session === 'object') {
        for (const key of ['userId', 'id', 'email']) {
            if (typeof session[key] === 'string' && session[key].trim()) return session[key].trim();
        }
    }
    fail('INVALID_SESSION', 'Recipes require a stable account session id');
}

function assertRepository(repository) {
    for (const method of ['get', 'update', 'flush']) {
        if (!repository || typeof repository[method] !== 'function') {
            fail('INVALID_REPOSITORY', `Recipe repository must implement ${method}()`);
        }
    }
    return repository;
}

function assertExpectedVersion(value) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
        fail('INVALID_VERSION', 'Expected recipe version must be a positive integer');
    }
}

function latest(record) {
    return record.versions[record.currentVersion - 1];
}

function findRecord(state, id) {
    return state.records.find(record => record.id === id);
}

function requireRecord(state, id) {
    const record = findRecord(state, id);
    if (!record) fail('RECIPE_NOT_FOUND', `Recipe not found: ${id}`, { id });
    return record;
}

function assertCurrentVersion(record, expectedVersion) {
    assertExpectedVersion(expectedVersion);
    if (expectedVersion !== undefined && record.currentVersion !== expectedVersion) {
        fail('VERSION_CONFLICT', 'Recipe version conflict', {
            id: record.id,
            expected: expectedVersion,
            actual: record.currentVersion
        });
    }
}

function normalizeNow(clock) {
    const now = clock();
    if (typeof now !== 'string' || !now || !Number.isFinite(Date.parse(now))) {
        fail('INVALID_CLOCK', 'Recipe clock must return an ISO-compatible timestamp');
    }
    return now;
}

function cloneCurrentRecords(state) {
    return state.records.map(record => safeClone(record));
}

function normalizeRevisionPatch(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        fail('INVALID_REVISION', 'Recipe revision must be an object');
    }
    const unknown = Object.keys(patch).filter(key => !REVISION_FIELDS.has(key));
    if (unknown.length) fail('UNKNOWN_FIELD', `Recipe revision contains unknown fields: ${unknown.join(', ')}`, { unknown });
    if (Object.keys(patch).length === 0) fail('NO_CHANGES', 'Recipe revision cannot be empty');
    return safeClone(patch, 'Recipe revision');
}

function parseExport(payload) {
    if (typeof payload !== 'string') return safeClone(payload, 'Recipe import');
    try {
        return JSON.parse(payload);
    } catch (error) {
        fail('INVALID_EXPORT_JSON', 'Recipe import is not valid JSON', {}, error);
    }
}

function importedRecord(record, now, forkId = null) {
    const targetId = forkId === null ? record.id : forkId;
    const versions = record.versions.map((version) => {
        const provenance = {
            ...version.provenance,
            importedAt: now,
            sourceId: version.provenance.sourceId || record.id
        };
        if (forkId !== null) {
            provenance.forkedFrom = { recipeId: record.id, version: version.version };
        }
        return normalizeRecipeVersion({ ...version, id: targetId, provenance }, {
            expectedId: targetId,
            expectedVersion: version.version
        });
    });
    return normalizeRecipeRecord({ id: targetId, currentVersion: versions.length, versions });
}

function createImportReport(strategy) {
    return { strategy, imported: [], replaced: [], skipped: [], forked: [] };
}

function cloneReport(report) {
    return safeClone(report, 'Recipe import report');
}

export class RecipeService {
    constructor({ repositoryFactory, getSessionId = defaultSessionId, clock, idFactory } = {}) {
        if (typeof repositoryFactory !== 'function') throw new TypeError('RecipeService repositoryFactory must be a function');
        if (typeof getSessionId !== 'function') throw new TypeError('RecipeService getSessionId must be a function');
        if (typeof clock !== 'function') throw new TypeError('RecipeService clock must be a function');
        if (typeof idFactory !== 'function') throw new TypeError('RecipeService idFactory must be a function');

        this._repositoryFactory = repositoryFactory;
        this._getSessionId = getSessionId;
        this._clock = clock;
        this._idFactory = idFactory;
        this._repositoryOwners = new WeakMap();
        this._binding = null;
        this._tail = Promise.resolve();
        this.api = Object.freeze({
            list: this.list.bind(this),
            get: this.get.bind(this),
            history: this.history.bind(this),
            create: this.create.bind(this),
            revise: this.revise.bind(this),
            remove: this.remove.bind(this),
            render: this.render.bind(this),
            diff: this.diff.bind(this),
            export: this.export.bind(this),
            import: this.import.bind(this),
            flush: this.flush.bind(this)
        });
    }

    get activeSessionId() {
        return this._binding?.sessionId || null;
    }

    start(session) {
        return this._enqueue(() => this._start(session), false);
    }

    switchSession(session) {
        return this._enqueue(async () => {
            this._activeBinding();
            const sessionId = this._resolveSessionId(session);
            if (sessionId === this._binding.sessionId) return sessionId;
            const next = await this._prepareBinding(session, sessionId);
            await this._binding.repository.flush();
            this._binding = next;
            return sessionId;
        });
    }

    stop() {
        return this._enqueue(async () => {
            if (!this._binding) return;
            const binding = this._binding;
            this._binding = null;
            await binding.repository.flush();
        }, false);
    }

    list() {
        return this._enqueue(async () => {
            const state = await this._readState();
            return state.records
                .map(record => safeClone(latest(record)))
                .sort((left, right) => left.id.localeCompare(right.id));
        });
    }

    get(id, version = undefined) {
        return this._enqueue(async () => {
            const recipeId = normalizeRecipeId(id);
            const state = await this._readState();
            const record = requireRecord(state, recipeId);
            if (version === undefined) return safeClone(latest(record));
            if (!Number.isInteger(version) || version < 1 || version > record.currentVersion) {
                fail('VERSION_NOT_FOUND', `Recipe version not found: ${recipeId}@${version}`, { id: recipeId, version });
            }
            return safeClone(record.versions[version - 1]);
        });
    }

    history(id) {
        return this._enqueue(async () => {
            const recipeId = normalizeRecipeId(id);
            const state = await this._readState();
            return safeClone(requireRecord(state, recipeId).versions);
        });
    }

    create(draft) {
        return this._enqueue(async () => {
            const binding = this._activeBinding();
            const input = safeClone(draft, 'Recipe draft');
            const now = normalizeNow(this._clock);
            let created;
            await binding.repository.update((raw) => {
                const state = normalizeRecipeState(raw, binding.sessionId);
                const id = input?.id === undefined
                    ? this._uniqueId(state, { kind: 'create', sessionId: binding.sessionId })
                    : normalizeRecipeId(input.id);
                if (findRecord(state, id)) fail('RECIPE_EXISTS', `Recipe already exists: ${id}`, { id });
                created = createRecipeVersion(input, { id, now });
                return { ...state, records: [...cloneCurrentRecords(state), { id, currentVersion: 1, versions: [created] }] };
            });
            return safeClone(created);
        });
    }

    revise(id, patch, { expectedVersion } = {}) {
        return this._enqueue(async () => {
            const recipeId = normalizeRecipeId(id);
            const changes = normalizeRevisionPatch(patch);
            const binding = this._activeBinding();
            const now = normalizeNow(this._clock);
            let revised;
            await binding.repository.update((raw) => {
                const state = normalizeRecipeState(raw, binding.sessionId);
                const record = requireRecord(state, recipeId);
                assertCurrentVersion(record, expectedVersion);
                const current = latest(record);
                const provenance = changes.provenance === undefined
                    ? current.provenance
                    : normalizeProvenance(changes.provenance);
                const draft = {
                    title: changes.title === undefined ? current.title : changes.title,
                    description: changes.description === undefined ? current.description : changes.description,
                    variables: changes.variables === undefined ? current.variables : changes.variables,
                    steps: changes.steps === undefined ? current.steps : changes.steps,
                    permissions: changes.permissions === undefined ? current.permissions : changes.permissions,
                    provenance
                };
                const candidate = createRecipeVersion(draft, {
                    id: recipeId,
                    version: current.version,
                    now: current.updatedAt,
                    createdAt: current.createdAt
                });
                if (!diffRecipeVersions(current, candidate).changed) {
                    fail('NO_CHANGES', 'Recipe revision has no content changes');
                }
                revised = createRecipeVersion(draft, {
                    id: recipeId,
                    version: record.currentVersion + 1,
                    now,
                    createdAt: current.createdAt,
                    parent: { recipeId, version: record.currentVersion }
                });
                const replacement = {
                    id: recipeId,
                    currentVersion: revised.version,
                    versions: [...safeClone(record.versions), revised]
                };
                return { ...state, records: state.records.map(item => item.id === recipeId ? replacement : safeClone(item)) };
            });
            return safeClone(revised);
        });
    }

    remove(id, { expectedVersion } = {}) {
        return this._enqueue(async () => {
            const recipeId = normalizeRecipeId(id);
            const binding = this._activeBinding();
            let removed;
            await binding.repository.update((raw) => {
                const state = normalizeRecipeState(raw, binding.sessionId);
                const record = requireRecord(state, recipeId);
                assertCurrentVersion(record, expectedVersion);
                removed = latest(record);
                return { ...state, records: state.records.filter(item => item.id !== recipeId).map(safeClone) };
            });
            return safeClone(removed);
        });
    }

    render(id, values = {}, { version } = {}) {
        return this._enqueue(async () => renderRecipeVersion(await this._getFromActive(id, version), safeClone(values)));
    }

    diff(id, fromVersion, toVersion) {
        return this._enqueue(async () => {
            const recipeId = normalizeRecipeId(id);
            const state = await this._readState();
            const record = requireRecord(state, recipeId);
            const getVersion = (version) => {
                if (!Number.isInteger(version) || version < 1 || version > record.currentVersion) {
                    fail('VERSION_NOT_FOUND', `Recipe version not found: ${recipeId}@${version}`, { id: recipeId, version });
                }
                return record.versions[version - 1];
            };
            return diffRecipeVersions(getVersion(fromVersion), getVersion(toVersion));
        });
    }

    export(ids = undefined) {
        return this._enqueue(async () => {
            const state = await this._readState();
            let records;
            if (ids === undefined) {
                records = state.records;
            } else {
                if (!Array.isArray(ids)) fail('INVALID_EXPORT_SELECTION', 'Recipe export selection must be an array');
                const normalizedIds = ids.map(id => normalizeRecipeId(id));
                if (new Set(normalizedIds).size !== normalizedIds.length) {
                    fail('INVALID_EXPORT_SELECTION', 'Recipe export selection contains duplicate ids');
                }
                records = normalizedIds.map(id => requireRecord(state, id));
            }
            return {
                format: RECIPE_EXPORT_FORMAT,
                formatVersion: RECIPE_EXPORT_VERSION,
                exportedAt: normalizeNow(this._clock),
                recipes: safeClone(records).sort((left, right) => left.id.localeCompare(right.id))
            };
        });
    }

    import(payload, { strategy = RECIPE_IMPORT_STRATEGIES.ERROR } = {}) {
        return this._enqueue(async () => {
            const normalizedStrategy = normalizeImportStrategy(strategy);
            const envelope = normalizeRecipeExport(parseExport(payload));
            const binding = this._activeBinding();
            const now = normalizeNow(this._clock);
            const report = createImportReport(normalizedStrategy);

            await binding.repository.update((raw) => {
                const state = normalizeRecipeState(raw, binding.sessionId);
                const records = cloneCurrentRecords(state);
                for (const sourceRecord of envelope.recipes) {
                    const index = records.findIndex(record => record.id === sourceRecord.id);
                    if (index < 0) {
                        const imported = importedRecord(sourceRecord, now);
                        records.push(imported);
                        report.imported.push(imported.id);
                        continue;
                    }

                    if (normalizedStrategy === RECIPE_IMPORT_STRATEGIES.ERROR) {
                        fail('IMPORT_CONFLICT', `Recipe import conflicts with ${sourceRecord.id}`, { id: sourceRecord.id });
                    }
                    if (normalizedStrategy === RECIPE_IMPORT_STRATEGIES.SKIP) {
                        report.skipped.push({ id: sourceRecord.id, reason: 'exists' });
                        continue;
                    }
                    if (normalizedStrategy === RECIPE_IMPORT_STRATEGIES.NEWER &&
                        sourceRecord.currentVersion <= records[index].currentVersion) {
                        report.skipped.push({ id: sourceRecord.id, reason: 'not-newer' });
                        continue;
                    }
                    if (normalizedStrategy === RECIPE_IMPORT_STRATEGIES.FORK) {
                        const forkId = this._uniqueId({ ...state, records }, {
                            kind: 'fork',
                            sessionId: binding.sessionId,
                            sourceId: sourceRecord.id
                        });
                        const fork = importedRecord(sourceRecord, now, forkId);
                        records.push(fork);
                        report.forked.push({ fromId: sourceRecord.id, toId: forkId });
                        continue;
                    }

                    records[index] = importedRecord(sourceRecord, now);
                    report.replaced.push(sourceRecord.id);
                }
                return { ...state, records };
            });
            return cloneReport(report);
        });
    }

    flush() {
        return this._enqueue(() => this._activeBinding().repository.flush());
    }

    _enqueue(operation, requireActive = true) {
        const run = this._tail.then(() => {
            if (requireActive) this._activeBinding();
            return operation();
        });
        this._tail = run.catch(() => undefined);
        return run;
    }

    _resolveSessionId(session) {
        const sessionId = this._getSessionId(session);
        if (typeof sessionId !== 'string' || !sessionId.trim()) {
            fail('INVALID_SESSION', 'Recipes require a stable account session id');
        }
        return sessionId.trim();
    }

    async _start(session) {
        const sessionId = this._resolveSessionId(session);
        if (this._binding) {
            if (this._binding.sessionId === sessionId) return sessionId;
            fail('ALREADY_STARTED', 'RecipeService is already bound to another session');
        }
        this._binding = await this._prepareBinding(session, sessionId);
        return sessionId;
    }

    async _prepareBinding(session, sessionId) {
        let repository;
        try {
            repository = await this._repositoryFactory({ session: safeClone(session, 'Recipe session'), sessionId });
        } catch (error) {
            if (error instanceof RecipesError) throw error;
            fail('REPOSITORY_FACTORY_FAILED', 'Recipe repository could not be created', { sessionId }, error);
        }
        assertRepository(repository);
        const knownOwner = this._repositoryOwners.get(repository);
        if (knownOwner !== undefined && knownOwner !== sessionId) {
            fail('REPOSITORY_SESSION_REUSE', 'Recipe repository cannot be reused across account sessions', {
                expected: sessionId,
                actual: knownOwner
            });
        }
        const state = normalizeRecipeState(await repository.get(), sessionId);
        this._repositoryOwners.set(repository, sessionId);
        return { sessionId, repository, stateVersion: state.schemaVersion };
    }

    _activeBinding() {
        if (!this._binding) fail('SERVICE_INACTIVE', 'RecipeService is not bound to an account session');
        return this._binding;
    }

    async _readState() {
        const binding = this._activeBinding();
        return normalizeRecipeState(await binding.repository.get(), binding.sessionId);
    }

    async _getFromActive(id, version) {
        const recipeId = normalizeRecipeId(id);
        const state = await this._readState();
        const record = requireRecord(state, recipeId);
        if (version === undefined) return safeClone(latest(record));
        if (!Number.isInteger(version) || version < 1 || version > record.currentVersion) {
            fail('VERSION_NOT_FOUND', `Recipe version not found: ${recipeId}@${version}`, { id: recipeId, version });
        }
        return safeClone(record.versions[version - 1]);
    }

    _uniqueId(state, context) {
        const candidate = this._idFactory(safeClone(context, 'Recipe id context'));
        const id = normalizeRecipeId(candidate, 'Generated recipe id');
        if (findRecord(state, id)) fail('ID_FACTORY_COLLISION', `Generated recipe id already exists: ${id}`, { id });
        return id;
    }
}

export function createRecipeService(options) {
    return new RecipeService(options);
}
