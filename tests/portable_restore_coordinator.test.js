const assert = require('node:assert/strict');
const { before, describe, it } = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let api;
before(async () => {
    api = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'portable_archive', 'index.js'
    )).href);
});

const CHECKSUM = 'b'.repeat(64);

function action(section, type = 'insert') {
    const incomingIdentity = `${section}-incoming`;
    const targetIdentity = type === 'rename' ? `${incomingIdentity}~imported` : incomingIdentity;
    return {
        section,
        action: type,
        incomingIdentity,
        targetIdentity,
        identityPatch: type === 'rename' ? { field: 'id', value: targetIdentity } : null,
        value: { id: incomingIdentity }
    };
}

function counts(actions) {
    const result = { total: actions.length, insert: 0, skip: 0, replace: 0, rename: 0 };
    actions.forEach(item => { result[item.action] += 1; });
    return result;
}

function plan(specification = { chats: ['insert'] }) {
    const order = api.PORTABLE_ARCHIVE_SECTIONS;
    const sections = order.filter(name => Object.hasOwn(specification, name)).map(name => {
        const actions = specification[name].map(type => action(name, type));
        return { name, summary: counts(actions), actions };
    });
    const summary = { total: 0, insert: 0, skip: 0, replace: 0, rename: 0 };
    sections.forEach(section => Object.keys(summary).forEach(key => { summary[key] += section.summary[key]; }));
    return { dryRun: true, strategy: 'replace', archiveChecksum: CHECKSUM, summary, sections };
}

function port(overrides = {}) {
    return {
        async snapshot() { return { before: true }; },
        async apply(context) { return { applied: context.actions.length }; },
        async rollback() { return { restored: true }; },
        ...overrides
    };
}

function lifecycle(overrides = {}) {
    let started = true;
    let generation = 1;
    return {
        get started() { return started; },
        set started(value) { started = value; },
        get generation() { return generation; },
        bump() { generation += 1; },
        requireStarted() {
            if (!started) throw new api.PortableArchiveFeatureError('NOT_STARTED', 'not started');
            return generation;
        },
        assertCurrent(value) {
            if (!started || value !== generation) {
                throw new api.PortableArchiveFeatureError('OPERATION_CANCELLED', 'changed');
            }
        },
        ...overrides
    };
}

function coordinator(options = {}) {
    const life = options.life ?? lifecycle();
    const integrations = options.integrations ?? {};
    return {
        life,
        value: api.createPortableRestoreCoordinator({
            getIntegrations: async () => api.normalizePortableArchiveIntegrations(integrations),
            contributors: options.contributors,
            executor: options.executor,
            createExecutor: options.createExecutor,
            isReadOnly: options.isReadOnly,
            requireStarted: () => life.requireStarted(),
            assertCurrent: value => life.assertCurrent(value)
        })
    };
}

function expectCode(code) {
    return error => error?.code === code;
}

describe('Portable archive integration map', () => {
    it('normalizes object, Map, sync, and async sources without sharing maps', async () => {
        assert.equal((await api.createPortableIntegrationResolver()()).size, 0);
        const integration = { section: 'chats', exportSection() { return []; } };
        const fromObject = await api.createPortableIntegrationResolver({ chats: integration })();
        const fromMap = await api.createPortableIntegrationResolver(new Map([['chats', integration]]))();
        const fromFunction = await api.createPortableIntegrationResolver(async () => ({ chats: integration }))();
        for (const value of [fromObject, fromMap, fromFunction]) {
            assert.equal(value.get('chats').section, 'chats');
            assert.notEqual(value, integration);
            assert.equal(Object.isFrozen(value.get('chats')), true);
        }
    });

    it('rejects malformed sources, sections, fields, and capabilities', async () => {
        for (const source of [null, [], 1]) {
            assert.throws(() => api.createPortableIntegrationResolver(source), TypeError);
        }
        await assert.rejects(api.createPortableIntegrationResolver(() => [])(), expectCode('INVALID_INTEGRATIONS'));
        for (const value of [
            { other: { section: 'other', exportSection() {} } },
            { chats: null },
            { chats: { section: 'annotations', exportSection() {} } },
            { chats: { section: 'chats', exportSection() {}, extra: true } },
            { chats: { section: 'chats', exportSection: true } },
            { chats: { section: 'chats', contributor: true } },
            { chats: { section: 'chats' } }
        ]) {
            assert.throws(() => api.normalizePortableArchiveIntegrations(value), expectCode('INVALID_INTEGRATIONS'));
        }
    });
});

