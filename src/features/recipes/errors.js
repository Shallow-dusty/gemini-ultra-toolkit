export class RecipesError extends Error {
    constructor(code, message, details = {}, cause = undefined) {
        super(message);
        this.name = 'RecipesError';
        this.code = code;
        this.details = details;
        if (cause !== undefined) this.cause = cause;
    }
}

export function fail(code, message, details = {}, cause = undefined) {
    throw new RecipesError(code, message, details, cause);
}
