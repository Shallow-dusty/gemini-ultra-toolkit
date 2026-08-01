export class CollectionsError extends Error {
    constructor(code, message, details = {}, cause = undefined) {
        super(message);
        this.name = 'CollectionsError';
        this.code = code;
        this.details = details;
        if (cause !== undefined) this.cause = cause;
    }
}

export function fail(code, message, details = {}, cause = undefined) {
    throw new CollectionsError(code, message, details, cause);
}
