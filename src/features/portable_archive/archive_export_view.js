import { createArchiveExportSettingsView } from './archive_export_settings_view.js';

/** DOM-only view for Archive controls and legacy export entry points. */
export function createArchiveExportView({
    controller,
    ensureArchiveFeature,
    runArchiveAction,
    translate = (_zh, en) => en,
    notify = () => {},
    getChatHeader = () => null,
    removeById = id => globalThis.document?.getElementById(id)?.remove(),
    icon = () => globalThis.document.createElement('span'),
    computedStyle = element => getComputedStyle(element),
    scanSidebarChats = () => [],
    invalidateSidebarCache = () => {},
    requestRender = () => {}
}) {
    if (!controller || typeof controller !== 'object') {
        throw new TypeError('Archive export view requires a controller');
    }
    if (typeof ensureArchiveFeature !== 'function' || typeof runArchiveAction !== 'function') {
        throw new TypeError('Archive export view requires archive action adapters');
    }

    let menuAbort = null;
    const settingsView = createArchiveExportSettingsView({
        controller,
        ensureArchiveFeature,
        runArchiveAction,
        translate,
        icon
    });

    const view = {
        injectNativeUI() {
            const document = globalThis.document;
            const nativeId = 'gc-export-native';
            if (document.getElementById(nativeId)) return;

            const title = getChatHeader();
            const parent = title?.parentElement;
            if (!parent) return;

            const button = document.createElement('button');
            button.id = nativeId;
            button.className = 'gc-header-btn';
            button.type = 'button';
            button.appendChild(icon('download', 16));
            button.title = translate('导出对话', 'Export conversation');
            button.setAttribute('aria-label', button.title);
            button.setAttribute('aria-haspopup', 'menu');
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', 'gc-export-menu');
            button.onclick = event => {
                event.stopPropagation();
                view.toggleExportMenu(button);
            };

            const position = computedStyle(parent).position;
            if (position === 'static' || position === '') parent.style.position = 'relative';
            parent.appendChild(button);
        },

        removeNativeUI() {
            removeById('gc-export-native');
            removeById('gc-export-menu');
            menuAbort?.abort();
            menuAbort = null;
        },

        toggleExportMenu(anchorButton) {
            const document = globalThis.document;
            const menuId = 'gc-export-menu';
            const existing = document.getElementById(menuId);
            if (existing) {
                existing.remove();
                anchorButton.setAttribute('aria-expanded', 'false');
                menuAbort?.abort();
                menuAbort = null;
                return;
            }

            const menu = document.createElement('div');
            menu.id = menuId;
            menu.className = 'gc-dropdown-menu';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', translate('导出选项', 'Export options'));
            menu.style.cssText = 'top:100%;right:0;margin-top:4px;';

            const items = [
                ['file-text', translate('用量 JSON', 'Usage JSON'), () => controller.exportJSON()],
                ['chart', translate('用量 CSV', 'Usage CSV'), () => controller.doExportCSV()],
                ['edit', translate('用量 Markdown', 'Usage Markdown'), () => controller.doExportMarkdown()],
                ['file-text', translate('对话 JSON', 'Chat JSON'), () => controller.downloadCurrentTranscript('json')],
                ['chart', translate('对话 CSV', 'Chat CSV'), () => controller.downloadCurrentTranscript('csv')],
                ['edit', translate('对话 Markdown', 'Chat Markdown'), () => controller.downloadCurrentTranscript('markdown')],
                ['file-text', translate('对话 TXT', 'Chat TXT'), () => controller.downloadCurrentTranscript('text')],
                ['file-text', translate('对话 HTML', 'Chat HTML'), () => controller.downloadCurrentTranscript('html')],
                ['file-text', translate('对话 DOCX', 'Chat DOCX'), () => controller.downloadCurrentTranscript('docx')],
                ['package', translate('对话上下文包', 'Chat Packet'), () => controller.insertCurrentTranscriptPacket()],
                ['package', translate('可移植归档预览', 'Portable Archive Preview'), () => ensureArchiveFeature().showPreview(['chats'])]
            ];

            items.forEach(([iconId, text, action]) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'gc-dropdown-item';
                item.style.cssText = 'width:100%;border:0;background:transparent;text-align:left;font:inherit;';
                item.setAttribute('role', 'menuitem');
                item.appendChild(icon(iconId, 14));
                item.appendChild(document.createTextNode(` ${text}`));
                item.onclick = event => {
                    event.stopPropagation();
                    menu.remove();
                    anchorButton.setAttribute('aria-expanded', 'false');
                    menuAbort?.abort();
                    menuAbort = null;
                    Promise.resolve().then(action).catch(error => {
                        notify(error?.message || String(error));
                    });
                };
                menu.appendChild(item);
            });

            anchorButton.parentElement.appendChild(menu);
            anchorButton.setAttribute('aria-expanded', 'true');
            menuAbort?.abort();
            menuAbort = new AbortController();
            const closeMenu = event => {
                if (!menu.contains(event.target) && event.target !== anchorButton) {
                    menu.remove();
                    anchorButton.setAttribute('aria-expanded', 'false');
                    menuAbort?.abort();
                    menuAbort = null;
                }
            };
            document.addEventListener('click', closeMenu, { capture: true, signal: menuAbort.signal });
        },

        panelButton(label, onClick, options = {}) {
            const button = globalThis.document.createElement('button');
            button.type = 'button';
            button.className = 'settings-btn';
            button.style.cssText = options.style || 'width:auto;flex:1 1 38px;padding:5px 6px;font-size:10px;margin-top:0;';
            button.textContent = label;
            button.disabled = !!options.disabled;
            if (button.disabled) {
                button.style.opacity = '0.45';
                button.style.cursor = 'not-allowed';
            } else {
                button.onclick = onClick;
            }
            return button;
        },

        buttonRow(buttons) {
            const row = globalThis.document.createElement('div');
            row.style.cssText = 'display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;';
            buttons.forEach(button => row.appendChild(button));
            return row;
        },

        renderToDetailsPane(container) {
            const document = globalThis.document;
            const section = document.createElement('div');
            section.className = 'gf-section';

            const currentTitle = document.createElement('h3');
            currentTitle.className = 'section-title';
            currentTitle.textContent = translate('当前对话', 'Current Chat');
            section.appendChild(currentTitle);
            section.appendChild(view.buttonRow([
                view.panelButton('JSON', () => controller.downloadCurrentTranscript('json')),
                view.panelButton('CSV', () => controller.downloadCurrentTranscript('csv')),
                view.panelButton('MD', () => controller.downloadCurrentTranscript('markdown')),
                view.panelButton('TXT', () => controller.downloadCurrentTranscript('text')),
                view.panelButton('HTML', () => controller.downloadCurrentTranscript('html')),
                view.panelButton('DOCX', () => controller.downloadCurrentTranscript('docx')),
                view.panelButton(translate('包', 'Packet'), () => controller.insertCurrentTranscriptPacket())
            ]));

            const bulkTitle = document.createElement('h3');
            bulkTitle.className = 'section-title';
            bulkTitle.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
            const bulkLabel = document.createElement('span');
            bulkLabel.textContent = translate('选中对话', 'Selected Chats');
            const bulkCount = document.createElement('span');
            bulkCount.textContent = String(controller.bulkSelected.size);
            bulkTitle.append(bulkLabel, bulkCount);
            section.appendChild(bulkTitle);

            const chats = scanSidebarChats(true);
            if (chats.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'font-size:11px;color:var(--text-sub);padding:8px 0;text-align:center;';
                empty.textContent = translate('未找到侧栏对话', 'No sidebar chats found');
                section.appendChild(empty);
            } else {
                section.appendChild(view.buttonRow([
                    view.panelButton(translate('全选', 'All'), () => {
                        controller.selectVisibleBulkChats(chats);
                        requestRender();
                    }),
                    view.panelButton(translate('清空', 'Clear'), () => {
                        controller.clearBulkSelection();
                        requestRender();
                    }),
                    view.panelButton(translate('刷新', 'Refresh'), () => {
                        invalidateSidebarCache();
                        requestRender();
                    })
                ]));

                const list = document.createElement('div');
                list.style.cssText = 'max-height:160px;overflow-y:auto;margin-top:6px;border-top:1px solid var(--divider);border-bottom:1px solid var(--divider);';
                chats.forEach(chat => {
                    controller.rememberBulkChat(chat);
                    const row = document.createElement('label');
                    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 2px;cursor:pointer;font-size:11px;color:var(--text-main);';
                    row.title = chat.title;

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.name = 'primer-export-selected-chat';
                    checkbox.value = chat.id;
                    checkbox.checked = controller.bulkSelected.has(chat.id);
                    checkbox.onchange = event => {
                        event.stopPropagation();
                        controller.toggleBulkChat(chat);
                        requestRender();
                    };

                    const title = document.createElement('span');
                    title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
                    title.textContent = chat.title;
                    row.append(checkbox, title);
                    list.appendChild(row);
                });
                section.appendChild(list);
            }

            if (controller.bulkExporting) {
                const progress = document.createElement('div');
                progress.setAttribute('role', 'status');
                progress.setAttribute('aria-live', 'polite');
                progress.style.cssText = 'font-size:10px;color:var(--accent);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                progress.textContent = translate(
                    `正在导出 ${controller.bulkProgress.current}/${controller.bulkProgress.total}: ${controller.bulkProgress.title}`,
                    `Exporting ${controller.bulkProgress.current}/${controller.bulkProgress.total}: ${controller.bulkProgress.title}`
                );
                section.appendChild(progress);
                section.appendChild(view.buttonRow([
                    view.panelButton(translate('取消', 'Cancel'), () => {
                        controller.bulkCancelRequested = true;
                    }, { style: 'width:auto;flex:1;padding:5px 6px;font-size:10px;margin-top:0;color:#f28b82;' })
                ]));
            } else {
                const disabled = controller.bulkSelected.size === 0;
                section.appendChild(view.buttonRow([
                    view.panelButton('JSON', () => controller.downloadSelectedTranscripts('json'), { disabled }),
                    view.panelButton('CSV', () => controller.downloadSelectedTranscripts('csv'), { disabled }),
                    view.panelButton('MD', () => controller.downloadSelectedTranscripts('markdown'), { disabled }),
                    view.panelButton('TXT', () => controller.downloadSelectedTranscripts('text'), { disabled }),
                    view.panelButton('HTML', () => controller.downloadSelectedTranscripts('html'), { disabled }),
                    view.panelButton('DOCX', () => controller.downloadSelectedTranscripts('docx'), { disabled }),
                    view.panelButton(translate('包', 'Packet'), () => controller.insertSelectedTranscriptPacket(), { disabled })
                ]));
            }

            container.appendChild(section);
            ensureArchiveFeature().mount(container, { slot: 'details' });
        },

        getOnboarding: settingsView.getOnboarding,

        renderExportButtons: settingsView.renderExportButtons
    };

    return view;
}
