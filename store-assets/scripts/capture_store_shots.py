"""Drive Briar Havoc via page-level CDP and capture five 1280x800 PNGs.

Reads page WS from /json/list; userscript is already injected from a prior
session (sentinel: window.__PRIMER_PP_LOADED__). Otherwise injects fresh.

Output: store-assets/screenshots/0{1..5}-*.png
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from urllib.request import urlopen

from cdp_client import CDP, GM_POLYFILL_JS, load_userscript


REPO_ROOT = Path(__file__).resolve().parents[2]
SHOT_DIR = REPO_ROOT / "store-assets" / "screenshots"
CDP_HTTP = "http://127.0.0.1:63366"
PANEL_ID = "gemini-monitor-panel-v7"


def find_gemini_page_ws() -> str:
    with urlopen(f"{CDP_HTTP}/json", timeout=5) as r:
        tabs = json.loads(r.read())
    gem = [t for t in tabs if t.get("type") == "page" and "gemini.google.com" in t.get("url", "")]
    if not gem:
        raise RuntimeError("no Gemini page found")
    return gem[0]["webSocketDebuggerUrl"]


def ensure_userscript(cdp: CDP) -> None:
    cdp.eval_js(GM_POLYFILL_JS)
    # Mark tour AND every module onboarding as seen up front so the userscript
    # doesn't queue any modal on first boot. Idempotent: safe to call always.
    cdp.eval_js(r"""
        (() => {
            try {
                localStorage.setItem('gm_gemini_tour_seen', 'true');
                localStorage.setItem('gm_gemini_onboarding_seen', JSON.stringify({
                    counter: true, folders: true, export: true, 'prompt-vault': true,
                    'default-model': true, 'batch-delete': true,
                    'quote-reply': true, 'ui-tweaks': true
                }));
            } catch (e) {}
        })()
    """)
    if not cdp.eval_js("!!window.__PRIMER_PP_LOADED__"):
        us_src = load_userscript(REPO_ROOT)
        cdp.eval_js(
            "(() => { try { " + us_src + " } catch (e) { console.error('[primer++] inject failed:', e); throw e; } "
            "window.__PRIMER_PP_LOADED__ = true; return true; })();",
            _timeout=45,
        )


def dismiss_tour_aggressive(cdp: CDP) -> None:
    """Click Skip on any visible Primer++ guided tour overlay, and close
    any per-module onboarding modal that might be obscuring the panel."""
    cdp.eval_js(r"""
        (() => {
            // 1. tour panels: any Skip / 跳过 button.
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const b of buttons) {
                const t = (b.textContent || '').trim();
                if (t === 'Skip' || t === '跳过') { b.click(); }
            }
            // 2. onboarding modals: click .onboarding-close.
            document.querySelectorAll('.onboarding-close').forEach(c => c.click());
            // 3. brute-remove leftover onboarding overlays.
            document.querySelectorAll('.onboarding-overlay, #gemini-onboarding-modal').forEach(el => el.remove());
            // 4. mark every module's onboarding as seen so it doesn't pop again.
            const seen = {
                counter: true, folders: true, export: true, 'prompt-vault': true,
                'default-model': true, 'batch-delete': true,
                'quote-reply': true, 'ui-tweaks': true
            };
            try {
                localStorage.setItem('gm_gemini_onboarding_seen', JSON.stringify(seen));
                localStorage.setItem('gm_gemini_tour_seen', 'true');
            } catch (e) {}
        })()
    """)


def ensure_collapsed(cdp: CDP) -> None:
    """Make sure the floating panel is in collapsed (main view) state."""
    cdp.eval_js(r"""
        (() => {
            const pane = document.getElementById('g-details-pane');
            if (pane && pane.classList.contains('expanded')) {
                const tog = document.querySelector('#""" + PANEL_ID + r""" .gemini-toggle-btn');
                if (tog) tog.click();
            }
        })()
    """)


def expand_panel(cdp: CDP) -> None:
    cdp.eval_js(r"""
        (() => {
            const tog = document.querySelector('#""" + PANEL_ID + r""" .gemini-toggle-btn');
            if (tog) tog.click();
        })()
    """)


def click_in_details_pane(cdp: CDP, button_title_pattern: str) -> str | None:
    """Click a button inside #g-details-pane whose title or label matches.

    Returns the button's text/title for logging or None if not found.
    """
    found = cdp.eval_js(
        f"""(() => {{
            const pane = document.getElementById('g-details-pane');
            if (!pane) return null;
            const re = new RegExp({json.dumps(button_title_pattern)}, 'i');
            const btns = pane.querySelectorAll('button, [role="button"]');
            for (const b of btns) {{
                const label = (b.title || b.getAttribute('aria-label') || b.textContent || '').trim();
                if (re.test(label)) {{
                    b.click();
                    return label.slice(0, 40);
                }}
            }}
            return null;
        }})()"""
    )
    return found


def close_modal(cdp: CDP) -> None:
    cdp.eval_js(r"""
        (() => {
            // Settings modal / debug modal use .settings-overlay / .settings-modal
            const overlays = document.querySelectorAll(
                '.settings-overlay, .dashboard-overlay, [class*="overlay"]'
            );
            for (const o of overlays) {
                const closer = o.querySelector('.settings-close, [class*="close"], [aria-label*="Close" i], [aria-label*="关闭"]');
                if (closer) { closer.click(); return; }
                // fallback: click on the overlay backdrop
                o.click();
            }
        })()
    """)


def shoot(cdp: CDP, name: str) -> Path:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SHOT_DIR / name
    cdp.screenshot(path)
    print(f"[capture] saved {name} ({path.stat().st_size} bytes)")
    return path


def main() -> int:
    ws = find_gemini_page_ws()
    print(f"[capture] page WS: {ws}")
    cdp = CDP(ws)
    try:
        cdp.set_viewport(1280, 800, dpr=1.0)
        # Wait for the page <body> + the userscript's panel (sidenav element
        # name has shifted again on the live frontend — don't gate on it).
        cdp.wait_for("!!document.body", timeout=10)
        ensure_userscript(cdp)
        cdp.wait_for(f"!!document.getElementById('{PANEL_ID}')", timeout=20)
        time.sleep(2)
        dismiss_tour_aggressive(cdp)
        time.sleep(1)
        ensure_collapsed(cdp)
        time.sleep(1)
        dismiss_tour_aggressive(cdp)
        time.sleep(0.5)

        # --- shot 1: collapsed panel (main view, counter + quota) ---
        shoot(cdp, "01-panel-counter.png")

        # --- shot 2: expanded details pane ---
        expand_panel(cdp)
        time.sleep(1.5)
        dismiss_tour_aggressive(cdp)
        time.sleep(0.5)
        shoot(cdp, "02-details-pane.png")

        # --- shot 3: dashboard ---
        clicked = click_in_details_pane(cdp, r"stats|统计")
        print(f"[capture] stats button: {clicked!r}")
        time.sleep(2.5)
        shoot(cdp, "03-dashboard-heatmap.png")

        # Close dashboard before opening settings.
        close_modal(cdp)
        time.sleep(1)
        # Re-expand if collapsed got triggered.
        cdp.eval_js(r"""
            (() => {
                const pane = document.getElementById('g-details-pane');
                if (!pane || !pane.classList.contains('expanded')) {
                    const tog = document.querySelector('#""" + PANEL_ID + r""" .gemini-toggle-btn');
                    if (tog) tog.click();
                }
            })()
        """)
        time.sleep(1)

        # --- shot 4: settings modal ---
        clicked = click_in_details_pane(cdp, r"settings|设置")
        print(f"[capture] settings button: {clicked!r}")
        time.sleep(2)
        shoot(cdp, "04-settings.png")

        # --- shot 5: scroll inside the settings modal so the lower
        # sections (Themes / Export / Calibrate / Debug) are visible. ---
        cdp.eval_js(r"""
            (() => {
                const modal = document.querySelector('.settings-modal, [class*="settings-modal"]');
                if (!modal) return null;
                const body = modal.querySelector('.settings-body') || modal;
                body.scrollTop = body.scrollHeight;
                return body.scrollHeight;
            })()
        """)
        time.sleep(1)
        shoot(cdp, "05-settings-scrolled.png")

        close_modal(cdp)
        print("[capture] DONE")
        return 0
    finally:
        cdp.close()


if __name__ == "__main__":
    sys.exit(main())
