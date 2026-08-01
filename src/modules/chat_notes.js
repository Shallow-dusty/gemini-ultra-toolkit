/**
 * Stable v12 import path for the v13 Annotations vertical slice.
 *
 * Compatibility contracts retained by the implementation:
 * - NativeUI.t('对话笔记', 'Chat Notes') remains its legacy display alias.
 * - formatContextPacket is owned by _insertPinnedContextPacket.
 * - "Pinned Gemini context packet" remains explicit and local.
 * - packet creation is bounded with notes.slice(0, 8).
 */
export { ChatNotesModule } from '../features/annotations/legacy_chat_notes_module.js';
