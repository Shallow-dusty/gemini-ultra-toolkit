export const QUEUE_STALE_REASONS = Object.freeze({
    baseline: 'Queue send cancelled: composer baseline unavailable',
    composer: 'Queue send cancelled: composer changed',
    route: 'Queue send cancelled: route changed',
    session: 'Queue send cancelled: session changed',
    visibility: 'Queue send cancelled: page hidden'
});

export function requireObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${name} must be an object`);
    }
    return value;
}

export function requireMethod(owner, name, label) {
    if (typeof owner[name] !== 'function') throw new TypeError(`${label}.${name} must be a function`);
}

export function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
    return value;
}

export function requireDelay(value, name, fallback) {
    const resolved = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(resolved) || resolved < 0) throw new TypeError(`${name} must be a non-negative number`);
    return resolved;
}

export function clean(value) {
    return String(value ?? '').trim();
}

export function failureMessage(error, fallback) {
    return clean(error?.message || error) || fallback;
}

export function stageFailure(result, fallback) {
    if (result !== false && result?.ok !== false) return '';
    return clean(result?.reason) || fallback;
}

export function composerBaseline(result) {
    const baseline = result?.baseline;
    return baseline && typeof baseline === 'object' && !Array.isArray(baseline) ? baseline : null;
}

export function composerVerificationFailure(result) {
    return result?.ok === true ? '' : clean(result?.reason) || QUEUE_STALE_REASONS.composer;
}

export function continuationFailure({ started, session, currentSession, generation, context, paused }) {
    if (!started || currentSession !== session || session?.generation !== generation ||
        session?.storageKey !== context.storageKey || paused) {
        return QUEUE_STALE_REASONS.session;
    }
    if (session.routeKey !== context.routeKey) return QUEUE_STALE_REASONS.route;
    if (!context.visible) return QUEUE_STALE_REASONS.visibility;
    return '';
}
