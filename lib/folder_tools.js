function toId(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function toNullableFolderId(value) {
    const id = toId(value);
    return id || null;
}

function cloneFolderData(data) {
    const source = data && typeof data === 'object' ? data : {};
    const rawFolders = source.folders && typeof source.folders === 'object' ? source.folders : {};
    const folders = {};
    Object.entries(rawFolders).forEach(([id, folder]) => {
        folders[id] = folder && typeof folder === 'object' ? { ...folder } : folder;
    });
    const chatToFolder = source.chatToFolder && typeof source.chatToFolder === 'object' ? { ...source.chatToFolder } : {};
    const folderOrder = Array.isArray(source.folderOrder) ? [...source.folderOrder] : Object.keys(folders);
    return { folders, chatToFolder, folderOrder };
}

function getNowIso(opts = {}) {
    return opts.nowIso || new Date().toISOString();
}

function getCurrentFolderId(chatToFolder, chatId) {
    return Object.prototype.hasOwnProperty.call(chatToFolder, chatId) ? chatToFolder[chatId] : null;
}

function normalizeChatIds(chatIds) {
    const raw = Array.isArray(chatIds) ? chatIds : [chatIds];
    const seen = new Set();
    return raw
        .map(toId)
        .filter(id => {
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
}

function moveChatsToFolderForUndo(data, chatIds, targetFolderId, opts = {}) {
    const next = cloneFolderData(data);
    const targetId = toNullableFolderId(targetFolderId);
    if (targetId !== null && !next.folders[targetId]) {
        return { data: next, undo: null };
    }

    const entries = [];
    normalizeChatIds(chatIds).forEach(chatId => {
        const previousFolderId = getCurrentFolderId(next.chatToFolder, chatId);
        if (previousFolderId === targetId) return;

        if (targetId === null) {
            delete next.chatToFolder[chatId];
        } else {
            next.chatToFolder[chatId] = targetId;
        }
        entries.push({ chatId, previousFolderId, nextFolderId: targetId });
    });

    if (entries.length === 0) return { data: next, undo: null };
    return {
        data: next,
        undo: {
            type: 'folder-move',
            movedAt: getNowIso(opts),
            targetFolderId: targetId,
            entries
        }
    };
}

function restoreFolderMove(data, undo) {
    const next = cloneFolderData(data);
    if (!undo || undo.type !== 'folder-move' || !Array.isArray(undo.entries)) {
        return { data: next, restored: false, restoredCount: 0, skippedCount: 0 };
    }

    let restoredCount = 0;
    let skippedCount = 0;
    undo.entries.forEach(entry => {
        const chatId = toId(entry.chatId);
        const previousFolderId = toNullableFolderId(entry.previousFolderId);
        const nextFolderId = toNullableFolderId(entry.nextFolderId);
        const currentFolderId = chatId ? getCurrentFolderId(next.chatToFolder, chatId) : null;
        const canRestoreTarget = previousFolderId === null || Boolean(next.folders[previousFolderId]);

        if (!chatId || currentFolderId !== nextFolderId || !canRestoreTarget) {
            skippedCount++;
            return;
        }

        if (previousFolderId === null) {
            delete next.chatToFolder[chatId];
        } else {
            next.chatToFolder[chatId] = previousFolderId;
        }
        restoredCount++;
    });

    return {
        data: next,
        restored: restoredCount > 0,
        restoredCount,
        skippedCount
    };
}

function deleteFolderForUndo(data, folderId, opts = {}) {
    const next = cloneFolderData(data);
    const id = toId(folderId);
    if (!id || !next.folders[id]) {
        return { data: next, undo: null };
    }

    const assignments = Object.entries(next.chatToFolder)
        .filter(([, assignedFolderId]) => assignedFolderId === id)
        .map(([chatId]) => ({ chatId, folderId: id }));
    assignments.forEach(({ chatId }) => {
        delete next.chatToFolder[chatId];
    });

    const folder = { ...next.folders[id] };
    const restoreIndex = next.folderOrder.indexOf(id);
    delete next.folders[id];
    next.folderOrder = next.folderOrder.filter(existingId => existingId !== id);

    return {
        data: next,
        undo: {
            type: 'folder-delete',
            deletedAt: getNowIso(opts),
            folderId: id,
            folder,
            restoreIndex,
            assignments
        }
    };
}

function restoreDeletedFolder(data, undo) {
    const next = cloneFolderData(data);
    const folderId = toId(undo && undo.folderId);
    const folder = undo && undo.folder && typeof undo.folder === 'object' ? undo.folder : null;
    if (!undo || undo.type !== 'folder-delete' || !folderId || !folder || next.folders[folderId]) {
        return { data: next, restored: false, restoredAssignments: 0, skippedAssignments: 0 };
    }

    next.folders[folderId] = { ...folder };
    const rawIndex = Number(undo.restoreIndex);
    const restoreIndex = Number.isInteger(rawIndex)
        ? Math.max(0, Math.min(rawIndex, next.folderOrder.length))
        : next.folderOrder.length;
    const order = next.folderOrder.filter(id => id !== folderId);
    order.splice(restoreIndex, 0, folderId);
    next.folderOrder = order;

    let restoredAssignments = 0;
    let skippedAssignments = 0;
    const assignments = Array.isArray(undo.assignments) ? undo.assignments : [];
    assignments.forEach(entry => {
        const chatId = toId(entry.chatId);
        const currentFolderId = chatId ? getCurrentFolderId(next.chatToFolder, chatId) : null;
        if (!chatId || (currentFolderId !== null && Boolean(next.folders[currentFolderId]))) {
            skippedAssignments++;
            return;
        }

        next.chatToFolder[chatId] = folderId;
        restoredAssignments++;
    });

    return {
        data: next,
        restored: true,
        restoredAssignments,
        skippedAssignments
    };
}

module.exports = {
    cloneFolderData,
    deleteFolderForUndo,
    moveChatsToFolderForUndo,
    restoreDeletedFolder,
    restoreFolderMove
};
