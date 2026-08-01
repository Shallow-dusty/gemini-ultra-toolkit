import { cloneStorageValue } from '../../storage/clone.js';
import {
    createEmptyAnnotationsState,
    deleteAnnotation,
    importAnnotations,
    migrateAnnotationsData,
    searchAnnotations,
    serializeAnnotationsExport,
    upsertAnnotation
} from './domain.js';

const CREDENTIAL_FIELD = /^(?:password|passphrase|passcode|secret|totp|otp|cookie|authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret)$/i;

export class AnnotationsFeatureError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AnnotationsFeatureError';
        this.code = code;
    }
}

function normalizeSession(session) {
    if (typeof session === 'string') {
        const id = session.trim();
        if (id) return { accountId: id, readOnly: false };
    }
    if (session && typeof session === 'object' && !Array.isArray(session)) {
        for (const key of Object.keys(session)) {
            if (CREDENTIAL_FIELD.test(key)) {
                throw new AnnotationsFeatureError(
                    'CREDENTIAL_MATERIAL',
                    `Annotations session cannot contain credential field ${key}`
                );
            }
        }
        const id = String(session.accountId ?? session.userId ?? session.id ?? '').trim();
        if (id) {
            const readOnly = session.readOnly === true
                || session.kind === 'inspection'
                || session.mode === 'inspection';
            return { accountId: id, readOnly };
        }
    }
    throw new AnnotationsFeatureError('INVALID_SESSION', 'Annotations require an active session identity');
}

function assertRepository(repository, accountId) {
    if (!repository || typeof repository.get !== 'function' || typeof repository.update !== 'function') {
        throw new AnnotationsFeatureError(
            'INVALID_REPOSITORY',
            'Annotations repository must implement get() and update()'
        );
    }
    const scope = repository.scope;
    if (scope?.readOnly === true) {
        throw new AnnotationsFeatureError('READ_ONLY_SESSION', 'Annotations cannot bind to a read-only scope');
    }
    const declared = repository.boundAccountId
        ?? repository.accountId
        ?? scope?.targetUserId
        ?? scope?.sessionUserId;
    if (declared !== undefined && declared !== accountId) {
        throw new AnnotationsFeatureError(
            'SESSION_BOUNDARY',
            `Annotations repository belongs to a different session than ${accountId}`
        );
    }
    if (scope?.sessionUserId !== undefined && scope.sessionUserId !== accountId) {
        throw new AnnotationsFeatureError(
            'SESSION_BOUNDARY',
            `Annotations writable session does not match ${accountId}`
        );
    }
}

function unwrapRepositoryResult(result) {
    return result?.format === 'primer-pp.storage' && Object.prototype.hasOwnProperty.call(result, 'data')
        ? result.data
        : result;
}

/**
 * Session-bound domain service. repositoryForSession receives only the public
 * account identity, never a credential-bearing session object.
 */
