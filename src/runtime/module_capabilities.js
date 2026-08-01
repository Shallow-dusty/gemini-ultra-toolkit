import { normalizeName } from './module_descriptor.js';
import { ModuleHostError } from './module_host_error.js';

export function assertDependencies(record, capabilities) {
    const missing = record.descriptor.requires.filter(name => !capabilities.has(name));
    if (missing.length) {
        throw new ModuleHostError(
            'MISSING_CAPABILITY',
            `Module "${record.descriptor.id}" is missing required capabilities: ${missing.join(', ')}`,
            { moduleId: record.descriptor.id, missing }
        );
    }
}

export function assertCapabilitySlots(record, capabilities) {
    const conflicts = record.descriptor.provides
        .filter(name => capabilities.has(name))
        .map(name => ({ name, owner: capabilities.get(name).owner }));
    if (conflicts.length) {
        throw new ModuleHostError(
            'CAPABILITY_CONFLICT',
            `Module "${record.descriptor.id}" cannot replace registered capabilities`,
            { moduleId: record.descriptor.id, conflicts }
        );
    }
}

export function assertNoStartedDependents(record, activationOrder) {
    const provided = new Set(record.descriptor.provides);
    if (provided.size === 0) return;
    const dependents = activationOrder
        .filter(candidate => candidate !== record &&
            candidate.descriptor.requires.some(name => provided.has(name)))
        .map(candidate => candidate.descriptor.id);
    if (dependents.length) {
        throw new ModuleHostError(
            'DEPENDENCY_IN_USE',
            `Module "${record.descriptor.id}" is still required by active modules: ${dependents.join(', ')}`,
            { moduleId: record.descriptor.id, dependents }
        );
    }
}

export function removeOwnedCapabilities(capabilities, owner) {
    for (const [name, entry] of capabilities) {
        if (entry.owner === owner) capabilities.delete(name);
    }
}

export function createModuleContext(host, record, scope, staged, session, extra = {}) {
    const moduleId = record.descriptor.id;
    const provideCapability = (name, value) => {
        normalizeName(name, 'capability');
        if (!record.descriptor.provides.includes(name)) {
            throw new ModuleHostError(
                'UNDECLARED_CAPABILITY',
                `Module "${moduleId}" did not declare capability "${name}"`,
                { moduleId, capability: name }
            );
        }
        if (staged.has(name) && staged.get(name) !== value) {
            throw new ModuleHostError(
                'DUPLICATE_CAPABILITY_VALUE',
                `Module "${moduleId}" provided conflicting values for "${name}"`,
                { moduleId, capability: name }
            );
        }
        staged.set(name, value);
        return value;
    };

    return Object.freeze({
        id: moduleId,
        scope,
        signal: scope.signal,
        session,
        hasCapability: name => staged.has(name) || host.hasCapability(name),
        getCapability: name => staged.has(name) ? staged.get(name) : host.getCapability(name),
        requireCapability: name => staged.has(name)
            ? staged.get(name)
            : host.requireCapability(name, moduleId),
        provideCapability,
        provide: provideCapability,
        ...extra
    });
}

export function stageCapabilityMap(record, staged, source, sourceName) {
    if (typeof source !== 'object' || Array.isArray(source)) {
        throw new ModuleHostError(
            'INVALID_CAPABILITIES',
            `Module "${record.descriptor.id}" ${sourceName} must be an object`,
            { moduleId: record.descriptor.id, source: sourceName }
        );
    }
    for (const [name, value] of Object.entries(source)) {
        record.context.provideCapability(name, value);
    }
}
