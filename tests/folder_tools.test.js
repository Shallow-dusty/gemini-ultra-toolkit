const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    cloneFolderData,
    deleteFolderForUndo,
    moveChatsToFolderForUndo,
    restoreDeletedFolder,
    restoreFolderMove
} = require('../lib/folder_tools.js');

const nowIso = '2026-06-08T10:00:00.000Z';

function sampleData() {
    return {
        folders: {
            work: { name: 'Work', color: '#8ab4f8', collapsed: false },
            personal: { name: 'Personal', color: '#81c995', pinned: true }
        },
        chatToFolder: {
            c1: 'work',
            c2: 'personal',
            stale: 'missing'
        },
        folderOrder: ['work', 'personal']
    };
}

describe('folder_tools', () => {
    it('clones folder data without mutating source objects', () => {
        const source = sampleData();
        const cloned = cloneFolderData(source);

        cloned.folders.work.name = 'Changed';
        cloned.chatToFolder.c1 = 'personal';
        cloned.folderOrder.reverse();

        assert.equal(source.folders.work.name, 'Work');
        assert.equal(source.chatToFolder.c1, 'work');
        assert.deepEqual(source.folderOrder, ['work', 'personal']);
    });

    it('falls back to empty data and folder key order for partial inputs', () => {
        assert.deepEqual(cloneFolderData(null), { folders: {}, chatToFolder: {}, folderOrder: [] });

        const partial = cloneFolderData({ folders: { a: { name: 'A' }, broken: 'raw' }, chatToFolder: null, folderOrder: null });
        assert.deepEqual(partial, {
            folders: { a: { name: 'A' }, broken: 'raw' },
            chatToFolder: {},
            folderOrder: ['a', 'broken']
        });
    });

    it('moves one or many chats and records undo metadata', () => {
        const result = moveChatsToFolderForUndo(sampleData(), ['c1', 'c3', 'c3', '', null], 'personal', { nowIso });

        assert.equal(result.data.chatToFolder.c1, 'personal');
        assert.equal(result.data.chatToFolder.c3, 'personal');
        assert.equal(result.undo.type, 'folder-move');
        assert.equal(result.undo.movedAt, nowIso);
        assert.equal(result.undo.targetFolderId, 'personal');
        assert.deepEqual(result.undo.entries, [
            { chatId: 'c1', previousFolderId: 'work', nextFolderId: 'personal' },
            { chatId: 'c3', previousFolderId: null, nextFolderId: 'personal' }
        ]);
    });

    it('unassigns chats, ignores no-op moves, and rejects missing target folders', () => {
        const unassigned = moveChatsToFolderForUndo(sampleData(), 'c1', null, { nowIso });
        assert.equal(unassigned.data.chatToFolder.c1, undefined);
        assert.deepEqual(unassigned.undo.entries, [
            { chatId: 'c1', previousFolderId: 'work', nextFolderId: null }
        ]);

        const noOp = moveChatsToFolderForUndo(sampleData(), ['c1'], 'work', { nowIso });
        assert.equal(noOp.undo, null);
        assert.equal(noOp.data.chatToFolder.c1, 'work');

        const invalidTarget = moveChatsToFolderForUndo(sampleData(), ['c1'], 'missing', { nowIso });
        assert.equal(invalidTarget.undo, null);
        assert.equal(invalidTarget.data.chatToFolder.c1, 'work');
    });

    it('restores folder moves without clobbering newer assignments', () => {
        const moved = moveChatsToFolderForUndo(sampleData(), ['c1', 'c3'], 'personal', { nowIso });
        moved.data.chatToFolder.c3 = 'work';

        const restored = restoreFolderMove(moved.data, moved.undo);

        assert.equal(restored.restored, true);
        assert.equal(restored.restoredCount, 1);
        assert.equal(restored.skippedCount, 1);
        assert.equal(restored.data.chatToFolder.c1, 'work');
        assert.equal(restored.data.chatToFolder.c3, 'work');
    });

    it('restores moves back to uncategorized and can timestamp with the current clock', () => {
        const moved = moveChatsToFolderForUndo(sampleData(), ['c3'], 'work');
        const restored = restoreFolderMove(moved.data, moved.undo);

        assert.match(moved.undo.movedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(restored.restored, true);
        assert.equal(restored.data.chatToFolder.c3, undefined);
    });

    it('skips move undo entries with invalid payloads or missing restore folders', () => {
        const moved = moveChatsToFolderForUndo(sampleData(), ['c1'], 'personal', { nowIso });
        delete moved.data.folders.work;

        const restored = restoreFolderMove(moved.data, {
            type: 'folder-move',
            entries: [
                moved.undo.entries[0],
                { chatId: '', previousFolderId: null, nextFolderId: 'personal' }
            ]
        });

        assert.equal(restored.restored, false);
        assert.equal(restored.restoredCount, 0);
        assert.equal(restored.skippedCount, 2);
        assert.equal(restored.data.chatToFolder.c1, 'personal');

        const invalid = restoreFolderMove(sampleData(), { type: 'folder-delete', entries: [] });
        assert.equal(invalid.restored, false);
        assert.equal(invalid.skippedCount, 0);
    });

    it('deletes folders with assignments and records enough data to restore', () => {
        const result = deleteFolderForUndo(sampleData(), 'work', { nowIso });

        assert.equal(result.data.folders.work, undefined);
        assert.deepEqual(result.data.folderOrder, ['personal']);
        assert.equal(result.data.chatToFolder.c1, undefined);
        assert.equal(result.data.chatToFolder.c2, 'personal');
        assert.equal(result.undo.type, 'folder-delete');
        assert.equal(result.undo.deletedAt, nowIso);
        assert.equal(result.undo.folderId, 'work');
        assert.deepEqual(result.undo.folder, { name: 'Work', color: '#8ab4f8', collapsed: false });
        assert.equal(result.undo.restoreIndex, 0);
        assert.deepEqual(result.undo.assignments, [{ chatId: 'c1', folderId: 'work' }]);
    });

    it('returns no delete undo for invalid or unknown folders', () => {
        const blank = deleteFolderForUndo(sampleData(), '', { nowIso });
        const missing = deleteFolderForUndo(sampleData(), 'missing', { nowIso });

        assert.equal(blank.undo, null);
        assert.equal(missing.undo, null);
        assert.deepEqual(missing.data.folderOrder, ['work', 'personal']);
    });

    it('restores deleted folders and unclobbered assignments at the original index', () => {
        const deleted = deleteFolderForUndo(sampleData(), 'work', { nowIso });
        const restored = restoreDeletedFolder(deleted.data, deleted.undo);

        assert.equal(restored.restored, true);
        assert.equal(restored.restoredAssignments, 1);
        assert.equal(restored.skippedAssignments, 0);
        assert.deepEqual(restored.data.folderOrder, ['work', 'personal']);
        assert.equal(restored.data.folders.work.name, 'Work');
        assert.equal(restored.data.chatToFolder.c1, 'work');
    });

    it('skips deleted-folder restores that would overwrite newer valid assignments', () => {
        const deleted = deleteFolderForUndo(sampleData(), 'work', { nowIso });
        deleted.data.chatToFolder.c1 = 'personal';

        const restored = restoreDeletedFolder(deleted.data, deleted.undo);

        assert.equal(restored.restored, true);
        assert.equal(restored.restoredAssignments, 0);
        assert.equal(restored.skippedAssignments, 1);
        assert.equal(restored.data.chatToFolder.c1, 'personal');
    });

    it('clamps deleted-folder restore indexes and appends malformed indexes', () => {
        const base = {
            folders: { b: { name: 'B' } },
            chatToFolder: {},
            folderOrder: ['b']
        };
        const beforeStart = restoreDeletedFolder(base, {
            type: 'folder-delete',
            folderId: 'a',
            folder: { name: 'A' },
            restoreIndex: -3,
            assignments: [{ chatId: '', folderId: 'a' }]
        });
        const append = restoreDeletedFolder(base, {
            type: 'folder-delete',
            folderId: 'c',
            folder: { name: 'C' },
            restoreIndex: 'later',
            assignments: null
        });

        assert.deepEqual(beforeStart.data.folderOrder, ['a', 'b']);
        assert.equal(beforeStart.skippedAssignments, 1);
        assert.deepEqual(append.data.folderOrder, ['b', 'c']);
        assert.equal(append.restoredAssignments, 0);
    });

    it('rejects invalid deleted-folder undo payloads and duplicate folder restores', () => {
        const base = sampleData();
        const invalid = restoreDeletedFolder(base, null);
        const wrongType = restoreDeletedFolder(base, { type: 'folder-move', folderId: 'old', folder: { name: 'Old' } });
        const duplicate = restoreDeletedFolder(base, { type: 'folder-delete', folderId: 'work', folder: { name: 'Work' } });

        assert.equal(invalid.restored, false);
        assert.equal(wrongType.restored, false);
        assert.equal(duplicate.restored, false);
        assert.deepEqual(duplicate.data.folderOrder, ['work', 'personal']);
    });
});
