"""Minimal page-level CDP client for Roxy-launched Briar Havoc.

Bypasses Playwright (browser-level CDP is held by chromedriver) by talking
directly to the Gemini page's DevTools WebSocket.

API:
    cdp = CDP(page_ws_url)
    cdp.send("Runtime.evaluate", expression="...")
    cdp.set_viewport(1280, 800)
    cdp.inject_js(snippet)
    cdp.screenshot("out.png")
    cdp.close()

Helpers operate synchronously; the WebSocket runs in a background thread
to drain events while await-style id matching delivers RPC responses.
"""

from __future__ import annotations

import base64
import json
import threading
import time
from pathlib import Path
from queue import Queue, Empty
from typing import Any, Optional

import websocket  # websocket-client


class CDPError(RuntimeError):
    pass


class CDP:
    def __init__(self, ws_url: str, *, default_timeout: float = 30.0):
        self.ws_url = ws_url
        self.default_timeout = default_timeout
        # Chrome >= 137 enforces --remote-allow-origins on DevTools WebSockets.
        # Without --remote-allow-origins=* in Chrome's argv, ANY value of the
        # Origin header is rejected — Chrome compares verbatim against its
        # allowlist. The only header that gets through is *no Origin header
        # at all*, which non-browser clients are permitted to omit.
        self._ws = websocket.create_connection(
            ws_url,
            timeout=10,
            suppress_origin=True,
        )
        # Switch to a *short* recv timeout so the reader thread doesn't
        # block forever, but loop instead of bailing — chromedriver's CDP
        # endpoint goes quiet between RPCs and would otherwise kill us.
        self._ws.settimeout(1.0)
        self._next_id = 0
        self._lock = threading.Lock()
        self._responses: dict[int, Queue] = {}
        self._events: list[dict] = []
        self._stop = threading.Event()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        # Enable basic domains
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send("DOM.enable")

    def _read_loop(self) -> None:
        while not self._stop.is_set():
            try:
                raw = self._ws.recv()
            except websocket.WebSocketTimeoutException:
                continue  # idle tick, keep looping
            except (websocket.WebSocketConnectionClosedException, OSError):
                break
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if "id" in msg:
                q = self._responses.get(msg["id"])
                if q is not None:
                    q.put(msg)
            else:
                self._events.append(msg)

    def send(self, method: str, _timeout: Optional[float] = None, **params) -> dict:
        with self._lock:
            self._next_id += 1
            mid = self._next_id
            q: Queue = Queue()
            self._responses[mid] = q
        payload = {"id": mid, "method": method, "params": params}
        self._ws.send(json.dumps(payload))
        try:
            resp = q.get(timeout=_timeout or self.default_timeout)
        except Empty:
            raise CDPError(f"{method} timed out after {_timeout or self.default_timeout}s")
        finally:
            self._responses.pop(mid, None)
        if "error" in resp:
            raise CDPError(f"{method}: {resp['error']}")
        return resp.get("result", {})

    def set_viewport(self, width: int, height: int, dpr: float = 1.0) -> None:
        self.send(
            "Emulation.setDeviceMetricsOverride",
            width=width,
            height=height,
            deviceScaleFactor=dpr,
            mobile=False,
        )

    def eval_js(self, expression: str, *, await_promise: bool = False, _timeout: float = 30.0) -> Any:
        result = self.send(
            "Runtime.evaluate",
            _timeout=_timeout,
            expression=expression,
            returnByValue=True,
            awaitPromise=await_promise,
        )
        if "exceptionDetails" in result:
            exc = result["exceptionDetails"]
            raise CDPError(f"eval threw: {exc.get('text')} :: {exc.get('exception', {}).get('description')}")
        return result.get("result", {}).get("value")

    def wait_for(self, predicate_js: str, timeout: float = 20.0, poll: float = 0.4) -> Any:
        """Repeatedly evaluate `predicate_js` until truthy or timeout."""
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            last = self.eval_js(predicate_js)
            if last:
                return last
            time.sleep(poll)
        raise CDPError(f"wait_for timed out: {predicate_js[:80]}... last={last!r}")

    def screenshot(self, path: str | Path, *, fmt: str = "png", quality: int | None = None) -> None:
        params: dict[str, Any] = {"format": fmt, "captureBeyondViewport": False}
        if quality is not None and fmt == "jpeg":
            params["quality"] = quality
        result = self.send("Page.captureScreenshot", **params)
        data = base64.b64decode(result["data"])
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(data)

    def close(self) -> None:
        self._stop.set()
        try:
            self._ws.close()
        except Exception:
            pass


