import { normalizeConversation } from './snapshot.js';

const CONTROL_STYLE = 'min-width:44px;min-height:44px;font:inherit;';

export function defaultTranslate(zh, en) {
    return globalThis.navigator?.language?.toLowerCase().startsWith('zh') ? zh : en;
}

export function makeButton(documentRef, label, onPress, { danger = false, disabled = false } = {}) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = danger ? 'g-btn danger' : 'g-btn';
    button.style.cssText = CONTROL_STYLE;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', event => {
        event.stopPropagation?.();
        if (!button.disabled) onPress(event);
    });
    return button;
}

export function appendText(documentRef, parent, tag, text) {
    const element = documentRef.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
}

function statusText(status, t) {
    const labels = {
        pending: t('等待', 'Pending'),
        verifying: t('校验快照', 'Verifying snapshot'),
        deleting: t('正在删除', 'Deleting'),
        deleted: t('已删除', 'Deleted'),
        failed: t('失败', 'Failed'),
        stale: t('快照已变化，未删除', 'Snapshot changed; not deleted'),
        cancelled: t('已取消', 'Cancelled'),
        skipped: t('已跳过', 'Skipped')
    };
    return labels[status];
}

export class BulkLifecycleView {
    constructor({ document: documentRef, translate = defaultTranslate } = {}) {
        if (!documentRef || typeof documentRef.createElement !== 'function') {
            throw new TypeError('BulkLifecycleView requires a document');
        }
        if (typeof translate !== 'function') throw new TypeError('BulkLifecycleView translate must be a function');
        this.document = documentRef;
        this.t = translate;
    }

    createChoice(item, { checked, disabled, onChange }) {
        const normalized = normalizeConversation(item);
        const label = this.document.createElement('label');
        label.className = 'primer-bulk-choice';
        label.setAttribute('data-primer-sidebar-control', 'bulk-lifecycle');
        label.style.cssText = 'display:flex;align-items:center;gap:8px;min-height:44px;';
        const input = this.document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.disabled = disabled;
        input.setAttribute('aria-label', this.t(
            `选择对话：${normalized.title}`,
            `Select conversation: ${normalized.title}`
        ));
        // Gemini renders each recent conversation as a link. Cancel the link's
        // default navigation and own checkbox activation explicitly so a
        // selection cannot invalidate the captured scope.
        label.addEventListener('click', event => {
            event.stopPropagation?.();
            if (event.target !== input) {
                event.preventDefault?.();
                onChange(!input.checked);
            }
        });
        const text = this.document.createElement('span');
        text.textContent = normalized.title;
        text.title = normalized.title;
        text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        input.addEventListener('click', event => {
            const selected = Boolean(input.checked);
            event.preventDefault?.();
            event.stopPropagation?.();
            onChange(selected);
        });
        input.addEventListener('change', event => {
            event.stopPropagation?.();
            onChange(Boolean(input.checked));
        });
        label.append(input, text);
        return { label, input };
    }

    createToolbar({ selectionMode, active, selectedCount }, handlers) {
        const toolbar = this.document.createElement('div');
        toolbar.id = 'gc-batch-toolbar';
        toolbar.className = 'gc-sidebar-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', this.t('批量生命周期', 'Bulk lifecycle'));
        if (!selectionMode) {
            toolbar.append(makeButton(
                this.document,
                this.t('管理当前可见对话', 'Manage visible conversations'),
                handlers.enter
            ));
            return toolbar;
        }

        toolbar.className += ' gc-sidebar-toolbar-active';
        toolbar.append(makeButton(
            this.document,
            this.t('全选当前可见范围', 'Select all visible'),
            handlers.selectAll,
            { disabled: active }
        ));
        toolbar.append(makeButton(
            this.document,
            this.t('清除选择', 'Clear selection'),
            handlers.clear,
            { disabled: active || selectedCount === 0 }
        ));
        toolbar.append(makeButton(
            this.document,
            active
                ? this.t('中止当前任务', 'Cancel current run')
                : this.t(`预览 ${selectedCount} 项`, `Preview ${selectedCount}`),
            active ? handlers.cancelRun : handlers.preview,
            { danger: true, disabled: !active && selectedCount === 0 }
        ));
        if (!active) {
            toolbar.append(makeButton(this.document, this.t('退出', 'Exit'), handlers.exit));
        }
        return toolbar;
    }

    _appendReport(parent, report, active, cancelRun) {
        if (!report) return;
        const section = this.document.createElement('section');
        section.className = 'primer-bulk-report';
        appendText(this.document, section, 'h3', this.t('逐项结果', 'Per-item results'));
        const summary = appendText(
            this.document,
            section,
            'p',
            this.t(
                `阶段：${report.phase}；删除 ${report.deleted}，失败 ${report.failed}，变化 ${report.stale}，取消 ${report.cancelled}。`,
                `Phase: ${report.phase}; deleted ${report.deleted}, failed ${report.failed}, stale ${report.stale}, cancelled ${report.cancelled}.`
            )
        );
        summary.setAttribute('role', report.failed ? 'alert' : 'status');
        summary.setAttribute('aria-live', 'polite');
        appendText(
            this.document,
            section,
            'p',
            this.t(`归档：${report.archive.status}`, `Archive: ${report.archive.status}`)
        );
        const list = this.document.createElement('ul');
        for (const item of report.items) {
            appendText(
                this.document,
                list,
                'li',
                `${item.title} — ${statusText(item.status, this.t)}${item.error ? ` (${item.error})` : ''}`
            );
        }
        section.append(list);
        if (active) {
            section.append(makeButton(
                this.document,
                this.t('中止当前任务', 'Cancel current run'),
                cancelRun,
                { danger: true }
            ));
        }
        parent.append(section);
    }

    createDetails({ items, scope, selection, report, active }, handlers) {
        const root = this.document.createElement('section');
        root.className = 'gf-section primer-bulk-lifecycle';
        appendText(this.document, root, 'h2', this.t('批量生命周期', 'Bulk lifecycle'));
        appendText(
            this.document,
            root,
            'p',
            this.t(`选择范围：${scope.label}`, `Selection scope: ${scope.label}`)
        );
        const fieldset = this.document.createElement('fieldset');
        const legend = this.document.createElement('legend');
        legend.textContent = this.t('当前侧栏可见对话', 'Conversations visible in the current sidebar');
        fieldset.append(legend);
        if (items.length === 0) {
            appendText(this.document, fieldset, 'p', this.t('当前范围没有对话。', 'No conversations are in this scope.'));
        } else {
            for (const item of items) {
                fieldset.append(this.createChoice(item, {
                    checked: selection.has(item.id),
                    disabled: active,
                    onChange: selected => handlers.select(item, selected)
                }).label);
            }
        }
        root.append(fieldset);
        const actions = this.document.createElement('div');
        actions.className = 'primer-bulk-actions';
        actions.append(makeButton(
            this.document,
            this.t('全选当前可见范围', 'Select all visible'),
            handlers.selectAll,
            { disabled: active || items.length === 0 }
        ));
        actions.append(makeButton(
            this.document,
            this.t('取消全选', 'Deselect all'),
            handlers.clear,
            { disabled: active || selection.size === 0 }
        ));
        actions.append(makeButton(
            this.document,
            this.t(`预览 ${selection.size} 项`, `Preview ${selection.size}`),
            handlers.preview,
            { danger: true, disabled: active || selection.size === 0 }
        ));
        root.append(actions);
        this._appendReport(root, report, active, handlers.cancelRun);
        return root;
    }
}
