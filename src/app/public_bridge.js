function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`Public bridge ${name} must be a function`);
    return value;
}

const PUBLIC_CAPABILITY_HEALTH_FIELDS = Object.freeze([
    'schemaVersion', 'version', 'adapterVersion', 'generation', 'generatedAt', 'features',
    'id', 'checkedAt', 'status', 'action', 'reason', 'code', 'sourceCode', 'selectors',
    'selectorHealth', 'passed', 'total', 'failedRequired', 'failedOptional', 'checks',
    'required', 'ok', 'nativeCapability', 'policy', 'available', 'owned', 'reasonCode'
]);

/** Whitelist the stable structural health contract before exposing it globally. */
export function sanitizeCapabilityHealthSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    try {
        return JSON.parse(JSON.stringify(snapshot, PUBLIC_CAPABILITY_HEALTH_FIELDS));
    } catch (_ignored) {
        return null;
    }
}

/** Build the stable, serializable debug probe exposed to users and support. */
export function createProbeReporter({
    appName,
    version,
    application,
    adapter,
    registry,
    documentRef,
    panelId,
    healthService = null,
    now = () => new Date()
}) {
    if (!application || !adapter || !registry || !documentRef) {
        throw new TypeError('Probe reporter dependencies are required');
    }
    requireFunction(now, 'now');
    if (healthService !== null && typeof healthService.getSnapshot !== 'function') {
        throw new TypeError('Probe reporter healthService must implement getSnapshot()');
    }

    return function getProbeReport() {
        const detailsPane = documentRef.getElementById('g-details-pane');
        const generatedAt = now();
        return {
            app: appName,
            version,
            generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : String(generatedAt),
            lifecycle: application.state,
            adapter: adapter.getRuntimeProbeReport(),
            capabilityHealth: sanitizeCapabilityHealthSnapshot(healthService?.getSnapshot()),
            modules: {
                registered: Object.keys(registry.modules).sort(),
                enabled: Array.from(registry.enabledModules).sort(),
                states: registry.host?.list?.() || []
            },
            localUI: {
                panelPresent: Boolean(documentRef.getElementById(panelId)),
                detailsPanePresent: Boolean(detailsPane),
                detailsPaneExpanded: Boolean(detailsPane?.classList.contains('expanded')),
                exportButtonPresent: Boolean(documentRef.getElementById('gc-export-native'))
            }
        };
    };
}

/**
 * Install the legacy public globals without making the composition root own
 * browser-global mutation details. The returned cleanup restores prior values.
 */
export function installPublicGlobals({
    globalObject,
    getProbeReport,
    start,
    stop,
    names = {
        getProbe: '__PRIMER_PP_GET_PROBE_REPORT__',
        start: '__PRIMER_PP_START__',
        stop: '__PRIMER_PP_STOP__'
    }
}) {
    if (!globalObject) throw new TypeError('Public bridge requires a global object');
    requireFunction(getProbeReport, 'getProbeReport');
    requireFunction(start, 'start');
    requireFunction(stop, 'stop');

    const globalNames = [names?.getProbe, names?.start, names?.stop];
    if (globalNames.some(name => typeof name !== 'string' || !name) || new Set(globalNames).size !== 3) {
        throw new TypeError('Public bridge global names must be three unique strings');
    }
    const bindings = {
        [names.getProbe]: getProbeReport,
        [names.start]: start,
        [names.stop]: stop
    };
    const previous = new Map();
    for (const [name, value] of Object.entries(bindings)) {
        previous.set(name, Object.getOwnPropertyDescriptor(globalObject, name));
        Object.defineProperty(globalObject, name, {
            configurable: true,
            enumerable: true,
            writable: true,
            value
        });
    }

    let active = true;
    return function removePublicGlobals() {
        if (!active) return false;
        active = false;
        for (const [name, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalObject, name, descriptor);
            else delete globalObject[name];
        }
        return true;
    };
}

/** Register menu commands in their declared order and return host handles. */
export function registerMenuCommands(registerMenuCommand, commands) {
    requireFunction(registerMenuCommand, 'registerMenuCommand');
    if (!Array.isArray(commands)) throw new TypeError('Public bridge menu commands must be an array');
    return commands.map(command => {
        if (!command || typeof command.label !== 'string' || !command.label) {
            throw new TypeError('Every menu command requires a label');
        }
        requireFunction(command.handler, `handler for ${command.label}`);
        return registerMenuCommand(command.label, command.handler);
    });
}
