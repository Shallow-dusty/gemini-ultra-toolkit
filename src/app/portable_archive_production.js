import { GLOBAL_KEYS } from '../constants.js';
import {
    DEFAULT_UI_TWEAKS,
    createPreferencesPortableArchivePort,
    normalizePreferredModel,
    normalizeUiTweaks
} from '../features/preferences/index.js';
import { createPreferencesArchiveRepository } from './preferences_archive_repository.js';
import { createPortableArchiveWiring } from './portable_archive_wiring.js';

export const PRODUCTION_ARCHIVE_MODULE_SECTIONS = Object.freeze([
    'chats',
    'annotations',
    'collections',
    'recipes',
    'insights',
    'queue'
]);

function requireMethod(owner, method, label) {
    if (!owner || typeof owner[method] !== 'function') {
        throw new TypeError(`${label} must implement ${method}()`);
    }
}

function assertSectionOwners(sectionOwners, registry) {
    if (!sectionOwners || typeof sectionOwners !== 'object' || Array.isArray(sectionOwners)) {
        throw new TypeError('Portable Archive sectionOwners must be an object');
    }
    const actual = Object.keys(sectionOwners).sort();
    const expected = [...PRODUCTION_ARCHIVE_MODULE_SECTIONS].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new TypeError('Portable Archive sectionOwners must contain the exact production sections');
    }
    for (const section of PRODUCTION_ARCHIVE_MODULE_SECTIONS) {
        const owner = sectionOwners[section];
        requireMethod(owner, 'getPortableArchiveIntegration', `Portable Archive ${section} owner`);
        if (typeof owner.id !== 'string' || registry.modules?.[owner.id] !== owner) {
            throw new TypeError(`Portable Archive ${section} owner must be a registered legacy module`);
        }
    }
}

function requirePreferencesModule(module, label, methods) {
    if (!module || typeof module.id !== 'string' || typeof module.STORAGE_KEY !== 'string') {
        throw new TypeError(`${label} must expose its legacy module and storage identities`);
    }
    for (const method of methods) requireMethod(module.capability, method, `${label} capability`);
}

/** Production-only assembly around the ten registered legacy module objects. */
export function createProductionPortableArchive({
    registry,
    storage,
    core,
    nativeUI,
    defaultModel,
    uiTweaks,
    sectionOwners,
    notifications
} = {}) {
    for (const method of ['isEnabled', 'notifyUserChange', 'stageDesiredModules', 'getDesiredModulesPreference']) {
        requireMethod(registry, method, 'Portable Archive registry');
    }
    for (const method of ['get', 'set', 'flush']) requireMethod(storage, method, 'Portable Archive storage');
    for (const method of [
        'getTheme', 'setTheme', 'getCurrentUser', 'getInspectingUser', 'getTempUser'
    ]) requireMethod(core, method, 'Portable Archive Core');
    for (const method of ['getLocale', 'setLocale', 't']) requireMethod(nativeUI, method, 'Portable Archive NativeUI');
    requirePreferencesModule(defaultModel, 'Default Model', ['get', 'set']);
    requirePreferencesModule(uiTweaks, 'UI Tweaks', ['get', 'set']);
    if (registry.modules?.[defaultModel.id] !== defaultModel || registry.modules?.[uiTweaks.id] !== uiTweaks) {
        throw new TypeError('Portable Archive preference modules must be registered legacy modules');
    }
    requireMethod(notifications, 'show', 'Portable Archive notifications');
    assertSectionOwners(sectionOwners, registry);

    const repository = createPreferencesArchiveRepository({
        getScope() {
            const fallback = core.getTempUser();
            const sessionUserId = String(core.getCurrentUser() || fallback).trim() || fallback;
            const targetUserId = String(core.getInspectingUser() || sessionUserId).trim() || sessionUserId;
            return sessionUserId === targetUserId
                ? { kind: 'session', sessionUserId, targetUserId, readOnly: false }
                : { kind: 'inspection', sessionUserId, targetUserId, readOnly: true };
        },
        theme: {
            load: () => core.getTheme(),
            save: value => core.setTheme(value)
        },
        locale: {
            load: () => nativeUI.getLocale(),
            save: value => nativeUI.setLocale(value)
        },
        defaultModel: {
            load: () => registry.isEnabled(defaultModel.id)
                ? defaultModel.capability.get()
                : normalizePreferredModel(storage.get(defaultModel.STORAGE_KEY, 'pro')),
            save: value => defaultModel.capability.set(value)
        },
        uiTweaks: {
            load: () => registry.isEnabled(uiTweaks.id)
                ? uiTweaks.capability.get()
                : normalizeUiTweaks(storage.get(uiTweaks.STORAGE_KEY, DEFAULT_UI_TWEAKS)),
            save: value => uiTweaks.capability.set(value)
        },
        enabledModules: {
            load: () => registry.getDesiredModulesPreference(),
            async save(value) {
                await registry.stageDesiredModules(value);
                notifications.show(nativeUI.t(
                    '模块开关已暂存，将在下次重载后生效',
                    'Module changes were staged and will apply after the next reload'
                ));
            },
            flush: () => storage.flush()
        }
    });
    const preferences = createPreferencesPortableArchivePort({ repository });
    const integrationProviders = {
        preferences: () => preferences.getPortableArchiveIntegration()
    };
    for (const section of PRODUCTION_ARCHIVE_MODULE_SECTIONS) {
        const owner = sectionOwners[section];
        integrationProviders[section] = () => registry.isEnabled(owner.id)
            ? owner.getPortableArchiveIntegration()
            : null;
    }
    const wiring = createPortableArchiveWiring({ integrationProviders });

    async function notifySession(user) {
        const result = await registry.notifyUserChange(user);
        await wiring.refresh();
        return result;
    }

    return Object.freeze({
        wiring,
        notifySession,
        exportPorts: Object.freeze({ ...wiring.ports })
    });
}
