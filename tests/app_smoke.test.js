const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function tokenizeEmbeddedCode(source) {
    const tokens = [];
    for (let index = 0; index < source.length;) {
        const rest = source.slice(index);
        if (rest.startsWith('"""') || rest.startsWith("'''")) {
            index += 3;
            continue;
        }
        if (rest.startsWith('//') || source[index] === '#') {
            const newline = source.indexOf('\n', index);
            index = newline === -1 ? source.length : newline + 1;
            continue;
        }
        if (rest.startsWith('/*')) {
            const end = source.indexOf('*/', index + 2);
            index = end === -1 ? source.length : end + 2;
            continue;
        }
        const character = source[index];
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }
        if (character === '"' || character === "'" || character === '`') {
            const quote = character;
            let value = '';
            index += 1;
            while (index < source.length && source[index] !== quote) {
                if (source[index] === '\\' && index + 1 < source.length) index += 1;
                value += source[index];
                index += 1;
            }
            index += index < source.length ? 1 : 0;
            tokens.push({ type: 'string', value });
            continue;
        }
        if (/[A-Za-z_$]/.test(character)) {
            const start = index;
            while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
            tokens.push({ type: 'identifier', value: source.slice(start, index) });
            continue;
        }
        tokens.push({ type: 'punctuator', value: character });
        index += 1;
    }
    return tokens;
}

function findDirectGmStorageReads(source) {
    const tokens = tokenizeEmbeddedCode(source);
    const aliases = new Set(['GM_getValue']);
    const isIdentifier = (index, value) => tokens[index]?.type === 'identifier' &&
        (value === undefined || tokens[index].value === value);
    const isBracketReference = index => isIdentifier(index) &&
        tokens[index + 1]?.value === '[' &&
        tokens[index + 2]?.type === 'string' && tokens[index + 2].value === 'GM_getValue' &&
        tokens[index + 3]?.value === ']';
    const resolvesToRead = index => (isIdentifier(index) && aliases.has(tokens[index].value)) ||
        (isIdentifier(index) && tokens[index + 1]?.value === '.' &&
            isIdentifier(index + 2, 'GM_getValue')) || isBracketReference(index);

    let changed = true;
    while (changed) {
        changed = false;
        for (let index = 1; index < tokens.length - 1; index += 1) {
            if (tokens[index].value !== '=' || !isIdentifier(index - 1) || !resolvesToRead(index + 1)) continue;
            if (!aliases.has(tokens[index - 1].value)) {
                aliases.add(tokens[index - 1].value);
                changed = true;
            }
        }
        for (let index = 0; index < tokens.length - 4; index += 1) {
            if (tokens[index].value !== '{' || !isIdentifier(index + 1, 'GM_getValue')) continue;
            const aliasIndex = tokens[index + 2]?.value === ':' ? index + 3 : index + 1;
            if (!isIdentifier(aliasIndex)) continue;
            const closeIndex = tokens.findIndex((token, candidate) => candidate > aliasIndex && token.value === '}');
            if (closeIndex === -1 || tokens[closeIndex + 1]?.value !== '=') continue;
            if (!aliases.has(tokens[aliasIndex].value)) {
                aliases.add(tokens[aliasIndex].value);
                changed = true;
            }
        }
    }

    const calls = [];
    for (let index = 0; index < tokens.length; index += 1) {
        if (isIdentifier(index) && aliases.has(tokens[index].value) && tokens[index + 1]?.value === '(') {
            calls.push(tokens[index].value);
        }
        if (isBracketReference(index) && tokens[index + 4]?.value === '(') calls.push('GM_getValue');
    }
    return calls;
}

