/**
 * Stable v12 import path for the v13 Bulk Lifecycle vertical slice.
 *
 * Compatibility labels retained for source-level integrations:
 * - NativeUI.t('批量删除', 'Batch Delete')
 * - NativeUI.t('全选', 'Select All')
 * - NativeUI.t('取消全选', 'Deselect All')
 *
 * The implementation deliberately has no PanelUI, NativeUI, or Counter
 * singleton dependency. Gemini DOM selectors/actions enter through the
 * injected adapter owned by the vertical feature.
 */
export {
    BatchDeleteModule,
    createBatchDeleteModule
} from '../features/bulk_lifecycle/legacy_module.js';
