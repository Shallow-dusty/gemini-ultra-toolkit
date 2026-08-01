import {
    appendLabel,
    createButton,
    descendantsOf,
    flattenCollectionTree,
    formatRulesDraft,
    parseRulesDraft,
    parseTagsDraft
} from './view_support.js';

export function renderCollectionForm({ document: documentRef, translate, model, handlers }) {
    const editing = model.editing;
    const form = documentRef.createElement('form');
    form.className = 'gc-collections-form';
    form.setAttribute('aria-label', editing ? translate('编辑集合', 'Edit collection') : translate('创建集合', 'Create collection'));

    const name = documentRef.createElement('input');
    name.name = 'name';
    name.required = true;
    name.maxLength = 160;
    name.value = editing?.name ?? '';
    appendLabel(documentRef, form, translate('名称', 'Name'), name);

    const parent = documentRef.createElement('select');
    parent.name = 'parentId';
    const rootOption = documentRef.createElement('option');
    rootOption.value = '';
    rootOption.textContent = translate('顶层', 'Top level');
    parent.appendChild(rootOption);
    const blocked = editing ? descendantsOf(model.tree, editing.id) : new Set();
    for (const { collection, depth } of flattenCollectionTree(model.tree)) {
        const option = documentRef.createElement('option');
        option.value = collection.id;
        option.textContent = `${'— '.repeat(depth - 1)}${collection.name}`;
        option.disabled = collection.id === editing?.id || blocked.has(collection.id);
        option.selected = collection.id === editing?.parentId;
        parent.appendChild(option);
    }
    appendLabel(documentRef, form, translate('父集合', 'Parent collection'), parent);

    const tags = documentRef.createElement('input');
    tags.name = 'tags';
    tags.value = editing?.tags?.join(', ') ?? '';
    tags.placeholder = translate('标签，用逗号分隔', 'Tags, comma separated');
    appendLabel(documentRef, form, translate('标签', 'Tags'), tags);

    const color = documentRef.createElement('input');
    color.name = 'color';
    color.type = 'color';
    color.value = editing?.color ?? '#8ab4f8';
    appendLabel(documentRef, form, translate('颜色', 'Color'), color);

    const ruleMode = documentRef.createElement('select');
    ruleMode.name = 'ruleMode';
    for (const [value, zh, en] of [['any', '任一规则匹配', 'Match any rule'], ['all', '所有规则匹配', 'Match all rules']]) {
        const option = documentRef.createElement('option');
        option.value = value;
        option.textContent = translate(zh, en);
        option.selected = value === (editing?.ruleMode ?? 'any');
        ruleMode.appendChild(option);
    }
    ruleMode.value = editing?.ruleMode ?? 'any';
    appendLabel(documentRef, form, translate('规则组合', 'Rule combination'), ruleMode);

    const rules = documentRef.createElement('textarea');
    rules.name = 'rules';
    rules.rows = 4;
    rules.value = formatRulesDraft(editing?.rules);
    rules.placeholder = '[{"field":"title","operator":"contains","value":"research"},{"field":"status","operator":"equals","value":"archived"}]';
    appendLabel(documentRef, form, translate('规则 JSON', 'Rules JSON'), rules);

    const help = documentRef.createElement('small');
    help.textContent = translate(
        '字段可用 title/url/tag/status；匹配可用 contains/equals/starts-with。先预览再确认，仅改变本地归属。',
        'Fields: title/url/tag/status. Operators: contains/equals/starts-with. Preview and confirm before changing local memberships.'
    );
    form.appendChild(help);

    const actions = documentRef.createElement('div');
    actions.className = 'gc-collection-actions';
    const submit = documentRef.createElement('button');
    submit.type = 'submit';
    submit.textContent = editing ? translate('保存', 'Save') : translate('创建集合', 'Create collection');
    submit.dataset.focusKey = 'collection-form-submit';
    actions.appendChild(submit);
    if (editing) actions.appendChild(createButton(documentRef, translate('取消', 'Cancel'), handlers.onCancelEdit));
    form.appendChild(actions);

    form.onsubmit = event => {
        event?.preventDefault?.();
        handlers.onSubmit(editing?.id ?? null, {
            name: name.value,
            parentId: parent.value || null,
            tags: parseTagsDraft(tags.value),
            color: color.value,
            rules: parseRulesDraft(rules.value),
            ruleMode: ruleMode.value
        });
    };
    return form;
}
