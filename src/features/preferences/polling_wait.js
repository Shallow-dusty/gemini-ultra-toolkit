export function createPollingWaitFor({
    setInterval: schedule = globalThis.setInterval,
    clearInterval: cancel = globalThis.clearInterval,
    now = () => Date.now(),
    intervalMs = 100
} = {}) {
    if (typeof schedule !== 'function' || typeof cancel !== 'function' || typeof now !== 'function') {
        throw new TypeError('Polling wait requires timer and clock functions');
    }
    return (predicate, timeoutMs) => new Promise((resolve, reject) => {
        let initial;
        try { initial = predicate(); }
        catch (error) { reject(error); return; }
        if (initial) { resolve(initial); return; }
        const startedAt = now();
        const timer = schedule(() => {
            try {
                const value = predicate();
                if (value) {
                    cancel(timer);
                    resolve(value);
                } else if (now() - startedAt >= timeoutMs) {
                    cancel(timer);
                    reject(new Error('Preference capability wait timed out'));
                }
            } catch (error) {
                cancel(timer);
                reject(error);
            }
        }, intervalMs);
    });
}