def load_userscript(repo_root: Path) -> str:
    src = (repo_root / "primer-pp.user.js").read_text(encoding="utf-8")
    # Strip the Tampermonkey banner so we don't pollute Runtime.evaluate
    # (it's a comment block, safe to keep, but stripping helps eval if any
    # heuristic detection of meta block triggers strange behavior).
    # We keep it; userscript is just JS.
    return src


def find_gemini_page_ws(port: int | None = None) -> str:
    """Locate the Gemini tab's CDP WebSocket on the local Roxy daemon.

    Tries, in order:
      1. Explicit `port` arg.
      2. /tmp/roxy-port.txt (written by the open-browser shell snippet).
      3. Probe ports 50000-65000 looking for one whose /json/version
         responds with Chrome — slow last resort.
    """
    import json
    from urllib.request import urlopen
    from urllib.error import URLError

    candidates: list[int] = []
    if port is not None:
        candidates.append(port)
    pf = Path("/tmp/roxy-port.txt")
    if pf.is_file():
        try:
            candidates.append(int(pf.read_text().strip()))
        except ValueError:
            pass

    for p in candidates:
        try:
            with urlopen(f"http://127.0.0.1:{p}/json", timeout=3) as r:
                tabs = json.loads(r.read())
            for t in tabs:
                if t.get("type") == "page" and "gemini.google.com" in t.get("url", ""):
                    return t["webSocketDebuggerUrl"]
        except (URLError, OSError, json.JSONDecodeError):
            continue
    raise RuntimeError(f"no Gemini tab found on Roxy CDP ports tried: {candidates}")


GM_POLYFILL_JS = r"""
(() => {
    if (window.__PRIMER_PP_GM_POLY__) return;
    const NS = 'gm_';
    const listeners = new Map();
    let lid = 0;
    window.GM_addStyle = (css) => {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    };
    window.GM_setValue = (k, v) => {
        try {
            const oldRaw = localStorage.getItem(NS + k);
            localStorage.setItem(NS + k, JSON.stringify(v));
            const oldVal = oldRaw === null ? undefined : JSON.parse(oldRaw);
            for (const [, cb] of listeners) {
                try { if (cb.key === k) cb.fn(k, oldVal, v, false); } catch {}
            }
        } catch (e) {}
    };
    window.GM_getValue = (k, def) => {
        try {
            const raw = localStorage.getItem(NS + k);
            return raw === null ? def : JSON.parse(raw);
        } catch { return def; }
    };
    window.GM_listValues = () => {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(NS)) out.push(key.slice(NS.length));
        }
        return out;
    };
    window.GM_addValueChangeListener = (k, fn) => {
        const id = ++lid;
        listeners.set(id, { key: k, fn });
        return id;
    };
    window.GM_removeValueChangeListener = (id) => { listeners.delete(id); };
    window.GM_registerMenuCommand = () => {};
    window.__PRIMER_PP_GM_POLY__ = true;
})();
"""


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: cdp_client.py ws://.../devtools/page/<id>", file=sys.stderr)
        sys.exit(2)
    cdp = CDP(sys.argv[1])
    try:
        print("title:", cdp.eval_js("document.title"))
        print("url:", cdp.eval_js("location.href"))
    finally:
        cdp.close()
