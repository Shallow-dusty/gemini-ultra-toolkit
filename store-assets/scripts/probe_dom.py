"""Probe what's actually in DOM after viewport change."""
import json
from urllib.request import urlopen
from cdp_client import CDP

with urlopen("http://127.0.0.1:63366/json", timeout=5) as r:
    tabs = json.loads(r.read())
ws = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page" and "gemini.google.com" in t.get("url",""))

cdp = CDP(ws)
try:
    cdp.set_viewport(1280, 800, dpr=1.0)
    info = cdp.eval_js(r"""
        (() => {
            const candidates = [
                'bard-sidenav',
                'nav[aria-label="Side Navigation"]',
                'nav[aria-label*="Side"]',
                'nav',
                '#gemini-monitor-panel-v7',
                '#g-details-pane',
            ];
            const out = {};
            for (const sel of candidates) {
                const el = document.querySelector(sel);
                out[sel] = el ? { tag: el.tagName, classes: el.className } : null;
            }
            out.allNavs = Array.from(document.querySelectorAll('nav')).map(n => ({
                tag: n.tagName, classes: n.className, aria: n.getAttribute('aria-label')
            }));
            out.url = location.href;
            out.title = document.title;
            return out;
        })()
    """)
    print(json.dumps(info, indent=2, ensure_ascii=False))
finally:
    cdp.close()
