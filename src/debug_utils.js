import { Logger } from './logger.js';
import { Core } from './core.js';

function maskEmail(email) {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    return local[0] + '***@' + domain[0] + '***.' + domain.split('.').pop();
}

function maskStorageKey(key) {
    if (!key || !key.includes('@')) return key;
    return key.replace(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/, (m, local, domain) => {
        return local[0] + '***@' + domain[0] + '***.' + domain.split('.').pop();
    });
}

export function debugDumpStorageKeys() {
    try {
        const keys = (typeof GM_listValues === 'function' ? GM_listValues() : []).slice().sort();
        const geminiKeys = keys.filter(k => k.startsWith('gemini_') || k.startsWith('gemini_store_'));
        console.group('\uD83D\uDC8E Gemini Debug: Storage Keys');
        console.log('All keys:', keys.map(maskStorageKey));
        console.log('Gemini keys:', geminiKeys.map(maskStorageKey));
        console.groupEnd();
        Logger.info('Debug: dumped storage keys', { count: keys.length });
    } catch (e) {
        Logger.warn('Debug: failed to list storage keys', { error: String(e) });
    }
}

export function debugShowDetectedUser() {
    try {
        const detected = Core.detectUser();
        const current = Core.getCurrentUser();
        const effective = detected || current;
        const storageKey = (effective && effective.includes('@')) ? `gemini_store_${maskEmail(effective)}` : null;
        console.group('\uD83D\uDC8E Gemini Debug: User');
        console.log('detected:', maskEmail(detected));
        console.log('currentUser:', maskEmail(current));
        console.log('effectiveUser:', maskEmail(effective));
        console.log('storageKey:', storageKey);
        console.groupEnd();
        Logger.info('Debug: show detected user', { detected: maskEmail(detected), current: maskEmail(current), effective: maskEmail(effective) });
    } catch (e) {
        Logger.warn('Debug: failed to show detected user', { error: String(e) });
    }
}

export function debugExportAllStorage() {
    try {
        const keys = (typeof GM_listValues === 'function' ? GM_listValues() : []).slice().sort();
        const data = {};
        keys.forEach(k => {
            try { data[k] = GM_getValue(k); } catch (e) { data[k] = { error: String(e) }; }
        });
        const payload = {
            exportedAt: new Date().toISOString(),
            keys: keys,
            data: data
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gemini_storage_export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        console.log('\uD83D\uDC8E Storage export saved: gemini_storage_export.json');
        Logger.info('Debug: export all storage');
    } catch (e) {
        Logger.warn('Debug: failed to export storage', { error: String(e) });
    }
}

export function debugExportLegacyData() {
    try {
        const legacyKeys = [
            'gemini_count_chats_map',
            'gemini_count_session',
            'gemini_count_total',
            'gemini_interaction_count',
            'gemini_view_mode',
            'gemini_panel_position',
            'gemini_panel_pos_v64',
            'gemini_panel_pos'
        ];
        const data = {};
        legacyKeys.forEach(k => {
            try { data[k] = GM_getValue(k); } catch (e) { data[k] = { error: String(e) }; }
        });
        const payload = {
            exportedAt: new Date().toISOString(),
            legacyKeys: legacyKeys,
            data: data
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gemini_legacy_export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        console.log('\uD83D\uDC8E Legacy export saved: gemini_legacy_export.json');
        Logger.info('Debug: export legacy data');
    } catch (e) {
        Logger.warn('Debug: failed to export legacy data', { error: String(e) });
    }
}

export function debugExportLogs() {
    try {
        const payload = Logger.export();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gemini_logs_export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        Logger.info('Debug: export logs');
    } catch (e) {
        Logger.warn('Debug: failed to export logs', { error: String(e) });
    }
}

export function debugExportAdapterProbe() {
    try {
        if (typeof window.__PRIMER_PP_GET_PROBE_REPORT__ !== 'function') {
            throw new Error('Probe report bridge is unavailable');
        }
        const payload = window.__PRIMER_PP_GET_PROBE_REPORT__();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'primer_pp_adapter_probe.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        Logger.info('Debug: export adapter probe report');
    } catch (e) {
        Logger.warn('Debug: failed to export adapter probe report', { error: String(e) });
    }
}

export function debugDumpGeminiStores() {
    try {
        const keys = (typeof GM_listValues === 'function' ? GM_listValues() : []).slice().sort();
        const targets = keys.filter(k => k.startsWith('gemini_store_') || k.startsWith('gemini_folders_data') || k.startsWith('gemini_'));
        console.group('\uD83D\uDC8E Gemini Debug: Storage Dump');
        targets.forEach(k => {
            try { console.log(maskStorageKey(k), GM_getValue(k)); } catch (err) { console.warn('Failed to read', maskStorageKey(k), err); }
        });
        console.groupEnd();
    } catch (e) {
        Logger.warn('Debug: failed to dump storage', { error: String(e) });
    }
}
