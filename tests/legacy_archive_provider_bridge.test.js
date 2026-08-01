const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let createLegacyArchiveProviderBridge;
before(async () => {
    ({ createLegacyArchiveProviderBridge } = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'portable_archive', 'legacy_provider_bridge.js'
    )).href));
});

describe('legacy Export provider bridge', () => {
    it('validates providers and sends exact section selections without leaking extras', async () => {
        assert.throws(() => createLegacyArchiveProviderBridge(), /getTranscript/);
        const calls = [];
        const bridge = createLegacyArchiveProviderBridge({
            getTranscript: () => ({ chatId: 'visible', messages: [{ role: 'user', text: 'hi' }] })
        });
        assert.equal(bridge.configure(), bridge);
        assert.equal(bridge.archiveSectionsProvider, null);
        assert.equal(bridge.contributorsProvider, null);
        assert.equal(bridge.availabilityProvider, null);
        for (const field of ['archiveSectionsProvider', 'contributorsProvider', 'availabilityProvider']) {
            assert.throws(() => bridge.configure({ [field]: true }), new RegExp(field));
        }
        const contributorsProvider = () => ({});
        const availabilityProvider = () => ({ sections: {} });
        const archiveSectionsProvider = options => {
            calls.push(options);
            return { annotations: ['note'], recipes: ['recipe'], queue: ['must-not-leak'] };
        };
        bridge.configure({
            archiveSectionsProvider, contributorsProvider, availabilityProvider
        });
        assert.equal(bridge.archiveSectionsProvider, archiveSectionsProvider);
        assert.equal(bridge.contributorsProvider, contributorsProvider);
        assert.equal(bridge.availabilityProvider, availabilityProvider);
        const signal = new AbortController().signal;
        assert.deepEqual(await bridge.getSections({ include: ['annotations', 'recipes'], signal }), {
            annotations: ['note'], recipes: ['recipe']
        });
        assert.deepEqual(calls, [{ include: ['annotations', 'recipes'], signal }]);
        assert.deepEqual(await bridge.getSections({ include: [] }), {});
        for (const options of [null, [], { include: ['unknown'] }, { include: ['chats', 'chats'] }]) {
            await assert.rejects(bridge.getSections(options), /options|selection/);
        }
    });

    it('uses strict chats when available and the visible transcript for expected unavailability', async () => {
        const transcript = { chatId: 'visible', messages: [{ role: 'user', text: 'fallback' }] };
        const bridge = createLegacyArchiveProviderBridge({ getTranscript: () => transcript });
        assert.deepEqual(await bridge.getSections(), { chats: [transcript] });

        const rich = {
            ...transcript,
            href: 'https://gemini.google.com/app/visible',
            messages: [{ role: 'model', text: 'rich', parts: [{ type: 'code', text: 'x' }] }],
            structure: { kind: 'current-rich' },
            fidelity: { status: 'complete' },
            metadata: { model: 'gemini-pro', richResponse: true }
        };
        const richBridge = createLegacyArchiveProviderBridge({ getTranscript: () => rich });
        const providerVisible = Object.freeze({
            id: 'visible',
            tags: Object.freeze(['important']),
            annotations: Object.freeze([{ text: 'local note' }]),
            aliases: Object.freeze(['work-chat']),
            collections: Object.freeze(['research']),
            localOnly: true,
            metadata: Object.freeze({ indexed: true, model: 'older-model' }),
            messages: Object.freeze([{ role: 'model', text: 'normalized' }]),
            structure: Object.freeze({ kind: 'normalized' }),
            fidelity: Object.freeze({ status: 'partial' })
        });
        const providerChats = Object.freeze([
            Object.freeze({ id: 'older', messages: Object.freeze([]) }),
            providerVisible
        ]);
        richBridge.configure({ archiveSectionsProvider: () => ({ chats: providerChats }) });
        assert.deepEqual(await richBridge.getSections({ include: ['chats'] }), {
            chats: [providerChats[0], {
                ...providerVisible,
                ...rich,
                tags: providerVisible.tags,
                annotations: providerVisible.annotations,
                aliases: providerVisible.aliases,
                collections: providerVisible.collections,
                metadata: { indexed: true, model: 'gemini-pro', richResponse: true }
            }]
        });
        assert.equal((await richBridge.getSections()).chats[1].messages[0].parts[0].type, 'code');
        assert.deepEqual(providerVisible.messages, [{ role: 'model', text: 'normalized' }]);
        assert.deepEqual(providerVisible.metadata, { indexed: true, model: 'older-model' });
        bridge.configure({ archiveSectionsProvider: () => ({ annotations: [] }) });
        assert.deepEqual(await bridge.getSections({ include: ['chats'] }), { chats: [transcript] });

        for (const code of ['MISSING_SECTION', 'SECTION_DISABLED', 'SECTION_UNAVAILABLE', 'WIRING_INACTIVE']) {
            bridge.configure({ archiveSectionsProvider() { throw Object.assign(new Error(code), { code }); } });
            assert.deepEqual(await bridge.getSections({ include: ['chats'] }), { chats: [transcript] });
        }
        bridge.configure({ archiveSectionsProvider() { throw new Error('provider bug'); } });
        await assert.rejects(bridge.getSections({ include: ['chats'] }), /provider bug/);

        const empty = createLegacyArchiveProviderBridge({
            getTranscript: () => ({ chatId: '', messages: [] })
        });
        assert.deepEqual(await empty.getSections(), { chats: [] });

        const anonymous = { chatId: '', title: 'Draft', messages: [{ role: 'user', text: 'draft' }] };
        const anonymousBridge = createLegacyArchiveProviderBridge({ getTranscript: () => anonymous });
        anonymousBridge.configure({ archiveSectionsProvider: () => ({ chats: [anonymous] }) });
        assert.deepEqual((await anonymousBridge.getSections()).chats, [anonymous]);
        anonymousBridge.configure({ archiveSectionsProvider: () => ({ chats: [{ id: 'known', messages: [] }] }) });
        assert.deepEqual((await anonymousBridge.getSections()).chats, [
            { id: 'known', messages: [] }, anonymous
        ]);
        anonymousBridge.configure({ archiveSectionsProvider: () => ({ chats: {} }) });
        await assert.rejects(anonymousBridge.getSections(), /must return an array/);
    });

    it('fails closed on invalid provider records and duplicate identities', async () => {
        const bridge = createLegacyArchiveProviderBridge({
            getTranscript: () => ({ chatId: '', messages: [] })
        });
        for (const chats of [
            [null],
            ['chat'],
            [{ id: 'same' }, { chatId: 'same' }],
            [{ chatId: ' ', id: 'same' }, { chatId: 'same' }]
        ]) {
            bridge.configure({ archiveSectionsProvider: () => ({ chats }) });
            await assert.rejects(bridge.getSections(), /object records|duplicate identity/);
        }
    });

    it('keeps provider content when the matching visible capture is empty', async () => {
        const transcript = {
            format: 'primer-pp.chat-transcript',
            schemaVersion: 1,
            chatId: 'visible',
            title: 'Current title',
            messages: [],
            structure: { kind: 'empty-capture' },
            fidelity: { status: 'empty' },
            metadata: { model: 'gemini-pro', visibleMessageCount: 0 }
        };
        const provided = Object.freeze({
            id: 'visible',
            title: 'Indexed title',
            tags: Object.freeze(['local']),
            messages: Object.freeze([{ role: 'model', text: 'indexed content' }]),
            structure: Object.freeze({ kind: 'indexed-rich' }),
            fidelity: Object.freeze({ status: 'complete' }),
            metadata: Object.freeze({ indexed: true, model: 'older-model' })
        });
        const bridge = createLegacyArchiveProviderBridge({ getTranscript: () => transcript });
        bridge.configure({ archiveSectionsProvider: () => ({ chats: Object.freeze([provided]) }) });
        const [merged] = (await bridge.getSections()).chats;
        assert.equal(merged.title, 'Current title');
        assert.equal(merged.tags, provided.tags);
        assert.equal(merged.messages, provided.messages);
        assert.equal(merged.structure, provided.structure);
        assert.equal(merged.fidelity, provided.fidelity);
        assert.equal(Object.hasOwn(merged, 'format'), false);
        assert.equal(Object.hasOwn(merged, 'schemaVersion'), false);
        assert.deepEqual(merged.metadata, {
            indexed: true, model: 'gemini-pro', visibleMessageCount: 0
        });
        assert.deepEqual(provided.messages, [{ role: 'model', text: 'indexed content' }]);
    });

    it('uses canonical anonymous dedupe and never appends an empty unmatched capture', async () => {
        const transcript = {
            chatId: '', title: 'Draft', messages: [{ role: 'user', text: 'draft' }],
            metadata: { model: 'pro', indexed: true }
        };
        const sameWithDifferentInsertionOrder = Object.freeze({
            metadata: Object.freeze({ indexed: true, model: 'pro' }),
            messages: Object.freeze([{ text: 'draft', role: 'user' }]),
            title: 'Draft',
            chatId: ''
        });
        const bridge = createLegacyArchiveProviderBridge({ getTranscript: () => transcript });
        bridge.configure({
            archiveSectionsProvider: () => ({ chats: Object.freeze([sameWithDifferentInsertionOrder]) })
        });
        const deduped = (await bridge.getSections()).chats;
        assert.equal(deduped.length, 1);
        assert.equal(deduped[0], sameWithDifferentInsertionOrder);

        const emptyBridge = createLegacyArchiveProviderBridge({
            getTranscript: () => ({ chatId: 'unmatched', messages: [] })
        });
        emptyBridge.configure({ archiveSectionsProvider: () => ({ chats: [{ id: 'known', messages: [] }] }) });
        assert.deepEqual((await emptyBridge.getSections()).chats, [{ id: 'known', messages: [] }]);
    });

    it('adapts live contributors and availability while always advertising transcript export', async () => {
        const contributors = { recipes: { snapshot() {}, apply() {}, rollback() {} } };
        const bridge = createLegacyArchiveProviderBridge({
            getTranscript: () => ({ chatId: '', messages: [] })
        });
        assert.deepEqual(bridge.getContributors(), {});
        assert.equal(await bridge.getAvailability(), null);
        bridge.configure({
            contributorsProvider: () => contributors,
            availabilityProvider: () => ({
                generation: 2,
                state: 'ready',
                sections: { chats: { status: 'disabled' }, recipes: { status: 'available' } }
            })
        });
        assert.equal(bridge.getContributors(), contributors);
        const snapshot = await bridge.getAvailability();
        assert.equal(Object.isFrozen(snapshot), true);
        assert.deepEqual(snapshot.sections.chats, {
            status: 'available', reasonCode: 'TRANSCRIPT_FALLBACK'
        });
        assert.equal(snapshot.sections.recipes.status, 'available');

        bridge.configure({ availabilityProvider: () => ({ sections: { chats: { status: 'available' } } }) });
        assert.deepEqual((await bridge.getAvailability()).sections.chats, { status: 'available' });
        bridge.configure({ availabilityProvider: () => [] });
        await assert.rejects(bridge.getAvailability(), /availability snapshot/);
        bridge.configure({ availabilityProvider: () => ({ sections: [] }) });
        await assert.rejects(bridge.getAvailability(), /availability snapshot/);
    });
});
