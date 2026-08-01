import { createButton } from './view_support.js';

const MAX_RENDERED_MATCHES = 100;

export function renderRulePreview({ document: documentRef, translate, preview, handlers }) {
    if (!preview) return null;
    const section = documentRef.createElement('section');
    section.className = 'gc-rule-preview';
    section.setAttribute('aria-label', translate('规则预览', 'Rule preview'));
    const heading = documentRef.createElement('h3');
    heading.textContent = translate('规则预览（仅本地）', 'Rule preview (local only)');
    const summary = documentRef.createElement('p');
    summary.textContent = translate(
        `${preview.matchCount} 个对话匹配；${preview.changeCount} 个本地归属将变更。Gemini 对话和 Notebooks 不会被修改。`,
        `${preview.matchCount} chats match; ${preview.changeCount} local memberships will change. Gemini chats and Notebooks will not be modified.`
    );
    const source = documentRef.createElement('p');
    source.textContent = translate(
        `可见对话 ${preview.visibleMatchedChatIds.length}；本地归档 ${preview.archiveMatchedChatIds.length}。`,
        `Visible matches: ${preview.visibleMatchedChatIds.length}; local archive matches: ${preview.archiveMatchedChatIds.length}.`
    );
    section.append(heading, summary, source);
    const list = documentRef.createElement('ul');
    for (const match of preview.matches.slice(0, MAX_RENDERED_MATCHES)) {
        const item = documentRef.createElement('li');
        item.textContent = `${match.chatId} → ${match.matchedCollectionIds.join(', ')}`;
        list.appendChild(item);
    }
    section.appendChild(list);
    if (preview.matches.length > MAX_RENDERED_MATCHES) {
        const remainder = documentRef.createElement('p');
        remainder.textContent = translate(
            `另有 ${preview.matches.length - MAX_RENDERED_MATCHES} 个匹配；完整 ID 保留在预览结果中。`,
            `${preview.matches.length - MAX_RENDERED_MATCHES} more matches; the preview result retains every exact ID.`
        );
        section.appendChild(remainder);
    }
    const actions = documentRef.createElement('div');
    actions.className = 'gc-collection-actions';
    if (preview.changeCount > 0) {
        actions.appendChild(createButton(
            documentRef,
            translate(`确认应用 ${preview.changeCount} 项本地变更`, `Confirm ${preview.changeCount} local changes`),
            handlers.onApplyRulePreview
        ));
    }
    actions.appendChild(createButton(documentRef, translate('清除预览', 'Clear preview'), handlers.onCancelRulePreview));
    section.appendChild(actions);
    return section;
}
