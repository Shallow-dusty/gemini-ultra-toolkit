"""Take one screenshot to verify dimensions and panel state."""
import json
from pathlib import Path
from urllib.request import urlopen
from cdp_client import CDP

with urlopen("http://127.0.0.1:63366/json", timeout=5) as r:
    tabs = json.loads(r.read())
ws = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page" and "gemini.google.com" in t.get("url",""))

cdp = CDP(ws)
try:
    cdp.set_viewport(1280, 800, dpr=1.0)
    # Confirm new DPR
    print("dpr=", cdp.eval_js("window.devicePixelRatio"))
    print("vw,vh=", cdp.eval_js("[window.innerWidth, window.innerHeight]"))
    out = Path("/home/shallow/04.AI-Prism/05.Gemini-Ultra-Toolkit/store-assets/screenshots/_probe_shot.png")
    cdp.screenshot(out)
    sz = out.stat().st_size
    print(f"wrote {out} size={sz} bytes")
finally:
    cdp.close()
