const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    deleteChatNote,
    getNotesStats,
    getPinnedNotes,
    normalizeChatRef,
    normalizeNote,
    normalizeNotesData,
    toggleChatPin,
    upsertChatNote
} = require('../lib/chat_notes_store.js');

describe('chat_notes_store', () => {
    const nowIso = '2026-06-08T00:00:00.000Z';
    const laterIso = '2026-06-08T01:00:00.000Z';

    it('normalizes chat refs and rejects missing ids', () => {
        assert.equal(normalizeChatRef(null), null);
        assert.equal(normalizeChatRef({ title: 'No ID' }), null);
        assert.deepEqual(normalizeChatRef({
            id: 'abc',
            title: '  Chat Title  ',
            href: 'javascript:alert(1)'
        }), {
            chatId: 'abc',
            title: 'Chat Title',
            href: ''
        });
    });

    it('normalizes individual notes with safe defaults', () => {
        const note = normalizeNote({
            chatId: 'c1',
            title: '',
            note: '  remember this  ',
            pinned: true,
            href: '/app/c1',
            createdAt: '',
            updatedAt: ''
        }, { nowIso });

        assert.equal(note.title, 'c1');
        assert.equal(note.note, 'remember this');
        assert.equal(note.pinned, true);
        assert.equal(note.href, '/app/c1');
        assert.equal(note.createdAt, nowIso);
        assert.equal(note.updatedAt, nowIso);
        assert.equal(normalizeNote('bad'), null);
    });

    it('normalizes note collections and drops invalid entries', () => {
        assert.deepEqual(normalizeNotesData(null), { notes: {} });

        const data = normalizeNotesData({
            notes: {
                c1: { note: 'one' },
                c2: { chatId: 'stale-id', note: 'two' },
                '': { note: 'bad' }
            }
        }, { nowIso });

        assert.deepEqual(Object.keys(data.notes), ['c1', 'c2']);
        assert.equal(data.notes.c1.note, 'one');
        assert.equal(data.notes.c2.chatId, 'c2');
    });

    it('creates, updates, and removes notes when empty and unpinned', () => {
        const created = upsertChatNote({}, { id: 'c1', title: 'First', href: '/app/c1' }, { note: 'note' }, { nowIso });
        assert.equal(created.notes.c1.note, 'note');
        assert.equal(created.notes.c1.pinned, false);
        assert.equal(created.notes.c1.createdAt, nowIso);

        const updated = upsertChatNote(created, { id: 'c1', title: 'Renamed' }, { note: 'updated', pinned: true }, { nowIso: laterIso });
        assert.equal(updated.notes.c1.title, 'Renamed');
        assert.equal(updated.notes.c1.note, 'updated');
        assert.equal(updated.notes.c1.pinned, true);
        assert.equal(updated.notes.c1.createdAt, nowIso);
        assert.equal(updated.notes.c1.updatedAt, laterIso);

        const keptBecausePinned = upsertChatNote(updated, { id: 'c1' }, { note: '' }, { nowIso: laterIso });
        assert.equal(keptBecausePinned.notes.c1.pinned, true);
        assert.equal(keptBecausePinned.notes.c1.note, '');
        assert.equal(keptBecausePinned.notes.c1.title, 'Renamed');
        assert.equal(keptBecausePinned.notes.c1.href, '/app/c1');

        const removed = upsertChatNote(keptBecausePinned, { id: 'c1' }, { pinned: false }, { nowIso: laterIso });
        assert.deepEqual(removed.notes, {});
    });

    it('ignores invalid upserts and can timestamp with the current clock', () => {
        const original = upsertChatNote({}, { id: 'c1' }, { note: 'note' }, { nowIso });
        assert.deepEqual(upsertChatNote(original, null, { note: 'bad' }), original);

        const generated = upsertChatNote({}, { id: 'c2' }, { note: 'generated' });
        assert.equal(generated.notes.c2.title, 'c2');
        assert.match(generated.notes.c2.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('toggles pins and ignores invalid chat refs', () => {
        const pinned = toggleChatPin({}, { id: 'c1', title: 'First' }, { nowIso });
        assert.equal(pinned.notes.c1.pinned, true);
        assert.equal(pinned.notes.c1.note, '');

        const unpinned = toggleChatPin(pinned, { id: 'c1' }, { nowIso: laterIso });
        assert.deepEqual(unpinned.notes, {});
        assert.deepEqual(toggleChatPin(pinned, {}, { nowIso: laterIso }), pinned);
    });

    it('deletes notes by id', () => {
        const data = upsertChatNote({}, { id: 'c1' }, { note: 'note' }, { nowIso });
        assert.deepEqual(deleteChatNote(data, 'c1').notes, {});
        assert.deepEqual(deleteChatNote(data, null).notes, data.notes);
    });

    it('returns pinned notes sorted by update time then title', () => {
        const data = {
            notes: {
                a: { chatId: 'a', title: 'Beta', pinned: true, updatedAt: '2026-01-01T00:00:00.000Z' },
                b: { chatId: 'b', title: 'Alpha', pinned: true, updatedAt: '2026-01-01T00:00:00.000Z' },
                c: { chatId: 'c', title: 'Newest', pinned: true, updatedAt: '2026-01-02T00:00:00.000Z' },
                d: { chatId: 'd', title: 'No Pin', pinned: false, updatedAt: '2026-01-03T00:00:00.000Z' }
            }
        };

        assert.deepEqual(getPinnedNotes(data).map(note => note.chatId), ['c', 'b', 'a']);
    });

    it('counts note stats', () => {
        const data = {
            notes: {
                a: { chatId: 'a', title: 'A', note: 'text', pinned: true },
                b: { chatId: 'b', title: 'B', note: '', pinned: true },
                c: { chatId: 'c', title: 'C', note: 'text', pinned: false }
            }
        };

        assert.deepEqual(getNotesStats(data), { total: 3, pinned: 2, withNote: 2 });
    });
});
