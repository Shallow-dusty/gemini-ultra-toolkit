"""Probe live DOM for the Primer++ panel to plan screenshot orchestration."""

from __future__ import annotations

import argparse
import json

from cdp_client import CDP, find_gemini_page_ws


def probe_panel(port: int | None = None) -> dict:
    ws = find_gemini_page_ws(port)
    cdp = CDP(ws)
    try:
        return cdp.eval_js(r"""
            (() => {
                const panel = document.getElementById('gemini-monitor-panel-v7');
                if (!panel) return { panel: false };
                const rect = panel.getBoundingClientRect();
                const collectBtns = (root) => Array.from(root.querySelectorAll('button, [role=\"button\"]')).map(b => ({
                    cls: b.className,
                    id: b.id,
                    title: b.title || b.getAttribute('aria-label') || '',
                    text: (b.textContent || '').trim().slice(0, 30)
                }));
                const detailsPane = document.getElementById('g-details-pane');
                return {
                    panel: true,
                    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
                    panelButtons: collectBtns(panel),
                    detailsPaneOpen: !!detailsPane && getComputedStyle(detailsPane).display !== 'none',
                    detailsPaneButtons: detailsPane ? collectBtns(detailsPane) : null,
                    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
                };
            })()
        """)
    finally:
        cdp.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, help="Optional CDP HTTP port")
    args = parser.parse_args()
    print(json.dumps(probe_panel(args.port), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
