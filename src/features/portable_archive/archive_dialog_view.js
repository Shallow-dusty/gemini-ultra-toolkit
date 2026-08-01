import { appendDefinition, appendTextElement } from './archive_dom.js';
import { DIALOG_IDS, SECTION_LABELS, fail } from './feature_contract.js';
import { wireRestoreDialogExecution } from './restore_dialog_execution.js';

export function createArchiveDialogView(options) {
    const document = options.document;
    const translate = options.translate;

    function closeAll(reason) {
        if (!options.closeDialog) return;
        options.closeDialog(DIALOG_IDS.preview, reason);
        options.closeDialog(DIALOG_IDS.restore, reason);
    }

    function requireDocument(message) {
        const documentRef = document();
        if (!documentRef?.createElement) fail('DOM_UNAVAILABLE', message);
        return documentRef;
    }

    function renderPreview(preview) {
        const documentRef = requireDocument('Archive preview requires a DOM document');
        const content = documentRef.createElement('div');
        content.className = 'gc-archive-dialog-content';
        content.style.cssText = 'display:grid;gap:12px;min-width:min(440px,80vw);max-width:640px;';
        appendTextElement(documentRef, content, 'h2', translate('可移植归档预览', 'Portable archive preview'));
        const summary = documentRef.createElement('dl');
        summary.className = 'gc-archive-summary';
        summary.style.cssText = 'display:grid;grid-template-columns:max-content 1fr;gap:6px 12px;margin:0;overflow-wrap:anywhere;';
        appendDefinition(documentRef, summary, translate('创建时间', 'Created'), preview.createdAt);
        appendDefinition(documentRef, summary, translate('条目', 'Entries'), preview.totalEntries);
        appendDefinition(documentRef, summary, translate('大小', 'Size'), `${preview.sizeBytes} bytes`);
        appendDefinition(documentRef, summary, translate('校验和', 'Checksum'), preview.checksum);
        content.appendChild(summary);

        const list = documentRef.createElement('ul');
        list.setAttribute('aria-label', translate('归档内容', 'Archive contents'));
        for (const section of preview.sections) {
            appendTextElement(
                documentRef,
                list,
                'li',
                `${translate(...SECTION_LABELS[section.name])}: ${section.itemCount}`
            );
        }
        content.appendChild(list);
        const close = appendTextElement(documentRef, content, 'button', translate('关闭', 'Close'), 'settings-btn');
        close.type = 'button';
        close.onclick = () => options.closeDialog?.(DIALOG_IDS.preview, 'close-button');
        return { content, close };
    }

    function restoreReason(section) {
        if (section.reason === 'NO_CHANGES') return translate('没有可执行变更', 'No changes to apply');
        if (section.reason === 'MISSING_CONTRIBUTOR') {
            return translate('此功能尚未提供恢复能力', 'Restore contributor unavailable');
        }
        return '';
    }

    function renderResult(documentRef, container, result) {
        container.replaceChildren?.();
        appendTextElement(documentRef, container, 'strong', `${translate('结果', 'Result')}: ${result.status}`);
        const sections = documentRef.createElement('ul');
        sections.setAttribute('aria-label', translate('恢复结果', 'Restore results'));
        for (const section of result.sections || []) {
            appendTextElement(documentRef, sections, 'li', `${section.name}: ${section.status}`);
        }
        container.appendChild(sections);
        if (result.failure) {
            const code = result.failure.code || 'CONTRIBUTOR_FAILURE';
            appendTextElement(documentRef, container, 'p',
                `${translate('失败', 'Failure')} [${code}]: ${result.failure.message}`);
        }
        if (result.rollbackErrors?.length) {
            const failures = documentRef.createElement('ul');
            failures.setAttribute('aria-label', translate('回滚失败', 'Rollback failures'));
            for (const error of result.rollbackErrors) {
                appendTextElement(documentRef, failures, 'li',
                    `${error.section} [${error.code || 'CONTRIBUTOR_FAILURE'}]: ${error.message}`);
            }
            container.appendChild(failures);
        }
    }

    function renderRestore(plan, description) {
        const documentRef = requireDocument('Restore preview requires a DOM document');
        const content = documentRef.createElement('div');
        content.className = 'gc-archive-dialog-content';
        content.style.cssText = 'display:grid;gap:12px;min-width:min(420px,80vw);max-width:640px;';
        appendTextElement(documentRef, content, 'h2', translate('恢复预演', 'Restore dry run'));
        const notice = appendTextElement(
            documentRef,
            content,
            'p',
            translate('此预演不会写入或删除任何数据。', 'This dry run does not write or delete any data.')
        );
        notice.setAttribute('role', 'note');
        const summary = documentRef.createElement('dl');
        summary.style.cssText = 'display:grid;grid-template-columns:max-content 1fr;gap:6px 12px;margin:0;';
        appendDefinition(documentRef, summary, translate('策略', 'Strategy'), plan.strategy);
        appendDefinition(documentRef, summary, translate('新增', 'Insert'), plan.summary.insert);
        appendDefinition(documentRef, summary, translate('跳过', 'Skip'), plan.summary.skip);
        appendDefinition(documentRef, summary, translate('替换', 'Replace'), plan.summary.replace);
        appendDefinition(documentRef, summary, translate('重命名', 'Rename'), plan.summary.rename);
        content.appendChild(summary);
        const list = documentRef.createElement('ul');
        list.setAttribute('aria-label', translate('分区预演', 'Section plan'));
        const checkboxes = new Map();
        for (const section of plan.sections) {
            const capability = description.sections.find(item => item.name === section.name);
            const item = documentRef.createElement('li');
            const label = documentRef.createElement('label');
            const input = documentRef.createElement('input');
            input.type = 'checkbox';
            input.value = section.name;
            input.disabled = !capability.available;
            input.checked = capability.available;
            label.appendChild(input);
            appendTextElement(
                documentRef,
                label,
                'span',
                `${translate(...SECTION_LABELS[section.name])}: ${section.summary.total}`
            );
            const reason = restoreReason(capability);
            if (reason) appendTextElement(documentRef, label, 'small', ` — ${reason}`);
            item.appendChild(label);
            list.appendChild(item);
            checkboxes.set(section.name, input);
        }
        content.appendChild(list);

        const confirmationLabel = documentRef.createElement('label');
        appendTextElement(
            documentRef,
            confirmationLabel,
            'span',
            translate('输入 RESTORE 以确认写入', 'Type RESTORE to confirm writing local data')
        );
        const confirmation = documentRef.createElement('input');
        confirmation.type = 'text';
        confirmation.autocomplete = 'off';
        confirmationLabel.appendChild(confirmation);
        content.appendChild(confirmationLabel);

        const progress = appendTextElement(documentRef, content, 'p', translate('等待确认', 'Awaiting confirmation'));
        progress.setAttribute('role', 'status');
        progress.setAttribute('aria-live', 'polite');
        const journal = documentRef.createElement('ol');
        journal.setAttribute('aria-label', translate('恢复日志', 'Restore journal'));
        content.appendChild(journal);
        const resultContainer = documentRef.createElement('div');
        resultContainer.setAttribute('aria-live', 'polite');
        content.appendChild(resultContainer);

        const resumeGroup = documentRef.createElement('div');
        resumeGroup.style.display = 'none';
        const resumeNotice = appendTextElement(
            documentRef,
            resumeGroup,
            'p',
            translate(
                '失败操作已完整回滚。恢复不会自动重试；输入 RESUME 后再次明确执行。',
                'The failed attempt was fully rolled back. Nothing retries automatically; type RESUME to act explicitly.'
            )
        );
        resumeNotice.setAttribute('role', 'note');
        const resumeLabel = documentRef.createElement('label');
        appendTextElement(documentRef, resumeLabel, 'span', translate('输入 RESUME 以继续', 'Type RESUME to continue'));
        const resumeConfirmation = documentRef.createElement('input');
        resumeConfirmation.type = 'text';
        resumeConfirmation.autocomplete = 'off';
        resumeLabel.appendChild(resumeConfirmation);
        resumeGroup.appendChild(resumeLabel);
        const resume = appendTextElement(documentRef, resumeGroup, 'button', translate('恢复并继续', 'Resume restore'), 'settings-btn');
        resume.type = 'button';
        resume.disabled = true;
        content.appendChild(resumeGroup);

        const actions = documentRef.createElement('div');
        const close = appendTextElement(documentRef, content, 'button', translate('关闭', 'Close'), 'settings-btn');
        close.type = 'button';
        const cancel = appendTextElement(documentRef, actions, 'button', translate('取消恢复', 'Cancel restore'), 'settings-btn');
        cancel.type = 'button';
        cancel.disabled = true;
        const apply = appendTextElement(documentRef, actions, 'button', translate('应用恢复', 'Apply restore'), 'settings-btn');
        apply.type = 'button';
        apply.disabled = true;
        content.appendChild(actions);

        wireRestoreDialogExecution({
            apply,
            cancel,
            close,
            confirmation,
            checkboxes,
            progress,
            resume,
            resumeConfirmation,
            resumeGroup,
            translate,
            appendJournal: message => appendTextElement(documentRef, journal, 'li', message),
            renderResult: result => renderResult(documentRef, resultContainer, result),
            applyRestore: runOptions => options.applyRestore(plan, runOptions),
            resumeRestore: options.resumeRestore,
            getResumeEligibility: options.getResumeEligibility,
            cancelRestore: options.cancelRestore,
            closeDialog: () => options.closeDialog?.(DIALOG_IDS.restore, 'close-button')
        });
        return {
            content,
            close,
            cancel,
            apply,
            resume,
            confirmation,
            resumeConfirmation,
            resumeGroup,
            checkboxes,
            progress,
            journal,
            resultContainer
        };
    }

    function show(id, ariaLabel, rendered) {
        if (!options.openDialog) return null;
        return options.openDialog({
            id,
            ariaLabel,
            contentElement: rendered.content,
            initialFocus: rendered.close,
            replaceExisting: true
        });
    }

    async function showPreview(selection) {
        const result = await options.operations.preview(selection);
        show(
            DIALOG_IDS.preview,
            translate('可移植归档预览', 'Portable archive preview'),
            renderPreview(result.preview)
        );
        return result.preview;
    }

    async function showRestorePlan(text, strategy = 'skip') {
        const plan = await options.operations.planRestoreText(text, strategy);
        const description = await options.describeRestore(plan);
        show(
            DIALOG_IDS.restore,
            translate('恢复预演', 'Restore dry run'),
            renderRestore(plan, description)
        );
        return plan;
    }

    return Object.freeze({ closeAll, renderPreview, renderRestore, showPreview, showRestorePlan });
}
