const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let health;
before(async () => {
    health = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'capability_health', 'index.js'
    )).href);
});

function feature(snapshot, id) {
    return snapshot.features.find(item => item.id === id);
}

describe('Capability Health snapshots', () => {
    it('produces all five states from injected structural facts without reading private Gemini data', async () => {
        let selectorReads = 0;
        const adapter = {
            getSelectorHealthReport() {
                selectorReads += 1;
                return {
                    checks: [
                        { id: 'composer', ok: true, label: 'ignored' },
                        { id: 'sidebar', ok: false, detail: 'ignored' },
                        { id: 'optional-menu', ok: false }
                    ]
                };
            },
            getCurrentConversationMessages() { throw new Error('must not read message bodies'); },
            getChatTitleText() { throw new Error('must not read titles'); },
            getCurrentUser() { throw new Error('must not read account data'); }
        };
        const probeCalls = [];
        const monitor = health.createCapabilityHealth({
            version: '13.0.0',
            adapter,
            probe(request) {
                probeCalls.push(request);
                return { adapterVersion: 'gemini-2026.08', features: {} };
            },
            nativeCapabilities: {
                notebooks: { available: true, owned: true, version: '2026.08', reasonCode: 'GEMINI_NATIVE' }
            },
            clock: () => '2026-08-01T00:00:00.000Z',
            features: [
                { id: 'z_available', version: '2', selectors: { required: ['composer'] } },
                { id: 'a_degraded', selectors: { optional: ['optional-menu'] } },
                { id: 'm_native', nativeCapability: 'notebooks' },
                { id: 'b_disabled', enabled: false },
                { id: 'f_failed', selectors: { required: ['sidebar'] } }
            ]
        });

        const snapshot = await monitor.refresh();
        assert.equal(selectorReads, 1);
        assert.equal(probeCalls.length, 1);
        assert.deepEqual(probeCalls[0].selectorIds, ['composer', 'optional-menu', 'sidebar']);
        assert.deepEqual(snapshot.features.map(item => item.id), [
            'a_degraded', 'b_disabled', 'f_failed', 'm_native', 'z_available'
        ]);
        assert.equal(feature(snapshot, 'z_available').status, 'available');
        assert.equal(feature(snapshot, 'z_available').action, 'run');
        assert.equal(feature(snapshot, 'a_degraded').status, 'degraded');
        assert.equal(feature(snapshot, 'a_degraded').action, 'run-degraded');
        assert.equal(feature(snapshot, 'b_disabled').status, 'disabled');
        assert.equal(feature(snapshot, 'b_disabled').action, 'skip');
        assert.equal(feature(snapshot, 'f_failed').status, 'failed');
        assert.equal(feature(snapshot, 'f_failed').action, 'disable');
        assert.equal(feature(snapshot, 'm_native').status, 'native-owned');
        assert.equal(feature(snapshot, 'm_native').action, 'delegate-native');
        assert.equal(feature(snapshot, 'm_native').nativeCapability.version, '2026.08');
        assert.equal(snapshot.generatedAt, '2026-08-01T00:00:00.000Z');
        assert.equal(snapshot.adapterVersion, 'gemini-2026.08');
        assert.equal(snapshot.version, '13.0.0');
        assert.equal(Object.isFrozen(snapshot), true);
        assert.equal(Object.isFrozen(snapshot.features), true);
        assert.deepEqual(feature(snapshot, 'f_failed').selectorHealth.failedRequired, ['sidebar']);
        const serialized = JSON.stringify(snapshot);
        assert.doesNotMatch(serialized, /message bodies|titles|account data|ignored/);
    });

    it('applies explicit degradation strategies to missing evidence and probe failures', async () => {
        const nativeUnknown = health.createCapabilityHealth({
            features: [{
                id: 'native_bridge',
                nativeCapability: 'native.bridge',
                degradationPolicy: { onNativeFactsFailure: 'available' }
            }],
            nativeCapabilities() { throw new Error('unavailable'); },
            clock: () => 0
        });
        assert.equal(feature(await nativeUnknown.refresh(), 'native_bridge').status, 'available');
        assert.equal(feature(nativeUnknown.getSnapshot(), 'native_bridge').reason.code, 'NATIVE_FACTS_UNAVAILABLE');

        const custom = health.createCapabilityHealth({
            features: [
                {
                    id: 'required_fallback',
                    selectors: { required: ['missing'] },
                    degradationPolicy: { onMissingRequired: 'degraded' }
                },
                {
                    id: 'optional_accepted',
                    selectors: { optional: ['missing'] },
                    degradationPolicy: { onMissingOptional: 'available' }
                },
                {
                    id: 'enablement_error',
                    enabled() { throw new Error('bad preference'); }
                }
            ],
            adapter: { getSelectorHealthReport: () => ({ checks: [] }) },
            clock: () => 0
        });
        const snapshot = await custom.refresh();
        assert.equal(feature(snapshot, 'required_fallback').status, 'degraded');
        assert.equal(feature(snapshot, 'required_fallback').reason.code, 'REQUIRED_SELECTOR_MISSING');
        assert.equal(feature(snapshot, 'optional_accepted').status, 'available');
        assert.equal(feature(snapshot, 'optional_accepted').reason.code, 'OPTIONAL_SELECTOR_GAP_ACCEPTED');
        assert.equal(feature(snapshot, 'enablement_error').reason.code, 'ENABLEMENT_CHECK_FAILED');

        const failedProbe = health.createCapabilityHealth({
            features: [{
                id: 'probe_fallback',
                degradationPolicy: { onProbeFailure: 'degraded' }
            }],
            probe() { throw new Error('offline'); },
            clock: () => 0
        });
        assert.equal(feature(await failedProbe.refresh(), 'probe_fallback').status, 'degraded');
        assert.equal(feature(failedProbe.getSnapshot(), 'probe_fallback').reason.code, 'FEATURE_PROBE_UNAVAILABLE');
    });

    it('normalizes feature probe outcomes and native augmentation', async () => {
        const monitor = health.createCapabilityHealth({
            features: [
                { id: 'explicit_failed' },
                { id: 'explicit_degraded' },
                { id: 'augmented', nativeCapability: 'native.tools', nativePolicy: 'augment' },
                { id: 'ignored_native', nativeCapability: 'native.ignored', nativePolicy: 'ignore' }
            ],
            nativeCapabilities: new Map([
                ['native.tools', true],
                ['native.ignored', { owned: true, reasonCode: 'SAFE_REASON' }]
            ]),
            probe: () => ({
                features: new Map([
                    ['explicit_failed', { available: false, reasonCode: 'BROKEN_CONTRACT' }],
                    ['explicit_degraded', { degraded: true, reasonCode: 'PARTIAL_CONTRACT' }],
                    ['augmented', { available: true }]
                ])
            }),
            clock: () => 0
        });
        const snapshot = await monitor.refresh();
        assert.equal(feature(snapshot, 'explicit_failed').reason.sourceCode, 'BROKEN_CONTRACT');
        assert.equal(feature(snapshot, 'explicit_degraded').status, 'degraded');
        assert.equal(feature(snapshot, 'explicit_degraded').reason.sourceCode, 'PARTIAL_CONTRACT');
        assert.equal(feature(snapshot, 'augmented').status, 'available');
        assert.equal(feature(snapshot, 'augmented').nativeCapability.available, true);
        assert.equal(feature(snapshot, 'ignored_native').status, 'available');
    });

    it('contains malformed evidence while preserving every usable structural fact', async () => {
        let enabledCalls = 0;
        const monitor = health.createCapabilityHealth({
            features: [
                { id: 'invalid_fact' },
                { id: 'failed_without_reason' },
                { id: 'degraded_without_reason' },
                {
                    id: 'selector_from_probe',
                    enabled: async () => { enabledCalls += 1; return true; },
                    selectors: { required: ['from-check'], optional: ['from-map'] }
                },
                { id: 'native_available_fallback', nativeCapability: 'native.available', nativePolicy: 'augment' }
            ],
            adapter: {
                getSelectorHealthReport() { throw new Error('adapter probe unavailable'); }
            },
            nativeCapabilities: {
                'native.available': { available: true, version: ' ', reasonCode: 'not-safe' }
            },
            probe: () => ({
                selectorHealth: {
                    checks: [
                        null,
                        { id: 1, ok: true },
                        { id: 'wrong-ok', ok: 'yes' },
                        { id: ' ', ok: true },
                        { id: 'from-check', ok: true }
                    ],
                    selectors: { 'from-map': true, ' ': true, ignored: 'yes' }
                },
                features: {
                    invalid_fact: {},
                    failed_without_reason: { available: false },
                    degraded_without_reason: { degraded: true },
                    selector_from_probe: { status: 'available' }
                },
                adapterVersion: ' '
            }),
            adapterVersion: 'fallback-adapter',
            clock: () => new Date('2026-08-01T00:00:00.000Z')
        });

        const snapshot = await monitor.refresh();
        assert.equal(enabledCalls, 1);
        assert.equal(snapshot.adapterVersion, 'fallback-adapter');
        assert.equal(feature(snapshot, 'invalid_fact').status, 'available');
        assert.deepEqual(feature(snapshot, 'failed_without_reason').reason, { code: 'FEATURE_PROBE_FAILED' });
        assert.deepEqual(feature(snapshot, 'degraded_without_reason').reason, { code: 'FEATURE_PROBE_DEGRADED' });
        assert.equal(feature(snapshot, 'selector_from_probe').status, 'available');
        assert.equal(feature(snapshot, 'native_available_fallback').nativeCapability.owned, true);
        assert.equal(feature(snapshot, 'native_available_fallback').nativeCapability.version, null);
        assert.equal(feature(snapshot, 'native_available_fallback').nativeCapability.reasonCode, null);

        const unavailableSelectors = health.createCapabilityHealth({
            features: [{ id: 'selector_unavailable', selectors: { required: ['composer'] } }],
            probe: () => ({ selectorHealth: null }),
            clock: () => 0
        });
        assert.equal(feature(await unavailableSelectors.refresh(), 'selector_unavailable').reason.code,
            'SELECTOR_PROBE_UNAVAILABLE');

        const invalidProbe = health.createCapabilityHealth({
            features: [{ id: 'invalid_probe_result' }],
            probe: () => null,
            clock: () => 0
        });
        assert.equal(feature(await invalidProbe.refresh(), 'invalid_probe_result').reason.code,
            'FEATURE_PROBE_UNAVAILABLE');
    });

    it('normalizes every supported native capability provider return shape', async () => {
        const requests = [];
        const create = value => health.createCapabilityHealth({
            features: [
                { id: 'native_one', nativeCapability: 'native.shared', nativePolicy: 'augment' },
                { id: 'native_two', nativeCapability: 'native.shared', nativePolicy: 'augment' }
            ],
            nativeCapabilities(request) {
                requests.push(request);
                return value;
            },
            clock: () => 0
        });

        const objectSnapshot = await create({ 'native.shared': false }).refresh();
        const mapSnapshot = await create(new Map([['native.shared', {
            owned: true, version: ' current ', reasonCode: 'NATIVE_READY'
        }]])).refresh();
        const primitiveSnapshot = await create('invalid').refresh();

        assert.equal(feature(objectSnapshot, 'native_one').nativeCapability.available, false);
        assert.equal(feature(mapSnapshot, 'native_one').nativeCapability.version, 'current');
        assert.equal(feature(mapSnapshot, 'native_one').nativeCapability.reasonCode, 'NATIVE_READY');
        assert.equal(feature(primitiveSnapshot, 'native_one').nativeCapability.available, false);
        assert.deepEqual(requests[0].featureIds, ['native_one', 'native_two']);
        assert.deepEqual(requests[0].nativeCapabilityIds, ['native.shared']);
    });
});

