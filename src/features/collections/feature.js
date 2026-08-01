import { fail } from './errors.js';
import {
    createEmptyCollectionsState,
    getNowIso,
    isRecord,
    normalizeCollectionsState,
    resolveCollectionLimits,
    safeClone,
    sessionIdFromContext
} from './model.js';
import {
    createCollection,
    getCollectionTree,
    listCollections,
    moveCollection,
    removeCollection,
    resolveMembership,
    setManualMembership,
    setNotebooksAvailability,
    updateCollection
} from './operations.js';
import {
    createCollectionsExport,
    importCollections,
    serializeCollectionsExport
} from './transfer.js';

function unwrapRepositoryResult(result) {
    return result?.format === 'primer-pp.storage' && Object.prototype.hasOwnProperty.call(result, 'data')
        ? result.data
        : result;
}

function assertRepository(repository, sessionId) {
    for (const method of ['get', 'update', 'flush']) {
        if (!repository || typeof repository[method] !== 'function') {
            fail('INVALID_REPOSITORY', `Collections repository must implement ${method}()`);
        }
    }
    if (repository.scope?.readOnly === true) fail('READ_ONLY_SESSION', 'Collections require a writable session repository');
    const declared = repository.boundAccountId
        ?? repository.accountId
        ?? repository.scope?.targetUserId
        ?? repository.scope?.sessionUserId;
    if (declared !== undefined && declared !== sessionId) {
        fail('SESSION_BOUNDARY', `Collections repository belongs to another session`, {
            expected: sessionId,
            actual: declared
        });
    }
    if (repository.scope?.sessionUserId !== undefined && repository.scope.sessionUserId !== sessionId) {
        fail('SESSION_BOUNDARY', 'Collections writable scope does not match the active session', {
            expected: sessionId,
            actual: repository.scope.sessionUserId
        });
    }
    return repository;
}

export class CollectionsService {
    constructor({
        repositoryForSession,
        clock = () => new Date().toISOString(),
        idFactory,
        limits = {}
    } = {}) {
        if (typeof repositoryForSession !== 'function') throw new TypeError('Collections repositoryForSession must be a function');
        if (typeof clock !== 'function') throw new TypeError('Collections clock must be a function');
        if (idFactory !== undefined && typeof idFactory !== 'function') throw new TypeError('Collections idFactory must be a function');
        this._repositoryForSession = repositoryForSession;
        this._clock = clock;
        this._idFactory = idFactory;
        this._limits = resolveCollectionLimits(limits);
        this._binding = null;
        this._tail = Promise.resolve();
        this._repositoryOwners = new WeakMap();
        this.api = Object.freeze({
            getSessionId: this.getSessionId.bind(this),
            getSnapshot: this.getSnapshot.bind(this),
            list: this.list.bind(this),
            tree: this.tree.bind(this),
            resolveMembership: this.resolveMembership.bind(this),
            create: this.create.bind(this),
            update: this.update.bind(this),
            move: this.move.bind(this),
            remove: this.remove.bind(this),
            setManualMembership: this.setManualMembership.bind(this),
            setManualMemberships: this.setManualMemberships.bind(this),
            setNotebooksAvailability: this.setNotebooksAvailability.bind(this),
            exportObject: this.exportObject.bind(this),
            exportJson: this.exportJson.bind(this),
            importJson: this.importJson.bind(this),
            flush: this.flush.bind(this)
        });
    }

    start(session) {
        return this._enqueue(() => this._start(session), false);
    }

    switchSession(session) {
        return this._enqueue(async () => {
            const current = this._activeBinding();
            const sessionId = sessionIdFromContext(session);
            if (sessionId === current.sessionId) return sessionId;
            const next = await this._prepareBinding(sessionId);
            await current.repository.flush();
            this._binding = next;
            return sessionId;
        });
    }

    stop() {
        return this._enqueue(async () => {
            if (!this._binding) return;
            const repository = this._binding.repository;
            this._binding = null;
            await repository.flush();
        }, false);
    }

    getSessionId() {
        return this._enqueue(() => this._activeBinding().sessionId);
    }

    getSnapshot() {
        return this._enqueue(() => this._readState());
    }

    list(query = {}) {
        return this._enqueue(async () => listCollections(await this._readState(), query, this._domainOptions()));
    }

    tree(query = {}) {
        return this._enqueue(async () => getCollectionTree(await this._readState(), query, this._domainOptions()));
    }

    resolveMembership(item) {
        return this._enqueue(async () => resolveMembership(await this._readState(), item, this._domainOptions()));
    }

    create(draft) {
        return this._mutate(state => createCollection(state, draft, this._domainOptions())).then(result => result.collection);
    }

    update(id, patch) {
        return this._mutate(state => updateCollection(state, id, patch, this._domainOptions())).then(result => result.collection);
    }

    move(id, placement) {
        return this._mutate(state => moveCollection(state, id, placement, this._domainOptions())).then(result => result.collection);
    }

    remove(id, removeOptions = {}) {
        return this._mutate(state => removeCollection(state, id, removeOptions, this._domainOptions())).then(result => result.removedIds);
    }

