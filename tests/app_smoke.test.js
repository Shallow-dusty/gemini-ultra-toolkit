const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('app smoke checks', () => {
    it('keeps public branding and disclaimer aligned', () => {
        const meta = read('src/meta.txt');
        const manifest = JSON.parse(read('src/platforms/extension/manifest.json'));
        const readme = read('README.md');
        const constants = read('src/constants.js');

        assert.match(meta, /@name\s+Primer\+\+ for Gemini™ \(v12\.0\)/);
        assert.equal(manifest.name, 'Primer++ for Gemini™');
        assert.match(manifest.description, /Unofficial community extension for Gemini™/);
        assert.match(readme, /Primer\+\+ is an unofficial community extension/);
        assert.match(constants, /APP_NAME = 'Primer\+\+ for Gemini\\u2122'/);
        assert.match(constants, /TRADEMARK_NOTICE = 'Primer\+\+ is an unofficial community extension/);
    });

    it('keeps extension manifest scoped to Gemini with minimal permissions', () => {
        const manifest = JSON.parse(read('src/platforms/extension/manifest.json'));

        assert.deepEqual(manifest.permissions.sort(), ['contextMenus', 'storage']);
        assert.deepEqual(manifest.content_scripts[0].matches, ['https://gemini.google.com/*']);
        assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
        assert.equal(manifest.manifest_version, 3);
    });

    it('keeps basic keyboard accessibility guards in panel styles and modals', () => {
        const panelUi = read('src/panel_ui.js');
        const panelSettings = read('src/panel_settings.js');
        const panelDashboard = read('src/panel_dashboard.js');
        const nativeUi = read('src/native_ui.js');

        assert.match(panelUi, /:focus-visible/);
        assert.match(panelUi, /prefers-reduced-motion: reduce/);
        assert.match(panelUi, /settingsBtn\.style\.width = '44px'/);
        assert.match(nativeUi, /trapFocus\(container\)/);
        assert.match(panelSettings, /NativeUI\.trapFocus\(modal\)/);
        assert.match(panelDashboard, /NativeUI\.trapFocus\(modal\)/);
    });

    it('merges Guest data only after the new user storage has loaded', () => {
        const main = read('src/main.js');

        // The fix requires notifyUserChange() to run BEFORE the merge block,
        // so the freshly-loaded user storage is the base, not the live cm.state
        // (which still contains the soon-to-be-cloned Guest data).
        const notifyIdx = main.indexOf('ModuleRegistry.notifyUserChange(getInspectingUser())');
        const mergeIdx = main.indexOf('Merged ${guestState.total} messages from Guest session');
        assert.ok(notifyIdx !== -1, 'notifyUserChange call missing');
        assert.ok(mergeIdx !== -1, 'guest merge block missing');
        assert.ok(notifyIdx < mergeIdx, 'notifyUserChange must precede guest merge to avoid double-counting');

        // And it must run exactly once — a leftover trailing call would
        // re-load cm.state and wipe the merge that was just persisted.
        const matches = main.match(/ModuleRegistry\.notifyUserChange\(getInspectingUser\(\)\)/g) || [];
        assert.equal(matches.length, 1, 'notifyUserChange must be called exactly once in lazyDetect');
    });

    it('guards counter.attemptIncrement against inspecting-mode storage corruption', () => {
        const counter = read('src/modules/counter.js');

        // attemptIncrement must snap inspectingUser back to currentUser before
        // mutating cm.state — otherwise saveData() persists another profile's
        // totals into the current user's storage key.
        assert.match(counter, /attemptIncrement\(\)\s*\{[\s\S]*?Core\.getInspectingUser\(\)\s*!==\s*currentUser[\s\S]*?Core\.setInspectingUser\(currentUser\)[\s\S]*?this\.loadDataForUser\(currentUser\)/);
    });

    it('keeps startup rendering ordered and repairable', () => {
        const main = read('src/main.js');
        const panelUi = read('src/panel_ui.js');

        assert.match(main, /function startProgressiveDisclosure\(\)/);
        assert.match(main, /waitForGeminiReady\(\(\) => \{\s*onDOMStructureChange\(\);\s*startProgressiveDisclosure\(\);/);
        assert.doesNotMatch(main, /gc-onboarding-overlay/);
        assert.match(main, /#gemini-onboarding-modal, \.onboarding-overlay/);
        assert.match(main, /if \(ModuleRegistry\.isEnabled\('counter'\)\) \{\s*PanelUI\.create\(\);/);

        assert.match(panelUi, /_isPanelComplete\(container\)/);
        assert.match(panelUi, /existing\.remove\(\);/);
        assert.match(panelUi, /if \(CounterModule\.state\.isExpanded\)/);
        assert.match(panelUi, /Details pane render error/);
    });

    it('keeps extension icons generated from a maintainable source asset', () => {
        const source = read('src/platforms/extension/icons/source.svg');
        const iconsDir = path.join(root, 'src/platforms/extension/icons');

        assert.match(source, /viewBox="0 0 128 128"/);
        assert.match(source, /linearGradient/);
        for (const size of [16, 48, 128]) {
            const iconPath = path.join(iconsDir, `icon-${size}.png`);
            const icon = fs.readFileSync(iconPath);
            assert.equal(icon.subarray(1, 4).toString('ascii'), 'PNG');
            assert.ok(icon.length > 500);
        }
    });

    it('keeps npm audit fix pinned in the lockfile', () => {
        const lock = JSON.parse(read('package-lock.json'));
        const braceExpansion = lock.packages['node_modules/brace-expansion'];

        assert.equal(lock.packages[''].name, 'primer-pp');
        assert.equal(braceExpansion.version, '5.0.6');
    });

    it('keeps Gemini-owned DOM selectors behind GeminiAdapter', () => {
        const sourceFiles = [
            ...fs.readdirSync(path.join(root, 'src/modules'))
                .filter(file => file.endsWith('.js'))
                .map(file => `src/modules/${file}`),
            'src/core.js',
            'src/main.js',
            'src/native_ui.js',
            'src/panel_settings.js'
        ];
        const forbiddenFragments = [
            'bard-',
            'gem-nav',
            'gem-menu',
            'model-response',
            'user-query',
            'response-container',
            'conversation-container',
            'chat-window',
            'chat-container',
            'gds-pillbox',
            'data-test-id',
            'aria-label="Side Navigation"',
            'aria-label="Enter a prompt for Gemini"',
            'aria-label="Send message"',
            'aria-label="Open mode picker"',
            'aria-label="Open menu for conversation actions"',
            'href*="/gems/"',
            '.ql-editor'
        ];
        const selectorLiteral = /(?:\.(?:querySelector(?:All)?|closest|matches)|rules\.push)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
        const offenders = [];

        for (const file of sourceFiles) {
            const source = read(file);
            for (const match of source.matchAll(selectorLiteral)) {
                const literal = match[2];
                const fragment = forbiddenFragments.find(item => literal.includes(item));
                if (fragment) {
                    offenders.push(`${file}: ${fragment}`);
                }
            }
        }

        assert.deepEqual(offenders, []);
        assert.match(read('src/adapters/gemini.js'), /getSelectorHealthReport\(\)/);
        assert.match(read('src/adapters/gemini.js'), /getRuntimeProbeReport\(\)/);
        assert.match(read('src/adapters/gemini.js'), /getVisibleToolModeEntries\(\)/);
        assert.match(read('src/adapters/gemini.js'), /getRichResponseProbeReport\(\)/);
        assert.match(read('src/panel_settings.js'), /GeminiAdapter\.getSelectorHealthReport\(\)/);
    });

    it('keeps adapter probe export reachable without exposing storage dumps', () => {
        const main = read('src/main.js');
        const debugUtils = read('src/debug_utils.js');
        const panelSettings = read('src/panel_settings.js');
        const probeScript = read('store-assets/scripts/export_adapter_probe.py');
        const adapter = read('src/adapters/gemini.js');

        assert.match(main, /__PRIMER_PP_GET_PROBE_REPORT__/);
        assert.match(main, /Debug: Export Adapter Probe/);
        assert.match(debugUtils, /debugExportAdapterProbe/);
        assert.match(panelSettings, /Export Adapter Probe/);
        assert.match(probeScript, /__PRIMER_PP_GET_PROBE_REPORT__/);
        assert.match(probeScript, /--inject-userscript/);
        assert.match(adapter, /richResponse: this\.getRichResponseProbeReport\(\)/);
        assert.match(adapter, /codeBlockCount/);
        assert.match(adapter, /citationCandidateCount/);
        assert.doesNotMatch(probeScript, /GM_getValue/);
    });

    it('keeps live Gemini compatibility status conservative', () => {
        const projectStatus = read('docs/PROJECT_STATUS.md');
        const roadmap = read('docs/ROADMAP.md');
        const auditStatus = read('docs/audits/CURRENT_AUDIT_STATUS.md');
        const marketPlan = read('docs/research/market-ui-plan-2026-06-07.md');

        assert.match(projectStatus, /live smoke still pending/i);
        assert.match(projectStatus, /last full logged-in smoke passed on 2026-05-21/);
        assert.match(projectStatus, /does not verify logged-in sidebar history navigation or transcript\s+capture/);
        assert.match(roadmap, /last live DOM evidence, not a current-day compatibility guarantee/);
        assert.match(roadmap, /Live logged-in proof is still pending/);
        assert.match(auditStatus, /Repeat for every Google Gemini frontend shift/);
        assert.match(marketPlan, /logged-in live proof remains pending/);
    });

    it('keeps Prompt Vault import available when the vault is empty', () => {
        const promptVault = read('src/modules/prompt_vault.js');
        const emptyIdx = promptVault.indexOf('if (this._prompts.length === 0)');
        const appendIdx = promptVault.indexOf('this._appendPromptIORow(container);', emptyIdx);
        const returnIdx = promptVault.indexOf('return;', emptyIdx);

        assert.ok(emptyIdx !== -1, 'empty Prompt Vault branch missing');
        assert.ok(appendIdx !== -1, 'empty Prompt Vault branch must render import/export controls');
        assert.ok(appendIdx < returnIdx, 'Prompt Vault import/export controls must render before empty-state return');
    });

    it('keeps Chat Notes pinned packets explicit and local', () => {
        const chatNotes = read('src/modules/chat_notes.js');

        assert.match(chatNotes, /formatContextPacket/);
        assert.match(chatNotes, /_insertPinnedContextPacket/);
        assert.match(chatNotes, /Pinned Gemini context packet/);
        assert.match(chatNotes, /notes\.slice\(0, 8\)/);
        assert.doesNotMatch(chatNotes, /getCurrentConversationMessages/);
    });

    it('keeps Prompt Vault prompt packets explicit and local', () => {
        const promptVault = read('src/modules/prompt_vault.js');

        assert.match(promptVault, /formatPromptContextPacket/);
        assert.match(promptVault, /_packetSelected/);
        assert.match(promptVault, /_insertSelectedPromptPacket/);
        assert.match(promptVault, /Selected Gemini prompt packet/);
        assert.doesNotMatch(promptVault, /getCurrentConversationMessages/);
        assert.doesNotMatch(promptVault, /formatContextPacket/);
    });

    it('keeps recently hardened module labels localized', () => {
        const exportModule = read('src/modules/export.js');
        const promptVault = read('src/modules/prompt_vault.js');
        const messageQueue = read('src/modules/message_queue.js');
        const chatNotes = read('src/modules/chat_notes.js');

        assert.match(exportModule, /NativeUI\.t\('当前对话', 'Current Chat'\)/);
        assert.match(exportModule, /NativeUI\.t\('选中对话', 'Selected Chats'\)/);
        assert.doesNotMatch(exportModule, /textContent = 'Current Chat'/);
        assert.doesNotMatch(exportModule, /textContent = 'Selected Chats'/);

        assert.match(promptVault, /NativeUI\.t\('提示词金库', 'Prompt Vault'\)/);
        assert.match(promptVault, /NativeUI\.t\('提示词名称', 'Prompt name'\)/);
        assert.match(promptVault, /NativeUI\.t\('新建提示词', 'New Prompt'\)/);
        assert.doesNotMatch(promptVault, /title = 'Prompt Vault'/);
        assert.doesNotMatch(promptVault, /placeholder = 'Prompt name'/);
        assert.doesNotMatch(promptVault, /textContent = 'No saved prompts/);

        assert.match(messageQueue, /NativeUI\.t\('消息队列', 'Message Queue'\)/);
        assert.match(chatNotes, /NativeUI\.t\('对话笔记', 'Chat Notes'\)/);
    });

    it('keeps folder and batch-delete panel labels localized', () => {
        const folders = read('src/modules/folders.js');
        const batchDelete = read('src/modules/batch_delete.js');

        assert.match(folders, /NativeUI\.t\('文件夹', 'Folders'\)/);
        assert.match(folders, /NativeUI\.t\('搜索对话\.\.\.', 'Search chats\.\.\.'\)/);
        assert.match(folders, /NativeUI\.t\('\+ 新建文件夹', '\+ New Folder'\)/);
        assert.match(folders, /NativeUI\.t\('文件夹名称', 'Folder name'\)/);
        assert.match(folders, /NativeUI\.t\('\+ 添加规则', '\+ Add Rule'\)/);
        assert.doesNotMatch(folders, /textContent = 'Folders'/);
        assert.doesNotMatch(folders, /placeholder = 'Search chats\.\.\.'/);
        assert.doesNotMatch(folders, /textContent = '\+ New Folder'/);
        assert.doesNotMatch(folders, /placeholder = 'Folder name'/);

        assert.match(batchDelete, /NativeUI\.t\('批量删除', 'Batch Delete'\)/);
        assert.match(batchDelete, /NativeUI\.t\('全选', 'Select All'\)/);
        assert.match(batchDelete, /NativeUI\.t\('取消全选', 'Deselect All'\)/);
        assert.doesNotMatch(batchDelete, /title\.textContent = 'Batch Delete'/);
        assert.doesNotMatch(batchDelete, /selectAll\.textContent = 'Select All'/);
        assert.doesNotMatch(batchDelete, /deselectAll\.textContent = 'Deselect All'/);
    });

    it('keeps quote and UI tweaks native labels localized', () => {
        const quoteReply = read('src/modules/quote_reply.js');
        const uiTweaks = read('src/modules/ui_tweaks.js');

        assert.match(quoteReply, /NativeUI\.t\('引用', 'Quote'\)/);
        assert.match(quoteReply, /NativeUI\.t\('包', 'Packet'\)/);
        assert.doesNotMatch(quoteReply, /textContent = '\\uD83D\\uDCAC Quote'/);

        assert.match(uiTweaks, /NativeUI\.t\('Ctrl\+Enter \\u21B5', 'Ctrl\+Enter \\u21B5'\)/);
        assert.match(uiTweaks, /NativeUI\.t\('输入字数计数', 'Input counter'\)/);
        assert.doesNotMatch(uiTweaks, /textContent = 'Ctrl\+Enter \\u21B5'/);
    });

    it('keeps UI Tweaks input counter local to the composer', () => {
        const uiTweaks = read('src/modules/ui_tweaks.js');
        const styles = read('src/native_ui_styles.js');
        const inputStats = read('lib/input_stats_tools.js');

        assert.match(uiTweaks, /inputCounter/);
        assert.match(uiTweaks, /formatInputStats/);
        assert.match(uiTweaks, /GeminiAdapter\.getInputEditor\(\)/);
        assert.match(uiTweaks, /editor\.addEventListener\('input'/);
        assert.match(uiTweaks, /gc-input-counter/);
        assert.match(styles, /gc-input-counter/);
        assert.match(inputStats, /getInputStats/);
        assert.doesNotMatch(uiTweaks, /getCurrentConversationMessages|scanSidebarChatLinks/);
    });

    it('keeps Quote Reply selected text packets explicit and local', () => {
        const quoteReply = read('src/modules/quote_reply.js');

        assert.match(quoteReply, /formatTextSnippetPacket/);
        assert.match(quoteReply, /_insertSnippetPacket/);
        assert.match(quoteReply, /Selected Gemini text snippet/);
        assert.doesNotMatch(quoteReply, /getCurrentConversationMessages/);
    });

    it('keeps Export transcript packets explicit, bounded, and insert-only', () => {
        const exportModule = read('src/modules/export.js');
        const packetTools = read('lib/context_packet_tools.js');

        assert.match(exportModule, /formatTranscriptSnippetPacket/);
        assert.match(exportModule, /formatBulkTranscriptSnippetPacket/);
        assert.match(exportModule, /_insertCurrentTranscriptPacket/);
        assert.match(exportModule, /_insertSelectedTranscriptPacket/);
        assert.match(exportModule, /Current Gemini transcript snippet packet/);
        assert.match(exportModule, /Selected Gemini transcript snippet packet/);
        assert.match(packetTools, /MAX_TRANSCRIPT_CHATS = 4/);
        assert.match(packetTools, /MAX_TRANSCRIPT_MESSAGES = 12/);
        assert.match(packetTools, /MAX_TRANSCRIPT_MESSAGE_LENGTH = 1200/);
        assert.doesNotMatch(exportModule, /GM_setValue/);
        assert.doesNotMatch(exportModule, /getSendButton|sendBtn\.click/);
    });

    it('keeps DOCX transcript export dependency-free and reachable', () => {
        const exportModule = read('src/modules/export.js');
        const transcriptTools = read('lib/chat_transcript_export.js');
        const pkg = JSON.parse(read('package.json'));

        assert.match(transcriptTools, /exportTranscriptDOCX/);
        assert.match(transcriptTools, /exportBulkTranscriptDOCX/);
        assert.match(transcriptTools, /createDocxPackage/);
        assert.match(exportModule, /exportCurrentChatDOCX/);
        assert.match(exportModule, /exportSelectedChatsDOCX/);
        assert.match(exportModule, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
        assert.equal(pkg.dependencies, undefined);
        assert.doesNotMatch(transcriptTools, /require\('docx'\)|require\('jszip'\)|require\('jspdf'\)|require\('pdf-lib'\)/);
    });

    it('keeps transcript CSV export reachable and spreadsheet-safe', () => {
        const exportModule = read('src/modules/export.js');
        const transcriptTools = read('lib/chat_transcript_export.js');

        assert.match(transcriptTools, /exportTranscriptCSV/);
        assert.match(transcriptTools, /exportBulkTranscriptCSV/);
        assert.match(transcriptTools, /escapeCSVCell/);
        assert.match(transcriptTools, /\^\\s\*\[=\+\\-@\]/);
        assert.match(exportModule, /exportCurrentChatCSV/);
        assert.match(exportModule, /exportSelectedChatsCSV/);
        assert.match(exportModule, /text\/csv/);
    });
});
