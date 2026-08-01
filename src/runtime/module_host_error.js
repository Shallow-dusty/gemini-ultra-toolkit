/** Error with a stable code and structured details for UI and diagnostics. */
export class ModuleHostError extends Error {
    constructor(code, message, details = {}, cause = undefined) {
        super(message);
        this.name = 'ModuleHostError';
        this.code = code;
        this.details = details;
        if (cause !== undefined) this.cause = cause;
    }
}

export function descriptorError(message, details = {}) {
    return new ModuleHostError('INVALID_DESCRIPTOR', message, details);
}

export function collectErrors(errors) {
    if (errors.length === 1) return errors[0];
    if (typeof AggregateError === 'function') return new AggregateError(errors, 'Multiple module cleanup failures');
    const aggregate = new Error('Multiple module cleanup failures');
    aggregate.name = 'AggregateError';
    aggregate.errors = errors;
    return aggregate;
}
