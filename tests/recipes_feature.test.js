const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let recipes;
before(async () => {
    recipes = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'recipes', 'index.js'
    )).href);
});

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

class MemoryRecipeRepository {
    constructor(value = undefined, { flushError = null } = {}) {
        this.value = clone(value);
        this.flushError = flushError;
        this.flushCount = 0;
        this.updateCount = 0;
    }

    async get() {
        return clone(this.value);
    }

    async update(updater) {
        this.updateCount += 1;
        const next = await updater(clone(this.value));
        this.value = clone(next);
        return clone(this.value);
    }

    async flush() {
        this.flushCount += 1;
        if (this.flushError) throw this.flushError;
    }
}

function createDeterministicService(options = {}) {
    return recipes.createRecipeService({
        clock() { return '2026-08-01T00:00:00.000Z'; },
        idFactory() { return 'generated-recipe'; },
        ...options
    });
}

function createHarness({ values = {}, ids = ['generated-1', 'generated-2'], times } = {}) {
    const repositories = new Map();
    for (const [id, value] of Object.entries(values)) repositories.set(id, new MemoryRecipeRepository(value));
    const generated = [...ids];
    const ticks = [...(times || [
        '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:01:00.000Z',
        '2026-08-01T00:02:00.000Z',
        '2026-08-01T00:03:00.000Z',
        '2026-08-01T00:04:00.000Z'
    ])];
    const contexts = [];
    const service = recipes.createRecipeService({
        repositoryFactory({ session, sessionId }) {
            contexts.push({ session, sessionId });
            if (!repositories.has(sessionId)) repositories.set(sessionId, new MemoryRecipeRepository());
            return repositories.get(sessionId);
        },
        idFactory(context) {
            contexts.push(context);
            return generated.shift();
        },
        clock() {
            return ticks.shift() || '2026-08-01T01:00:00.000Z';
        }
    });
    return { service, repositories, contexts };
}

function basicDraft(overrides = {}) {
    return {
        id: 'alpha',
        title: 'Research answer',
        description: 'A deterministic two-step recipe',
        variables: [
            { name: 'topic', type: 'text', label: 'Topic', required: true },
            { name: 'depth', type: 'number', default: 2 },
            { name: 'citations', type: 'boolean', default: true },
            { name: 'tone', type: 'choice', options: ['short', 'detailed'], default: 'short' },
            { name: 'optional', type: 'text', description: 'May be omitted' }
        ],
        steps: [
            {
                id: 'outline',
                title: 'Outline',
                template: 'Outline {{ topic }} at depth {{depth}}. Optional: {{optional}}',
                permissions: ['composer.insert']
            },
            {
                id: 'answer',
                title: 'Answer',
                template: 'Write {{tone}}; citations={{citations}}; topic={{topic}}.',
                permissions: ['conversation.send', 'file.download']
            }
        ],
        permissions: ['file.download', 'composer.insert', 'conversation.send'],
        provenance: {
            source: 'local',
            sourceId: 'seed',
            sourceUrl: 'https://example.test/recipe',
            author: 'Tester',
            license: 'MIT'
        },
        ...overrides
    };
}

function versionFrom(overrides = {}) {
    return recipes.createRecipeVersion(basicDraft(overrides), {
        id: overrides.id || 'alpha',
        now: '2026-08-01T00:00:00.000Z'
    });
}

function expectCode(fn, code) {
    assert.throws(fn, error => error instanceof recipes.RecipesError && error.code === code);
}

async function expectCodeAsync(promise, code) {
    await assert.rejects(promise, error => error instanceof recipes.RecipesError && error.code === code);
}

