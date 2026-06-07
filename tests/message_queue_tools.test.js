const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    addQueueItem,
    addQueueItems,
    cancelQueueItem,
    clearQueueHistory,
    createQueueItem,
    DEFAULT_QUEUE_INTERVAL_MS,
    evaluateQueueSafety,
    getNextQueuedItem,
    getQueueStats,
    MAX_QUEUE_INTERVAL_MS,
    MIN_QUEUE_INTERVAL_MS,
    markQueueItemFailed,
    markQueueItemSending,
    markQueueItemSent,
    moveQueueItem,
    normalizeQueueData,
    normalizeQueueIntervalMs,
    normalizeQueueItem,
    removeQueueItem,
    setQueueInterval,
    setQueuePaused,
    updateQueueItem
} = require('../lib/message_queue_tools.js');

describe('message_queue_tools', () => {
    const nowIso = '2026-06-08T00:00:00.000Z';
    const laterIso = '2026-06-08T01:00:00.000Z';

    it('normalizes queue items and recovers stranded sending state when requested', () => {
        assert.equal(normalizeQueueItem(null), null);
        assert.equal(normalizeQueueItem({ text: '   ' }), null);

        const item = normalizeQueueItem({
            content: '  First line\nSecond line  ',
            status: 'sending',
            error: '  err  '
        }, 2, { nowIso });

        assert.equal(item.id, 'q_2');
        assert.equal(item.title, 'First line');
        assert.equal(item.text, 'First line\nSecond line');
        assert.equal(item.status, 'sending');
        assert.equal(item.createdAt, nowIso);
        assert.equal(item.updatedAt, nowIso);
        assert.equal(item.error, 'err');

        assert.equal(normalizeQueueItem({ text: 'x', status: 'sending' }, 0, { recoverSending: true }).status, 'queued');
        assert.equal(normalizeQueueItem({ text: 'x', status: 'mystery' }).status, 'queued');
    });

    it('normalizes queue data with safe defaults and active item validation', () => {
        assert.deepEqual(normalizeQueueData(null), {
            paused: true,
            activeId: '',
            lastError: '',
            intervalMs: DEFAULT_QUEUE_INTERVAL_MS,
            items: []
        });

        const data = normalizeQueueData({
            paused: false,
            activeId: 'a',
            lastError: '  wait  ',
            intervalMs: '2500',
            items: [
                { id: 'a', text: 'one', status: 'sending' },
                { id: 'b', text: '' },
                'bad'
            ]
        }, { nowIso });

        assert.equal(data.paused, false);
        assert.equal(data.activeId, 'a');
        assert.equal(data.lastError, 'wait');
        assert.equal(data.intervalMs, 2500);
        assert.deepEqual(data.items.map(item => item.id), ['a']);

        const recovered = normalizeQueueData(data, { recoverSending: true });
        assert.equal(recovered.activeId, '');
        assert.equal(recovered.items[0].status, 'queued');
        assert.deepEqual(normalizeQueueData({ items: {} }).items, []);
    });

    it('normalizes and updates queue pacing intervals', () => {
        assert.equal(normalizeQueueIntervalMs(undefined), DEFAULT_QUEUE_INTERVAL_MS);
        assert.equal(normalizeQueueIntervalMs('bad'), DEFAULT_QUEUE_INTERVAL_MS);
        assert.equal(normalizeQueueIntervalMs(2500.4), 2500);
        assert.equal(normalizeQueueIntervalMs(MIN_QUEUE_INTERVAL_MS - 1), MIN_QUEUE_INTERVAL_MS);
        assert.equal(normalizeQueueIntervalMs(MAX_QUEUE_INTERVAL_MS + 1), MAX_QUEUE_INTERVAL_MS);

        const paced = setQueueInterval({ intervalMs: 1200, items: [{ id: 'a', text: 'one' }] }, '3400');
        assert.equal(paced.intervalMs, 3400);
        assert.equal(paced.items[0].id, 'a');
    });

    it('creates and adds queue items at the requested position', () => {
        assert.equal(createQueueItem(''), null);

        const generated = createQueueItem('body', { nowIso });
        assert.match(generated.id, /^q_\d+/);
        assert.equal(generated.title, 'body');

        const item = createQueueItem('body', { id: 'id1', title: 'Title', nowIso });
        assert.equal(item.id, 'id1');
        assert.equal(item.title, 'Title');
        assert.equal(item.status, 'queued');

        const first = addQueueItem({ lastError: 'old' }, 'one', { id: 'one', nowIso });
        const front = addQueueItem(first, 'two', { id: 'two', position: 'front', nowIso: laterIso });
        const unchanged = addQueueItem(front, '');

        assert.deepEqual(front.items.map(entry => entry.id), ['two', 'one']);
        assert.equal(front.lastError, '');
        assert.deepEqual(unchanged.items.map(entry => entry.id), ['two', 'one']);
    });

    it('adds multiple queue items with stable ordering and ids', () => {
        const base = addQueueItem({ lastError: 'old' }, 'existing', { id: 'existing', nowIso });
        const result = addQueueItems(base, [
            { text: 'first step', title: 'Step One' },
            { content: 'second step', id: 'custom' },
            'third step',
            { text: '   ' }
        ], {
            idPrefix: 'chain',
            nowIso: laterIso
        });

        assert.equal(result.added, 3);
        assert.deepEqual(result.items.map(item => item.id), ['chain_1', 'custom', 'chain_3']);
        assert.deepEqual(result.data.items.map(item => item.id), ['existing', 'chain_1', 'custom', 'chain_3']);
        assert.equal(result.data.items[1].title, 'Step One');
        assert.equal(result.data.items[2].title, 'second step');
        assert.equal(result.data.lastError, '');
        assert.equal(result.data.items[1].createdAt, laterIso);

        const front = addQueueItems(base, ['front one', 'front two'], {
            idPrefix: 'front',
            position: 'front',
            nowIso
        });
        assert.deepEqual(front.data.items.map(item => item.id), ['front_1', 'front_2', 'existing']);

        const single = addQueueItems({}, 'solo item', { nowIso });
        assert.equal(single.added, 1);
        assert.match(single.items[0].id, /^q_\d+_1$/);
        assert.equal(single.items[0].text, 'solo item');

        const unchanged = addQueueItems(base, ['', null]);
        assert.equal(unchanged.added, 0);
        assert.deepEqual(unchanged.data.items.map(item => item.id), ['existing']);
        assert.equal(unchanged.data.lastError, '');
    });

    it('updates item title and text while ignoring empty replacement text', () => {
        const data = addQueueItem({}, 'original text', { id: 'a', nowIso });
        const titled = updateQueueItem(data, 'a', { title: '  New Title  ' }, { nowIso: laterIso });
        assert.equal(titled.items[0].title, 'New Title');
        assert.equal(titled.items[0].updatedAt, laterIso);

        const retitledFromText = updateQueueItem(titled, 'a', { title: '', text: 'replacement' }, { nowIso });
        assert.equal(retitledFromText.items[0].text, 'replacement');
        assert.equal(retitledFromText.items[0].title, 'replacement');

        const textOnly = updateQueueItem(retitledFromText, 'a', { text: 'text only' }, { nowIso });
        assert.equal(textOnly.items[0].text, 'text only');
        assert.equal(textOnly.items[0].title, 'replacement');

        const derivedTitle = updateQueueItem(textOnly, 'a', { title: '' }, { nowIso });
        assert.equal(derivedTitle.items[0].title, 'text only');

        const ignoredText = updateQueueItem(retitledFromText, 'a', { text: '   ' }, { nowIso });
        assert.equal(ignoredText.items[0].text, 'replacement');

        assert.deepEqual(updateQueueItem(data, 'missing', { title: 'x' }), normalizeQueueData(data));
    });

    it('removes and reorders queue items with bounds checks', () => {
        let data = addQueueItem({}, 'one', { id: 'one', nowIso });
        data = addQueueItem(data, 'two', { id: 'two', nowIso });
        data = addQueueItem(data, 'three', { id: 'three', nowIso });

        assert.deepEqual(moveQueueItem(data, 'missing', 'up').items.map(item => item.id), ['one', 'two', 'three']);
        assert.deepEqual(moveQueueItem(data, 'one', 'up').items.map(item => item.id), ['one', 'two', 'three']);
        assert.deepEqual(moveQueueItem(data, 'two', 'up').items.map(item => item.id), ['two', 'one', 'three']);
        assert.deepEqual(moveQueueItem(data, 'two', 'down').items.map(item => item.id), ['one', 'three', 'two']);
        assert.deepEqual(moveQueueItem(data, 'one', 2).items.map(item => item.id), ['two', 'three', 'one']);
        assert.deepEqual(moveQueueItem(data, 'one', 0).items.map(item => item.id), ['one', 'two', 'three']);
        assert.deepEqual(moveQueueItem(data, 'one', 'sideways').items.map(item => item.id), ['one', 'two', 'three']);

        const sending = markQueueItemSending(data, 'two', { nowIso });
        const removed = removeQueueItem(sending, 'two');
        assert.equal(removed.activeId, '');
        assert.deepEqual(removed.items.map(item => item.id), ['one', 'three']);
    });

    it('pauses, resumes, finds next queued item, and marks send lifecycle', () => {
        let data = addQueueItem({}, 'one', { id: 'one', nowIso });
        data = addQueueItem(data, 'two', { id: 'two', nowIso });

        const running = setQueuePaused(data, false, { lastError: '' });
        assert.equal(running.paused, false);
        assert.equal(getNextQueuedItem(running).id, 'one');

        const sending = markQueueItemSending(running, 'one', { nowIso: laterIso });
        assert.equal(sending.items[0].status, 'sending');
        assert.equal(sending.activeId, 'one');
        assert.equal(sending.paused, false);
        assert.equal(getQueueStats(sending).sending, 1);

        const sent = markQueueItemSent(sending, 'one', { nowIso: laterIso });
        assert.equal(sent.items[0].status, 'sent');
        assert.equal(sent.items[0].sentAt, laterIso);
        assert.equal(sent.activeId, '');
        assert.equal(getNextQueuedItem({ items: [{ id: 'sent', text: 'done', status: 'sent' }] }), null);

        const failed = markQueueItemFailed(sent, 'two', ' unavailable ', { nowIso });
        assert.equal(failed.items[1].status, 'queued');
        assert.equal(failed.items[1].error, 'unavailable');
        assert.equal(failed.paused, true);
        assert.equal(failed.lastError, 'unavailable');

        const terminal = markQueueItemFailed(failed, 'two', '', { requeue: false, nowIso });
        assert.equal(terminal.items[1].status, 'failed');
        assert.equal(terminal.items[1].error, 'Queue send failed');

        const activeFailure = markQueueItemFailed(sending, 'one', 'stopped', { nowIso });
        assert.equal(activeFailure.activeId, '');

        assert.deepEqual(markQueueItemSending(data, 'missing'), normalizeQueueData(data));
        assert.deepEqual(markQueueItemSent(data, 'missing'), normalizeQueueData(data));
        assert.deepEqual(markQueueItemFailed(data, 'missing', 'x'), normalizeQueueData(data));
    });

    it('cancels items, clears completed history, and reports stats', () => {
        let data = addQueueItem({}, 'queued', { id: 'queued', nowIso });
        data = addQueueItem(data, 'done', { id: 'done', nowIso });
        data = addQueueItem(data, 'cancel', { id: 'cancel', nowIso });
        data = markQueueItemSent(data, 'done', { nowIso });
        data = cancelQueueItem(data, 'cancel', { nowIso: laterIso });

        assert.equal(data.items[2].status, 'cancelled');
        assert.equal(data.items[2].updatedAt, laterIso);
        const activeCancel = cancelQueueItem(markQueueItemSending(data, 'queued'), 'queued');
        assert.equal(activeCancel.activeId, '');
        assert.deepEqual(cancelQueueItem(data, 'missing'), normalizeQueueData(data));

        const stats = getQueueStats(data);
        assert.deepEqual(stats, {
            total: 3,
            queued: 1,
            sending: 0,
            sent: 1,
            failed: 0,
            cancelled: 1,
            pending: 1,
            paused: true
        });

        const cleared = clearQueueHistory(data);
        assert.deepEqual(cleared.items.map(item => item.id), ['queued']);
    });

    it('evaluates automation safety from adapter-facing context', () => {
        assert.deepEqual(evaluateQueueSafety(), { ok: true, reason: '' });
        assert.deepEqual(evaluateQueueSafety({ toolModeActive: true, toolModeLabel: 'Canvas' }), {
            ok: false,
            reason: 'Tool mode active: Canvas'
        });
        assert.deepEqual(evaluateQueueSafety({ toolModeActive: true }), {
            ok: false,
            reason: 'Tool mode active: unknown tool mode'
        });
        assert.deepEqual(evaluateQueueSafety({ editorReady: false }), {
            ok: false,
            reason: 'Input editor unavailable'
        });
        assert.deepEqual(evaluateQueueSafety({ sendReady: false }), {
            ok: false,
            reason: 'Send button unavailable'
        });
    });
});