    setManualMembership(itemId, collectionIds) {
        return this._mutate(state => setManualMembership(state, itemId, collectionIds, this._domainOptions()))
            .then(result => result.membership);
    }

    setManualMemberships(updates) {
        if (!Array.isArray(updates) || !updates.every(isRecord)) {
            fail('INVALID_MEMBERSHIP_BATCH', 'Collections membership batch must be an array of update objects');
        }
        return this._mutate(state => {
            let data = state;
            const memberships = [];
            for (const update of updates) {
                const result = setManualMembership(data, update.itemId, update.collectionIds, this._domainOptions());
                data = result.data;
                memberships.push(result.membership);
            }
            return { data, memberships };
        }).then(result => result.memberships);
    }

    setNotebooksAvailability(availability) {
        return this._mutate(state => setNotebooksAvailability(state, availability, this._domainOptions()))
            .then(result => result.notebooks);
    }

    exportObject() {
        return this._enqueue(async () => createCollectionsExport(await this._readState(), this._domainOptions()));
    }

    exportJson() {
        return this._enqueue(async () => serializeCollectionsExport(await this._readState(), this._domainOptions()));
    }

    importJson(input, importOptions = {}) {
        return this._mutate(state => importCollections(state, input, importOptions, this._domainOptions()))
            .then(result => result.report);
    }

    flush() {
        return this._enqueue(() => this._activeBinding().repository.flush());
    }

    _domainOptions() {
        const binding = this._activeBinding();
        return {
            sessionId: binding.sessionId,
            limits: this._limits,
            nowIso: getNowIso(this._clock),
            idFactory: this._idFactory
        };
    }

    _enqueue(operation, requireActive = true) {
        const run = this._tail.then(() => {
            if (requireActive) this._activeBinding();
            return operation();
        });
        this._tail = run.catch(() => undefined);
        return run;
    }

    async _start(session) {
        const sessionId = sessionIdFromContext(session);
        if (this._binding) {
            if (this._binding.sessionId === sessionId) return sessionId;
            fail('ALREADY_STARTED', 'Collections service is already bound to another session');
        }
        this._binding = await this._prepareBinding(sessionId);
        return sessionId;
    }

    async _prepareBinding(sessionId) {
        let repository;
        try {
            repository = await this._repositoryForSession(sessionId);
        } catch (error) {
            fail('REPOSITORY_FACTORY_FAILED', 'Collections repository could not be created', { sessionId }, error);
        }
        assertRepository(repository, sessionId);
        const owner = this._repositoryOwners.get(repository);
        if (owner !== undefined && owner !== sessionId) {
            fail('SESSION_BOUNDARY', 'repositoryForSession reused one collections repository across sessions');
        }
        this._repositoryOwners.set(repository, sessionId);
        const raw = await repository.get();
        const state = normalizeCollectionsState(raw, {
            sessionId,
            limits: this._limits,
            nowIso: getNowIso(this._clock)
        });
        return { sessionId, repository, state };
    }

    _activeBinding() {
        if (!this._binding) fail('SERVICE_INACTIVE', 'Collections service is not bound to a session');
        return this._binding;
    }

    async _readState() {
        const binding = this._activeBinding();
        const raw = await binding.repository.get();
        return normalizeCollectionsState(raw, {
            sessionId: binding.sessionId,
            limits: this._limits,
            nowIso: getNowIso(this._clock)
        });
    }

    _mutate(operation) {
        return this._enqueue(async () => {
            const binding = this._activeBinding();
            let result;
            const stored = await binding.repository.update((raw) => {
                const state = normalizeCollectionsState(raw, {
                    sessionId: binding.sessionId,
                    limits: this._limits,
                    nowIso: getNowIso(this._clock)
                });
                result = operation(state);
                return result.data;
            });
            // Validate envelope and non-envelope repositories alike before
            // exposing the operation result.
            normalizeCollectionsState(unwrapRepositoryResult(stored), {
                sessionId: binding.sessionId,
                limits: this._limits,
                nowIso: getNowIso(this._clock)
            });
            return safeClone(result);
        });
    }
}

export function createCollectionsService(options) {
    return new CollectionsService(options);
}

/** ModuleHost descriptor. UI mounting is intentionally deferred. */
export function createCollectionsModule(options = {}) {
    const { defaultEnabled = false, ...serviceOptions } = options;
    if (typeof defaultEnabled !== 'boolean') throw new TypeError('Collections defaultEnabled must be boolean');
    const service = createCollectionsService(serviceOptions);
    return Object.freeze({
        id: 'collections',
        name: 'Collections',
        description: 'Nested local collections that augment Gemini without replacing native Notebooks',
        defaultEnabled,
        provides: Object.freeze(['collections.service']),
        create(context) {
            return {
                async start() {
                    await service.start(context.session);
                    context.provideCapability('collections.service', service.api);
                },
                onSessionChange(nextSession) {
                    return service.switchSession(nextSession);
                },
                stop() {
                    return service.stop();
                }
            };
        }
    });
}
