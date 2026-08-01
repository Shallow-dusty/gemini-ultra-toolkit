/** Stable, presentation-independent failures for archive UI and diagnostics. */
export class PortableArchiveError extends Error {
    constructor(code, message, details = {}, cause = undefined) {
        super(message);
        this.name = 'PortableArchiveError';
        this.code = code;
        this.details = details;
        if (cause !== undefined) this.cause = cause;
    }
}
export function archiveError(code, message, details = {}, cause = undefined) {
    return new PortableArchiveError(code, message, details, cause);
}
