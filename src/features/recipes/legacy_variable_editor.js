const VARIABLE_TYPES = ['text', 'number', 'boolean', 'choice'];
const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

function translate(t, zh, en) {
    return typeof t === 'function' ? t(zh, en) : en;
}

function labeledControl(document, row, labelText, control) {
    const label = document.createElement('label');
    label.textContent = labelText;
    label.setAttribute('for', control.id);
    row.append(label, control);
    return control;
}

function textInput(document, id, name, value = '') {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.name = name;
    input.value = value;
    return input;
}

function parseDefault(type, control, enabled, options) {
    if (!enabled.checked) return {};
    if (type === 'boolean') return { default: control.checked };
    if (type === 'number') {
        const value = Number(control.value);
        if (!Number.isFinite(value)) throw new TypeError('Number variable defaults must be finite numbers');
        return { default: value };
    }
    if (type === 'choice' && !options.includes(control.value)) {
        throw new TypeError('Choice variable defaults must match one declared option');
    }
    return { default: control.value };
}

function createVariableRow({ document, list, value = {}, index, t, onRemove }) {
    const row = document.createElement('fieldset');
    row.className = 'primer-recipe-variable-editor-row';
    const legend = document.createElement('legend');
    legend.textContent = `${translate(t, '变量', 'Variable')} ${index + 1}`;
    row.appendChild(legend);

    const prefix = `primer-recipe-editor-variable-${index}`;
    const name = textInput(document, `${prefix}-name`, 'variableName', value.name || '');
    name.required = true;
    name.pattern = '[A-Za-z][A-Za-z0-9_]*';
    labeledControl(document, row, translate(t, '名称（模板中使用 {{name}}）', 'Name (use {{name}} in templates)'), name);

    const label = textInput(document, `${prefix}-label`, 'variableLabel', value.label || '');
    labeledControl(document, row, translate(t, '显示名称', 'Display label'), label);

    const description = textInput(document, `${prefix}-description`, 'variableDescription', value.description || '');
    labeledControl(document, row, translate(t, '说明', 'Description'), description);

    const type = document.createElement('select');
    type.id = `${prefix}-type`;
    type.name = 'variableType';
    for (const kind of VARIABLE_TYPES) {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kind;
        option.selected = kind === (value.type || 'text');
        type.appendChild(option);
    }
    type.value = value.type || 'text';
    labeledControl(document, row, translate(t, '类型', 'Type'), type);

    const required = document.createElement('input');
    required.type = 'checkbox';
    required.id = `${prefix}-required`;
    required.name = 'variableRequired';
    required.checked = value.required === true;
    labeledControl(document, row, translate(t, '必填', 'Required'), required);

    const options = textInput(document, `${prefix}-options`, 'variableOptions', (value.options || []).join(', '));
    labeledControl(document, row, translate(t, '选项（逗号分隔，仅 choice）', 'Options (comma-separated, choice only)'), options);

    const hasDefault = document.createElement('input');
    hasDefault.type = 'checkbox';
    hasDefault.id = `${prefix}-has-default`;
    hasDefault.name = 'variableHasDefault';
    hasDefault.checked = Object.prototype.hasOwnProperty.call(value, 'default');
    labeledControl(document, row, translate(t, '使用默认值', 'Use default value'), hasDefault);

    const defaultValue = value.type === 'boolean'
        ? document.createElement('input')
        : textInput(document, `${prefix}-default`, 'variableDefault', value.default ?? '');
    defaultValue.id = `${prefix}-default`;
    defaultValue.name = 'variableDefault';
    if ((value.type || 'text') === 'boolean') {
        defaultValue.type = 'checkbox';
        defaultValue.checked = value.default === true;
    }
    labeledControl(document, row, translate(t, '默认值', 'Default value'), defaultValue);
    type.addEventListener('change', () => {
        const booleanType = type.value === 'boolean';
        defaultValue.type = booleanType ? 'checkbox' : type.value === 'number' ? 'number' : 'text';
        if (booleanType) defaultValue.checked = defaultValue.value === 'true';
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'settings-btn secondary';
    remove.textContent = translate(t, '移除此变量', 'Remove variable');
    remove.addEventListener('click', () => onRemove(row));
    row.appendChild(remove);
    list.appendChild(row);

    return { row, name, label, description, type, required, options, hasDefault, defaultValue };
}

function readRow(controls) {
    const name = controls.name.value.trim();
    if (!VARIABLE_NAME.test(name)) throw new TypeError(`Invalid variable name: ${name || '(empty)'}`);
    const type = controls.type.value;
    const options = controls.options.value.split(',').map(value => value.trim()).filter(Boolean);
    if (type === 'choice' && options.length === 0) throw new TypeError(`Choice variable ${name} requires options`);
    const variable = {
        name,
        type,
        label: controls.label.value.trim(),
        description: controls.description.value.trim(),
        required: controls.required.checked === true,
        ...parseDefault(type, controls.defaultValue, controls.hasDefault, options)
    };
    if (type === 'choice') variable.options = [...new Set(options)];
    return variable;
}

export function createLegacyVariableEditor({ document, container, variables = [], t } = {}) {
    const section = document.createElement('section');
    section.className = 'primer-recipe-variable-editor';
    const heading = document.createElement('h3');
    heading.textContent = translate(t, '模板变量', 'Template variables');
    section.appendChild(heading);
    const help = document.createElement('p');
    help.textContent = translate(t,
        '变量名称可在任一步骤中写成 {{name}}；choice 类型需要提供选项。',
        'Reference variables as {{name}} in any step; choice variables require options.');
    section.appendChild(help);
    const list = document.createElement('div');
    list.className = 'primer-recipe-variable-editor-list';
    section.appendChild(list);
    container.appendChild(section);

    const rows = [];
    const removeRow = row => {
        const index = rows.findIndex(entry => entry.row === row);
        if (index >= 0) rows.splice(index, 1);
        row.remove();
    };
    const add = value => rows.push(createVariableRow({
        document, list, value, index: rows.length, t, onRemove: removeRow
    }));
    for (const variable of variables) add(variable);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'settings-btn secondary';
    addButton.textContent = translate(t, '添加变量', 'Add variable');
    addButton.addEventListener('click', () => add({ type: 'text' }));
    section.appendChild(addButton);

    return Object.freeze({
        add,
        read() {
            const result = rows.map(readRow);
            const names = result.map(variable => variable.name);
            if (new Set(names).size !== names.length) throw new TypeError('Variable names must be unique');
            return result;
        }
    });
}
