"""Probe live DOM for the Primer++ panel to plan screenshot orchestration."""
import json, sys
from urllib.request import urlopen
from cdp_client import CDP

with urlopen("http://127.0.0.1:50000", timeout=2) as _:
    pass

with urlopen("http://127.0.0.1:63366/json", timeout=5) as r:
    tabs = json.loads(r.read())
ws = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page" and "gemini.google.com" in t.get("url",""))

cdp = CDP(ws)
try:
    info = cdp.eval_js(r"""
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
    print(json.dumps(info, indent=2, ensure_ascii=False))
finally:
    cdp.close()
