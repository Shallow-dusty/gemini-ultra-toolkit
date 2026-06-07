const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildPromptVariables,
    composePromptContent,
    createPromptExport,
    findPromptByShortcut,
    getQuickMenuSections,
    markPromptUsed,
    mergePromptImport,
    normalizeChainSteps,
    normalizePrompt,
    normalizePromptList,
    normalizeShortcut,
    parsePromptImport,
    renderPromptTemplate,
    serializePromptExport,
    sortPromptsForDisplay
} = require('../lib/prompt_vault_tools.js');

describe('prompt_vault_tools', () => {
    const nowIso = '2026-06-08T00:00:00.000Z';
    const sample = [
        {
            id: 'recent',
            name: 'Recent Writer',
            content: 'Write about {{chat_title}}',
            category: 'Writing',
            shortcut: '/writer',
            usedCount: 3,
            lastUsedAt: '2026-06-07T10:00:00.000Z'
        },
        {
            id: 'fav',
            name: 'Favorite Coder',
            content: 'Review {{selected_text}}',
            category: 'Coding',
            shortcut: 'code',
            favorite: true,
            usedCount: 1,
            lastUsedAt: '2026-06-01T10:00:00.000Z'
        },
        {
            id: 'top',
            name: 'Top Analyst',
            content: 'Analyze this',
            category: 'Research',
            usedCount: 9
        }
    ];

    it('normalizes prompt records for storage compatibility', () => {
        const normalized = normalizePrompt({
            id: '',
            name: '  Name With Spaces  ',
            content: '  body  ',
            category: '',
            shortcut: '/My Shortcut!',
            favorite: true,
            usedCount: '2.8',
            createdAt: '',
            updatedAt: '',
            lastUsedAt: null,
            chainSteps: 'step two\n---\nstep three'
        }, 4, { nowIso });

        assert.equal(normalized.id, 'p_4');
        assert.equal(normalized.name, 'Name With Spaces');
        assert.equal(normalized.content, 'body');
        assert.equal(normalized.category, 'General');
        assert.equal(normalized.shortcut, 'my-shortcut');
        assert.equal(normalized.favorite, true);
        assert.equal(normalized.usedCount, 2);
        assert.equal(normalized.createdAt, nowIso);
        assert.equal(normalized.updatedAt, nowIso);
        assert.equal(normalized.lastUsedAt, '');
        assert.deepEqual(normalized.chainSteps, ['step two', 'step three']);
    });

    it('drops invalid prompt-list entries and handles non-arrays', () => {
        assert.deepEqual(normalizePromptList(null), []);
        assert.deepEqual(normalizePromptList([{ name: 'Empty', content: '' }]), []);

        const normalized = normalizePromptList([null, { name: '', content: 'ok', usedCount: -1 }], { nowIso });
        assert.equal(normalized.length, 1);
        assert.equal(normalized[0].name, 'Prompt 2');
        assert.equal(normalized[0].usedCount, 0);
    });

    it('normalizes shortcuts from explicit values and prompt names', () => {
        assert.equal(normalizeShortcut('/Ask Gemini++'), 'ask-gemini');
        assert.equal(normalizeShortcut('', 'Long Prompt Name'), 'long-prompt-name');
        assert.equal(normalizeShortcut('A'.repeat(40)), 'a'.repeat(32));
    });

    it('normalizes prompt-chain steps from strings, arrays, and objects', () => {
        assert.deepEqual(normalizeChainSteps('one\n---\ntwo\n\n---\n'), ['one', 'two']);
        assert.deepEqual(normalizeChainSteps([' one ', { content: 'two' }, '', null]), ['one', 'two']);
        assert.equal(normalizeChainSteps(Array.from({ length: 20 }, (_, i) => `step ${i}`)).length, 12);
    });

    it('sorts favorites, recents, usage counts, and names deterministically', () => {
        const sorted = sortPromptsForDisplay([
            ...sample,
            { id: 'alpha', name: 'Alpha', content: 'a', usedCount: 9 },
            { id: 'beta', name: 'Beta', content: 'b', usedCount: 9 }
        ]);

        assert.deepEqual(sorted.map(p => p.id), ['fav', 'recent', 'alpha', 'beta', 'top']);

        const byUse = sortPromptsForDisplay([
            { id: 'low', name: 'Low', content: 'low', usedCount: 1 },
            { id: 'high', name: 'High', content: 'high', usedCount: 5 }
        ]);
        assert.deepEqual(byUse.map(p => p.id), ['high', 'low']);
    });

    it('builds quick-menu sections without duplicates', () => {
        const sections = getQuickMenuSections(sample, { limit: 3 });
        assert.deepEqual(sections.map(s => s.label), ['Favorites', 'Recent', 'Top Prompts']);
        assert.deepEqual(sections.flatMap(s => s.prompts.map(p => p.id)), ['fav', 'recent', 'top']);
    });

    it('handles empty and zero-limit quick menus', () => {
        assert.deepEqual(getQuickMenuSections([], { limit: Number.NaN }), []);
        assert.deepEqual(getQuickMenuSections(sample, { limit: 0 }), []);
        assert.deepEqual(
            getQuickMenuSections([{ id: 'a', name: 'A', content: 'a' }, { id: 'b', name: 'B', content: 'b' }], { limit: 1 })
                .flatMap(section => section.prompts.map(prompt => prompt.id)),
            ['a']
        );
    });

    it('renders built-in prompt variables and leaves unknown placeholders intact', () => {
        const vars = {
            ...buildPromptVariables({
                now: new Date('2026-06-08T09:30:00'),
                chatTitle: 'Architecture Notes',
                selectedText: 'selected',
                model: 'pro'
            }),
            nullable: null
        };

        const rendered = renderPromptTemplate(
            'On {{date}} at {{time}} in {{chat-title}} using {{model}}: {{selected_text}} {{missing}} {{nullable}}',
            vars
        );

        assert.equal(rendered, 'On 2026-06-08 at 09:30 in Architecture Notes using pro: selected {{missing}} ');
    });

    it('composes single prompts and multi-step prompt chains', () => {
        const single = composePromptContent({ name: 'Single', content: 'Hello {{model}}' }, { model: 'pro' });
        assert.equal(single, 'Hello pro');

        const chain = composePromptContent({
            name: 'Chain',
            content: 'Plan {{date}}',
            chainSteps: ['Draft {{selected_text}}', 'Review']
        }, {
            date: '2026-06-08',
            selected_text: 'scope'
        });

        assert.equal(chain, 'Step 1\nPlan 2026-06-08\n\n---\n\nStep 2\nDraft scope\n\n---\n\nStep 3\nReview');
        assert.equal(composePromptContent({ name: 'Empty', content: '' }), '');
    });

    it('falls back for dynamic prompt variables when context is missing', () => {
        const vars = buildPromptVariables({ now: 'not-a-date' });
        assert.match(vars.date, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(vars.datetime, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        assert.equal(vars.chat_title, '');
        assert.equal(vars.selected_text, '');
        assert.equal(vars.model, '');
    });

    it('finds prompts by slash shortcut after normalizing commands', () => {
        assert.equal(findPromptByShortcut(sample, '/writer').id, 'recent');
        assert.equal(findPromptByShortcut(sample, 'CODE').id, 'fav');
        assert.equal(findPromptByShortcut(sample, '/missing'), null);
        assert.equal(findPromptByShortcut(sample, ''), null);
    });

    it('marks prompt usage without mutating other prompts', () => {
        const updated = markPromptUsed(sample, 'fav', { nowIso });
        const fav = updated.find(p => p.id === 'fav');
        const recent = updated.find(p => p.id === 'recent');

        assert.equal(fav.usedCount, 2);
        assert.equal(fav.lastUsedAt, nowIso);
        assert.equal(fav.updatedAt, nowIso);
        assert.equal(recent.usedCount, 3);

        const defaultTime = markPromptUsed([{ id: 'x', name: 'X', content: 'x' }], 'x')[0];
        assert.match(defaultTime.lastUsedAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('creates a versioned prompt export envelope with metadata intact', () => {
        const payload = createPromptExport(sample, { nowIso });

        assert.equal(payload.schema, 'primer-pp.prompt-vault');
        assert.equal(payload.version, 1);
        assert.equal(payload.exportedAt, nowIso);
        assert.equal(payload.app, 'Primer++ for Gemini');
        assert.deepEqual(payload.prompts.map(prompt => prompt.id), ['recent', 'fav', 'top']);
        assert.equal(payload.prompts[1].favorite, true);
        assert.equal(payload.prompts[0].usedCount, 3);
    });

    it('serializes prompt exports as formatted JSON', () => {
        const serialized = serializePromptExport([{ id: 'x', name: 'X', content: 'body' }]);
        const parsed = JSON.parse(serialized);

        assert.equal(parsed.schema, 'primer-pp.prompt-vault');
        assert.match(parsed.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(parsed.prompts[0].shortcut, 'x');
        assert.ok(serialized.includes('\n  "schema"'));
    });

    it('parses legacy arrays and versioned prompt import envelopes', () => {
        const legacy = parsePromptImport([{ id: 'legacy', name: 'Legacy', content: 'body', shortcut: '/legacy' }], { nowIso });
        assert.equal(legacy[0].id, 'legacy');
        assert.equal(legacy[0].shortcut, 'legacy');

        const envelope = parsePromptImport({
            schema: 'primer-pp.prompt-vault',
            version: 1,
            prompts: [{ id: 'env', name: 'Envelope', content: 'body', favorite: true }]
        }, { nowIso });
        assert.equal(envelope[0].id, 'env');
        assert.equal(envelope[0].favorite, true);

        assert.deepEqual(parsePromptImport({ prompts: {} }), []);
        assert.deepEqual(parsePromptImport(null), []);
    });

    it('merges imported prompts while assigning fresh ids and preserving metadata', () => {
        const merged = mergePromptImport(
            [{ id: 'existing', name: 'Existing', content: 'keep' }],
            {
                prompts: [{
                    id: 'old',
                    name: 'Imported',
                    content: 'body',
                    category: 'Research',
                    shortcut: '/imported',
                    favorite: true,
                    chainSteps: ['step'],
                    usedCount: 4,
                    lastUsedAt: '2026-06-07T00:00:00.000Z'
                }]
            },
            {
                nowIso,
                idFactory: (prompt, index) => `new_${index}_${prompt.id}`
            }
        );

        assert.equal(merged.imported, 1);
        assert.deepEqual(merged.prompts.map(prompt => prompt.id), ['existing', 'new_0_old']);
        assert.equal(merged.prompts[1].category, 'Research');
        assert.equal(merged.prompts[1].favorite, true);
        assert.deepEqual(merged.prompts[1].chainSteps, ['step']);
        assert.equal(merged.prompts[1].usedCount, 4);
        assert.equal(merged.prompts[1].lastUsedAt, '2026-06-07T00:00:00.000Z');

        const defaultId = mergePromptImport([], [{ name: 'Generated', content: 'body' }]).prompts[0].id;
        assert.match(defaultId, /^p_\d+_0$/);
    });
});
