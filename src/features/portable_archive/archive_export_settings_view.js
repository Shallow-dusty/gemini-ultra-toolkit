/** Settings/onboarding view for Archive and legacy export entry points. */
export function createArchiveExportSettingsView({
    controller,
    ensureArchiveFeature,
    runArchiveAction,
    translate,
    icon
}) {
    return Object.freeze({
        getOnboarding() {
            return {
                zh: {
                    rant: '把重要对话和本地工作流保存为可校验、可迁移的归档；需要恢复时先查看计划，再决定后续操作。',
                    features: '在聊天标题旁保留多格式导出，并提供带校验和的可移植归档、内容选择和只读恢复预演。',
                    guide: '当前对话可继续导出 JSON / CSV / MD / TXT / HTML / DOCX；在归档与导出面板选择内容后，可预览或下载归档。导入文件只生成恢复计划，不会自动写入或删除数据。'
                },
                en: {
                    rant: 'Keep important conversations and local workflows in a verifiable, portable archive. Review a restore plan before deciding what to apply later.',
                    features: 'Keeps the chat-title multi-format export and adds checksum-verified portable archives, content selection, and read-only restore planning.',
                    guide: 'Current chats still export as JSON / CSV / MD / TXT / HTML / DOCX. In Archive & Export, select content to preview or download an archive. Imported files produce a dry-run plan only and never write or delete data automatically.'
                }
            };
        },

        renderExportButtons(container) {
            const specs = [
                ['download', translate('导出 JSON', 'Export JSON'), () => controller.exportJSON()],
                ['download', translate('导出 CSV', 'Export CSV'), () => controller.doExportCSV()],
                ['download', translate('导出 Markdown', 'Export Markdown'), () => controller.doExportMarkdown()],
                ['download', translate('导出当前对话', 'Export Current Chat'), () => controller.downloadCurrentTranscript('markdown')],
                ['download', translate('导出当前对话 CSV', 'Export Current Chat CSV'), () => controller.downloadCurrentTranscript('csv')],
                ['download', translate('导出当前对话 HTML', 'Export Current Chat HTML'), () => controller.downloadCurrentTranscript('html')],
                ['download', translate('导出当前对话 DOCX', 'Export Current Chat DOCX'), () => controller.downloadCurrentTranscript('docx')],
                ['package', translate('预览可移植归档', 'Preview Portable Archive'), () => runArchiveAction(() => ensureArchiveFeature().showPreview(['chats']))],
                ['download', translate('下载可移植归档', 'Download Portable Archive'), () => runArchiveAction(() => ensureArchiveFeature().download(['chats']))]
            ];

            specs.forEach(([iconId, label, action]) => {
                const button = globalThis.document.createElement('button');
                button.type = 'button';
                button.className = 'settings-btn';
                button.style.cssText = 'display:flex;align-items:center;gap:6px;';
                button.appendChild(icon(iconId, 14));
                button.appendChild(globalThis.document.createTextNode(` ${label}`));
                button.onclick = action;
                container.appendChild(button);
            });
        }
    });
}
