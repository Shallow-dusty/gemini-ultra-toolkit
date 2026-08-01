import {
    BulkLifecycleError,
    conversationMatches,
    sameRunScope
} from './snapshot.js';
import {
    normalizeArchiveCapability,
    verifyBulkArchiveCheckpoint
} from './archive_capability.js';

function asMessage(error, fallback) {
    return String(error?.message || error || fallback);
}

function cloneReport(report) {
    const checkpoint = report.archive.checkpoint;
    return Object.freeze({
        ...report,
        scope: report.scope,
        archive: Object.freeze({
            ...report.archive,
            checkpoint: checkpoint ? Object.freeze({
                ...checkpoint,
                checksum: Object.freeze({ ...checkpoint.checksum }),
                selectedIds: Object.freeze([...checkpoint.selectedIds])
            }) : null
        }),
        items: Object.freeze(report.items.map(item => Object.freeze({ ...item })))
    });
}

function countStatuses(items) {
    const count = status => items.filter(item => item.status === status).length;
    return {
        deleted: count('deleted'),
        failed: count('failed'),
        stale: count('stale'),
        cancelled: count('cancelled'),
        skipped: count('skipped')
    };
}

function isAbort(error, signal) {
    return Boolean(signal.aborted || error?.name === 'AbortError' || error?.code === 'ABORTED');
}

export class BulkLifecycleRunner {
    constructor({ adapter, archiveCapability = null, onChange = () => undefined } = {}) {
        for (const method of ['getRunScope', 'getConversationSnapshot', 'deleteConversation']) {
            if (!adapter || typeof adapter[method] !== 'function') {
                throw new TypeError(`BulkLifecycleRunner adapter requires ${method}()`);
            }
        }
        if (typeof onChange !== 'function') throw new TypeError('BulkLifecycleRunner onChange must be a function');
        this.adapter = adapter;
        this.archiveCapability = normalizeArchiveCapability(archiveCapability);
        this.onChange = onChange;
        this._active = null;
        this._report = null;
    }

    get active() { return Boolean(this._active); }
    get hasArchive() { return Boolean(this.archiveCapability); }
    get report() { return this._report ? cloneReport(this._report) : null; }

    setArchiveCapability(capability) {
        const next = normalizeArchiveCapability(capability);
        if (next === this.archiveCapability) return false;
        this.cancel('archive-capability-changed');
        this.archiveCapability = next;
        return true;
    }

    cancel(reason = 'cancelled') {
        if (!this._active) return false;
        this._active.controller.abort(reason);
        return true;
    }

    _emit(report) {
        Object.assign(report, countStatuses(report.items));
        this._report = report;
        this.onChange(cloneReport(report));
    }

    _cancelPending(report, reason, status = 'cancelled') {
        for (const item of report.items) {
            if (item.status === 'pending' || item.status === 'verifying') {
                item.status = status;
                item.error = reason;
            }
        }
    }

    _scopeIsCurrent(snapshot) {
        return sameRunScope(snapshot.scope, this.adapter.getRunScope());
    }

    async execute(snapshot, { archiveRequested = false } = {}) {
        if (this._active) throw new BulkLifecycleError('RUN_ACTIVE', 'A bulk lifecycle run is already active');
        if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
            throw new BulkLifecycleError('INVALID_SNAPSHOT', 'A non-empty run snapshot is required');
        }
        if (typeof archiveRequested !== 'boolean') {
            throw new TypeError('archiveRequested must be a boolean');
        }

        const controller = new AbortController();
        const archiveStatus = archiveRequested
            ? (this.archiveCapability ? 'pending' : 'unavailable')
            : (this.archiveCapability ? 'skipped' : 'unavailable');
        const report = {
            phase: 'preparing',
            total: snapshot.items.length,
            scope: snapshot.scope,
            archive: {
                requested: archiveRequested,
                status: archiveStatus,
                detail: '',
                checkpoint: null
            },
            items: snapshot.items.map(item => ({
                id: item.id,
                title: item.title,
                status: 'pending',
                error: ''
            }))
        };
        this._active = { controller, snapshot };
        this._emit(report);

