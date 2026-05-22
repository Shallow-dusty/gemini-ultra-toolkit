"""Probe CDP connectivity to Roxy-launched Briar Havoc.

Usage:
    python3 store-assets/scripts/cdp_probe.py ws://127.0.0.1:63366/devtools/browser/<uuid>
"""

import sys
from playwright.sync_api import sync_playwright

ws = sys.argv[1] if len(sys.argv) > 1 else ""
if not ws:
    print("missing ws url", file=sys.stderr)
    sys.exit(2)

with sync_playwright() as p:
    print(f"[probe] connecting to {ws}")
    browser = p.chromium.connect_over_cdp(ws, timeout=20_000)
    print(f"[probe] connected; contexts={len(browser.contexts)}")
    for ci, ctx in enumerate(browser.contexts):
        print(f"  ctx[{ci}] pages={len(ctx.pages)}")
        for pi, page in enumerate(ctx.pages):
            print(f"    page[{pi}] url={page.url}")
    print("[probe] OK")
    browser.close()
