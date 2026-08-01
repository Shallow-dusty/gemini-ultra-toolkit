import { NativeUI } from '../../native_ui.js';
import { INPUT_STYLE, splitTags } from './legacy_controls.js';

/** Owns the current-conversation annotation editor surface. */
export function createConversationAnnotationSurface(host) {
    return Object.freeze({
        renderReadOnlyNotice(container) {
            if (!host._isInspecting()) return;
            const notice = document.createElement('p');
            notice.setAttribute('role', 'status');
            notice.textContent = NativeUI.t(
                '正在检查其他账号；当前账号的注释暂时只读。',
                'You are inspecting another account; annotations for the active account are read-only.'
            );
            notice.style.cssText = 'margin:6px 0;padding:8px;border-radius:8px;background:rgba(253,189,0,.12);font-size:12px;';
            container.appendChild(notice);
        },

        renderCurrentChatEditor(container, current) {
            const title = document.createElement('h3');
            title.className = 'section-title';
            title.textContent = NativeUI.t('当前对话注释', 'Current conversation annotation');
            container.appendChild(title);

            if (!current) {
                const hint = document.createElement('p');
                hint.className = 'detail-row';
                hint.textContent = NativeUI.t('打开一个对话后可保存注释。', 'Open a conversation to save an annotation.');
                container.appendChild(hint);
                return;
            }

            const existing = host._conversationAnnotation(current.id);
            const readOnly = host._isInspecting();
            const header = document.createElement('div');
            header.className = 'detail-row';
            header.style.cssText = 'display:flex;align-items:center;gap:6px;';
            const chatTitle = document.createElement('span');
            chatTitle.textContent = current.title;
            chatTitle.title = current.title;
            chatTitle.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const reference = existing || {
                conversation: { id: current.id, title: current.title, href: current.href },
                body: ''
            };
            header.appendChild(chatTitle);
            header.appendChild(host._makeContextInsertButton(reference));
            header.appendChild(host._makeButton(existing?.pinned ? '★' : '☆', () => {
                return host._mutate(context => host._service.upsert({
                    id: existing?.id,
                    conversation: current,
                    anchor: { kind: 'conversation' },
                    body: existing?.body || '',
                    tags: existing?.tags || [],
                    status: existing?.status || 'active',
                    pinned: !existing?.pinned
                }, context));
            }, {
                title: existing?.pinned
                    ? NativeUI.t('取消置顶注释', 'Unpin annotation')
                    : NativeUI.t('置顶注释', 'Pin annotation'),
                pressed: existing?.pinned === true,
                disabled: readOnly,
                style: 'padding:8px;'
            }));
            container.appendChild(header);

            const noteArea = document.createElement('textarea');
            noteArea.id = host._nextControlId('body');
            noteArea.rows = 4;
            noteArea.style.cssText = `${INPUT_STYLE}resize:vertical;`;
            noteArea.placeholder = NativeUI.t('只保存在此浏览器中的本地注释…', 'Local annotation saved only in this browser…');
            noteArea.value = existing?.body || '';
            noteArea.readOnly = readOnly;
            host._appendField(container, NativeUI.t('注释内容', 'Annotation text'), noteArea);

            const tagsInput = document.createElement('input');
            tagsInput.id = host._nextControlId('tags');
            tagsInput.type = 'text';
            tagsInput.style.cssText = INPUT_STYLE;
            tagsInput.value = existing?.tags?.join(', ') || '';
            tagsInput.placeholder = NativeUI.t('架构, 待办', 'architecture, follow-up');
            tagsInput.readOnly = readOnly;
            host._appendField(
                container,
                NativeUI.t('标签', 'Tags'),
                tagsInput,
                NativeUI.t('使用英文逗号分隔标签', 'Separate tags with commas')
            );

            const statusSelect = document.createElement('select');
            statusSelect.id = host._nextControlId('status');
            statusSelect.style.cssText = INPUT_STYLE;
            statusSelect.disabled = readOnly;
            for (const [value, zh, en] of [
                ['active', '进行中', 'Active'],
                ['resolved', '已解决', 'Resolved'],
                ['archived', '已归档', 'Archived']
            ]) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = NativeUI.t(zh, en);
                option.selected = value === (existing?.status || 'active');
                statusSelect.appendChild(option);
            }
            statusSelect.value = existing?.status || 'active';
            host._appendField(container, NativeUI.t('状态', 'Status'), statusSelect);

            const actions = document.createElement('div');
            actions.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0 12px;';
            actions.appendChild(host._makeButton(NativeUI.t('保存注释', 'Save annotation'), () => {
                return host._mutate(context => host._service.upsert({
                    id: existing?.id,
                    conversation: current,
                    anchor: { kind: 'conversation' },
                    body: noteArea.value,
                    tags: splitTags(tagsInput.value),
                    status: statusSelect.value,
                    pinned: existing?.pinned === true
                }, context), NativeUI.t('注释已保存', 'Annotation saved'));
            }, { disabled: readOnly }));
            actions.appendChild(host._makeButton(NativeUI.t('删除注释', 'Delete annotation'), () => {
                NativeUI.showConfirm(
                    NativeUI.t('删除这条本地注释？', 'Delete this local annotation?'),
                    () => host._mutate(
                        context => host._service.remove(existing.id, context),
                        NativeUI.t('注释已删除', 'Annotation deleted')
                    ),
                    {
                        danger: true,
                        confirmText: NativeUI.t('删除', 'Delete'),
                        ariaLabel: NativeUI.t('确认删除注释', 'Confirm annotation deletion')
                    }
                );
            }, { disabled: readOnly || !existing }));
            actions.appendChild(host._makeButton(NativeUI.t('注释选中文本', 'Annotate selection'), () => {
                host._openSelectionAnnotationDialog(current);
            }, { disabled: readOnly, style: 'grid-column:1 / -1;' }));
            container.appendChild(actions);
        }
    });
}