export function createAnnotationsFeature({
    repositoryForSession,
    now = () => new Date().toISOString(),
    idFactory
} = {}) {
    if (typeof repositoryForSession !== 'function') {
        throw new TypeError('repositoryForSession must be a function');
    }
    if (typeof now !== 'function') throw new TypeError('Annotations clock must be a function');
    if (idFactory !== undefined && typeof idFactory !== 'function') {
        throw new TypeError('Annotations idFactory must be a function');
    }

    let started = false;
    let generation = 0;
    let binding = null;
    let state = createEmptyAnnotationsState();
    const repositoryOwners = new WeakMap();

    const options = () => ({ nowIso: now(), idFactory });

    function requireStarted() {
        if (!started || !binding) {
            throw new AnnotationsFeatureError('NOT_STARTED', 'Annotations feature is not bound to a session');
        }
        return binding;
    }

    function isCurrent(candidate) {
        return started && binding === candidate && candidate.generation === generation;
    }

    function assertCurrent(candidate) {
        if (!isCurrent(candidate)) {
            throw new AnnotationsFeatureError(
                'SESSION_CHANGED',
                'Annotations operation was cancelled because the active session changed'
            );
        }
    }

    async function bindSession(session) {
        const { accountId, readOnly } = normalizeSession(session);
        const nextGeneration = ++generation;
        binding = null;
        state = createEmptyAnnotationsState();

        const repository = await repositoryForSession(accountId);
        assertRepository(repository, accountId);
        const previousOwner = repositoryOwners.get(repository);
        if (previousOwner !== undefined && previousOwner !== accountId) {
            throw new AnnotationsFeatureError(
                'SESSION_BOUNDARY',
                'repositoryForSession reused one repository across accounts'
            );
        }
        repositoryOwners.set(repository, accountId);

        const raw = await repository.get();
        if (!started || nextGeneration !== generation) {
            throw new AnnotationsFeatureError('SESSION_CHANGED', 'Annotations session binding was superseded');
        }
        const nextBinding = { accountId, readOnly, repository, generation: nextGeneration };
        binding = nextBinding;
        state = migrateAnnotationsData(raw, options());
        return cloneStorageValue(state);
    }

    function assertWritable(candidate, operationContext = {}) {
        if (candidate.readOnly
            || operationContext.readOnly === true
            || operationContext.kind === 'inspection'
            || operationContext.mode === 'inspection') {
            throw new AnnotationsFeatureError('READ_ONLY_SESSION', 'Annotations inspection sessions are read-only');
        }
        const expectedAccount = String(
            operationContext.accountId ?? operationContext.sessionId ?? ''
        ).trim();
        if (expectedAccount && expectedAccount !== candidate.accountId) {
            throw new AnnotationsFeatureError(
                'SESSION_CHANGED',
                'Annotations operation belongs to a different active session'
            );
        }
    }

    async function mutate(operation, operationContext = {}) {
        const captured = requireStarted();
        assertWritable(captured, operationContext);
        const result = await captured.repository.update((raw) => {
            assertCurrent(captured);
            assertWritable(captured, operationContext);
            const current = migrateAnnotationsData(raw, options());
            return operation(current);
        });
        assertCurrent(captured);
        state = migrateAnnotationsData(unwrapRepositoryResult(result), options());
        return cloneStorageValue(state);
    }

    const feature = {
        async start(context = {}) {
            if (started && binding) return cloneStorageValue(state);
            started = true;
            try {
                return await bindSession(context.session);
            } catch (error) {
                started = false;
                binding = null;
                state = createEmptyAnnotationsState();
                throw error;
            }
        },

        async onSessionChange(nextSession) {
            if (!started) {
                throw new AnnotationsFeatureError('NOT_STARTED', 'Annotations feature has not started');
            }
            const previousRepository = binding?.repository;
            generation += 1;
            binding = null;
            state = createEmptyAnnotationsState();
            if (typeof previousRepository?.flush === 'function') await previousRepository.flush();
            return bindSession(nextSession);
        },

        async stop() {
            if (!started) return;
            const repository = binding?.repository;
            started = false;
            generation += 1;
            binding = null;
            state = createEmptyAnnotationsState();
            if (typeof repository?.flush === 'function') await repository.flush();
        },

        getSessionId() {
            return requireStarted().accountId;
        },

        isReadOnly() {
            return requireStarted().readOnly;
        },

        getSnapshot() {
            requireStarted();
            return cloneStorageValue(state);
        },

        search(filters = {}) {
            requireStarted();
            return searchAnnotations(state, filters, options());
        },

        exportJson(exportOptions = {}) {
            requireStarted();
            return serializeAnnotationsExport(state, { ...options(), ...exportOptions });
        },

        async upsert(input, operationContext = {}) {
            return mutate(current => upsertAnnotation(current, input, options()), operationContext);
        },

        async remove(annotationId, operationContext = {}) {
            return mutate(current => deleteAnnotation(current, annotationId, options()), operationContext);
        },

        async importJson(input, importOptions = {}, operationContext = {}) {
            let result;
            await mutate(current => {
                result = importAnnotations(current, input, { ...options(), ...importOptions });
                return result.data;
            }, operationContext);
            return cloneStorageValue(result);
        }
    };

    return Object.freeze(feature);
}

/** Adapter-free descriptor; ModuleHost supplies lifecycle context/capabilities. */
export function createAnnotationsModule(options) {
    const feature = createAnnotationsFeature(options);
    return Object.freeze({
        id: 'annotations',
        name: 'Annotations',
        description: 'Local conversation and message annotations',
        defaultEnabled: false,
        provides: Object.freeze(['annotations.service']),
        create() {
            return {
                async start(context) {
                    await feature.start(context);
                    context.provideCapability('annotations.service', feature);
                },
                onSessionChange(nextSession) {
                    return feature.onSessionChange(nextSession);
                },
                stop() {
                    return feature.stop();
                }
            };
        }
    });
}
