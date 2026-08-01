"""Small, import-safe helpers for local Chrome DevTools Protocol tools.

The module deliberately keeps third-party imports lazy so its pure safety
contracts can be tested with the Python standard library.  Network access is
restricted to loopback endpoints unless a caller explicitly opts in.
"""

from __future__ import annotations

import argparse
import base64
import ipaddress
import json
import os
import sys
import threading
import time
from pathlib import Path
from queue import Empty, Queue
from typing import Any, Callable, Iterable, Mapping, Optional
from urllib.parse import urlparse
from urllib.request import urlopen


COMMON_CDP_PORTS = (63366, 9222, 9223, 9229, 50000)


class CDPError(RuntimeError):
    """Raised when a CDP request fails or times out."""


def is_loopback_host(hostname: str | None) -> bool:
    """Return whether *hostname* is an unambiguous loopback target."""
    if not hostname:
        return False
    normalized = hostname.rstrip(".").lower()
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def validate_cdp_url(url: str, *, allow_remote: bool = False) -> str:
    """Validate a CDP HTTP/WebSocket URL without logging its sensitive path."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https", "ws", "wss"} or not parsed.hostname:
        raise ValueError("CDP endpoint must be an absolute HTTP or WebSocket URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("CDP endpoint must not contain embedded credentials")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("CDP endpoint has an invalid port") from exc
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("CDP endpoint port is out of range")
    if not allow_remote and not is_loopback_host(parsed.hostname):
        raise ValueError("remote CDP endpoints require explicit opt-in")
    return url


def validate_cdp_websocket_url(url: str, *, allow_remote: bool = False) -> str:
    """Validate a page-level CDP WebSocket endpoint."""
    validated = validate_cdp_url(url, allow_remote=allow_remote)
    if urlparse(validated).scheme not in {"ws", "wss"}:
        raise ValueError("page-level CDP endpoint must use ws or wss")
    return validated


def is_gemini_page_url(url: Any) -> bool:
    """Match the real Gemini origin, never a query/path substring or lookalike host."""
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    return (
        parsed.scheme == "https"
        and parsed.hostname == "gemini.google.com"
        and parsed.username is None
        and parsed.password is None
    )


def validate_port(port: int | str) -> int:
    """Normalize a TCP port and reject booleans, junk and out-of-range values."""
    if isinstance(port, bool):
        raise ValueError("port must be an integer")
    try:
        normalized = int(str(port).strip())
    except (TypeError, ValueError) as exc:
        raise ValueError("port must be an integer") from exc
    if not 1 <= normalized <= 65535:
        raise ValueError("port must be between 1 and 65535")
    return normalized


def ensure_output_available(path: str | Path, *, force: bool = False) -> Path:
    """Reject an existing output before any browser mutation takes place."""
    output = Path(path).expanduser()
    if output.exists() and not force:
        raise FileExistsError("output already exists; pass --force to replace it")
    return output


def ensure_outputs_available(paths: Iterable[str | Path], *, force: bool = False) -> tuple[Path, ...]:
    """Preflight a group of output paths as one safety boundary."""
    outputs = tuple(Path(path).expanduser() for path in paths)
    if len(set(outputs)) != len(outputs):
        raise ValueError("output paths must be unique")
    for output in outputs:
        ensure_output_available(output, force=force)
    return outputs


def write_bytes_safely(path: str | Path, data: bytes, *, force: bool = False) -> Path:
    """Write bytes without overwriting unless *force* was explicitly supplied."""
    output = ensure_output_available(path, force=force)
    output.parent.mkdir(parents=True, exist_ok=True)
    mode = "wb" if force else "xb"
    with output.open(mode) as handle:
        handle.write(data)
    return output


def write_text_safely(
    path: str | Path,
    text: str,
    *,
    force: bool = False,
    encoding: str = "utf-8",
) -> Path:
    """Write text using the same exclusive-output contract as screenshots."""
    output = ensure_output_available(path, force=force)
    output.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if force else "x"
    with output.open(mode, encoding=encoding, newline="\n") as handle:
        handle.write(text)
    return output


class RestoredState:
    """Capture state on entry and restore it on every exit path.

    A restoration failure is attached to an existing primary exception rather
    than hiding it.  Without a primary exception, the restoration error is
    raised normally.
    """

    def __init__(self, capture: Callable[[], Any], restore: Callable[[Any], None]):
        self._capture = capture
        self._restore = restore
        self.state: Any = None

    def __enter__(self) -> Any:
        self.state = self._capture()
        return self.state

    def __exit__(self, exc_type, exc, traceback) -> bool:
        try:
            self._restore(self.state)
        except Exception as restore_error:
            if exc is None:
                raise
            if hasattr(exc, "add_note"):
                exc.add_note(f"state restoration failed: {type(restore_error).__name__}")
        return False


def require_mutation_opt_in(enabled: bool) -> None:
    """Reject live page mutations unless the CLI flag was explicitly set."""
    if not enabled:
        raise PermissionError("page mutation requires --mutate-page")


def _open_websocket(url: str):
    try:
        import websocket  # type: ignore
    except ImportError as exc:
        raise RuntimeError("websocket-client is required for live CDP access") from exc
    return websocket.create_connection(url, timeout=10, suppress_origin=True)


def _is_timeout_error(exc: BaseException) -> bool:
    return isinstance(exc, TimeoutError) or type(exc).__name__ == "WebSocketTimeoutException"


def _is_closed_error(exc: BaseException) -> bool:
    return isinstance(exc, OSError) or type(exc).__name__ == "WebSocketConnectionClosedException"


class CDP:
    """Minimal synchronous CDP client whose ``close`` only closes transport."""

    def __init__(
        self,
        ws_url: str,
        *,
        default_timeout: float = 30.0,
        allow_remote: bool = False,
        connection_factory: Callable[[str], Any] | None = None,
        enable_domains: bool = True,
    ):
        self.ws_url = validate_cdp_websocket_url(ws_url, allow_remote=allow_remote)
        self.default_timeout = default_timeout
        self._ws = (connection_factory or _open_websocket)(self.ws_url)
        if hasattr(self._ws, "settimeout"):
            self._ws.settimeout(1.0)
        self._next_id = 0
        self._lock = threading.Lock()
        self._responses: dict[int, Queue] = {}
        self._events: list[dict] = []
        self._stop = threading.Event()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        try:
            if enable_domains:
                self.send("Page.enable")
                self.send("Runtime.enable")
                self.send("DOM.enable")
        except Exception:
            self.close_transport()
            raise

    def _read_loop(self) -> None:
        while not self._stop.is_set():
            try:
                raw = self._ws.recv()
            except Exception as exc:
                if _is_timeout_error(exc):
                    continue
                if _is_closed_error(exc):
                    break
                break
            if not raw:
                continue
            try:
                message = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                continue
            if "id" in message:
                response_queue = self._responses.get(message["id"])
                if response_queue is not None:
                    response_queue.put(message)
            else:
                self._events.append(message)

    def send(self, method: str, _timeout: Optional[float] = None, **params) -> dict:
        with self._lock:
            self._next_id += 1
            message_id = self._next_id
            response_queue: Queue = Queue()
            self._responses[message_id] = response_queue
        self._ws.send(json.dumps({"id": message_id, "method": method, "params": params}))
        timeout = self.default_timeout if _timeout is None else _timeout
        try:
            response = response_queue.get(timeout=timeout)
        except Empty as exc:
            raise CDPError(f"{method} timed out") from exc
        finally:
            self._responses.pop(message_id, None)
        if "error" in response:
            raise CDPError(f"{method} failed")
        return response.get("result", {})

    def set_viewport(self, width: int, height: int, dpr: float = 1.0) -> None:
        self.send(
            "Emulation.setDeviceMetricsOverride",
            width=width,
            height=height,
            deviceScaleFactor=dpr,
            mobile=False,
        )

    def get_viewport(self) -> dict[str, float]:
        value = self.eval_js(
            "({width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio})"
        )
        if not isinstance(value, dict):
            raise CDPError("viewport probe returned an invalid value")
        return {
            "width": int(value["width"]),
            "height": int(value["height"]),
            "dpr": float(value["dpr"]),
        }

    def restore_viewport(self, _state: Mapping[str, float]) -> None:
        """Remove the device-metrics override introduced by this tool.

        Re-applying the sampled inner dimensions is not restoration: it leaves
        an emulation override active after the CDP transport disconnects.  The
        store-asset tools only create a temporary override, so their cleanup
        boundary clears that override instead.
        """
        self.send("Emulation.clearDeviceMetricsOverride")

    def eval_js(self, expression: str, *, await_promise: bool = False, _timeout: float = 30.0) -> Any:
        result = self.send(
            "Runtime.evaluate",
            _timeout=_timeout,
            expression=expression,
            returnByValue=True,
            awaitPromise=await_promise,
        )
        if "exceptionDetails" in result:
            raise CDPError("page evaluation failed")
        return result.get("result", {}).get("value")

    def wait_for(self, predicate_js: str, timeout: float = 20.0, poll: float = 0.4) -> Any:
        deadline = time.time() + timeout
        while time.time() < deadline:
            value = self.eval_js(predicate_js)
            if value:
                return value
            time.sleep(poll)
        raise CDPError("page condition timed out")

    def capture_screenshot_bytes(self, *, fmt: str = "png", quality: int | None = None) -> bytes:
        params: dict[str, Any] = {"format": fmt, "captureBeyondViewport": False}
        if quality is not None:
            if fmt != "jpeg":
                raise ValueError("quality is only valid for jpeg screenshots")
            params["quality"] = quality
        result = self.send("Page.captureScreenshot", **params)
        try:
            return base64.b64decode(result["data"], validate=True)
        except (KeyError, TypeError, ValueError) as exc:
            raise CDPError("screenshot response was invalid") from exc

    def screenshot(
        self,
        path: str | Path,
        *,
        fmt: str = "png",
        quality: int | None = None,
        force: bool = False,
    ) -> Path:
        ensure_output_available(path, force=force)
        data = self.capture_screenshot_bytes(fmt=fmt, quality=quality)
        return write_bytes_safely(path, data, force=force)

    def close_transport(self) -> None:
        self._stop.set()
        try:
            self._ws.close()
        except Exception:
            pass
        if threading.current_thread() is not self._reader:
            self._reader.join(timeout=1.5)

    def close(self) -> None:
        """Compatibility alias; this never sends ``Browser.close``."""
        self.close_transport()


def load_userscript(repo_root: Path) -> str:
    return (repo_root / "primer-pp.user.js").read_text(encoding="utf-8")


def _add_port(candidates: list[int], value: int | str | None) -> None:
    if value is None:
        return
    try:
        port = validate_port(value)
    except ValueError:
        return
    if port not in candidates:
        candidates.append(port)


def find_gemini_page_ws(
    port: int | None = None,
    *,
    extra_ports: Iterable[int] | None = None,
    scan_range: tuple[int, int] | None = None,
    allow_remote: bool = False,
    opener: Callable[..., Any] = urlopen,
    environ: Mapping[str, str] | None = None,
    port_file: Path = Path("/tmp/roxy-port.txt"),
) -> str:
    """Locate a Gemini page through loopback CDP discovery endpoints."""
    candidates: list[int] = []
    if port is not None:
        # An explicit port identifies the browser instance the operator owns.
        # Falling through to ambient/common ports could mutate another browser.
        candidates.append(validate_port(port))
    else:
        source_environment = os.environ if environ is None else environ
        _add_port(candidates, source_environment.get("PRIMER_PP_CDP_PORT"))
        if port_file.is_file():
            _add_port(candidates, port_file.read_text(encoding="utf-8"))
        for extra_port in extra_ports or ():
            _add_port(candidates, extra_port)
        for common_port in COMMON_CDP_PORTS:
            _add_port(candidates, common_port)
        if scan_range is not None:
            start = max(1, int(scan_range[0]))
            end = min(65535, int(scan_range[1]))
            if start > end:
                raise ValueError("scan range start must not exceed its end")
            for candidate in range(start, end + 1):
                _add_port(candidates, candidate)

    for candidate in candidates:
        endpoint = f"http://127.0.0.1:{candidate}/json"
        try:
            with opener(endpoint, timeout=1) as response:
                tabs = json.loads(response.read())
            for tab in tabs:
                if tab.get("type") == "page" and is_gemini_page_url(tab.get("url")):
                    return validate_cdp_websocket_url(
                        tab["webSocketDebuggerUrl"],
                        allow_remote=allow_remote,
                    )
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            continue
    raise RuntimeError("no matching Gemini page was found on approved CDP ports")


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check a page-level CDP transport safely")
    parser.add_argument("endpoint", help="Page-level CDP WebSocket endpoint")
    parser.add_argument(
        "--allow-remote-cdp",
        action="store_true",
        help="Allow a non-loopback endpoint (unsafe; disabled by default)",
    )
    return parser


def run_probe(
    endpoint: str,
    *,
    allow_remote: bool = False,
    cdp_factory: Callable[..., CDP] = CDP,
) -> None:
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        if client.eval_js("true") is not True:
            raise CDPError("page probe returned an invalid result")
    finally:
        client.close_transport()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        run_probe(args.endpoint, allow_remote=args.allow_remote_cdp)
    except Exception as exc:
        print(f"cdp_client: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print("cdp_client: local page transport ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
