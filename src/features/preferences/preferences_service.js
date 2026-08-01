import {
    DEFAULT_MODULE_METADATA,
    PreferencesCatalog,
    PreferencesError,
    immutablePreferencesCopy
} from './catalog.js';
import { DEFAULT_PREFERENCE_POLICIES, PreferencesPlanner } from './preferences_planner.js';
import { assertPreferencesStorageAdapter, normalizePreferencesRuntime } from './preferences_ports.js';
import {
    createPreferencesSnapshot,
    normalizeStoredPreferences,
    preferenceArraysEqual,
    preferenceErrorSummary,
    serializePreferences
} from './preferences_state.js';

let serviceSequence = 0;

export class FeaturePreferencesService {
    constructor({ metadata = DEFAULT_MODULE_METADATA, storage, runtime = null } = {}) {
        assertPreferencesStorageAdapter(storage);
        this.catalog = metadata instanceof PreferencesCatalog ? metadata : new PreferencesCatalog(metadata);
        this.storage = storage;
        this.runtime = normalizePreferencesRuntime(runtime);
        this.planner = new PreferencesPlanner(this.catalog);
        this._serviceId = `preferences-${++serviceSequence}`;
        this._revision = 0;
        this._enabled = null;
        this._unknown = [];
        this._busy = false;
        this._sequence = 0;
        this._plans = new Map();
        this._receipts = new Map();
    }

    get ready() { return this._enabled !== null; }
    get metadata() { return this.catalog.list(); }

    async load() {
        this._assertIdle();
        this._busy = true;
        try {
            const stored = await this.storage.load();
            const state = normalizeStoredPreferences(stored, this.catalog);
            if (state.usedDefaults) {
                await this.storage.save(serializePreferences(this.catalog, state.known, state.unknown));
                await this.storage.flush();
            }
            this._enabled = state.known;
            this._unknown = state.unknown.slice();
            this._revision += 1;
            return this.snapshot();
        } finally {
            this._busy = false;
        }
    }

    snapshot() {
        this._assertReady();
        return createPreferencesSnapshot({
            catalog: this.catalog,
            revision: this._revision,
            enabled: this._enabled,
            unknown: this._unknown
        });
    }

    isEnabled(id) {
        this._assertReady();
        if (!this.catalog.has(id)) throw new PreferencesError('UNKNOWN_MODULE', `Unknown module: ${String(id)}`, { id });
        return this._enabled.has(id);
    }

    preview(changes, options = {}) {
        this._assertReady();
        return this._registerPlan(this.planner.preview({
            before: new Set(this._enabled),
            unknown: this._unknown,
            changes,
            options
        }));
    }

    async apply(planReference) {
        this._assertReady();
        this._assertIdle();
        const plan = this._resolvePlan(planReference);
        this._assertPlanCurrent(plan);
        this._busy = true;
        const completed = [];
        let persistenceAttempted = false;
        let receipt;
        try {
            for (const operation of plan.operations) {
                await this._execute(operation);
                completed.push(operation);
            }
            persistenceAttempted = true;
            await this.storage.save(serializePreferences(
                this.catalog,
                new Set(plan.after.enabledIds),
                plan.after.unknownIds
            ));
            await this.storage.flush();
            this._enabled = new Set(plan.after.enabledIds);
            this._unknown = plan.after.unknownIds.slice();
            this._revision += 1;
            this._plans.delete(plan.id);
            receipt = immutablePreferencesCopy({
                kind: 'preferences-receipt',
                serviceId: this._serviceId,
                id: `${this._serviceId}:receipt:${++this._sequence}`,
                revisionBefore: plan.baseRevision,
                revisionAfter: this._revision,
                before: plan.before,
                after: plan.after,
                operations: plan.operations
            });
            this._receipts.set(receipt.id, receipt);
        } catch (cause) {
            const rollbackErrors = await this._rollbackFailedApply(completed, plan, persistenceAttempted);
            this._busy = false;
            throw new PreferencesError(
                'APPLY_FAILED',
                'Feature preference transaction failed and was rolled back',
                {
                    cause: preferenceErrorSummary(cause),
                    rollbackErrors: rollbackErrors.map(preferenceErrorSummary)
                },
                cause
            );
        }
        this._busy = false;
        return receipt;
    }

