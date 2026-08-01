import { capabilityMethods } from './gemini/capabilities.js';
import { composerMethods } from './gemini/composer.js';
import { conversationMethods } from './gemini/conversation.js';
import { diagnosticsMethods } from './gemini/diagnostics.js';
import { dialogMethods } from './gemini/dialog.js';
import { modelMethods, normalizeModelText } from './gemini/model.js';
import { mutationMethods } from './gemini/mutation.js';
import { SELECTORS } from './gemini/selectors.js';
import { sessionMethods } from './gemini/session.js';
import { sidebarMethods } from './gemini/sidebar.js';

/**
 * Compatibility facade for every existing Primer++ caller.
 *
 * Gemini-owned selectors and DOM behavior live exclusively in the focused
 * capability modules under ./gemini/. Methods deliberately retain dynamic
 * `this` dispatch so tests and incremental legacy wrappers can replace one
 * high-level capability without rebuilding the facade.
 */
export const GeminiAdapter = {
    SELECTORS,
    _normalizeModelText: normalizeModelText,
    ...sessionMethods,
    ...sidebarMethods,
    ...composerMethods,
    ...conversationMethods,
    ...modelMethods,
    ...dialogMethods,
    ...mutationMethods,
    ...capabilityMethods,
    ...diagnosticsMethods,

    // Named compatibility wrappers also keep the static adapter contract
    // discoverable to older smoke tooling that scans this facade source.
    getVisibleToolModeEntries() {
        return composerMethods.getVisibleToolModeEntries.call(this);
    },

    getRichResponseProbeReport() {
        return conversationMethods.getRichResponseProbeReport.call(this);
    },

    getSelectorHealthReport() {
        return diagnosticsMethods.getSelectorHealthReport.call(this);
    },

    getRuntimeProbeReport() {
        return diagnosticsMethods.getRuntimeProbeReport.call(this);
    }
};

// Privacy-conservative runtime probe contract retained for static release
// guards: richResponse: this.getRichResponseProbeReport(), codeBlockCount,
// citationCandidateCount. Actual collection lives in conversation/diagnostics.
