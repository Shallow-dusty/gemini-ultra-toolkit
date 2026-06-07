const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildPromptVariables,
    findPromptByShortcut,
    getQuickMenuSections,
    markPromptUsed,
    normalizePrompt,
    normalizePromptList,
    normalizeShortcut,
    renderPromptTemplate,
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
            lastUsedAt: null
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
});