    async rollback(receiptReference) {
        this._assertReady();
        this._assertIdle();
        const receipt = this._resolveReceipt(receiptReference);
        if (receipt.revisionAfter !== this._revision
            || !preferenceArraysEqual(receipt.after.enabledIds, this.snapshot().enabledIds)
            || !preferenceArraysEqual(receipt.after.unknownIds, this._unknown)) {
            throw new PreferencesError('STALE_RECEIPT', 'Receipt no longer matches current preferences', {
                receiptRevision: receipt.revisionAfter,
                currentRevision: this._revision
            });
        }
        const plan = this._createPlan({
            before: new Set(receipt.after.enabledIds),
            after: new Set(receipt.before.enabledIds),
            unknownBefore: receipt.after.unknownIds,
            unknownAfter: receipt.before.unknownIds,
            requested: {},
            policies: DEFAULT_PREFERENCE_POLICIES,
            autoEnabled: new Set(),
            autoDisabled: new Set()
        });
        const rollbackReceipt = await this.apply(plan);
        this._receipts.delete(receipt.id);
        return rollbackReceipt;
    }

    _createPlan(options) {
        return this._registerPlan(this.planner.create(options));
    }

    _registerPlan(draft) {
        const plan = immutablePreferencesCopy({
            kind: 'preferences-plan',
            serviceId: this._serviceId,
            id: `${this._serviceId}:plan:${++this._sequence}`,
            baseRevision: this._revision,
            ...draft
        });
        this._plans.set(plan.id, plan);
        return plan;
    }

    _resolvePlan(reference) {
        if (!reference || reference.kind !== 'preferences-plan' || reference.serviceId !== this._serviceId) {
            throw new PreferencesError('FOREIGN_PLAN', 'Plan was not created by this preferences service');
        }
        const plan = this._plans.get(reference.id);
        if (!plan) throw new PreferencesError('UNKNOWN_PLAN', 'Plan is unknown or was already applied', { id: reference.id });
        return plan;
    }

    _resolveReceipt(reference) {
        if (!reference || reference.kind !== 'preferences-receipt' || reference.serviceId !== this._serviceId) {
            throw new PreferencesError('FOREIGN_RECEIPT', 'Receipt was not created by this preferences service');
        }
        const receipt = this._receipts.get(reference.id);
        if (!receipt) throw new PreferencesError('UNKNOWN_RECEIPT', 'Receipt is unknown or was already rolled back', { id: reference.id });
        return receipt;
    }

    _assertPlanCurrent(plan) {
        const current = this.snapshot();
        if (plan.baseRevision !== this._revision
            || !preferenceArraysEqual(plan.before.enabledIds, current.enabledIds)
            || !preferenceArraysEqual(plan.before.unknownIds, current.unknownIds)) {
            throw new PreferencesError('STALE_PLAN', 'Plan no longer matches current preferences', {
                planRevision: plan.baseRevision,
                currentRevision: this._revision
            });
        }
    }

    async _execute(operation) {
        if (operation.enabled) await this.runtime.enable(operation.id);
        else await this.runtime.disable(operation.id);
    }

    async _rollbackFailedApply(completed, plan, persistenceAttempted) {
        const errors = [];
        for (const operation of completed.slice().reverse()) {
            try { await this._execute({ id: operation.id, enabled: !operation.enabled }); }
            catch (error) { errors.push(error); }
        }
        if (persistenceAttempted) {
            try {
                await this.storage.save(serializePreferences(
                    this.catalog,
                    new Set(plan.before.enabledIds),
                    plan.before.unknownIds
                ));
            } catch (error) { errors.push(error); }
            try { await this.storage.flush(); }
            catch (error) { errors.push(error); }
        }
        return errors;
    }

    _assertReady() {
        if (!this.ready) throw new PreferencesError('NOT_READY', 'Preferences must be loaded first');
    }

    _assertIdle() {
        if (this._busy) throw new PreferencesError('PREFERENCES_BUSY', 'A preferences transaction is already running');
    }
}