describe('app smoke checks', () => {
    it('wires one platform runtime into core, shell, Gemini, and Recipes boundaries', () => {
        const main = read('src/main.js');
        assert.match(main, /const platform = createLegacyGmRuntime\(\)/);
        for (const boundary of [
            'configureLoggerRuntime',
            'configureStateRuntime',
            'configureCoreRuntime',
            'configureNativeUIRuntime',
            'ModuleRegistry.configureRuntime'
        ]) {
            assert.match(main, new RegExp(`${boundary.replace('.', '\\.')}\\(\\{ storage: platform\\.storage \\}\\)`));
        }
        assert.match(main, /DOMWatcher\.configure\(\{ attributeFilter: GeminiAdapter\.SELECTORS\.MUTATION_ATTRIBUTE_FILTER \}\)/);
        assert.match(main, /PanelUI\.configureShellPorts\(\{[\s\S]*?counter: CounterModule,[\s\S]*?exportModule: ExportModule,[\s\S]*?storage: platform\.storage,[\s\S]*?addStyle: platform\.addStyle/);
        assert.match(main, /GuidedTour\.configurePorts\(\{ storage: platform\.storage \}\)/);
        assert.match(main, /const notifications = Object\.freeze\(\{[\s\S]*?NativeUI\.showToast/);
        assert.match(main, /const shell = Object\.freeze\(\{ openModule: id => PanelUI\.openModule\(id\) \}\)/);
        assert.match(main, /PromptVaultModule\.configureCapabilities\(\{ notifications, shell \}\)/);
        assert.match(main, /flushPlatform: platform\.storage\.flush/);
        assert.match(main, /createPersistedReloadHandler\(\{/);
        assert.doesNotMatch(main, /\bGM_[A-Za-z0-9_]+\b|globalThis\.GM\b/);
    });

    it('assembles every production Portable Archive section from the existing legacy modules', () => {
        const main = read('src/main.js');
        const production = read('src/app/portable_archive_production.js');
        assert.match(main, /createProductionPortableArchive\(\{/);
        for (const mapping of [
            'chats: QuoteReplyModule',
            'annotations: ChatNotesModule',
            'collections: FoldersModule',
            'recipes: PromptVaultModule',
            'insights: CounterModule',
            'queue: MessageQueueModule'
        ]) assert.match(main, new RegExp(mapping));
        assert.match(main, /ExportModule\.configure\(portableArchive\.exportPorts\)/);
        assert.match(main, /archiveWiring: portableArchive\.wiring/);
        assert.match(main, /onModuleDisabled: composition\.registryCallbacks\.onModuleDisabled/);
        assert.match(production, /createPreferencesArchiveRepository/);
        assert.match(production, /createPreferencesPortableArchivePort/);
        assert.match(production, /stageDesiredModules/);
        assert.doesNotMatch(production, /registry\.toggle/);
    });

    it('keeps public branding and disclaimer aligned', () => {
        const meta = read('src/meta.txt');
        const manifest = JSON.parse(read('src/platforms/extension/manifest.json'));
        const readme = read('README.md');
        const constants = read('src/constants.js');

        assert.match(meta, /@name\s+Primer\+\+ for Gemini™ \(v13\.0\)/);
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
        const panelStyles = read('src/ui/shell/panel_styles.js');
        const modalShell = read('src/ui/shell/modal_shell.js');
        const settingsController = read('src/ui/shell/settings_controller.js');
        const dashboardController = read('src/ui/shell/dashboard_controller.js');
        const nativeUi = read('src/native_ui.js');

        assert.match(panelStyles, /:focus-visible/);
        assert.match(panelStyles, /prefers-reduced-motion: reduce/);
        assert.match(panelStyles, /\.panel-settings-trigger \{ width: 44px; min-width: 44px/);
        assert.match(nativeUi, /trapFocus\(container\)/);
        assert.match(modalShell, /IconButton\(/);
        assert.match(settingsController, /ui\.openDialog\(/);
        assert.match(dashboardController, /ui\.openDialog\(/);
    });

    it('merges Guest data only after the new user storage has loaded', () => {
        const main = read('src/main.js');

        // The fix requires notifyUserChange() to run BEFORE the merge block,
        // so the freshly-loaded user storage is the base, not the live cm.state
        // (which still contains the soon-to-be-cloned Guest data).
        const notifyIdx = main.indexOf('portableArchive.notifySession(getInspectingUser())');
        const mergeIdx = main.indexOf('Merged ${guestState.total} messages from Guest session');
        assert.ok(notifyIdx !== -1, 'notifyUserChange call missing');
        assert.ok(mergeIdx !== -1, 'guest merge block missing');
        assert.ok(notifyIdx < mergeIdx, 'notifyUserChange must precede guest merge to avoid double-counting');

        // And it must run exactly once — a leftover trailing call would
        // re-load cm.state and wipe the merge that was just persisted.
        const matches = main.match(/portableArchive\.notifySession\(getInspectingUser\(\)\)/g) || [];
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

        assert.match(main, /function startProgressiveDisclosure\(scope\)/);
        assert.match(main, /onReady\(scope\) \{\s*onDOMStructureChange\(\);\s*startProgressiveDisclosure\(scope\);/);
        assert.doesNotMatch(main, /gc-onboarding-overlay/);
        assert.match(main, /#gemini-onboarding-modal, \.onboarding-overlay/);
        assert.match(main, /function onPanelRemoved\(\) \{[\s\S]*?PanelUI\.create\(\);/);
        assert.doesNotMatch(
            main.match(/function onPanelRemoved\(\)[\s\S]*?\n\}/)?.[0] || '',
            /isEnabled\('counter'\)/
        );

        assert.match(panelUi, /_isPanelComplete\(container\)/);
        assert.match(panelUi, /existing\.remove\(\);/);
        assert.match(panelUi, /const counter = this\._requireShellPort\('counter'\)/);
        assert.doesNotMatch(panelUi, /\.\/modules\//);
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
        const version = braceExpansion.version.split('.').map(Number);
        assert.ok(
            version[0] > 5 || (version[0] === 5 && (version[1] > 0 || version[2] >= 9)),
            `brace-expansion ${braceExpansion.version} is below the audited 5.0.9 floor`
        );
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
        assert.match(read('src/ui/shell/debug_controller.js'), /adapter\.getSelectorHealthReport\(\)/);
    });

    it('keeps adapter probe export reachable without exposing storage dumps', () => {
        const main = read('src/main.js');
        const debugUtils = read('src/debug_utils.js');
        const panelSettings = read('src/panel_settings.js');
        const probeScript = read('store-assets/scripts/export_adapter_probe.py');
        const cdpClient = read('store-assets/scripts/cdp_client.py');
        const panelProbe = read('store-assets/scripts/probe_panel.py');
        const adapter = read('src/adapters/gemini.js');

        assert.match(main, /__PRIMER_PP_GET_PROBE_REPORT__/);
        assert.match(main, /Debug: Export Adapter Probe/);
        assert.match(debugUtils, /debugExportAdapterProbe/);
        assert.match(panelSettings, /Export Adapter Probe/);
        const productionDiagnostics = `${main}\n${panelSettings}`;
        for (const rawDiagnostic of [
            'debugShowDetectedUser',
            'debugDumpStorageKeys',
            'debugDumpGeminiStores',
            'debugExportLegacyData',
            'debugExportAllStorage',
            'debugExportLogs',
            'Dump Storage Keys',
            'Export All Storage',
            'Export Legacy Data',
            'Dump Gemini Storage'
        ]) {
            assert.doesNotMatch(productionDiagnostics, new RegExp(rawDiagnostic));
        }
        assert.match(probeScript, /__PRIMER_PP_GET_PROBE_REPORT__/);
        assert.match(probeScript, /--inject-userscript/);
        assert.match(cdpClient, /COMMON_CDP_PORTS/);
        assert.match(cdpClient, /PRIMER_PP_CDP_PORT/);
        assert.match(panelProbe, /find_gemini_page_ws/);
        assert.doesNotMatch(panelProbe, /127\.0\.0\.1:63366/);
        assert.match(adapter, /richResponse: this\.getRichResponseProbeReport\(\)/);
        assert.match(adapter, /codeBlockCount/);
        assert.match(adapter, /citationCandidateCount/);
        const forbiddenReadExamples = [
            "GM_getValue\n('secret')",
            "window[\n'GM_getValue'\n]\n('secret')",
            "const readValue = globalThis['GM_getValue'];\nreadValue('secret')",
            "const { GM_getValue: readValue } = globalThis;\nreadValue('secret')"
        ];
        for (const example of forbiddenReadExamples) {
            assert.notDeepEqual(findDirectGmStorageReads(example), []);
        }
        assert.deepEqual(findDirectGmStorageReads("const names = ['GM_getValue'];"), []);
        assert.deepEqual(findDirectGmStorageReads(probeScript), []);
    });

    it('keeps current Gemini compatibility evidence bounded', () => {
        const projectStatus = read('docs/PROJECT_STATUS.md');
        const roadmap = read('docs/ROADMAP.md');
        const auditStatus = read('docs/audits/CURRENT_AUDIT_STATUS.md');
        const marketPlan = read('docs/research/market-ui-plan-2026-06-07.md');

        assert.match(projectStatus, /v13\.0 release\s+candidate/i);
        assert.match(projectStatus, /strict current-account worksheet is 38\.5\/40 \(96\.25%\)/i);
        assert.match(projectStatus, /every critical row passes/i);
        assert.match(projectStatus, /three partial evidence rows/i);
        assert.match(projectStatus, /personal-free or Workspace score/i);
        assert.match(projectStatus, /unrelated chats and authentication remained/i);
        assert.match(roadmap, /current-account evidence gates are complete/i);
        assert.match(roadmap, /do not change "latest published release" from v12\.0/i);
        assert.match(auditStatus, /38\.5\/40 task-equivalents \(96\.25%\)/i);
        assert.match(auditStatus, /37 full,\s+3 partial, 0 unverified/i);
        assert.match(marketPlan, /logged-in live proof remains pending/);
    });

    it('keeps Prompt Vault import available when the vault is empty', () => {
        const recipesUi = read('src/features/recipes/legacy_ui.js');
        const toolbarIdx = recipesUi.indexOf('section.appendChild(toolbar);');
        const emptyIdx = recipesUi.indexOf('if (items.length === 0)');

        assert.ok(emptyIdx !== -1, 'empty Recipes branch missing');
        assert.match(recipesUi, /translate\(t, '导入', 'Import'\)/);
        assert.match(recipesUi, /translate\(t, '导出', 'Export'\)/);
        assert.ok(toolbarIdx !== -1 && toolbarIdx < emptyIdx,
            'Recipes import/export controls must render before the empty state');
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
        const promptVault = read('src/features/recipes/legacy_composer_controller.js');

        assert.match(promptVault, /formatPromptContextPacket/);
        assert.match(promptVault, /packetSelection/);
        assert.match(promptVault, /insertSelectedPromptPacket/);
        assert.match(promptVault, /Selected Gemini prompt packet/);
        assert.doesNotMatch(promptVault, /getCurrentConversationMessages/);
        assert.doesNotMatch(promptVault, /formatContextPacket/);
    });

    it('keeps recently hardened module labels localized', () => {
        const exportModule = read('src/modules/export.js');
        const exportView = read('src/features/portable_archive/archive_export_view.js');
        const promptVault = read('src/features/recipes/legacy_facade.js');
        const recipesUi = read('src/features/recipes/legacy_ui.js');
        const messageQueue = read('src/modules/message_queue.js');
        const chatNotes = read('src/modules/chat_notes.js');

        assert.match(exportView, /translate\('当前对话', 'Current Chat'\)/);
        assert.match(exportView, /translate\('选中对话', 'Selected Chats'\)/);
        assert.doesNotMatch(exportView, /textContent = 'Current Chat'/);
        assert.doesNotMatch(exportView, /textContent = 'Selected Chats'/);

        assert.match(promptVault, /t\('提示词金库', 'Prompt Vault'\)/);
        assert.match(recipesUi, /translate\(t, '提示词名称', 'Prompt name'\)/);
        assert.match(recipesUi, /translate\(t, '新建提示词', 'New Prompt'\)/);
        assert.doesNotMatch(promptVault, /title = 'Prompt Vault'/);
        assert.doesNotMatch(promptVault, /placeholder = 'Prompt name'/);
        assert.doesNotMatch(promptVault, /textContent = 'No saved prompts/);

        assert.match(messageQueue, /NativeUI\.t\('消息队列', 'Message Queue'\)/);
        assert.match(chatNotes, /NativeUI\.t\('对话笔记', 'Chat Notes'\)/);
    });

    it('keeps Message Queue pacing local and clamped', () => {
        const messageQueue = read('src/modules/message_queue.js');
        const queueTools = read('lib/message_queue_tools.js');

        assert.match(queueTools, /normalizeQueueIntervalMs/);
        assert.match(queueTools, /MIN_QUEUE_INTERVAL_MS/);
        assert.match(queueTools, /MAX_QUEUE_INTERVAL_MS/);
        assert.match(messageQueue, /setQueueInterval/);
        assert.match(messageQueue, /input\.type = 'number'/);
        assert.match(messageQueue, /NativeUI\.t\('发送间隔', 'Send interval'\)/);
        assert.doesNotMatch(messageQueue, /chrome\.storage\.sync|fetch\(/);
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

    it('keeps the Quote Reply facade localized', () => {
        const quoteReply = read('src/modules/quote_reply.js');
        const viewContracts = read('src/features/search_navigator/view_contracts.js');

        assert.match(quoteReply, /引用回复 \/ Quote Reply/);
        assert.match(quoteReply, /搜索与导航 \/ Search & Navigator/);
        assert.match(viewContracts, /quote: 'Quote'/);
        assert.match(viewContracts, /packet: 'Context packet'/);
        assert.doesNotMatch(quoteReply, /NativeUI|PanelUI/);
        assert.doesNotMatch(quoteReply, /textContent = '\\uD83D\\uDCAC Quote'/);
    });

    it('keeps UI tweaks native labels localized', () => {
        const uiTweaks = read('src/features/preferences/ui_tweaks_controller.js');
        assert.match(uiTweaks, /this\.surface\.translate\('Ctrl\+Enter 才发送', 'Ctrl\+Enter to send'\)/);
        assert.match(uiTweaks, /this\.surface\.translate\('输入字数计数', 'Input counter'\)/);
        assert.doesNotMatch(uiTweaks, /textContent = 'Ctrl\+Enter ↵'/);
    });

    it('keeps UI Tweaks input counter local to the composer', () => {
        const uiTweaksFacade = read('src/modules/ui_tweaks.js');
        const uiTweaks = read('src/features/preferences/ui_composer_preference.js');
        const preferencesSurface = read('src/features/preferences/dom_surface.js');
        const styles = read('src/native_ui_styles.js');
        const inputStats = read('lib/input_stats_tools.js');
        const vertical = [uiTweaksFacade, uiTweaks, preferencesSurface].join('\n');

        assert.match(uiTweaks, /inputCounter/);
        assert.match(uiTweaksFacade, /formatInputStats/);
        assert.match(uiTweaks, /this\.adapter\.getInputEditor\(\)/);
        assert.match(uiTweaks, /editor\.addEventListener\('input'/);
        assert.match(preferencesSurface, /gc-input-counter/);
        assert.match(preferencesSurface, /document\.createElement\('output'\)/);
        assert.match(preferencesSurface, /setAttribute\('role', 'switch'\)/);
        assert.match(styles, /gc-input-counter/);
        assert.match(inputStats, /getInputStats/);
        assert.doesNotMatch(vertical, /getCurrentConversationMessages|scanSidebarChatLinks/);
        assert.doesNotMatch(vertical, /hideGems|buildUITweakCssRules|createElement\('style'\)|document\.head/);
        assert.doesNotMatch([uiTweaksFacade, uiTweaks].join('\n'), /\bGM_(?:get|set)Value\b/);
    });

    it('keeps Quote Reply selected text packets explicit and local', () => {
        const quoteReply = read('src/modules/quote_reply.js');
        const searchNavigator = read('src/features/search_navigator/vertical_feature.js');
        const composerQuote = read('src/features/search_navigator/composer_quote.js');
        const quoteToolbar = read('src/features/search_navigator/quote_toolbar.js');
        const vertical = `${searchNavigator}\n${composerQuote}\n${quoteToolbar}`;

        assert.match(quoteReply, /SearchNavigatorViewController/);
        assert.match(quoteReply, /_insertSnippetPacket/);
        assert.match(composerQuote, /formatTextSnippetPacket/);
        assert.match(composerQuote, /Selected Gemini text snippet/);
        assert.match(composerQuote, /submit: false/);
        assert.doesNotMatch(quoteReply, /getCurrentConversationMessages/);
        assert.doesNotMatch(vertical, /getSendButton|\.submit\(|\.click\(/);
    });

    it('keeps Export transcript packets explicit, bounded, and insert-only', () => {
        const exportModule = read('src/modules/export.js');
        const currentExport = read('src/features/portable_archive/current_chat_export_controller.js');
        const multiExport = read('src/features/portable_archive/multi_chat_export_controller.js');
        const exportSources = `${exportModule}\n${currentExport}\n${multiExport}`;
        const packetTools = read('lib/context_packet_tools.js');

        assert.match(currentExport, /formatTranscriptSnippetPacket/);
        assert.match(multiExport, /formatBulkTranscriptSnippetPacket/);
        assert.match(exportModule, /_insertCurrentTranscriptPacket/);
        assert.match(exportModule, /_insertSelectedTranscriptPacket/);
        assert.match(currentExport, /Current Gemini transcript snippet packet/);
        assert.match(multiExport, /Selected Gemini transcript snippet packet/);
        assert.match(packetTools, /MAX_TRANSCRIPT_CHATS = 4/);
        assert.match(packetTools, /MAX_TRANSCRIPT_MESSAGES = 12/);
        assert.match(packetTools, /MAX_TRANSCRIPT_MESSAGE_LENGTH = 1200/);
        assert.doesNotMatch(exportSources, /GM_setValue/);
        assert.doesNotMatch(exportSources, /getSendButton|sendBtn\.click/);
    });

    it('keeps DOCX transcript export dependency-free and reachable', () => {
        const exportModule = read('src/modules/export.js');
        const exportRenderer = read('src/features/portable_archive/export_download_renderer.js');
        const transcriptTools = read('lib/chat_transcript_export.js');
        const pkg = JSON.parse(read('package.json'));

        assert.match(transcriptTools, /exportTranscriptDOCX/);
        assert.match(transcriptTools, /exportBulkTranscriptDOCX/);
        assert.match(transcriptTools, /createDocxPackage/);
        assert.match(exportModule, /exportCurrentChatDOCX/);
        assert.match(exportModule, /exportSelectedChatsDOCX/);
        assert.match(exportRenderer, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
        assert.equal(pkg.dependencies, undefined);
        assert.doesNotMatch(transcriptTools, /require\('docx'\)|require\('jszip'\)|require\('jspdf'\)|require\('pdf-lib'\)/);
    });

    it('keeps transcript CSV export reachable and spreadsheet-safe', () => {
        const exportModule = read('src/modules/export.js');
        const exportRenderer = read('src/features/portable_archive/export_download_renderer.js');
        const transcriptTools = read('lib/chat_transcript_export.js');

        assert.match(transcriptTools, /exportTranscriptCSV/);
        assert.match(transcriptTools, /exportBulkTranscriptCSV/);
        assert.match(transcriptTools, /escapeCSVCell/);
        assert.match(transcriptTools, /\^\\s\*\[=\+\\-@\]/);
        assert.match(exportModule, /exportCurrentChatCSV/);
        assert.match(exportModule, /exportSelectedChatsCSV/);
        assert.match(exportRenderer, /text\/csv/);
    });
});
