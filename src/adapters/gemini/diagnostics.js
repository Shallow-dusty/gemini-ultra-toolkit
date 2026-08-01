export const diagnosticsMethods = Object.freeze({
    getSelectorHealthReport() {
        const chatCount = this.getChatLinkCount();
        const checks = [
            { id: 'sidebar', label: 'Sidebar', ok: Boolean(this.getSidebar()) },
            { id: 'sidebar-overflow', label: 'Sidebar overflow', ok: Boolean(this.getSidebarOverflowContainer()) },
            { id: 'input-area', label: 'Input area', ok: Boolean(this.getInputArea()) },
            { id: 'input-editor', label: 'Input editor', ok: Boolean(this.getInputEditor()) },
            { id: 'input-actions', label: 'Input actions', ok: Boolean(this.getInputTrailingActions()) },
            { id: 'send-button', label: 'Send button', ok: Boolean(this.getSendButton()) },
            { id: 'chat-header', label: 'Chat header', ok: Boolean(this.getChatHeader()) },
            { id: 'model-switch', label: 'Model switch', ok: Boolean(this.getModelSwitch()) },
            { id: 'chat-links', label: 'Sidebar chat links', ok: chatCount > 0, detail: String(chatCount) }
        ];
        const passed = checks.filter(check => check.ok).length;
        return {
            ready: this.isReady(),
            passed,
            total: checks.length,
            failed: checks.filter(check => !check.ok).map(check => check.id),
            checks
        };
    },

    getRuntimeProbeReport() {
        const selectorHealth = this.getSelectorHealthReport();
        const capabilityProbe = this.getCapabilityProbeReport();
        const chatLinks = this.scanSidebarChatLinks();
        const firstChat = chatLinks[0] || null;
        const modelOptions = this.getModelMenuOptions();
        const chatId = this.getChatId();
        return {
            generatedAt: new Date().toISOString(),
            page: {
                host: globalThis.location?.host || '',
                pathKind: chatId ? 'conversation' : (this.isNewChatUrl() ? 'new-chat' : 'other'),
                chatIdPresent: Boolean(chatId),
                viewport: {
                    width: globalThis.window?.innerWidth || 0,
                    height: globalThis.window?.innerHeight || 0,
                    dpr: globalThis.window?.devicePixelRatio || 1
                }
            },
            selectorHealth,
            capabilityProbe,
            probes: {
                sidebar: {
                    present: Boolean(this.getSidebar()),
                    chatCount: chatLinks.length,
                    firstRowActionPresent: Boolean(firstChat && this.getChatRowMoreButton(firstChat.element))
                },
                input: {
                    areaPresent: Boolean(this.getInputArea()),
                    editorPresent: Boolean(this.getInputEditor()),
                    sendButtonPresent: Boolean(this.getSendButton()),
                    activeToolMode: this.getActiveToolMode(),
                    visibleToolModeEntries: this.getVisibleToolModeEntries()
                },
                model: {
                    switchPresent: Boolean(this.getModelSwitch()),
                    labelPresent: Boolean(this.getModelSwitchLabel()),
                    detectedKey: this.detectModelKey(),
                    openMenuOptionCount: modelOptions.length,
                    openMenuKeys: modelOptions.map(option => option.key).filter(Boolean)
                },
                header: {
                    anchorPresent: Boolean(this.getChatHeader()),
                    titleTextPresent: Boolean(this.getChatTitleText())
                },
                conversation: {
                    visibleMessageCount: this.getCurrentConversationMessages().length,
                    richResponse: this.getRichResponseProbeReport()
                }
            }
        };
    }
});
