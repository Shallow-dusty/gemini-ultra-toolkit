import { NativeUI } from '../../native_ui.js';
import { GeminiAdapter } from '../../adapters/gemini.js';
import { formatLocalDate } from '../../../lib/date_utils.js';
import { annotationToContextReference } from './context_transfer.js';
import { INPUT_STYLE } from './legacy_controls.js';

function backlinkLabel(annotation, summary) {
    return annotation.anchor.kind === 'message'
        ? NativeUI.t(`跳转到消息：${summary}`, `Jump to message: ${summary}`)
        : NativeUI.t(`打开对话：${summary}`, `Open conversation: ${summary}`);
}

function backlinkTitle(annotation) {
    const diagnostics = annotation.anchor.diagnostics || [];
    if (diagnostics.length) {
        return NativeUI.t(
            `消息定位已降级：${diagnostics.join(', ')}`,
            `Message locator is degraded: ${diagnostics.join(', ')}`
        );
    }
    return annotation.anchor.kind === 'message'
        ? NativeUI.t('跳转到已注释消息', 'Jump to annotated message')
        : NativeUI.t('打开注释所属对话', 'Open annotated conversation');
}

/** Owns pinned/search/library rendering plus JSON portability controls. */
export function createAnnotationLibrarySurface(host) {
    return Object.freeze({
        openAnnotationBacklink(annotation) {
            const messageAnchor = annotation.anchor.kind === 'message';
            if (messageAnchor) {
                const locator = {
                    kind: 'message',
                    chatId: annotation.conversation.id,
                    messageId: annotation.anchor.messageId,
                    ordinal: annotation.anchor.ordinal
                };
                try {
                    if (GeminiAdapter.openMessageLocator(locator, {
                        requireStable: annotation.anchor.strategy === 'stable-id'
                    })) return true;
                } catch { /* fall through to the explicit conversation backlink */ }
            }

            const href = annotation.conversation.href;
            let currentChatId = '';
            try { currentChatId = GeminiAdapter.getChatId?.() || ''; }
            catch { /* an unreadable route can still use a stored conversation href */ }
            if (href && (!messageAnchor || currentChatId !== annotation.conversation.id)) {
                window.location.href = href;
                if (messageAnchor) {
                    NativeUI.showToast(NativeUI.t(
                        '精确消息定位不可用，已打开所属对话',
                        'Exact message location is unavailable; opened its conversation instead'
                    ));
                }
                return true;
            }
            NativeUI.showToast(NativeUI.t(
                messageAnchor ? '已保存的消息位置当前不可用' : '注释所属对话链接不可用',
                messageAnchor ? 'The saved message location is currently unavailable' : 'The annotation conversation link is unavailable'
            ));
            return false;
        },

        renderPinnedAnnotations(container) {
            const pinned = host._service?.search({ pinned: true }) || [];
            const title = document.createElement('h3');
            title.className = 'section-title';
            title.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
            const label = document.createElement('span');
            label.textContent = NativeUI.t('置顶注释', 'Pinned annotations');
            title.appendChild(label);
            if (pinned.length) {
                const references = pinned.map(annotationToContextReference);
                title.appendChild(host._makeButton(NativeUI.t('插入包', 'Insert packet'), () => {
                    host._insertPinnedContextPacket(references);
                }, { style: 'padding:6px 10px;' }));
            }
            container.appendChild(title);

            if (!pinned.length) {
                const empty = document.createElement('p');
                empty.className = 'detail-row';
                empty.textContent = NativeUI.t('暂无置顶注释。', 'No pinned annotations yet.');
                container.appendChild(empty);
                return;
            }

            for (const annotation of pinned.slice(0, 8)) {
                const row = document.createElement('div');
                row.className = 'detail-row';
                row.style.cssText = 'display:flex;align-items:center;gap:6px;';
                const text = annotation.body
                    ? `${annotation.conversation.title} — ${annotation.body.slice(0, 48)}`
                    : annotation.conversation.title;
                const navigate = host._makeButton(backlinkLabel(annotation, text), () => {
                    return host._openAnnotationBacklink(annotation);
                }, {
                    title: backlinkTitle(annotation),
                    disabled: annotation.anchor.kind !== 'message' && !annotation.conversation.href,
                    style: 'flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
                });
                row.appendChild(navigate);
                row.appendChild(host._makeContextInsertButton(annotation));
                container.appendChild(row);
            }
        },

        renderSearchResults(container, query) {
            if (typeof container.replaceChildren === 'function') container.replaceChildren();
            else container.textContent = '';
            const results = query.trim() ? host._service.search({ query }) : [];
            if (!query.trim()) return;
            if (!results.length) {
                const empty = document.createElement('p');
                empty.textContent = NativeUI.t('没有匹配的注释。', 'No matching annotations.');
                container.appendChild(empty);
                return;
            }
            for (const annotation of results.slice(0, 12)) {
                const row = document.createElement('div');
                row.className = 'detail-row';
                row.style.cssText = 'display:flex;align-items:center;gap:6px;';
                const summary = annotation.body || annotation.conversation.title;
                row.appendChild(host._makeButton(backlinkLabel(annotation, summary.slice(0, 72)), () => {
                    return host._openAnnotationBacklink(annotation);
                }, {
                    title: backlinkTitle(annotation),
                    disabled: annotation.anchor.kind !== 'message' && !annotation.conversation.href,
                    style: 'flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
                }));
                row.appendChild(host._makeContextInsertButton(annotation));
                container.appendChild(row);
            }
        },

        renderSearch(container) {
            const title = document.createElement('h3');
            title.className = 'section-title';
            title.textContent = NativeUI.t('搜索注释', 'Search annotations');
            container.appendChild(title);
            const input = document.createElement('input');
            input.type = 'search';
            input.style.cssText = INPUT_STYLE;
            input.value = host._searchQuery;
            input.placeholder = NativeUI.t('搜索内容、标题或标签', 'Search text, titles, or tags');
            const results = document.createElement('div');
            results.setAttribute('aria-live', 'polite');
            host._appendField(container, NativeUI.t('搜索', 'Search'), input);
            container.appendChild(results);
            input.oninput = () => {
                host._searchQuery = input.value;
                host._renderSearchResults(results, input.value);
            };
            host._renderSearchResults(results, input.value);
        },

        exportAnnotations() {
            if (!host._service) return;
            const now = new Date();
            const data = host._service.exportJson({ nowIso: now.toISOString() });
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `primer-pp-annotations-${formatLocalDate(now)}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            NativeUI.showToast(NativeUI.t('注释已导出', 'Annotations exported'));
        },

        importAnnotations() {
            if (host._isInspecting()) {
                host._showError({ code: 'READ_ONLY_SESSION' });
                return;
            }
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.setAttribute('aria-label', NativeUI.t('选择注释 JSON 文件', 'Choose annotations JSON file'));
            input.onchange = event => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async loadEvent => {
                    const imported = await host._mutate(
                        context => host._service.importJson(
                            String(loadEvent.target.result || ''),
                            { conflict: 'incoming' },
                            context
                        )
                    );
                    if (imported) NativeUI.showToast(NativeUI.t('注释已导入', 'Annotations imported'));
                };
                reader.onerror = () => NativeUI.showToast(NativeUI.t('读取注释文件失败', 'Could not read annotation file'));
                reader.readAsText(file);
            };
            input.click();
        }
    });
}