describe('Recipes model and deterministic renderer', () => {
    it('normalizes a version and renders a manual permission-aware plan without sending', () => {
        const recipe = versionFrom();
        const rendered = recipes.renderRecipeVersion(recipe, { topic: 'Mars', depth: -0 });

        assert.equal(recipe.version, 1);
        assert.deepEqual(recipe.permissions, ['composer.insert', 'conversation.send', 'file.download']);
        assert.equal(rendered.steps[0].prompt, 'Outline Mars at depth 0. Optional: ');
        assert.equal(rendered.steps[1].prompt, 'Write short; citations=true; topic=Mars.');
        assert.deepEqual(rendered.variables, {
            topic: 'Mars', depth: 0, citations: true, tone: 'short', optional: null
        });
        assert.equal(rendered.steps[0].requiresConfirmation, false);
        assert.deepEqual(rendered.steps[1].dangerousPermissions, ['conversation.send', 'file.download']);
        assert.equal(rendered.requiresConfirmation, true);
        assert.equal(rendered.execution, 'manual');
        assert.equal(rendered.autoSend, false);
        assert.equal('send' in rendered, false);

        rendered.variables.topic = 'mutated';
        rendered.permissions.push('mutated');
        assert.equal(recipe.variables[0].name, 'topic');
        assert.equal(recipe.permissions.includes('mutated'), false);
    });

    it('renders every variable type and rejects missing, unknown, and mistyped values', () => {
        const recipe = versionFrom();
        const supplied = { topic: 'Moon', depth: 3.5, citations: false, tone: 'detailed', optional: 'x' };
        const values = recipes.resolveVariableValues(recipe.variables, supplied);
        assert.deepEqual(values, supplied);
        assert.equal(recipes.replaceTemplateVariables('{{topic}}/{{citations}}/{{depth}}', values), 'Moon/false/3.5');

        expectCode(() => recipes.resolveVariableValues(recipe.variables, []), 'INVALID_VALUE');
        expectCode(() => recipes.resolveVariableValues(recipe.variables, { extra: 1, topic: 'x' }), 'UNKNOWN_VARIABLE');
        expectCode(() => recipes.resolveVariableValues(recipe.variables, {}), 'MISSING_VARIABLE');
        expectCode(() => recipes.resolveVariableValues(recipe.variables, { topic: 4 }), 'INVALID_VARIABLE_VALUE');
        expectCode(() => recipes.resolveVariableValues(recipe.variables, { topic: 'x', depth: Infinity }), 'INVALID_VARIABLE_VALUE');
        expectCode(() => recipes.resolveVariableValues(recipe.variables, { topic: 'x', citations: 'yes' }), 'INVALID_VARIABLE_VALUE');
        expectCode(() => recipes.resolveVariableValues(recipe.variables, { topic: 'x', tone: 'verbose' }), 'INVALID_VARIABLE_VALUE');
    });

    it('validates variable schemas at every structural boundary', () => {
        expectCode(() => recipes.normalizeVariables({}), 'INVALID_VARIABLES');
        expectCode(() => recipes.normalizeVariables([null]), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'text', extra: true }]), 'UNKNOWN_FIELD');
        expectCode(() => recipes.normalizeVariables([{ name: '1bad', type: 'text' }]), 'INVALID_VARIABLE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'date' }]), 'INVALID_VARIABLE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'text', required: 'yes' }]), 'INVALID_VARIABLE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'choice' }]), 'INVALID_VARIABLE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'choice', options: [''] }]), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'choice', options: ['x', 'x'] }]), 'INVALID_VARIABLE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'text', options: ['x'] }]), 'INVALID_VARIABLE');
        expectCode(() => recipes.normalizeVariables([
            { name: 'a', type: 'text' }, { name: 'a', type: 'boolean' }
        ]), 'INVALID_VARIABLES');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'text', default: 1 }]), 'INVALID_VARIABLE_VALUE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'number', default: NaN }]), 'INVALID_VARIABLE_VALUE');
        expectCode(() => recipes.normalizeVariables([{ name: 'a', type: 'boolean', default: 0 }]), 'INVALID_VARIABLE_VALUE');
        expectCode(() => recipes.normalizeVariables([
            { name: 'a', type: 'choice', options: ['x'], default: 'y' }
        ]), 'INVALID_VARIABLE_VALUE');
    });

    it('validates ordered steps, templates, and the least-privilege manifest', () => {
        const variables = recipes.normalizeVariables([{ name: 'topic', type: 'text' }]);
        expectCode(() => recipes.normalizeSteps([], variables), 'INVALID_STEPS');
        expectCode(() => recipes.normalizeSteps([null], variables), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: 'A', template: 'x', extra: 1 }], variables), 'UNKNOWN_FIELD');
        expectCode(() => recipes.normalizeSteps([{ id: '*', title: 'A', template: 'x' }], variables), 'INVALID_RECIPE_ID');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: '', template: 'x' }], variables), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: 'A', template: '' }], variables), 'INVALID_TEMPLATE');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: 'A', template: 'x'.repeat(50001) }], variables), 'INVALID_TEMPLATE');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: 'A', template: '{{ bad-name }}' }], variables), 'INVALID_TEMPLATE');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: 'A', template: '{{missing}}' }], variables), 'UNKNOWN_VARIABLE');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: 'A', template: 'x', permissions: 'send' }], variables), 'INVALID_PERMISSIONS');
        expectCode(() => recipes.normalizeSteps([{ id: 'a', title: 'A', template: 'x', permissions: ['unknown'] }], variables), 'INVALID_PERMISSION');
        expectCode(() => recipes.normalizeSteps([{
            id: 'a', title: 'A', template: 'x', permissions: ['composer.insert', 'composer.insert']
        }], variables), 'INVALID_PERMISSIONS');
        expectCode(() => recipes.normalizeSteps([
            { id: 'a', title: 'A', template: 'x' }, { id: 'a', title: 'B', template: 'y' }
        ], variables), 'INVALID_STEPS');

        expectCode(() => versionFrom({ permissions: [] }), 'PERMISSION_MANIFEST_MISMATCH');
        const inferred = versionFrom({ permissions: undefined });
        assert.deepEqual(inferred.permissions, ['composer.insert', 'conversation.send', 'file.download']);
    });

    it('validates recipe identity, fields, timestamps, provenance, and history', () => {
        const now = '2026-08-01T00:00:00.000Z';
        expectCode(() => recipes.createRecipeVersion(null, { id: 'a', now }), 'INVALID_VALUE');
        expectCode(() => recipes.createRecipeVersion({ ...basicDraft(), unknown: 1 }, { id: 'a', now }), 'UNKNOWN_FIELD');
        expectCode(() => recipes.createRecipeVersion(basicDraft(), { id: '*', now }), 'INVALID_RECIPE_ID');
        expectCode(() => recipes.createRecipeVersion(basicDraft(), { id: 'a', version: 0, now }), 'INVALID_VERSION');
        expectCode(() => recipes.createRecipeVersion(basicDraft(), { id: 'a', now: 'bad' }), 'INVALID_TIMESTAMP');
        expectCode(() => recipes.createRecipeVersion(basicDraft({ title: 'x'.repeat(201) }), { id: 'a', now }), 'INVALID_VALUE');
        const defaults = recipes.createRecipeVersion({
            ...basicDraft({ provenance: undefined }),
            provenance: undefined
        }, { now });
        assert.equal(defaults.id, 'alpha');
        assert.equal(defaults.provenance.source, 'local');
        expectCode(() => recipes.normalizeProvenance(null), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeProvenance({ unknown: 1 }), 'UNKNOWN_FIELD');
        expectCode(() => recipes.normalizeProvenance({ source: 'Bad Source' }), 'INVALID_PROVENANCE');
        expectCode(() => recipes.normalizeProvenance({ source: 'local', author: 1 }), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeProvenance({ source: 'local', importedAt: 'bad' }), 'INVALID_TIMESTAMP');
        expectCode(() => recipes.normalizeProvenance({ source: 'local', parent: [] }), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeProvenance({ source: 'local', parent: { recipeId: 'a', version: 0 } }), 'INVALID_VERSION');
        expectCode(() => recipes.normalizeProvenance({ source: 'local', parent: { recipeId: 'a', version: 1, x: 2 } }), 'UNKNOWN_FIELD');

        const first = versionFrom();
        expectCode(() => recipes.normalizeRecipeVersion({ ...first, extra: true }), 'UNKNOWN_FIELD');
        expectCode(() => recipes.normalizeRecipeVersion(first, { expectedId: 'other' }), 'INVALID_RECIPE_ID');
        expectCode(() => recipes.normalizeRecipeVersion(first, { expectedVersion: 2 }), 'INVALID_VERSION');
        expectCode(() => recipes.normalizeRecipeRecord(null), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeRecipeRecord({ id: 'a', currentVersion: 0, versions: [], extra: 1 }), 'UNKNOWN_FIELD');
        expectCode(() => recipes.normalizeRecipeRecord({ id: 'a', currentVersion: 0, versions: [] }), 'INVALID_HISTORY');
        expectCode(() => recipes.normalizeRecipeRecord({ id: 'a', currentVersion: 2, versions: [{ ...first, id: 'a' }] }), 'INVALID_HISTORY');
        const second = { ...first, id: 'a', version: 2, createdAt: '2026-08-02T00:00:00.000Z' };
        expectCode(() => recipes.normalizeRecipeRecord({
            id: 'a', currentVersion: 2, versions: [{ ...first, id: 'a' }, second]
        }), 'INVALID_HISTORY');
    });

    it('produces clone-safe semantic diffs for changed and unchanged versions', () => {
        const first = versionFrom();
        const same = recipes.diffRecipeVersions(first, first);
        assert.equal(same.changed, false);
        assert.deepEqual(same.changes, []);

        const second = recipes.createRecipeVersion({
            ...basicDraft({ title: 'Changed', description: 'Changed description' }),
            provenance: { source: 'import', parent: { recipeId: 'alpha', version: 1 } }
        }, {
            id: 'alpha', version: 2, now: '2026-08-01T01:00:00.000Z', createdAt: first.createdAt
        });
        const diff = recipes.diffRecipeVersions(first, second);
        assert.equal(diff.changed, true);
        assert.deepEqual(diff.changes.map(change => change.field), ['title', 'description', 'provenance']);
        diff.changes[0].before = 'mutated';
        assert.equal(first.title, 'Research answer');
    });
});

