"""Shot 5: panel + details pane under the Cyber theme.

Replaces the redundant 05-settings-scrolled.png with a visually distinct
panel render demonstrating theming. Restores Glass theme after capture
so the user's state isn't permanently changed.
"""
import json
import time
from pathlib import Path
from urllib.request import urlopen
from cdp_client import CDP

REPO = Path(__file__).resolve().parents[2]
SHOT_DIR = REPO / "store-assets" / "screenshots"
PANEL_ID = "gemini-monitor-panel-v7"


def find_ws():
    with urlopen("http://127.0.0.1:63366/json", timeout=5) as r:
        tabs = json.loads(r.read())
    return next(t["webSocketDebuggerUrl"] for t in tabs
                if t.get("type") == "page" and "gemini.google.com" in t.get("url",""))


def click_theme(cdp: CDP, theme_name: str) -> str | None:
    """Click a theme row in the details pane. Theme rows render an icon
    prefix (e.g. "⚡ Cyber"), so match via case-insensitive substring."""
    needle = theme_name.lower()
    return cdp.eval_js(rf"""
        (() => {{
            const pane = document.getElementById('g-details-pane');
            if (!pane) return null;
            const needle = {json.dumps(needle)};
            const rows = pane.querySelectorAll('.detail-row');
            for (const r of rows) {{
                const t = (r.textContent || '').trim().toLowerCase();
                if (t.includes(needle) && !t.includes('chat') && !t.includes('today') && !t.includes('lifetime') && !t.includes('current')) {{
                    r.click();
                    return r.textContent.trim();
                }}
            }}
            return null;
        }})()
    """)


def main():
    cdp = CDP(find_ws(), default_timeout=60.0)
    try:
        cdp.set_viewport(1280, 800, dpr=1.0)

        # Close any modal first
        cdp.eval_js(r"""
            (() => {
                document.querySelectorAll('.settings-overlay, .dashboard-overlay').forEach(el => el.remove());
            })()
        """)
        time.sleep(0.6)

        # Make sure details pane is expanded so theme rows are visible.
        cdp.eval_js(r"""
            (() => {
                const pane = document.getElementById('g-details-pane');
                if (!pane || !pane.classList.contains('expanded')) {
                    const tog = document.querySelector('#""" + PANEL_ID + r""" .gemini-toggle-btn');
                    if (tog) tog.click();
                }
            })()
        """)
        time.sleep(1.0)

        # Switch to Cyber theme
        applied = click_theme(cdp, "Cyber")
        print("theme applied:", applied)
        time.sleep(1.2)

        cdp.screenshot(SHOT_DIR / "05-theme-cyber.png")
        sz = (SHOT_DIR / "05-theme-cyber.png").stat().st_size
        print(f"05-theme-cyber.png written ({sz} bytes)")

        # Restore Glass theme so user state isn't surprising next time.
        restored = click_theme(cdp, "Glass")
        print("theme restored:", restored)
    finally:
        cdp.close()


if __name__ == "__main__":
    main()
