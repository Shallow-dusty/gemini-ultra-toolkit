import { PORTABLE_ARCHIVE_SECTIONS } from './constants.js';
import { appendTextElement } from './archive_dom.js';
import {
    DEFAULT_SELECTION,
    SECTION_LABELS,
    fail,
    normalizeSelection
} from './feature_contract.js';

export function createArchiveControlsView(options) {
    const translate = options.translate;

    function selectedFrom(checkboxes) {
        return PORTABLE_ARCHIVE_SECTIONS.filter(name => {
            const input = checkboxes.get(name);
            return input.checked && !input.disabled;
        });
    }

    function setStatus(status, message, error = false) {
        status.textContent = message;
        status.setAttribute('role', error ? 'alert' : 'status');
    }

    async function runControl(status, action, successMessage) {
        setStatus(status, translate('处理中…', 'Working…'));
        try {
            const result = await action();
            setStatus(status, successMessage);
            options.notify(successMessage, { error: false });
            return result;
        } catch (error) {
            const message = error?.message || String(error);
            setStatus(status, message, true);
            options.notify(message, { error: true, code: error?.code || null });
            return null;
        }
    }

    function build(container, mountOptions) {
        const documentRef = options.document(container);
        if (!documentRef?.createElement || typeof container?.appendChild !== 'function') {
            fail('DOM_UNAVAILABLE', 'Portable Archive mount requires a DOM container');
        }
        const root = documentRef.createElement('section');
        root.className = 'gf-section gc-archive-controls';
        root.setAttribute('data-primer-archive-controls', '');
        appendTextElement(documentRef, root, 'h3', translate('可移植归档', 'Portable Archive'), 'section-title');

        const includeGroup = documentRef.createElement('fieldset');
        includeGroup.style.cssText = 'border:0;margin:0;padding:0;display:grid;gap:6px;';
        const legend = appendTextElement(documentRef, includeGroup, 'legend', translate('包含内容', 'Include'));
        legend.className = 'section-title';
        const checkboxes = new Map();
        const availabilityReasons = new Map();
        const selectedByDefault = normalizeSelection(mountOptions.defaultSelection ?? DEFAULT_SELECTION);
        let availabilityState = [];
        for (const name of PORTABLE_ARCHIVE_SECTIONS) {
            const label = documentRef.createElement('label');
            label.className = 'gc-archive-option';
            label.style.cssText = 'display:flex;align-items:center;gap:8px;min-height:32px;cursor:pointer;';
            const input = documentRef.createElement('input');
            input.type = 'checkbox';
            input.name = 'primer-archive-section';
            input.value = name;
            input.checked = selectedByDefault.includes(name);
            input.disabled = true;
            label.appendChild(input);
            appendTextElement(documentRef, label, 'span', translate(...SECTION_LABELS[name]));
            const reason = appendTextElement(documentRef, label, 'span', '', 'gc-archive-option-reason');
            reason.style.cssText = 'font-size:12px;color:var(--text-sub);';
            includeGroup.appendChild(label);
            checkboxes.set(name, input);
            availabilityReasons.set(name, reason);
        }
        root.appendChild(includeGroup);

        const actionRow = documentRef.createElement('div');
        actionRow.className = 'gc-archive-actions';
        actionRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
        const previewButton = appendTextElement(documentRef, actionRow, 'button', translate('预览归档', 'Preview archive'), 'settings-btn');
        previewButton.type = 'button';
        const downloadButton = appendTextElement(documentRef, actionRow, 'button', translate('下载归档', 'Download archive'), 'settings-btn');
        downloadButton.type = 'button';
        root.appendChild(actionRow);

        const restoreGroup = documentRef.createElement('fieldset');
        restoreGroup.style.cssText = 'border:0;margin:12px 0 0;padding:0;display:grid;gap:8px;';
        appendTextElement(documentRef, restoreGroup, 'legend', translate('恢复预演', 'Restore dry run'), 'section-title');
        const fileLabel = documentRef.createElement('label');
        fileLabel.style.cssText = 'display:grid;gap:4px;';
        appendTextElement(documentRef, fileLabel, 'span', translate('归档文件', 'Archive file'));
        const fileInput = documentRef.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileLabel.appendChild(fileInput);
        restoreGroup.appendChild(fileLabel);

        const strategyLabel = documentRef.createElement('label');
        strategyLabel.style.cssText = 'display:grid;gap:4px;';
        appendTextElement(documentRef, strategyLabel, 'span', translate('冲突策略', 'Conflict strategy'));
        const strategy = documentRef.createElement('select');
        for (const value of ['skip', 'replace', 'rename']) {
            const option = documentRef.createElement('option');
            option.value = value;
            option.textContent = value;
            strategy.appendChild(option);
        }
        strategy.value = 'skip';
        strategyLabel.appendChild(strategy);
        restoreGroup.appendChild(strategyLabel);
        const planButton = appendTextElement(documentRef, restoreGroup, 'button', translate('生成恢复预演', 'Preview restore'), 'settings-btn');
        planButton.type = 'button';
        root.appendChild(restoreGroup);

        const status = appendTextElement(documentRef, root, 'p', translate('就绪', 'Ready'), 'gc-archive-status');
        status.style.cssText = 'min-height:1.4em;margin:8px 0 0;color:var(--text-sub);overflow-wrap:anywhere;';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const ready = options.operations.inspectAvailability().then(availability => {
            availabilityState = availability;
            for (const item of availability) {
                const input = checkboxes.get(item.name);
                input.disabled = !item.available;
                if (!item.available) input.checked = false;
                availabilityReasons.get(item.name).textContent = item.available
                    ? ''
                    : translate('不可用', `Unavailable: ${item.reason}`);
            }
            return availability;
        }).catch(error => {
            if (error?.code !== 'OPERATION_CANCELLED') setStatus(status, error?.message || String(error), true);
            return [];
        });

        function selectedForAction() {
            const selected = selectedFrom(checkboxes);
            if (selected.length) return selected;
            const unavailableDefault = availabilityState.find(
                item => selectedByDefault.includes(item.name) && !item.available
            );
            if (unavailableDefault) {
                fail('SECTION_UNAVAILABLE', unavailableDefault.reason, { section: unavailableDefault.name });
            }
            return selected;
        }

        previewButton.onclick = () => runControl(
            status,
            async () => {
                await ready;
                return options.dialogs.showPreview(selectedForAction());
            },
            translate('归档预览已生成', 'Archive preview ready')
        );
        downloadButton.onclick = () => runControl(
            status,
            async () => {
                await ready;
                return options.operations.download(selectedForAction());
            },
            translate('归档已下载', 'Archive downloaded')
        );
        planButton.onclick = () => runControl(status, async () => {
            await ready;
            const file = fileInput.files?.[0];
            if (!file || typeof file.text !== 'function') {
                fail('NO_FILE', 'Choose a portable archive file first');
            }
            return options.dialogs.showRestorePlan(await file.text(), strategy.value);
        }, translate('恢复预演已生成', 'Restore plan ready'));

        container.appendChild(root);
        return {
            root,
            checkboxes,
            availabilityReasons,
            previewButton,
            downloadButton,
            fileInput,
            strategy,
            planButton,
            status,
            ready
        };
    }

    return Object.freeze({ build, runControl, selectedFrom, setStatus });
}