describe('Recipe state and portable export validation', () => {
    it('creates and validates account-owned state without cross-session fallback', () => {
        assert.deepEqual(recipes.createEmptyRecipeState('account-a'), {
            schemaVersion: 1, ownerSessionId: 'account-a', records: []
        });
        assert.deepEqual(recipes.normalizeRecipeState(undefined, 'account-a').records, []);
        expectCode(() => recipes.normalizeRecipeState([], 'account-a'), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeRecipeState({
            schemaVersion: 1, ownerSessionId: 'account-a', records: [], extra: true
        }, 'account-a'), 'UNKNOWN_FIELD');
        expectCode(() => recipes.normalizeRecipeState({
            schemaVersion: 2, ownerSessionId: 'account-a', records: []
        }, 'account-a'), 'UNSUPPORTED_SCHEMA');
        expectCode(() => recipes.normalizeRecipeState({
            schemaVersion: 1, ownerSessionId: 'account-b', records: []
        }, 'account-a'), 'SESSION_MISMATCH');
        expectCode(() => recipes.normalizeRecipeState({
            schemaVersion: 1, ownerSessionId: 'account-a', records: {}
        }, 'account-a'), 'INVALID_STATE');

        const recipe = versionFrom();
        const record = { id: 'alpha', currentVersion: 1, versions: [recipe] };
        expectCode(() => recipes.normalizeRecipeState({
            schemaVersion: 1, ownerSessionId: 'account-a', records: [record, record]
        }, 'account-a'), 'INVALID_STATE');
    });

    it('accepts only the current export format and complete unique histories', () => {
        const record = { id: 'alpha', currentVersion: 1, versions: [versionFrom()] };
        const envelope = {
            format: recipes.RECIPE_EXPORT_FORMAT,
            formatVersion: recipes.RECIPE_EXPORT_VERSION,
            exportedAt: '2026-08-01T00:00:00.000Z',
            recipes: [record]
        };
        assert.equal(recipes.normalizeRecipeExport(envelope).recipes[0].id, 'alpha');
        expectCode(() => recipes.normalizeRecipeExport(null), 'INVALID_VALUE');
        expectCode(() => recipes.normalizeRecipeExport({ ...envelope, extra: 1 }), 'UNKNOWN_FIELD');
        expectCode(() => recipes.normalizeRecipeExport({ ...envelope, format: 'other' }), 'INVALID_EXPORT');
        expectCode(() => recipes.normalizeRecipeExport({ ...envelope, formatVersion: 99 }), 'UNSUPPORTED_EXPORT_VERSION');
        expectCode(() => recipes.normalizeRecipeExport({ ...envelope, exportedAt: 'bad' }), 'INVALID_TIMESTAMP');
        expectCode(() => recipes.normalizeRecipeExport({ ...envelope, recipes: {} }), 'INVALID_EXPORT');
        expectCode(() => recipes.normalizeRecipeExport({ ...envelope, recipes: [record, record] }), 'INVALID_EXPORT');
        expectCode(() => recipes.normalizeImportStrategy('merge'), 'INVALID_IMPORT_STRATEGY');
        assert.equal(recipes.normalizeImportStrategy('fork'), 'fork');
    });

    it('wraps structured-clone failures with a stable RecipesError', () => {
        const value = { fn() {} };
        expectCode(() => recipes.safeClone(value, 'test value'), 'NOT_CLONEABLE');
    });
});