describe('Capability Health subscriptions and diffs', () => {
    it('serializes refreshes, publishes meaningful changes, and isolates observers', async () => {
        let composerReady = true;
        let tick = 0;
        const events = [];
        const monitor = new health.CapabilityHealthMonitor({
            features: [{ id: 'composer_tools', selectors: { required: ['composer'] } }],
            adapter: {
                async getSelectorHealthReport() {
                    await Promise.resolve();
                    return { selectors: { composer: composerReady } };
                }
            },
            clock: () => `2026-08-01T00:00:0${tick++}.000Z`
        });
        monitor.subscribe(() => { throw new Error('observer failure'); });
        const unsubscribe = monitor.subscribe(event => events.push(event));
        const first = await monitor.refresh();
        assert.equal(events.length, 1);
        assert.deepEqual(events[0].diff.added, ['composer_tools']);
        assert.equal(events[0].diff.changed, true);

        await monitor.refresh();
        assert.equal(events.length, 1, 'timestamp-only changes are not meaningful');
        composerReady = false;
        const [third, fourth] = await Promise.all([monitor.refresh(), monitor.refresh()]);
        assert.equal(third.generation, 3);
        assert.equal(fourth.generation, 4);
        assert.equal(events.length, 2);
        assert.equal(events[1].diff.updated[0].fromStatus, 'available');
        assert.equal(events[1].diff.updated[0].toStatus, 'failed');
        assert.ok(events[1].diff.updated[0].changes.includes('selectorHealth'));
        assert.equal(unsubscribe(), true);
        assert.equal(unsubscribe(), false);
        composerReady = true;
        await monitor.refresh();
        assert.equal(events.length, 2);

        const immediate = [];
        monitor.subscribe(event => immediate.push(event), { emitCurrent: true });
        assert.equal(immediate.length, 1);
        assert.equal(immediate[0].snapshot, monitor.getSnapshot());
        assert.equal(first.schemaVersion, 1);
        assert.doesNotThrow(() => monitor.subscribe(() => { throw new Error('immediate failure'); }, { emitCurrent: true }));
    });

    it('can publish unchanged snapshots and handles emit-current before the first refresh', async () => {
        const events = [];
        const monitor = health.createCapabilityHealth({
            features: [],
            notifyUnchanged: true,
            clock: () => 0
        });
        monitor.subscribe(event => events.push(event), { emitCurrent: true });
        await monitor.refresh();
        await monitor.refresh();
        assert.equal(events.length, 2);
        assert.equal(events[1].diff.changed, false);
    });

    it('diffs added, removed, updated, and unchanged feature snapshots', () => {
        const baseFeature = {
            id: 'a', version: '1', status: 'available', action: 'run', reason: { code: 'HEALTHY' },
            selectorHealth: { checks: [] }, nativeCapability: null
        };
        const previous = { generation: 1, features: [baseFeature, { ...baseFeature, id: 'removed' }] };
        const next = {
            generation: 2,
            features: [
                { ...baseFeature, status: 'degraded', action: 'run-degraded' },
                { ...baseFeature, id: 'added' }
            ]
        };
        const diff = health.diffCapabilitySnapshots(previous, next);
        assert.equal(diff.changed, true);
        assert.deepEqual(diff.added, ['added']);
        assert.deepEqual(diff.removed, ['removed']);
        assert.deepEqual(diff.updated[0].changes, ['status', 'action']);
        assert.equal(health.diffCapabilitySnapshots(next, { ...next, generation: 3 }).changed, false);
        const withoutGeneration = health.diffCapabilitySnapshots(null, { features: [] });
        assert.equal(withoutGeneration.fromGeneration, null);
        assert.equal(withoutGeneration.toGeneration, null);
        assert.throws(() => health.diffCapabilitySnapshots({}, next), /previous/);
        assert.throws(() => health.diffCapabilitySnapshots(next, {}), /next/);
    });
});

