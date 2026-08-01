import { formatLocalDate } from '../lib/date_utils.js';
import { Core } from './core.js';
import { createIcon } from './icons.js';
import { NativeUI } from './native_ui.js';
import { getCurrentTheme } from './state.js';
import { openDashboardController } from './ui/shell/dashboard_controller.js';

export function openDashboard() {
    return openDashboardController({
        document,
        window,
        createIcon,
        core: Core,
        counter: this._requireShellPort('counter'),
        formatDate: formatLocalDate,
        getTheme: getCurrentTheme,
        ui: NativeUI,
        schedule: setTimeout
    });
}
