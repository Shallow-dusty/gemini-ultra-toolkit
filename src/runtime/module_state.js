function asErrorSummary(error) {
    if (!error) return null;
    return Object.freeze({
        name: String(error.name || 'Error'),
        message: String(error.message || error),
        code: error.code || null
    });
}

export function createModuleRecord(descriptor) {
    return {
        descriptor,
        state: 'stopped',
        scope: null,
        lifecycle: null,
        startResult: null,
        context: null,
        lastError: null,
        generation: 0
    };
}

export function createModuleState(record) {
    return Object.freeze({
        id: record.descriptor.id,
        state: record.state,
        enabled: record.state === 'started',
        defaultEnabled: record.descriptor.defaultEnabled,
        provides: record.descriptor.provides.slice(),
        requires: record.descriptor.requires.slice(),
        generation: record.generation,
        error: asErrorSummary(record.lastError)
    });
}