        try {
            if (!this._scopeIsCurrent(snapshot)) {
                controller.abort('scope-changed');
            }

            if (archiveRequested && !this.archiveCapability && !controller.signal.aborted) {
                report.phase = 'blocked';
                report.archive.detail = 'archive-unavailable';
                this._cancelPending(report, 'archive-unavailable', 'skipped');
                this._emit(report);
                return cloneReport(report);
            }

            if (archiveRequested && this.archiveCapability && !controller.signal.aborted) {
                report.phase = 'archiving';
                report.archive.status = 'running';
                this._emit(report);
                try {
                    const archiveResult = await this.archiveCapability.archive(snapshot.items, {
                        signal: controller.signal,
                        scope: snapshot.scope,
                        capturedAt: snapshot.capturedAt
                    });
                    if (archiveResult === false || archiveResult?.accepted === false) {
                        throw new BulkLifecycleError('ARCHIVE_REJECTED', 'Archive capability rejected the snapshot');
                    }
                    const checkpoint = verifyBulkArchiveCheckpoint(archiveResult, snapshot.items);
                    report.archive.status = 'created';
                    report.archive.detail = checkpoint.id;
                    report.archive.checkpoint = checkpoint;
                } catch (error) {
                    if (isAbort(error, controller.signal)) {
                        this._cancelPending(report, String(controller.signal.reason || 'cancelled'));
                        report.phase = 'cancelled';
                        this._emit(report);
                        return cloneReport(report);
                    }
                    report.phase = 'blocked';
                    report.archive.status = 'failed';
                    report.archive.detail = asMessage(error, 'Archive failed');
                    this._cancelPending(report, 'archive-failed', 'skipped');
                    this._emit(report);
                    return cloneReport(report);
                }
            }

            report.phase = 'deleting';
            this._emit(report);
            for (const item of report.items) {
                if (controller.signal.aborted || !this._scopeIsCurrent(snapshot)) {
                    if (!controller.signal.aborted) controller.abort('scope-changed');
                    break;
                }

                item.status = 'verifying';
                this._emit(report);
                let current;
                try {
                    current = await this.adapter.getConversationSnapshot(item.id);
                } catch (error) {
                    item.status = 'failed';
                    item.error = asMessage(error, 'Snapshot verification failed');
                    this._emit(report);
                    this._cancelPending(report, 'stopped-after-failure', 'skipped');
                    this._emit(report);
                    break;
                }
                const expected = snapshot.items.find(candidate => candidate.id === item.id);
                if (!conversationMatches(expected, current)) {
                    item.status = 'stale';
                    item.error = 'snapshot-mismatch';
                    this._emit(report);
                    this._cancelPending(report, 'stopped-after-failure', 'skipped');
                    this._emit(report);
                    break;
                }
                if (!this._scopeIsCurrent(snapshot)) {
                    controller.abort('scope-changed');
                    break;
                }

                item.status = 'deleting';
                this._emit(report);
                try {
                    const result = await this.adapter.deleteConversation(expected, {
                        signal: controller.signal,
                        scope: snapshot.scope
                    });
                    if (result?.stale === true) {
                        item.status = 'stale';
                        item.error = 'snapshot-mismatch';
                    } else if (result === false || result?.deleted === false) {
                        item.status = 'failed';
                        item.error = String(result?.error || 'delete-rejected');
                    } else {
                        item.status = 'deleted';
                        item.error = '';
                    }
                } catch (error) {
                    if (isAbort(error, controller.signal)) {
                        item.status = 'cancelled';
                        item.error = String(controller.signal.reason || 'cancelled');
                        this._emit(report);
                        break;
                    }
                    item.status = 'failed';
                    item.error = asMessage(error, 'Delete failed');
                }
                this._emit(report);
                if (item.status === 'failed' || item.status === 'stale') {
                    this._cancelPending(report, 'stopped-after-failure', 'skipped');
                    this._emit(report);
                    break;
                }
            }

            if (controller.signal.aborted) {
                this._cancelPending(report, String(controller.signal.reason || 'cancelled'));
                report.phase = 'cancelled';
            } else {
                const counts = countStatuses(report.items);
                report.phase = counts.failed || counts.stale
                    ? (counts.deleted ? 'partial-failure' : 'failed')
                    : 'succeeded';
            }
            this._emit(report);
            return cloneReport(report);
        } finally {
            this._active = null;
        }
    }
}
