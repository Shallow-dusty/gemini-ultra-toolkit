"""Standalone: open Settings modal, wait fully rendered, capture shots 4 + 5."""
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


def main():
    cdp = CDP(find_ws(), default_timeout=60.0)
    try:
        cdp.set_viewport(1280, 800, dpr=1.0)

        # Ensure modal closed before we open a fresh one (no stale state).
        cdp.eval_js(r"""
            (() => {
                document.querySelectorAll('.settings-overlay, .dashboard-overlay').forEach(el => el.remove());
            })()
        """)
        time.sleep(0.5)

        # Make sure details pane is expanded so we can find the settings cog.
        info = cdp.eval_js(r"""
            (() => {
                const pane = document.getElementById('g-details-pane');
                if (!pane || !pane.classList.contains('expanded')) {
                    const tog = document.querySelector('#""" + PANEL_ID + r""" .gemini-toggle-btn');
                    if (tog) tog.click();
                    return 'toggled';
                }
                return 'already expanded';
            })()
        """)
        print("expand:", info)
        time.sleep(1.5)

        # Click Settings (the cog) inside the details pane.
        clicked = cdp.eval_js(r"""
            (() => {
                const pane = document.getElementById('g-details-pane');
                if (!pane) return null;
                const btns = pane.querySelectorAll('button, [role="button"]');
                for (const b of btns) {
                    const label = (b.title || b.getAttribute('aria-label') || b.textContent || '').trim();
                    if (/settings|设置/i.test(label)) { b.click(); return label.slice(0, 40); }
                }
                return null;
            })()
        """)
        print("clicked:", clicked)

        # Wait for the settings modal to render its first content block.
        cdp.wait_for(
            "!!document.querySelector('.settings-modal') && document.querySelectorAll('.settings-modal .settings-row').length > 3",
            timeout=15,
        )
        print("settings modal mounted")
        time.sleep(2.5)  # let any fade-in animation finish

        # Pre-warm: do an empty Runtime.evaluate to confirm the page isn't
        # blocked. (If GPU compositing is busy this still returns.)
        print("readyState:", cdp.eval_js("document.readyState"))

        # Shot 4 — top of settings modal.
        cdp.screenshot(SHOT_DIR / "04-settings.png")
        sz = (SHOT_DIR / "04-settings.png").stat().st_size
        print(f"04-settings.png written ({sz} bytes)")

        # Scroll modal body to bottom for shot 5.
        scroll_h = cdp.eval_js(r"""
            (() => {
                const body = document.querySelector('.settings-modal .settings-body');
                if (!body) return null;
                body.scrollTop = body.scrollHeight;
                return body.scrollHeight;
            })()
        """)
        print("scrolled to bottom; scrollHeight =", scroll_h)
        time.sleep(1.2)

        cdp.screenshot(SHOT_DIR / "05-settings-scrolled.png")
        sz = (SHOT_DIR / "05-settings-scrolled.png").stat().st_size
        print(f"05-settings-scrolled.png written ({sz} bytes)")
    finally:
        cdp.close()


if __name__ == "__main__":
    main()
