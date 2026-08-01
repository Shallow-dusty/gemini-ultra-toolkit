import { ModuleHostError, descriptorError } from './module_host_error.js';

const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const CAPABILITY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._:/-][A-Za-z0-9]+)*$/;
const LIFECYCLE_HOOKS = Object.freeze([
    'start', 'stop', 'init', 'destroy', 'onSessionChange', 'onUserChange'
]);

export function normalizeName(value, kind) {
    if (typeof value !== 'string' || value.trim() !== value || !value) {
        throw descriptorError(`${kind} must be a non-empty, trimmed string`, { value });
    }
    const pattern = kind === 'module id' ? MODULE_ID_PATTERN : CAPABILITY_PATTERN;
    if (!pattern.test(value)) {
        throw descriptorError(`Invalid ${kind}: ${value}`, { value });
    }
    return value;
}

function normalizeNameList(value, kind) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw descriptorError(`${kind} must be an array`, { value });
    }
    const names = value.map(name => normalizeName(name, 'capability'));
    if (new Set(names).size !== names.length) {
        throw descriptorError(`${kind} contains duplicate capabilities`, { value: names });
    }
    return names;
}

export function normalizeDescriptor(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw descriptorError('Module descriptor must be an object');
    }

    const id = normalizeName(input.id, 'module id');
    if (input.defaultEnabled !== undefined && typeof input.defaultEnabled !== 'boolean') {
        throw descriptorError('defaultEnabled must be a boolean', { id });
    }
    for (const hook of ['create', ...LIFECYCLE_HOOKS]) {
        if (input[hook] !== undefined && typeof input[hook] !== 'function') {
            throw descriptorError(`${hook} must be a function`, { id, hook });
        }
    }

    let provides;
    let staticProvides = null;
    if (input.provides === undefined) {
        provides = [];
    } else if (Array.isArray(input.provides)) {
        provides = normalizeNameList(input.provides, 'provides');
    } else if (input.provides && typeof input.provides === 'object') {
        provides = Object.keys(input.provides).map(name => normalizeName(name, 'capability'));
        staticProvides = Object.freeze({ ...input.provides });
    } else {
        throw descriptorError('provides must be an array or capability map', { id });
    }

    const requires = normalizeNameList(input.requires, 'requires');
    if (input.capabilities !== undefined &&
        (!input.capabilities || typeof input.capabilities !== 'object' || Array.isArray(input.capabilities))) {
        throw descriptorError('capabilities must be an object', { id });
    }

    const hasLifecycle = typeof input.create === 'function' ||
        LIFECYCLE_HOOKS.some(hook => typeof input[hook] === 'function');
    if (!hasLifecycle && provides.length === 0) {
        throw descriptorError('Descriptor must define create(), lifecycle hooks, or provided capabilities', { id });
    }

    return Object.freeze({
        ...input,
        id,
        defaultEnabled: input.defaultEnabled === true,
        provides: Object.freeze(provides.slice()),
        requires: Object.freeze(requires.slice()),
        capabilities: input.capabilities ? Object.freeze({ ...input.capabilities }) : undefined,
        staticProvides
    });
}

export function normalizeLifecycle(value, id) {
    if (typeof value === 'function') return { stop: value };
    if (!value || typeof value !== 'object') {
        throw new ModuleHostError(
            'INVALID_LIFECYCLE',
            `Module "${id}" create() must return a lifecycle object or cleanup function`,
            { moduleId: id }
        );
    }
    for (const hook of LIFECYCLE_HOOKS) {
        if (value[hook] !== undefined && typeof value[hook] !== 'function') {
            throw new ModuleHostError(
                'INVALID_LIFECYCLE',
                `Module "${id}" lifecycle.${hook} must be a function`,
                { moduleId: id, hook }
            );
        }
    }
    return value;
}

export function findLifecycleHook(record, name) {
    const aliases = {
        start: ['start', 'init'],
        stop: ['stop', 'destroy'],
        session: ['onSessionChange', 'onUserChange']
    }[name];
    const sources = [record.startResult, record.lifecycle, record.descriptor];
    for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        for (const alias of aliases) {
            if (typeof source[alias] === 'function') return { source, fn: source[alias], alias };
        }
    }
    return null;
}
