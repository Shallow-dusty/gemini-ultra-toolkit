const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    cloneFolderData,
    createFolderExport,
    deleteFolderForUndo,
    mergeFolderImport,
    moveChatsToFolderForUndo,
    normalizeFolderData,
    restoreDeletedFolder,
    restoreFolderMove,
    serializeFolderExport
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

    it('normalizes folder exports with safe colors, rules, order, and assignments', () => {
        const normalized = normalizeFolderData({
            folders: {
                work: {
                    name: '  Work  ',
                    color: 'javascript:red',
                    collapsed: true,
                    pinned: true,
                    rules: [
                        { type: 'regex', value: 'K8s.*' },
                        { type: 'bad', value: '  docs  ' },
                        { type: 'keyword', value: '' },
                        'bad'
                    ]
                },
                '': { name: 'Missing ID' },
                extra: { name: '', color: '#abc' },
                raw: 'bad'
            },
            chatToFolder: {
                c1: 'work',
                c2: 'missing',
                '': 'work'
            },
            folderOrder: ['missing', 'work', 'work']
        });

        assert.deepEqual(normalized.folderOrder, ['work', 'extra', 'raw']);
        assert.equal(normalized.folders.work.name, 'Work');
        assert.equal(normalized.folders.work.color, '#8ab4f8');
        assert.equal(normalized.folders.work.collapsed, true);
        assert.equal(normalized.folders.work.pinned, true);
        assert.deepEqual(normalized.folders.work.rules, [
            { type: 'regex', value: 'K8s.*' },
            { type: 'keyword', value: 'docs' }
        ]);
        assert.equal(normalized.folders.extra.name, 'Folder 3');
        assert.equal(normalized.folders.extra.color, '#abc');
        assert.equal(normalized.folders.raw.name, 'Folder 4');
        assert.deepEqual(normalized.chatToFolder, { c1: 'work' });
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

    it('creates and serializes versioned folder exports', () => {
        const payload = createFolderExport(sampleData(), { nowIso });
        const serialized = serializeFolderExport(sampleData(), { nowIso });
        const parsed = JSON.parse(serialized);

        assert.equal(payload.schema, 'primer-pp.folders');
        assert.equal(payload.version, 1);
        assert.equal(payload.exportedAt, nowIso);
        assert.equal(payload.app, 'Primer++ for Gemini');
        assert.deepEqual(payload.folderOrder, ['work', 'personal']);
        assert.equal(payload.chatToFolder.stale, undefined);
        assert.equal(parsed.schema, 'primer-pp.folders');
        assert.ok(serialized.includes('\n  "folders"'));

        const generated = createFolderExport({ folders: { a: { name: 'A' } } });
        assert.match(generated.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('merges folder imports while remapping duplicate folder ids and assignments', () => {
        const result = mergeFolderImport(sampleData(), {
            schema: 'primer-pp.folders',
            version: 1,
            folders: {
                work: { name: 'Imported Work', color: '#f28b82', rules: [{ type: 'keyword', value: 'ops' }] },
                archive: { name: 'Archive', color: '#fdd663' }
            },
            folderOrder: ['work', 'archive'],
            chatToFolder: {
                c1: 'work',
                c4: 'archive',
                c5: 'missing'
            }
        }, {
            idFactory: (_folder, index) => `imported_${index}`
        });

        assert.equal(result.importedFolders, 2);
        assert.equal(result.importedAssignments, 2);
        assert.deepEqual(result.data.folderOrder, ['work', 'personal', 'imported_0', 'archive']);
        assert.equal(result.data.folders.imported_0.name, 'Imported Work');
        assert.equal(result.data.folders.imported_0.rules[0].value, 'ops');
        assert.equal(result.data.chatToFolder.c1, 'imported_0');
        assert.equal(result.data.chatToFolder.c4, 'archive');
        assert.equal(result.data.chatToFolder.c2, 'personal');
    });

    it('handles empty folder imports and default import ids', () => {
        const empty = mergeFolderImport(sampleData(), null, { nowIso });
        assert.equal(empty.importedFolders, 0);
        assert.equal(empty.importedAssignments, 0);
        assert.deepEqual(empty.data.folderOrder, ['work', 'personal']);

        const duplicated = mergeFolderImport({ folders: { work: { name: 'Work' } }, chatToFolder: {}, folderOrder: ['work'] }, {
            folders: { work: { name: 'Imported' } },
            chatToFolder: { c1: 'work' },
            folderOrder: ['work']
        });
        const importedId = duplicated.data.folderOrder[1];
        assert.match(importedId, /^folder_\d+_0/);
        assert.equal(duplicated.data.chatToFolder.c1, importedId);

        const fallbackId = mergeFolderImport({ folders: { work: { name: 'Work' } }, chatToFolder: {}, folderOrder: ['work'] }, {
            folders: { work: { name: 'Imported' } },
            chatToFolder: {},
            folderOrder: ['work']
        }, {
            idFactory: () => ''
        }).data.folderOrder[1];
        assert.match(fallbackId, /^folder_\d+_0/);
    });

    it('adds copy suffixes when import id factories collide repeatedly', () => {
        const result = mergeFolderImport({
            folders: {
                work: { name: 'Work' },
                copy: { name: 'Copy' },
                copy_copy: { name: 'Copy Copy' }
            },
            chatToFolder: {},
            folderOrder: ['work', 'copy', 'copy_copy']
        }, {
            folders: { work: { name: 'Imported' } },
            folderOrder: ['work'],
            chatToFolder: {}
        }, {
            idFactory: () => 'copy'
        });

        assert.equal(result.data.folderOrder[3], 'copy_copy_copy');
        assert.equal(result.data.folders.copy_copy_copy.name, 'Imported');
    });
});
