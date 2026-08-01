/** Owns the explicit Apply/Cancel/Resume interaction state for a restore dialog. */
export function wireRestoreDialogExecution(options) {
    const {
        apply, cancel, close, confirmation, checkboxes, progress,
        resume, resumeConfirmation, resumeGroup, translate
    } = options;
    let attempted = false;
    let running = false;
    let resumeToken = null;

    function selected() {
        return [...checkboxes]
            .filter(([, input]) => input.checked && !input.disabled)
            .map(([name]) => name);
    }

    function updateApply() {
        apply.disabled = attempted || running || confirmation.value !== 'RESTORE' || selected().length === 0;
    }

    function updateResume() {
        resume.disabled = running || resumeToken === null || resumeConfirmation.value !== 'RESUME';
    }

    function clearResume() {
        resumeToken = null;
        resumeConfirmation.value = '';
        resumeGroup.style.display = 'none';
        updateResume();
    }

    function exposeResume(error) {
        const eligibility = error?.resumeEligibility
            ?? options.getResumeEligibility?.(error?.resumeToken);
        if (!eligibility?.eligible || !eligibility.token) {
            clearResume();
            return false;
        }
        resumeToken = eligibility.token;
        resumeConfirmation.value = '';
        resumeGroup.style.display = '';
        updateResume();
        return true;
    }

    function onProgress(entry) {
        const section = entry.section ? ` ${entry.section}` : '';
        const message = `${entry.phase}:${entry.status}${section}`;
        progress.textContent = message;
        options.appendJournal(message);
    }

    async function runAttempt(invoke) {
        running = true;
        apply.disabled = true;
        resume.disabled = true;
        cancel.disabled = false;
        close.disabled = true;
        progress.setAttribute('role', 'status');
        progress.textContent = translate('正在应用…', 'Applying restore…');
        let result = null;
        try {
            result = await invoke(onProgress);
            clearResume();
            progress.textContent = translate('恢复完成', 'Restore completed');
            options.renderResult(result);
        } catch (error) {
            const resumable = exposeResume(error);
            progress.textContent = resumable
                ? translate(
                    '恢复失败，但已完整回滚。请检查结果并输入 RESUME 后明确继续。',
                    'Restore failed, but rollback completed. Review the result and type RESUME to continue explicitly.'
                )
                : error?.result?.rollbackErrors?.length
                    ? translate('恢复失败且回滚不完整，禁止继续。', 'Restore failed and rollback is incomplete; resume is blocked.')
                    : error?.message || String(error);
            progress.setAttribute('role', 'alert');
            if (error?.result) options.renderResult(error.result);
        } finally {
            running = false;
            cancel.disabled = true;
            close.disabled = false;
            updateApply();
            updateResume();
        }
        return result;
    }

    confirmation.oninput = updateApply;
    resumeConfirmation.oninput = updateResume;
    for (const input of checkboxes.values()) input.onchange = updateApply;
    close.onclick = () => {
        if (!running) options.closeDialog();
    };
    cancel.onclick = () => {
        const cancelled = options.cancelRestore('user-cancel');
        if (cancelled) progress.textContent = translate('正在取消并回滚…', 'Cancelling and rolling back…');
        return cancelled;
    };
    apply.onclick = async () => {
        updateApply();
        if (apply.disabled) return null;
        attempted = true;
        return runAttempt(onProgressHandler => options.applyRestore({
            sections: selected(),
            onProgress: onProgressHandler
        }));
    };
    resume.onclick = async () => {
        updateResume();
        if (resume.disabled) return null;
        const eligibility = options.getResumeEligibility?.(resumeToken);
        if (!eligibility?.eligible) {
            clearResume();
            progress.textContent = translate('继续令牌已失效。', 'Resume token is no longer valid.');
            progress.setAttribute('role', 'alert');
            return null;
        }
        const token = resumeToken;
        clearResume();
        return runAttempt(onProgressHandler => options.resumeRestore(token, { onProgress: onProgressHandler }));
    };
    updateApply();
    updateResume();

    return Object.freeze({
        get running() { return running; },
        selected,
        updateApply,
        updateResume
    });
}
