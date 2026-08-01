import { NativeUI } from '../../native_ui.js';
import { createLegacyVariableEditor } from './legacy_variable_editor.js';

let recipeDialogSequence = 0;

function assertDocument(documentRef) {
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new TypeError('Recipes UI requires a DOM document');
    }
    return documentRef;
}

function translate(t, zh, en) {
    return typeof t === 'function' ? t(zh, en) : en;
}

function appendTextElement(documentRef, parent, tag, text, className = '') {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
}

function button(documentRef, label, action, onAction, options = {}) {
    const element = documentRef.createElement('button');
    element.type = options.type || 'button';
    element.className = options.className || 'settings-btn';
    element.textContent = label;
    element.setAttribute('aria-label', options.ariaLabel || label);
    element.addEventListener('click', event => {
        event.stopPropagation?.();
        onAction(action, event);
    });
    return element;
}

function definition(documentRef, list, term, value) {
    appendTextElement(documentRef, list, 'dt', term);
    appendTextElement(documentRef, list, 'dd', value || '—');
}

function displayRecipeList(value, formatter) {
    return value.map(formatter).join('; ');
}

function displayDiffValue(value, field = '') {
    if (value === undefined || value === null || value === '') return '—';
    if (field === 'variables' && Array.isArray(value)) {
        return displayRecipeList(value, variable => `${variable.name}:${variable.type}`);
    }
    if (field === 'steps' && Array.isArray(value)) {
        return displayRecipeList(value, step => `${step.id}: ${String(step.template).slice(0, 80)}`);
    }
    if (field === 'provenance' && typeof value === 'object') {
        const parent = value.parent ? ` · parent ${value.parent.recipeId}@v${value.parent.version}` : '';
        const fork = value.forkedFrom ? ` · fork ${value.forkedFrom.recipeId}@v${value.forkedFrom.version}` : '';
        return `${value.source || 'unknown'}${parent}${fork}`;
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
}

function renderRecipeCard(documentRef, item, onAction, t) {
    const recipe = item.recipe;
    const article = documentRef.createElement('article');
    article.className = 'primer-recipes-card';
    article.setAttribute('data-recipe-id', recipe.id);
    const heading = appendTextElement(documentRef, article, 'h4', recipe.title);
    heading.id = `primer-recipe-${recipe.id}-title`;
    article.setAttribute('aria-labelledby', heading.id);
    appendTextElement(documentRef, article, 'p', `${translate(t, '版本', 'Version')} ${recipe.version}`,
        'primer-recipes-version');
    if (recipe.description) appendTextElement(documentRef, article, 'p', recipe.description);

    const actions = documentRef.createElement('div');
    actions.className = 'primer-recipes-actions';
    actions.append(
        button(documentRef, translate(t, '插入草稿', 'Insert draft'), { type: 'insert', id: recipe.id }, onAction),
        button(documentRef, translate(t, '队列权限预览', 'Preview queue permissions'),
            { type: 'queue-preview', id: recipe.id }, onAction),
        button(documentRef, translate(t, '编辑', 'Edit'), { type: 'edit', id: recipe.id }, onAction),
        button(documentRef, translate(t, '删除', 'Delete'), { type: 'delete', id: recipe.id }, onAction,
            { ariaLabel: `${translate(t, '删除', 'Delete')} ${recipe.title}` })
    );
    article.appendChild(actions);

    const structure = documentRef.createElement('details');
    appendTextElement(documentRef, structure, 'summary', translate(t, '变量、步骤与来源', 'Variables, steps, and provenance'));
    appendTextElement(documentRef, structure, 'h5', translate(t, '变量', 'Variables'));
    if (recipe.variables.length === 0) {
        appendTextElement(documentRef, structure, 'p', translate(t, '无变量', 'No variables'));
    } else {
        const variables = documentRef.createElement('ul');
        for (const variable of recipe.variables) {
            appendTextElement(documentRef, variables, 'li',
                `${variable.name} · ${variable.type}${variable.required ? ' · required' : ''}`);
        }
        structure.appendChild(variables);
    }
    appendTextElement(documentRef, structure, 'h5', translate(t, '有序步骤', 'Ordered steps'));
    const steps = documentRef.createElement('ol');
    for (const step of recipe.steps) appendTextElement(documentRef, steps, 'li', step.title);
    structure.appendChild(steps);
    appendTextElement(documentRef, structure, 'h5', translate(t, '来源', 'Provenance'));
    const provenance = documentRef.createElement('dl');
    definition(documentRef, provenance, translate(t, '来源类型', 'Source'), recipe.provenance.source);
    definition(documentRef, provenance, translate(t, '来源 ID', 'Source ID'), recipe.provenance.sourceId);
    definition(documentRef, provenance, translate(t, '作者', 'Author'), recipe.provenance.author);
    if (recipe.provenance.importedAt) {
        definition(documentRef, provenance, translate(t, '导入时间', 'Imported'), recipe.provenance.importedAt);
    }
    if (recipe.provenance.forkedFrom) {
        definition(documentRef, provenance, translate(t, '分支来源', 'Forked from'),
            `${recipe.provenance.forkedFrom.recipeId}@v${recipe.provenance.forkedFrom.version}`);
    }
    if (recipe.provenance.parent) {
        definition(documentRef, provenance, translate(t, '父版本', 'Parent version'),
            `${recipe.provenance.parent.recipeId}@v${recipe.provenance.parent.version}`);
    }
    structure.appendChild(provenance);
    article.appendChild(structure);

    const history = documentRef.createElement('details');
    appendTextElement(documentRef, history, 'summary', translate(t, '版本历史与差异', 'Version history and diff'));
    const versions = documentRef.createElement('ol');
    for (const version of item.history) {
        appendTextElement(documentRef, versions, 'li',
            `v${version.version} · ${version.updatedAt} · ${version.provenance.source}`);
    }
    history.appendChild(versions);
    if (item.diff?.changed) {
        appendTextElement(documentRef, history, 'h4', translate(t, '变更字段', 'Changed fields'));
        const changes = documentRef.createElement('ul');
        changes.setAttribute('aria-label', translate(t, '最新版本差异', 'Latest version changes'));
        for (const change of item.diff.changes) {
            appendTextElement(documentRef, changes, 'li',
                `${change.field}: ${displayDiffValue(change.before, change.field)} → ${displayDiffValue(change.after, change.field)}`);
        }
        history.appendChild(changes);
    } else {
        appendTextElement(documentRef, history, 'p', translate(t, '暂无版本差异', 'No version diff yet'));
    }
    article.appendChild(history);
    return article;
}

export function renderRecipesManager({ document: documentRef, container, items = [], onAction, t } = {}) {
    const document = assertDocument(documentRef);
    if (!container || typeof container.appendChild !== 'function') throw new TypeError('Recipes manager requires a container');
    if (typeof onAction !== 'function') throw new TypeError('Recipes manager requires onAction');
    container.textContent = '';
    const section = document.createElement('section');
    section.className = 'primer-recipes-manager';
    const heading = appendTextElement(document, section, 'h3', translate(t, '提示词配方', 'Recipes'));
    heading.id = 'primer-recipes-heading';
    section.setAttribute('aria-labelledby', heading.id);
    const toolbar = document.createElement('div');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', translate(t, '配方操作', 'Recipe actions'));
    toolbar.append(
        button(document, translate(t, '新建配方', 'New recipe'), { type: 'create' }, onAction),
        button(document, translate(t, '导入', 'Import'), { type: 'import' }, onAction),
        button(document, translate(t, '导出', 'Export'), { type: 'export' }, onAction)
    );
    section.appendChild(toolbar);
    if (items.length === 0) {
        appendTextElement(document, section, 'p', translate(t, '暂无配方。可导入旧 Prompt Vault 或新建。',
            'No recipes yet. Import Prompt Vault data or create one.'));
    } else {
        for (const item of items) section.appendChild(renderRecipeCard(document, item, onAction, t));
    }
    container.appendChild(section);
    return section;
}

function openDialog({ document: documentRef, mount, title, description, renderBody, onClose, ui = NativeUI }) {
    const document = assertDocument(documentRef);
    if (mount != null && typeof mount.appendChild !== 'function') {
        throw new TypeError('Recipes dialog requires a mount');
    }
    if (!ui || typeof ui.openDialog !== 'function') {
        throw new TypeError('Recipes dialog requires the shared NativeUI dialog capability');
    }
    const staging = document.createElement('section');
    staging.className = 'settings-modal primer-recipes-dialog';
    const heading = appendTextElement(document, staging, 'h2', title);
    const id = `primer-recipes-dialog-${++recipeDialogSequence}`;
    heading.id = `${id}-title`;
    const descriptionElement = appendTextElement(document, staging, 'p', description);
    descriptionElement.id = `${heading.id}-description`;
    let sharedHandle = null;
    const close = reason => sharedHandle.close(reason);
    const closeButton = button(document, '×', 'close', () => close('button'), {
        ariaLabel: 'Close dialog', className: 'settings-close'
    });
    staging.appendChild(closeButton);
    renderBody(staging, close);
    sharedHandle = ui.openDialog({
        id,
        ariaLabel: title,
        overlayClass: 'settings-overlay primer-recipes-dialog-layer',
        contentElement: staging,
        initialFocus: closeButton,
        onClose
    });
    sharedHandle.element.setAttribute('aria-labelledby', heading.id);
    sharedHandle.element.setAttribute('aria-describedby', descriptionElement.id);
    return Object.freeze({
        id: sharedHandle.id,
        element: sharedHandle.element,
        dialog: sharedHandle.element,
        overlay: sharedHandle.overlay,
        get open() { return sharedHandle.open; },
        close
    });
}

function variableControl(document, variable) {
    let control;
    if (variable.type === 'choice') {
        control = document.createElement('select');
        for (const option of variable.options) {
            const element = document.createElement('option');
            element.value = option;
            element.textContent = option;
            control.appendChild(element);
        }
    } else {
        control = document.createElement('input');
        control.type = variable.type === 'number' ? 'number' : variable.type === 'boolean' ? 'checkbox' : 'text';
    }
    control.name = variable.name;
    control.id = `primer-recipe-variable-${variable.name}`;
    control.required = variable.required;
    if (Object.prototype.hasOwnProperty.call(variable, 'default')) {
        if (variable.type === 'boolean') control.checked = variable.default;
        else control.value = String(variable.default);
    }
    return control;
}

function readVariable(control, variable) {
    if (variable.type === 'boolean') return Boolean(control.checked);
    if (variable.type === 'number') return Number(control.value);
    return control.value;
}

export function openRecipeVariablesDialog({ document, mount, recipe, initialValues = {}, onSubmit, onClose, t, ui } = {}) {
    if (!recipe || !Array.isArray(recipe.variables)) throw new TypeError('Variable dialog requires a recipe');
    if (typeof onSubmit !== 'function') throw new TypeError('Variable dialog requires onSubmit');
    return openDialog({
        document,
        mount,
        title: translate(t, '填写配方变量', 'Recipe variables'),
        description: translate(t, '仅生成草稿，不会自动发送。', 'This only prepares a draft and never sends it.'),
        ui,
        onClose,
        renderBody(dialog, close) {
            const form = document.createElement('form');
            const controls = new Map();
            for (const variable of recipe.variables) {
                const label = document.createElement('label');
                label.textContent = variable.label || variable.name;
                const control = variableControl(document, variable);
                if (Object.prototype.hasOwnProperty.call(initialValues, variable.name)) {
                    if (variable.type === 'boolean') control.checked = Boolean(initialValues[variable.name]);
                    else control.value = String(initialValues[variable.name]);
                }
                label.setAttribute('for', control.id);
                form.append(label, control);
                controls.set(variable.name, control);
            }
            form.appendChild(button(document, translate(t, '生成并插入草稿', 'Prepare and insert draft'),
                'submit', () => {}, { type: 'submit' }));
            form.addEventListener('submit', event => {
                event.preventDefault?.();
                const values = {};
                for (const variable of recipe.variables) {
                    values[variable.name] = readVariable(controls.get(variable.name), variable);
                }
                onSubmit(values);
                close('submit');
            });
            dialog.appendChild(form);
        }
    });
}

export function openQueuePermissionPreview({ document, mount, plan, onConfirm, onClose, t, ui } = {}) {
    if (!plan || plan.autoSend !== false || !Array.isArray(plan.steps)) {
        throw new TypeError('Queue preview requires a non-sending rendered recipe plan');
    }
    if (typeof onConfirm !== 'function') throw new TypeError('Queue preview requires onConfirm');
    return openDialog({
        document,
        mount,
        title: translate(t, '队列权限预览', 'Queue permission preview'),
        description: translate(t,
            '此操作只把草稿加入本地队列；队列稍后发送仍需由用户启动。',
            'This only adds drafts to the local queue; sending later still requires the user to start the queue.'),
        ui,
        onClose,
        renderBody(dialog, close) {
            const permissions = document.createElement('ul');
            permissions.setAttribute('aria-label', translate(t, '所需权限', 'Required permissions'));
            const allPermissions = [...new Set([...plan.permissions, 'conversation.send'])].sort();
            for (const permission of allPermissions) appendTextElement(document, permissions, 'li', permission);
            dialog.appendChild(permissions);
            const steps = document.createElement('ol');
            for (const step of plan.steps) appendTextElement(document, steps, 'li', step.title);
            dialog.appendChild(steps);
            dialog.appendChild(button(document, translate(t, '确认加入队列', 'Confirm queue handoff'),
                'confirm', () => { onConfirm(plan); close('confirm'); }));
        }
    });
}

export function openLegacyRecipeEditor({ document, mount, existing = null, onSave, onClose, t, ui } = {}) {
    if (typeof onSave !== 'function') throw new TypeError('Recipe editor requires onSave');
    return openDialog({
        document,
        mount,
        title: existing ? translate(t, '编辑提示词', 'Edit Prompt') : translate(t, '新建提示词', 'New Prompt'),
        description: translate(t, '保存会创建可比较的新版本。', 'Saving creates a diffable version.'),
        ui,
        onClose,
        renderBody(dialog, close) {
            const form = document.createElement('form');
            const fields = [
                ['name', translate(t, '提示词名称', 'Prompt name'), 'input'],
                ['category', translate(t, '分类', 'Category'), 'input'],
                ['shortcut', translate(t, 'Slash 快捷命令', 'Slash shortcut'), 'input'],
                ['content', translate(t, '第一步模板', 'First step template'), 'textarea'],
                ['chainSteps', translate(t, '后续步骤（用 --- 分隔）', 'Later steps (separate with ---)'), 'textarea']
            ];
            const controls = {};
            for (const [name, labelText, tag] of fields) {
                const label = document.createElement('label');
                label.textContent = labelText;
                const control = document.createElement(tag);
                control.name = name;
                control.id = `primer-recipe-editor-${name}`;
                control.value = name === 'chainSteps'
                    ? (existing?.chainSteps || []).join('\n---\n')
                    : existing?.[name] || '';
                if (name === 'name' || name === 'content') control.required = true;
                label.setAttribute('for', control.id);
                form.append(label, control);
                controls[name] = control;
            }
            const variableEditor = createLegacyVariableEditor({
                document,
                container: form,
                variables: existing?.recipeVariables || [],
                t
            });
            const error = document.createElement('p');
            error.setAttribute('role', 'alert');
            error.className = 'primer-recipes-editor-error';
            form.appendChild(error);
            form.appendChild(button(document, translate(t, '保存版本', 'Save version'), 'save', () => {}, { type: 'submit' }));
            form.addEventListener('submit', event => {
                event.preventDefault?.();
                let draft;
                try {
                    draft = {
                        name: controls.name.value.trim() || 'Untitled',
                        category: controls.category.value.trim() || 'General',
                        shortcut: controls.shortcut.value.trim(),
                        content: controls.content.value.trim(),
                        chainSteps: controls.chainSteps.value.split(/\n\s*---+\s*\n/g).map(value => value.trim()).filter(Boolean),
                        recipeVariables: variableEditor.read()
                    };
                    error.textContent = '';
                } catch (saveError) {
                    error.textContent = saveError.message;
                    return;
                }
                if (!draft.content) return;
                onSave(draft);
                close('save');
            });
            dialog.appendChild(form);
        }
    });
}
