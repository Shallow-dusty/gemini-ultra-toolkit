export function createPendingWriteTracker() {
    const pending = new Set();

    return Object.freeze({
        track(value) {
            const promise = Promise.resolve(value);
            pending.add(promise);
            promise.then(
                () => pending.delete(promise),
                () => pending.delete(promise)
            );
            return promise;
        },

        async flush() {
            while (pending.size > 0) {
                await Promise.all([...pending]);
            }
        }
    });
}