describe('Capability Health contract validation', () => {
    it('rejects ambiguous descriptors and unsafe configuration shapes', async () => {
        const create = options => () => health.createCapabilityHealth({
            features: [], clock: () => 0, ...options
        });
        assert.throws(create({ features: null }), /features/);
        assert.throws(create({ features: [null] }), /feature/);
        assert.throws(create({ features: [{ id: 'Bad Id' }] }), /Invalid feature id/);
        assert.throws(create({ features: [{ id: 'same' }, { id: 'same' }] }), /unique/);
        assert.throws(create({ features: [{ id: 'x', enabled: 'yes' }] }), /enabled/);
        assert.throws(create({ features: [{ id: 'x', selectors: { required: 'x' } }] }), /array/);
        assert.throws(create({ features: [{ id: 'x', selectors: { required: ['a', 'a'] } }] }), /duplicates/);
        assert.throws(create({ features: [{ id: 'x', selectors: { required: ['a'], optional: ['a'] } }] }), /both required and optional/);
        assert.throws(create({ features: [{ id: 'x', nativePolicy: 'augment' }] }), /requires nativeCapability/);
        assert.throws(create({ features: [{ id: 'x', nativeCapability: 'x', nativePolicy: 'bad' }] }), /unsupported/);
        assert.throws(create({ degradationPolicy: { unknown: 'failed' } }), /Unknown/);
        assert.throws(create({ degradationPolicy: [] }), /degradationPolicy must be an object/);
        assert.throws(create({ features: [{ id: 'x', degradationPolicy: [] }] }), /must be an object/);
        assert.throws(create({ degradationPolicy: { onProbeFailure: 'available' } }), /unsupported/);
        assert.throws(create({ adapter: [] }), /adapter/);
        assert.throws(create({ probe: true }), /probe/);
        assert.throws(create({ nativeCapabilities: 'bad' }), /nativeCapabilities/);
        assert.throws(create({ clock: null }), /clock/);
        assert.throws(create({ notifyUnchanged: 'yes' }), /notifyUnchanged/);
        assert.throws(create({ version: '' }), /version/);
        const monitor = health.createCapabilityHealth({ features: [], clock: () => 'invalid' });
        assert.rejects(monitor.refresh(), /clock/);
        assert.throws(() => monitor.subscribe(null), /listener/);
        assert.throws(() => monitor.subscribe(() => {}, { emitCurrent: 'yes' }), /emitCurrent/);

        assert.throws(() => health.createCapabilityHealth({ features: [] }), /clock/);
        const defaults = health.createCapabilityHealth({ features: [], clock: () => 0 });
        assert.equal(defaults.adapterVersion, null);
        assert.equal(defaults.version, '1');
        assert.equal((await defaults.refresh()).generatedAt, '1970-01-01T00:00:00.000Z');

        const explicitAdapter = health.createCapabilityHealth({
            features: [], adapterVersion: ' adapter-v1 ', clock: () => 0
        });
        assert.equal((await explicitAdapter.refresh()).adapterVersion, 'adapter-v1');
    });
});