describe('Portable restore coordinator', () => {
    it('describes skip, missing, integration, and explicit contributor capabilities', async () => {
        const integrationPort = port();
        const { value } = coordinator({
            integrations: { annotations: { section: 'annotations', contributor: integrationPort } },
            contributors: { chats: port() }
        });
        const description = await value.describe(plan({
            chats: ['insert'], annotations: ['replace'], collections: ['skip']
        }));
        assert.deepEqual(description.sections, [
            { name: 'chats', actionCount: 1, available: true, reason: null },
            { name: 'annotations', actionCount: 1, available: true, reason: null },
            { name: 'collections', actionCount: 0, available: false, reason: 'NO_CHANGES' }
        ]);
        assert.equal(description.contributors.annotations, integrationPort);

        const missing = await coordinator().value.describe(plan({ chats: ['insert'] }));
        assert.deepEqual(missing.sections[0], {
            name: 'chats', actionCount: 1, available: false, reason: 'MISSING_CONTRIBUTOR'
        });
    });

    it('executes once, forwards progress, rejects unsafe selections, and resets for a new session', async () => {
        const progress = [];
        const { value } = coordinator({ contributors: { chats: port(), annotations: port() } });
        const restorePlan = plan({ chats: ['insert'], annotations: ['replace'] });
        const result = await value.execute(restorePlan, {
            sections: ['annotations'],
            onProgress: entry => progress.push(entry)
        });
        assert.equal(result.status, 'completed');
        assert.deepEqual(result.selectedSections, ['annotations']);
        assert.ok(progress.length >= 4);
        const defaultSelection = coordinator({ contributors: { chats: port() } }).value;
        assert.deepEqual((await defaultSelection.execute(plan())).selectedSections, ['chats']);
        await assert.rejects(value.execute(restorePlan, { sections: ['annotations'] }), expectCode('RESTORE_ALREADY_EXECUTED'));
        assert.equal(value.reset('new-session'), false);
        assert.equal((await value.execute(restorePlan, { sections: ['annotations'] })).status, 'completed');

        for (const executeOptions of [null, [], 'bad']) {
            await assert.rejects(value.execute(plan(), executeOptions), expectCode('INVALID_ARGUMENT'));
        }
        await assert.rejects(value.execute(plan(), { sections: 'chats' }), expectCode('INVALID_SELECTION'));
        await assert.rejects(value.execute(plan(), { sections: [] }), expectCode('INVALID_SELECTION'));
        await assert.rejects(value.execute(plan(), { sections: ['chats', 'chats'] }), expectCode('INVALID_SELECTION'));
        await assert.rejects(value.execute(plan(), { sections: ['annotations'] }), expectCode('INVALID_SELECTION'));
        await assert.rejects(
            coordinator().value.execute(plan(), { sections: ['chats'] }),
            expectCode('SECTION_UNAVAILABLE')
        );
        await assert.rejects(
            coordinator({ contributors: { chats: port() } }).value.execute(plan({ chats: ['skip'] }), { sections: ['chats'] }),
            expectCode('SECTION_UNAVAILABLE')
        );
    });

    it('blocks inspection, validates construction and contributor sources, and supports external executor metadata', async () => {
        for (const options of [
            {},
            { getIntegrations() {}, requireStarted: true, assertCurrent() {} },
            { getIntegrations() {}, requireStarted() {} },
            { getIntegrations() {}, requireStarted() {}, assertCurrent() {}, isReadOnly: true },
            { getIntegrations() {}, requireStarted() {}, assertCurrent() {}, executor: {} },
            { getIntegrations() {}, requireStarted() {}, assertCurrent() {}, createExecutor: true }
        ]) {
            assert.throws(() => api.createPortableRestoreCoordinator(options), TypeError);
        }

        const readOnly = coordinator({ contributors: { chats: port() }, isReadOnly: () => true }).value;
        await assert.rejects(readOnly.execute(plan(), { sections: ['chats'] }), expectCode('READ_ONLY_SESSION'));

        for (const contributors of [null, []]) {
            assert.throws(() => coordinator({ contributors }), TypeError);
        }
        for (const contributors of [{ other: port() }, { chats: null }]) {
            const invalid = coordinator({ contributors }).value;
            await assert.rejects(invalid.describe(plan()), error => Boolean(error?.code));
        }

        const calls = [];
        const external = {
            sections: ['chats'],
            async execute(input, options) {
                calls.push({ input, options });
                return { status: 'external', sections: [], rollbackErrors: [] };
            }
        };
        const externalCoordinator = coordinator({ executor: external }).value;
        assert.equal((await externalCoordinator.describe(plan())).sections[0].available, true);
        assert.equal((await externalCoordinator.execute(plan(), { sections: ['chats'] })).status, 'external');
        assert.equal(calls.length, 1);

        const byMethod = coordinator({
            executor: { hasContributor: name => name === 'chats', async execute() { return { status: 'method' }; } }
        }).value;
        assert.equal((await byMethod.describe(plan())).sections[0].available, true);
    });

    it('cancels active work, forwards external abort, and detects lifecycle changes', async () => {
        let entered;
        const enteredPromise = new Promise(resolve => { entered = resolve; });
        const waiting = port({
            async apply(context) {
                entered();
                await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true }));
                throw Object.assign(new Error('aborted'), { code: 'RESTORE_ABORTED' });
            }
        });
        const first = coordinator({ contributors: { chats: waiting } });
        const pending = first.value.execute(plan(), { sections: ['chats'] });
        await enteredPromise;
        assert.equal(first.value.running, true);
        await assert.rejects(first.value.execute(plan(), { sections: ['chats'] }), expectCode('RESTORE_IN_PROGRESS'));
        assert.equal(first.value.cancel('user'), true);
        assert.equal(first.value.cancel('again'), false);
        await assert.rejects(pending, expectCode('RESTORE_ABORTED'));
        assert.equal(first.value.running, false);

        const aborted = new AbortController();
        aborted.abort('external');
        const externalAbort = coordinator({ contributors: { chats: port() } }).value;
        await assert.rejects(
            externalAbort.execute(plan(), { sections: ['chats'], signal: aborted.signal }),
            expectCode('RESTORE_ABORTED')
        );
        const liveSignal = new AbortController();
        assert.equal((await coordinator({ contributors: { chats: port() } }).value.execute(
            plan(), { sections: ['chats'], signal: liveSignal.signal }
        )).status, 'completed');
        await assert.rejects(
            coordinator({ contributors: { chats: port() } }).value.execute(plan(), { sections: ['chats'], signal: {} }),
            expectCode('INVALID_ABORT_SIGNAL')
        );

        let release;
        const ignoredAbortExecutor = {
            sections: ['chats'],
            async execute() { await new Promise(resolve => { release = resolve; }); return { status: 'late' }; }
        };
        const changed = coordinator({ executor: ignoredAbortExecutor });
        const late = changed.value.execute(plan(), { sections: ['chats'] });
        while (!release) await Promise.resolve();
        changed.life.bump();
        changed.value.reset('session-change');
        release();
        await assert.rejects(late, expectCode('OPERATION_CANCELLED'));
    });
});
