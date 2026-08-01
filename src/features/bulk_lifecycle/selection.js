import {
    createRunSnapshot,
    normalizeConversation
} from './snapshot.js';

/** Owns explicit selection state; it never scans Gemini or mutates the DOM. */
export class BulkSelectionState {
    constructor({ isRunActive = () => false } = {}) {
        if (typeof isRunActive !== 'function') {
            throw new TypeError('BulkSelectionState isRunActive must be a function');
        }
        this._isRunActive = isRunActive;
        this._items = new Map();
        this._mode = false;
    }

    get mode() { return this._mode; }
    get size() { return this._items.size; }
    get ids() { return Object.freeze([...this._items.keys()]); }
    get items() { return Object.freeze([...this._items.values()]); }
    has(id) { return this._items.has(String(id)); }

    enter() {
        if (this._isRunActive()) return false;
        this._mode = true;
        return true;
    }

    exit() {
        if (this._isRunActive()) return false;
        this._mode = false;
        this._items.clear();
        return true;
    }

    set(item, selected) {
        const normalized = normalizeConversation(item);
        if (selected) this._items.set(normalized.id, normalized);
        else this._items.delete(normalized.id);
        return selected;
    }

    selectAll(items) {
        for (const item of items) this.set(item, true);
        return this.size;
    }

    clear() {
        const changed = this.size > 0;
        this._items.clear();
        return changed;
    }

    remove(id) { return this._items.delete(String(id)); }

    reset() {
        this._mode = false;
        this._items.clear();
    }

    capture({ scope, capturedAt }) {
        return createRunSnapshot({
            items: this.items,
            selectedIds: this.ids,
            scope,
            capturedAt
        });
    }
}