describe('Gemini capability probe bridge', () => {
    it('maps Gemini adapter and native records without importing the adapter singleton', async () => {
        const bridge = health.createGeminiCapabilityProbeBridge({
            getCapabilityProbeReport: async () => ({
                adapterVersion: ' gemini-current ',
                adapterCapabilities: [
                    { id: 'available', status: 'available' },
                    { id: 'degraded', status: 'degraded' },
                    { id: 'failed', status: 'unavailable' },
                    { id: 'dependency', status: 'degraded' },
                    { id: ' ', status: 'available' },
                    { id: 'legacy', status: 'supported' },
                    { id: 'ignored', status: 'unknown' },
                    null
                ],
                nativeCapabilities: [
                    { id: 'native-available', status: 'native-owned', quality: 'available' },
                    { id: 'native-degraded', status: 'native-owned', quality: 'degraded' },
                    { id: 'native-unavailable', status: 'unavailable', quality: 'unavailable' },
                    { id: 'native-invalid', status: 'native-owned', quality: 'unknown' },
                    null
                ]
            }),
            features: [
                { id: 'available', selectors: { required: [], optional: [] } },
                { id: 'degraded', selectors: { required: [], optional: [] } },
                { id: 'failed', selectors: { required: [], optional: [] } },
                { id: 'dependent', selectors: { required: ['dependency'], optional: ['missing'] } },
                { id: 'unreported', selectors: { required: [], optional: [] } }
            ]
        });
        const capture = await bridge.capture();
        assert.equal(Object.isFrozen(capture), true);
        const probe = bridge.toFeatureProbe(capture, {
            featureIds: ['available', 'degraded', 'failed', 'dependent', 'unreported', 'unknown'],
            selectorIds: ['available', 'degraded', 'failed', 'dependency', 'missing']
        });
        assert.equal(probe.adapterVersion, 'gemini-current');
        assert.deepEqual(probe.selectorHealth.selectors, {
            available: true, degraded: true, failed: false, dependency: true
        });
        assert.equal(probe.features.available.status, 'available');
        assert.equal(probe.features.degraded.status, 'degraded');
        assert.equal(probe.features.failed.status, 'failed');
        assert.equal(probe.features.dependent.status, 'degraded');
        assert.equal(Object.hasOwn(probe.features, 'unreported'), false);

        assert.deepEqual(bridge.toNativeFacts(capture, {
            nativeCapabilityIds: ['native-available', 'native-degraded', 'native-unavailable', 'native-invalid', 'missing']
        }), {
            'native-available': {
                available: true, owned: true, reasonCode: 'GEMINI_NATIVE_AVAILABLE'
            },
            'native-degraded': {
                available: true, owned: true, reasonCode: 'GEMINI_NATIVE_DEGRADED'
            },
            'native-unavailable': {
                available: false, owned: false, reasonCode: 'GEMINI_NATIVE_UNAVAILABLE'
            }
        });
    });

    it('contains missing, malformed, and failed Gemini probe reports', async () => {
        assert.throws(() => health.createGeminiCapabilityProbeBridge({ features: [] }), /getCapabilityProbeReport/);
        assert.throws(() => health.createGeminiCapabilityProbeBridge({
            getCapabilityProbeReport() {}, features: null
        }), /features/);

        const values = [null, {}, new Error('offline')];
        const bridge = new health.GeminiCapabilityProbeBridge({
            getCapabilityProbeReport() {
                const value = values.shift();
                if (value instanceof Error) throw value;
                return value;
            },
            features: []
        });
        const invalid = await bridge.capture();
        assert.deepEqual(invalid, { ok: false });
        assert.throws(() => bridge.toFeatureProbe(invalid, { featureIds: [], selectorIds: [] }), /unavailable/);
        assert.throws(() => bridge.toNativeFacts(invalid, { nativeCapabilityIds: [] }), /unavailable/);

        const empty = await bridge.capture();
        assert.deepEqual(bridge.toFeatureProbe(empty, { featureIds: [], selectorIds: [] }), {
            selectorHealth: { selectors: {} }, features: {}
        });
        assert.deepEqual(bridge.toNativeFacts(empty, { nativeCapabilityIds: [] }), {});
        assert.deepEqual(await bridge.capture(), { ok: false });
    });
});