describe('RecipeService lifecycle and CRUD', () => {
    it('validates constructor dependencies, session identity, and repository contracts', async () => {
        assert.throws(() => recipes.createRecipeService(), /repositoryFactory/);
        assert.throws(() => recipes.createRecipeService({ repositoryFactory() {}, getSessionId: 1 }), /getSessionId/);
        assert.throws(() => recipes.createRecipeService({ repositoryFactory() {}, clock: 1 }), /clock/);
        assert.throws(() => recipes.createRecipeService({
            repositoryFactory() {},
            clock() { return '2026-08-01T00:00:00.000Z'; },
            idFactory: 1
        }), /idFactory/);
        assert.throws(() => recipes.createRecipeService({ repositoryFactory() {} }), /clock/);
        assert.throws(() => recipes.createRecipeService({
            repositoryFactory() {},
            clock() { return '2026-08-01T00:00:00.000Z'; }
        }), /idFactory/);

        const invalidSession = createDeterministicService({ repositoryFactory() { return new MemoryRecipeRepository(); } });
        await expectCodeAsync(invalidSession.start({}), 'INVALID_SESSION');
        await expectCodeAsync(invalidSession.start('  '), 'INVALID_SESSION');

        const badCustomSession = createDeterministicService({
            getSessionId() { return 1; },
            repositoryFactory() { return new MemoryRecipeRepository(); }
        });
        await expectCodeAsync(badCustomSession.start('x'), 'INVALID_SESSION');

        for (const repository of [null, { get() {} }, { get() {}, update() {} }]) {
            const service = createDeterministicService({ repositoryFactory() { return repository; } });
            await expectCodeAsync(service.start('account-a'), 'INVALID_REPOSITORY');
        }

        const factoryError = createDeterministicService({ repositoryFactory() { throw new Error('offline'); } });
        await assert.rejects(factoryError.start('account-a'), error =>
            error.code === 'REPOSITORY_FACTORY_FAILED' && error.cause.message === 'offline'
        );
        const stableError = new recipes.RecipesError('EXPECTED', 'expected');
        const stable = createDeterministicService({ repositoryFactory() { throw stableError; } });
        await assert.rejects(stable.start('account-a'), error => error === stableError);
    });

    it('supports default string/object session identities and start/stop idempotency', async () => {
        const harness = createHarness();
        assert.equal(await harness.service.start({ userId: ' account-a ' }), 'account-a');
        assert.equal(harness.service.activeSessionId, 'account-a');
        assert.equal(await harness.service.start({ id: 'account-a' }), 'account-a');
        await expectCodeAsync(harness.service.start({ email: 'other@example.test' }), 'ALREADY_STARTED');
        await harness.service.stop();
        assert.equal(harness.service.activeSessionId, null);
        await harness.service.stop();
        await expectCodeAsync(harness.service.api.list(), 'SERVICE_INACTIVE');

        const emailHarness = createHarness();
        assert.equal(await emailHarness.service.start({ email: 'person@example.test' }), 'person@example.test');
        await emailHarness.service.stop();
        const idHarness = createHarness();
        assert.equal(await idHarness.service.start({ id: 'profile-id' }), 'profile-id');
    });

    it('creates, reads, revises, diffs, renders, and removes immutable version histories', async () => {
        const { service, repositories } = createHarness();
        await service.start('account-a');
        const draft = basicDraft();
        const created = await service.api.create(draft);
        draft.title = 'caller mutation';
        created.title = 'result mutation';

        assert.equal((await service.api.get('alpha')).title, 'Research answer');
        assert.deepEqual((await service.api.list()).map(recipe => recipe.id), ['alpha']);
        assert.equal((await service.api.history('alpha')).length, 1);
        await expectCodeAsync(service.api.create(basicDraft()), 'RECIPE_EXISTS');

        const revised = await service.api.revise('alpha', { title: 'Research answer v2' }, { expectedVersion: 1 });
        assert.equal(revised.version, 2);
        assert.deepEqual(revised.provenance.parent, { recipeId: 'alpha', version: 1 });
        assert.equal((await service.api.get('alpha', 1)).title, 'Research answer');
        assert.equal((await service.api.get('alpha', 2)).title, 'Research answer v2');
        assert.equal((await service.api.diff('alpha', 1, 2)).changed, true);

        const plan = await service.api.render('alpha', { topic: 'Jupiter' }, { version: 1 });
        assert.equal(plan.steps[0].prompt.includes('Jupiter'), true);
        assert.equal(plan.autoSend, false);
        assert.equal(Object.isFrozen(service.api), true);
        assert.equal('start' in service.api, false);
        assert.equal('switchSession' in service.api, false);

        await service.api.create(basicDraft({ id: 'beta' }));
        const current = await service.api.get('alpha');
        const fullyRevised = await service.api.revise('alpha', {
            description: 'Updated description',
            variables: current.variables,
            steps: current.steps,
            permissions: current.permissions,
            provenance: { ...current.provenance, source: 'import' }
        });
        assert.equal(fullyRevised.version, 3);
        assert.equal(fullyRevised.description, 'Updated description');
        assert.equal(fullyRevised.provenance.source, 'import');
        assert.equal((await service.api.render('alpha', { topic: 'Saturn' })).version, 3);

        await expectCodeAsync(service.api.revise('alpha', null), 'INVALID_REVISION');
        await expectCodeAsync(service.api.revise('alpha', { title: 'x' }, { expectedVersion: 1 }), 'VERSION_CONFLICT');
        await expectCodeAsync(service.api.revise('alpha', {}, {}), 'NO_CHANGES');
        await expectCodeAsync(service.api.revise('alpha', { id: 'other' }), 'UNKNOWN_FIELD');
        await expectCodeAsync(service.api.revise('alpha', { description: 'Updated description' }), 'NO_CHANGES');
        await expectCodeAsync(service.api.remove('alpha', { expectedVersion: 1 }), 'VERSION_CONFLICT');

        const removed = await service.api.remove('alpha', { expectedVersion: 3 });
        assert.equal(removed.version, 3);
        await expectCodeAsync(service.api.get('alpha'), 'RECIPE_NOT_FOUND');
        assert.deepEqual((await service.api.list()).map(item => item.id), ['beta']);
        assert.equal(repositories.get('account-a').updateCount, 9);
    });

    it('validates ids, requested versions, clocks, and generated-id collisions', async () => {
        const { service } = createHarness({ ids: ['alpha'] });
        await service.start('account-a');
        await service.api.create(basicDraft());
        await expectCodeAsync(service.api.get('*'), 'INVALID_RECIPE_ID');
        await expectCodeAsync(service.api.get('alpha', 0), 'VERSION_NOT_FOUND');
        await expectCodeAsync(service.api.history('missing'), 'RECIPE_NOT_FOUND');
        await expectCodeAsync(service.api.diff('alpha', 0, 1), 'VERSION_NOT_FOUND');
        await expectCodeAsync(service.api.diff('alpha', 1, 2), 'VERSION_NOT_FOUND');
        await expectCodeAsync(service.api.render('alpha', {}, { version: 5 }), 'VERSION_NOT_FOUND');
        await expectCodeAsync(service.api.remove('alpha', { expectedVersion: 0 }), 'INVALID_VERSION');

        const collision = createHarness({ ids: ['alpha'] });
        await collision.service.start('account-a');
        await collision.service.api.create(basicDraft());
        const generatedDraft = basicDraft();
        delete generatedDraft.id;
        await expectCodeAsync(collision.service.api.create(generatedDraft), 'ID_FACTORY_COLLISION');

        const badId = createHarness({ ids: ['*'] });
        await badId.service.start('account-a');
        await expectCodeAsync(badId.service.api.create(generatedDraft), 'INVALID_RECIPE_ID');

        const badClock = recipes.createRecipeService({
            repositoryFactory() { return new MemoryRecipeRepository(); },
            clock() { return 42; },
            idFactory() { return 'generated-recipe'; }
        });
        await badClock.start('account-a');
        await expectCodeAsync(badClock.create(basicDraft()), 'INVALID_CLOCK');
    });

    it('serializes concurrent mutations and keeps caller references isolated', async () => {
        const { service } = createHarness();
        await service.start('account-a');
        const first = basicDraft({ id: 'b' });
        const second = basicDraft({ id: 'a' });
        await Promise.all([service.api.create(first), service.api.create(second)]);
        const list = await service.api.list();
        assert.deepEqual(list.map(recipe => recipe.id), ['a', 'b']);
        list[0].steps[0].title = 'mutated';
        assert.equal((await service.api.get('a')).steps[0].title, 'Outline');
        await service.api.flush();
    });

    it('uses only integrator-injected timestamps and ids deterministically', async () => {
        const repository = new MemoryRecipeRepository();
        const service = recipes.createRecipeService({
            repositoryFactory() { return repository; },
            clock() { return '2042-03-04T05:06:07.000Z'; },
            idFactory(context) {
                assert.deepEqual(context, { kind: 'create', sessionId: 'account-a' });
                return 'injected-id';
            }
        });
        await service.start('account-a');
        const draft = basicDraft();
        delete draft.id;
        const created = await service.create(draft);
        assert.equal(created.id, 'injected-id');
        assert.equal(created.createdAt, '2042-03-04T05:06:07.000Z');
    });
});

