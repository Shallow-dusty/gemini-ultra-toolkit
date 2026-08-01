import { NativeUI } from '../../native_ui.js';

/** Coordinates the legacy details-pane surfaces without owning their behavior. */
export function createLegacyAnnotationsView(host) {
    return Object.freeze({
        renderToDetailsPane(container) {
            host._detailsContainer = container;
            host._syncCompatibilityData();
            const stats = host._getStats();
            const title = document.createElement('h2');
            title.className = 'section-title';
            title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
            const label = document.createElement('span');
            label.textContent = NativeUI.t('注释', 'Annotations');
            const count = document.createElement('span');
            count.style.opacity = '0.75';
            count.textContent = `${stats.total}/${stats.pinned}/${stats.messages}`;
            count.setAttribute('aria-label', NativeUI.t(
                `${stats.total} 条注释，${stats.pinned} 条置顶，${stats.messages} 条消息注释`,
                `${stats.total} annotations, ${stats.pinned} pinned, ${stats.messages} message annotations`
            ));
            title.appendChild(label);
            title.appendChild(count);
            container.appendChild(title);

            host._renderReadOnlyNotice(container);
            host._renderCurrentChatEditor(container, host._getCurrentChatRef());
            host._renderPinnedAnnotations(container);
            host._renderSearch(container);

            const ioRow = document.createElement('div');
            ioRow.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;';
            ioRow.appendChild(host._makeButton(NativeUI.t('导出注释', 'Export annotations'), () => host._exportAnnotations()));
            ioRow.appendChild(host._makeButton(NativeUI.t('导入注释', 'Import annotations'), () => host._importAnnotations(), {
                disabled: host._isInspecting()
            }));
            container.appendChild(ioRow);
        }
    });
}