describe('Gemini capability health service', () => {
    function report(statuses = {}) {
        return {
            schemaVersion: 2,
            adapterCapabilities: Object.entries(statuses.adapter || {}).map(([id, status]) => ({ id, status })),
            nativeCapabilities: Object.entries(statuses.native || {}).map(([id, quality]) => ({
                id,
                status: quality === 'unavailable' ? 'unavailable' : 'native-owned',
                quality
            }))
        };
    }

    function fiveStateService(overrides = {}) {
        let tick = 0;
        return health.createGeminiCapabilityHealthService({
            getCapabilityProbeReport: () => report({
                adapter: {
                    available: 'available',
                    dependency: 'degraded',
                    failed: 'unavailable'
                },
                native: { notebooks: 'available' }
            }),
            features: [
                { id: 'available' },
                { id: 'degraded', selectors: { required: ['dependency'] } },
                { id: 'native', nativeCapability: 'notebooks' },
                { id: 'disabled', enabled: false },
                { id: 'failed' }
            ],
            clock: () => `2026-08-01T00:00:0${tick++}.000Z`,
            ...overrides
        });
    }

    it('starts once, refreshes one report per snapshot, publishes all five states, and stops idempotently', async () => {
        let reads = 0;
        let current = report({
            adapter: { available: 'available', dependency: 'degraded', failed: 'unavailable' },
            native: { notebooks: 'available' }
        });
        let tick = 0;
        const service = fiveStateService({
            getCapabilityProbeReport() { reads += 1; return current; },
            clock: () => `2026-08-01T00:00:0${tick++}.000Z`
        });
        assert.equal(service.isStarted(), false);
        assert.equal(service.getSnapshot(), null);
        assert.doesNotThrow(() => service.subscribe(() => {}, { emitCurrent: true }));
        assert.throws(() => service.subscribe(null), /listener/);
        assert.throws(() => service.subscribe(() => {}, { emitCurrent: 'yes' }), /emitCurrent/);

        const events = [];
        service.subscribe(() => { throw new Error('observer failure'); });
        const unsubscribe = service.subscribe(event => events.push(event));
        const firstStart = service.start();
        assert.equal(service.start(), firstStart);
        const snapshot = await firstStart;
        assert.equal(reads, 1);
        assert.equal(service.isStarted(), true);
        assert.equal(service.getSnapshot(), snapshot);
        assert.deepEqual(Object.fromEntries(snapshot.features.map(item => [item.id, item.status])), {
            available: 'available',
            degraded: 'degraded',
            disabled: 'disabled',
            failed: 'failed',
            native: 'native-owned'
        });
        assert.equal(events.length, 1);
        assert.deepEqual(events[0].diff.added, ['available', 'degraded', 'disabled', 'failed', 'native']);

        assert.equal(await service.start(), snapshot, 'completed start is idempotent');
        const immediate = [];
        service.subscribe(event => immediate.push(event), { emitCurrent: true });
        assert.equal(immediate[0].snapshot, snapshot);
        assert.doesNotThrow(() => service.subscribe(() => { throw new Error('immediate failure'); }, { emitCurrent: true }));

        await service.refresh();
        assert.equal(reads, 2);
        assert.equal(events.length, 1, 'timestamp-only refresh is not published');
        current = report({
            adapter: { available: 'unavailable', dependency: 'available', failed: 'available' },
            native: { notebooks: 'unavailable' }
        });
        const changed = await service.refresh();
        assert.equal(reads, 3);
        assert.equal(feature(changed, 'available').status, 'failed');
        assert.equal(feature(changed, 'degraded').status, 'available');
        assert.equal(feature(changed, 'native').status, 'available');
        assert.equal(events.length, 2);
        assert.equal(unsubscribe(), true);
        assert.equal(unsubscribe(), false);
        assert.equal(service.stop(), true);
        assert.equal(service.stop(), false);
        assert.equal(service.isStarted(), false);
        await assert.rejects(service.refresh(), /not started/);
    });

    it('can publish unchanged snapshots and converts probe failure into a health snapshot', async () => {
        let fail = false;
        const events = [];
        const service = fiveStateService({
            notifyUnchanged: true,
            getCapabilityProbeReport() {
                if (fail) throw new Error('offline');
                return report({ adapter: { available: 'available' } });
            }
        });
        service.subscribe(event => events.push(event));
        await service.start();
        await service.refresh();
        assert.equal(events.length, 2);
        assert.equal(events[1].diff.changed, false);
        fail = true;
        const failed = await service.refresh();
        assert.ok(failed.features.every(item => item.status === 'failed' || item.status === 'disabled'));
        service.stop();
    });

    it('drops an in-flight capture or monitor result after stop and can restart cleanly', async () => {
        let releaseCapture;
        let getter = () => new Promise(resolve => { releaseCapture = resolve; });
        const captureService = fiveStateService({ getCapabilityProbeReport: () => getter() });
        const pendingCapture = captureService.start();
        await Promise.resolve();
        assert.equal(captureService.stop(), true);
        releaseCapture(report({ adapter: { available: 'available' } }));
        assert.equal(await pendingCapture, null);
        assert.equal(captureService.getSnapshot(), null);
        getter = () => report({ adapter: { available: 'available' } });
        assert.ok(await captureService.start());
        captureService.stop();

        let releaseEnabled;
        const monitorService = health.createGeminiCapabilityHealthService({
            getCapabilityProbeReport: () => report({ adapter: { delayed: 'available' } }),
            features: [{
                id: 'delayed',
                enabled: () => new Promise(resolve => { releaseEnabled = resolve; })
            }],
            clock: () => 0
        });
        const pendingMonitor = monitorService.start();
        while (!releaseEnabled) await Promise.resolve();
        monitorService.stop();
        releaseEnabled(true);
        assert.equal(await pendingMonitor, null);
        assert.equal(monitorService.getSnapshot(), null);
    });

    it('clears a rejected start and validates the default module catalog', async () => {
        const invalidClock = fiveStateService({ clock: () => 'invalid' });
        await assert.rejects(invalidClock.start(), /clock/);
        assert.equal(invalidClock.stop(), true);

        assert.throws(() => health.createGeminiModuleCapabilityCatalog({ isEnabled: true }), /isEnabled/);
        const enabled = new Set(['counter', 'folders']);
        const catalog = health.createGeminiModuleCapabilityCatalog({ isEnabled: id => enabled.has(id) });
        assert.equal(catalog.length, 10);
        assert.equal(Object.isFrozen(catalog), true);
        assert.equal(Object.isFrozen(catalog[0].selectors), true);
        assert.equal(catalog.find(item => item.id === 'counter').nativePolicy, 'augment');
        assert.equal(catalog.find(item => item.id === 'prompt-vault').nativeCapability, 'skills');
        assert.equal(catalog.find(item => item.id === 'prompt-vault').nativePolicy, 'augment');
        assert.equal(catalog.find(item => item.id === 'quote-reply').nativeCapability, 'search');
        assert.equal(catalog.find(item => item.id === 'quote-reply').nativePolicy, 'augment');
        assert.equal(catalog.find(item => item.id === 'folders').enabled(), true);
        assert.equal(catalog.find(item => item.id === 'message-queue').enabled(), false);
        assert.equal(health.createGeminiModuleCapabilityCatalog().every(item => item.enabled()), true);
    });

    it('keeps quote reply and prompt vault as complements when Gemini owns search and Skills/Gems', async () => {
        const enabled = new Set(['prompt-vault', 'quote-reply']);
        const service = health.createGeminiCapabilityHealthService({
            getCapabilityProbeReport: () => report({
                adapter: { composer: 'available', messages: 'available' },
                native: { search: 'available', skills: 'available' }
            }),
            features: health.createGeminiModuleCapabilityCatalog({ isEnabled: id => enabled.has(id) }),
            clock: () => 0
        });
        const snapshot = await service.start();
        const promptVault = feature(snapshot, 'prompt-vault');
        const quoteReply = feature(snapshot, 'quote-reply');

        assert.equal(promptVault.status, 'available');
        assert.equal(promptVault.action, 'run');
        assert.equal(promptVault.nativeCapability.id, 'skills');
        assert.equal(promptVault.nativeCapability.policy, 'augment');
        assert.equal(promptVault.nativeCapability.owned, true);
        assert.equal(quoteReply.status, 'available');
        assert.equal(quoteReply.action, 'run');
        assert.equal(quoteReply.nativeCapability.id, 'search');
        assert.equal(quoteReply.nativeCapability.policy, 'augment');
        assert.equal(quoteReply.nativeCapability.owned, true);
        assert.notEqual(promptVault.status, 'native-owned');
        assert.notEqual(quoteReply.status, 'native-owned');
        service.stop();
    });
});