describe('RecipeService account isolation and portable conflicts', () => {
    it('switches repositories transactionally and rejects mismatched owners', async () => {
        const stateB = recipes.createEmptyRecipeState('account-b');
        const { service, repositories } = createHarness({ values: { 'account-b': stateB } });
        await service.start('account-a');
        await service.api.create(basicDraft());
        assert.equal(await service.switchSession('account-b'), 'account-b');
        assert.deepEqual(await service.api.list(), []);
        await service.api.create(basicDraft({ id: 'beta' }));
        assert.deepEqual((await service.api.list()).map(item => item.id), ['beta']);
        assert.equal(await service.switchSession('account-b'), 'account-b');
        await service.switchSession('account-a');
        assert.deepEqual((await service.api.list()).map(item => item.id), ['alpha']);
        assert.equal(repositories.get('account-a').flushCount, 1);

        repositories.set('account-c', new MemoryRecipeRepository(recipes.createEmptyRecipeState('someone-else')));
        await expectCodeAsync(service.switchSession('account-c'), 'SESSION_MISMATCH');
        assert.equal(service.activeSessionId, 'account-a');
        assert.deepEqual((await service.api.list()).map(item => item.id), ['alpha']);
    });

    it('rejects repository object reuse even before either account has persisted data', async () => {
        const shared = new MemoryRecipeRepository();
        const service = createDeterministicService({ repositoryFactory() { return shared; } });
        await service.start('account-a');
        await service.stop();
        await service.start('account-a');
        await expectCodeAsync(service.switchSession('account-b'), 'REPOSITORY_SESSION_REUSE');
        assert.equal(service.activeSessionId, 'account-a');
    });

    it('keeps the old binding when repository flush prevents a session change', async () => {
        const old = new MemoryRecipeRepository(undefined, { flushError: new Error('disk busy') });
        const service = createDeterministicService({
            repositoryFactory({ sessionId }) {
                return sessionId === 'old' ? old : new MemoryRecipeRepository();
            }
        });
        await service.start('old');
        await assert.rejects(service.switchSession('new'), /disk busy/);
        assert.equal(service.activeSessionId, 'old');
        await assert.rejects(service.stop(), /disk busy/);
        assert.equal(service.activeSessionId, null);
    });

    it('exports selected/all histories deterministically and validates selections', async () => {
        const { service } = createHarness();
        await service.start('account-a');
        await service.api.create(basicDraft({ id: 'z' }));
        await service.api.create(basicDraft({ id: 'a' }));
        const all = await service.api.export();
        assert.equal(all.format, 'primer-pp.recipes');
        assert.equal(all.formatVersion, 1);
        assert.deepEqual(all.recipes.map(record => record.id), ['a', 'z']);
        assert.equal('ownerSessionId' in all, false);

        const selected = await service.api.export(['z']);
        assert.deepEqual(selected.recipes.map(record => record.id), ['z']);
        await expectCodeAsync(service.api.export('z'), 'INVALID_EXPORT_SELECTION');
        await expectCodeAsync(service.api.export(['z', 'z']), 'INVALID_EXPORT_SELECTION');
        await expectCodeAsync(service.api.export(['missing']), 'RECIPE_NOT_FOUND');
    });

    it('imports JSON atomically with error and skip conflict strategies', async () => {
        const source = createHarness();
        await source.service.start('source');
        await source.service.api.create(basicDraft());
        const payload = await source.service.api.export();

        const target = createHarness();
        await target.service.start('target');
        const imported = await target.service.api.import(JSON.stringify(payload));
        assert.deepEqual(imported, { strategy: 'error', imported: ['alpha'], replaced: [], skipped: [], forked: [] });
        const importedRecipe = await target.service.api.get('alpha');
        assert.equal(importedRecipe.provenance.importedAt, '2026-08-01T00:00:00.000Z');
        assert.equal(importedRecipe.provenance.sourceId, 'seed');

        const before = clone(target.repositories.get('target').value);
        await expectCodeAsync(target.service.api.import(payload), 'IMPORT_CONFLICT');
        assert.deepEqual(target.repositories.get('target').value, before);
        const skipped = await target.service.api.import(payload, { strategy: 'skip' });
        assert.deepEqual(skipped.skipped, [{ id: 'alpha', reason: 'exists' }]);
        await expectCodeAsync(target.service.api.import('{bad json'), 'INVALID_EXPORT_JSON');
        await expectCodeAsync(target.service.api.import(payload, { strategy: 'merge' }), 'INVALID_IMPORT_STRATEGY');

        const noSource = createHarness();
        await noSource.service.start('source');
        await noSource.service.api.create(basicDraft({ provenance: { source: 'local' } }));
        const noSourcePayload = await noSource.service.api.export();
        const fresh = createHarness();
        await fresh.service.start('target');
        await fresh.service.api.import(noSourcePayload);
        assert.equal((await fresh.service.api.get('alpha')).provenance.sourceId, 'alpha');
    });

    it('handles replace, newer, and fork strategies with explicit reports and provenance', async () => {
        const source = createHarness();
        await source.service.start('source');
        await source.service.api.create(basicDraft());
        await source.service.api.revise('alpha', { title: 'Imported v2' });
        const newerPayload = await source.service.api.export();

        const replace = createHarness();
        await replace.service.start('target');
        await replace.service.api.create(basicDraft({ title: 'Local' }));
        const replaceReport = await replace.service.api.import(newerPayload, { strategy: 'replace' });
        assert.deepEqual(replaceReport.replaced, ['alpha']);
        assert.equal((await replace.service.api.get('alpha')).title, 'Imported v2');

        const newer = createHarness();
        await newer.service.start('target');
        await newer.service.api.create(basicDraft({ title: 'Local' }));
        const newerReport = await newer.service.api.import(newerPayload, { strategy: 'newer' });
        assert.deepEqual(newerReport.replaced, ['alpha']);
        const notNewer = await newer.service.api.import(newerPayload, { strategy: 'newer' });
        assert.deepEqual(notNewer.skipped, [{ id: 'alpha', reason: 'not-newer' }]);

        const fork = createHarness({ ids: ['forked-alpha'] });
        await fork.service.start('target');
        await fork.service.api.create(basicDraft());
        const forkReport = await fork.service.api.import(newerPayload, { strategy: 'fork' });
        assert.deepEqual(forkReport.forked, [{ fromId: 'alpha', toId: 'forked-alpha' }]);
        const forked = await fork.service.api.get('forked-alpha', 2);
        assert.deepEqual(forked.provenance.forkedFrom, { recipeId: 'alpha', version: 2 });
        assert.equal(forked.provenance.importedAt !== null, true);
    });
});

describe('ModuleHost-facing Recipes factory', () => {
    it('provides only the domain API and delegates lifecycle/session changes', async () => {
        const repositories = new Map();
        const descriptor = recipes.createRecipesModule({
            defaultEnabled: false,
            repositoryFactory({ sessionId }) {
                if (!repositories.has(sessionId)) repositories.set(sessionId, new MemoryRecipeRepository());
                return repositories.get(sessionId);
            },
            clock() { return '2026-08-01T00:00:00.000Z'; },
            idFactory() { return 'generated-recipe'; }
        });
        assert.equal(descriptor.id, 'recipes');
        assert.equal(descriptor.defaultEnabled, false);
        assert.deepEqual(descriptor.provides, ['recipes']);

        let capability;
        const lifecycle = descriptor.create({
            session: 'account-a',
            provide(name, value) {
                assert.equal(name, 'recipes');
                capability = value;
            }
        });
        await lifecycle.start();
        await capability.create(basicDraft());
        await lifecycle.onSessionChange('account-b');
        assert.deepEqual(await capability.list(), []);
        await lifecycle.stop();
        await expectCodeAsync(capability.list(), 'SERVICE_INACTIVE');
        assert.equal('send' in capability, false);
        assert.equal('execute' in capability, false);

        assert.throws(() => recipes.createRecipesModule({ defaultEnabled: 'yes' }), /defaultEnabled/);
        assert.equal(recipes.createRecipesModule({
            repositoryFactory() { return new MemoryRecipeRepository(); },
            clock() { return '2026-08-01T00:00:00.000Z'; },
            idFactory() { return 'generated-recipe'; }
        }).defaultEnabled, true);
    });
});
