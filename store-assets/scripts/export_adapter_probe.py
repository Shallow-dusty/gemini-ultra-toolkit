"""Export a sanitized Primer++ probe report from a local Gemini tab."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable, Mapping

from cdp_client import (
    CDP,
    GM_POLYFILL_JS,
    RestoredState,
    ensure_output_available,
    find_gemini_page_ws,
    load_userscript,
    require_mutation_opt_in,
    write_text_safely,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_EXPR = "typeof window.__PRIMER_PP_GET_PROBE_REPORT__ === 'function'"
INJECTION_SNAPSHOT_KEY = "__PRIMER_PP_TOOL_INJECTION_SNAPSHOT__"
INJECTION_BINDINGS = (
    "GM_addStyle", "GM_setValue", "GM_getValue", "GM_listValues",
    "GM_addValueChangeListener", "GM_removeValueChangeListener",
    "GM_registerMenuCommand", "__PRIMER_PP_GM_POLY__",
    "__PRIMER_PP_LOADED__", "__PRIMER_PP_GET_PROBE_REPORT__",
    "__PRIMER_PP_START__", "__PRIMER_PP_STOP__",
)
SAFE_REPORT_KEYS = frozenset({
    "app", "version", "generatedAt", "lifecycle", "adapter", "capabilityHealth",
    "modules", "localUI", "schemaVersion", "statuses", "policy", "summary",
    "adapterCapabilities", "nativeCapabilities", "theme", "id", "owner", "kind",
    "extensionFeature", "status", "quality", "reason", "mode", "hostPresent",
    "total", "available", "degraded", "nativeOwned", "unavailable", "registered",
    "enabled", "states", "state", "panelPresent", "detailsPanePresent",
    "detailsPaneExpanded", "exportButtonPresent", "generation", "generatedAt",
    "features", "checkedAt", "action", "code", "sourceCode", "selectorHealth",
    "passed", "failedRequired", "failedOptional", "checks", "required", "ok",
    "nativeCapability", "owned", "reasonCode",
})
SAFE_APP_NAMES = frozenset({"Primer++", "Primer++ for Gemini™"})
STRUCTURAL_ID_FIELDS = frozenset({
    "id", "nativeCapability", "registered", "enabled",
    "failedRequired", "failedOptional",
})
SYMBOLIC_CODE_FIELDS = frozenset({"code", "sourceCode", "reasonCode"})
TIMESTAMP_FIELDS = frozenset({"generatedAt", "checkedAt"})
STRUCTURAL_ID = re.compile(r"[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*\Z")
SYMBOLIC_CODE = re.compile(r"[A-Z][A-Z0-9_]{0,79}\Z")
VERSION_TEXT = re.compile(r"v?\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?\Z")
UTC_TIMESTAMP = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z\Z"
)
ENUM_TEXT = {
    "lifecycle": frozenset({
        "new", "idle", "active", "starting", "started", "ready", "refreshing",
        "stopping", "stopped", "disposing", "disposed", "failed",
    }),
    "state": frozenset({
        "new", "idle", "active", "registered", "starting", "started", "ready",
        "refreshing", "stopping", "stopped", "disposing", "disposed", "failed",
    }),
    "status": frozenset({
        "available", "degraded", "native-owned", "unavailable", "disabled", "failed",
        "registered", "starting", "started", "stopping", "stopped",
    }),
    "statuses": frozenset({
        "available", "degraded", "native-owned", "unavailable", "disabled", "failed",
    }),
    "quality": frozenset({"available", "degraded", "native-owned", "unavailable"}),
    "action": frozenset({"run", "run-degraded", "delegate-native", "skip", "disable"}),
    "policy": frozenset({
        "available", "degraded", "native-owned", "unavailable", "disabled", "failed",
        "prefer-native", "ignore", "required", "optional", "fail-closed",
    }),
    "mode": frozenset({"auto", "dark", "light", "unknown"}),
    "theme": frozenset({"auto", "glass", "cyber", "paper", "dark", "light", "unknown"}),
    "owner": frozenset({"primer-adapter", "gemini-native"}),
    "kind": frozenset({"integration-surface", "native-capability"}),
}


def _sanitize_probe_text(value: str, field: str | None) -> str:
    """Accept only field-specific structural strings, never arbitrary prose."""
    if field == "app" and value in SAFE_APP_NAMES:
        return value
    if field == "version" and len(value) <= 48 and VERSION_TEXT.fullmatch(value):
        return value
    if field in TIMESTAMP_FIELDS and UTC_TIMESTAMP.fullmatch(value):
        return value
    if field in STRUCTURAL_ID_FIELDS and len(value) <= 80 and STRUCTURAL_ID.fullmatch(value):
        return value
    if field in SYMBOLIC_CODE_FIELDS and SYMBOLIC_CODE.fullmatch(value):
        return value
    if field in ENUM_TEXT and value in ENUM_TEXT[field]:
        return value
    return "[redacted]"


def sanitize_probe_report(value: Any, *, field: str | None = None) -> Any:
    """Whitelist stable fields and enforce their scalar schemas recursively."""
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _sanitize_probe_text(value, field)
    if isinstance(value, list):
        return [sanitize_probe_report(item, field=field) for item in value]
    if isinstance(value, Mapping):
        return {
            key: sanitize_probe_report(item, field=key)
            for key, item in value.items()
            if isinstance(key, str) and key in SAFE_REPORT_KEYS
        }
    return None


def capture_injection_state(client: CDP) -> dict[str, bool]:
    bindings = json.dumps(INJECTION_BINDINGS)
    snapshot_key = json.dumps(INJECTION_SNAPSHOT_KEY)
    value = client.eval_js(f"""
        (() => {{
            const snapshotKey = {snapshot_key};
            if (Object.prototype.hasOwnProperty.call(window, snapshotKey)) {{
                throw new Error('tool injection snapshot already exists');
            }}
            const names = {bindings};
            const savedBindings = {{}};
            for (const name of names) {{
                savedBindings[name] = {{
                    present: Object.prototype.hasOwnProperty.call(window, name),
                    descriptor: Object.getOwnPropertyDescriptor(window, name)
                }};
            }}
            const gmStorage = {{}};
            for (let index = 0; index < localStorage.length; index += 1) {{
                const key = localStorage.key(index);
                if (key?.startsWith('gm_')) gmStorage[key] = localStorage.getItem(key);
            }}
            const loaded = !!window.__PRIMER_PP_LOADED__;
            const bridge = typeof window.__PRIMER_PP_GET_PROBE_REPORT__ === 'function';
            const stopBinding = savedBindings.__PRIMER_PP_STOP__;
            const staleStop = stopBinding.present && !loaded && !bridge;
            window[snapshotKey] = {{
                bindings: savedBindings,
                gmStorage,
                panelPresent: !!document.getElementById('gemini-monitor-panel-v7'),
                detailsPresent: !!document.getElementById('g-details-pane'),
                styles: new Set(document.querySelectorAll('style')),
                staleStop,
                injectionAttempted: false,
                injectedStop: null
            }};
            return {{
                snapshot: true,
                loaded,
                bridge,
                staleStop
            }};
        }})()
    """)
    if not isinstance(value, Mapping):
        raise RuntimeError("injection state probe failed")
    return {
        key: value.get(key) is True
        for key in ("snapshot", "loaded", "bridge", "staleStop")
    }


def restore_injection_state(client: CDP, state: Mapping[str, bool]) -> None:
    if state.get("snapshot") is not True:
        raise RuntimeError("injection snapshot was not captured")
    snapshot_key = json.dumps(INJECTION_SNAPSHOT_KEY)
    client.eval_js(
        f"""
        (async () => {{
            const snapshotKey = {snapshot_key};
            const before = window[snapshotKey];
            if (!before) throw new Error('tool injection snapshot is missing');
            let stopFailed = false;
            let bindingRestoreFailed = false;
            try {{
                const previousStop = before.bindings.__PRIMER_PP_STOP__;
                const currentStop = Object.getOwnPropertyDescriptor(window, '__PRIMER_PP_STOP__');
                let temporaryStop = null;
                if (before.injectionAttempted) {{
                    if (typeof before.injectedStop === 'function') {{
                        temporaryStop = before.injectedStop;
                    }} else if (currentStop && 'value' in currentStop &&
                            typeof currentStop.value === 'function' &&
                            (!previousStop.present || !previousStop.descriptor ||
                                currentStop.value !== previousStop.descriptor.value)) {{
                        temporaryStop = currentStop.value;
                    }}
                }}
                if (temporaryStop) await temporaryStop.call(window);
            }} catch (_error) {{
                stopFailed = true;
            }}
            try {{
                if (!before.panelPresent) document.getElementById('gemini-monitor-panel-v7')?.remove();
                if (!before.detailsPresent) document.getElementById('g-details-pane')?.remove();
                for (const style of document.querySelectorAll('style')) {{
                    const primerStyle = /--primer-|gemini-monitor-panel|g-details-pane/.test(style.textContent || '');
                    if (!before.styles.has(style) && primerStyle) style.remove();
                }}
                const currentGmKeys = [];
                for (let index = 0; index < localStorage.length; index += 1) {{
                    const key = localStorage.key(index);
                    if (key?.startsWith('gm_')) currentGmKeys.push(key);
                }}
                for (const key of currentGmKeys) {{
                    if (!Object.prototype.hasOwnProperty.call(before.gmStorage, key)) {{
                        localStorage.removeItem(key);
                    }}
                }}
                for (const [key, value] of Object.entries(before.gmStorage)) {{
                    localStorage.setItem(key, value);
                }}
            }} finally {{
                for (const [name, binding] of Object.entries(before.bindings)) {{
                    try {{
                        if (name === '__PRIMER_PP_STOP__' && before.staleStop) {{
                            const removed = delete window[name];
                            if (!removed && Object.prototype.hasOwnProperty.call(window, name)) {{
                                bindingRestoreFailed = true;
                            }}
                        }} else if (binding.present) {{
                            Object.defineProperty(window, name, binding.descriptor);
                        }} else {{
                            delete window[name];
                        }}
                    }} catch (_error) {{
                        bindingRestoreFailed = true;
                    }}
                }}
                delete window[snapshotKey];
            }}
            if (stopFailed) throw new Error('temporary userscript stop failed');
            if (bindingRestoreFailed) throw new Error('injection binding restoration failed');
            return true;
        }})()
        """,
        await_promise=True,
    )


def inject_userscript(client: CDP, *, repo_root: Path = REPO_ROOT) -> None:
    if client.eval_js(BRIDGE_EXPR):
        return
    if client.eval_js("!!window.__PRIMER_PP_LOADED__"):
        raise RuntimeError("Primer++ is loaded without a probe bridge; refusing reinjection")
    source = load_userscript(repo_root)
    client.eval_js(GM_POLYFILL_JS)
    snapshot_key = json.dumps(INJECTION_SNAPSHOT_KEY)
    client.eval_js(
        """
        (() => {
            const snapshotKey = """ + snapshot_key + """;
            const before = window[snapshotKey];
            if (!before) throw new Error('tool injection snapshot is missing');
            if (before.staleStop) {
                const removed = delete window.__PRIMER_PP_STOP__;
                if (!removed && Object.prototype.hasOwnProperty.call(window, '__PRIMER_PP_STOP__')) {
                    throw new Error('stale userscript stop cannot be removed');
                }
            }
            before.injectionAttempted = true;
            try {
        """ + source + """
            } finally {
                const currentStop = Object.getOwnPropertyDescriptor(window, '__PRIMER_PP_STOP__');
                const previousStop = before.bindings.__PRIMER_PP_STOP__;
                if (currentStop && 'value' in currentStop && typeof currentStop.value === 'function' &&
                        (before.staleStop || !previousStop.present || !previousStop.descriptor ||
                            currentStop.value !== previousStop.descriptor.value)) {
                    before.injectedStop = currentStop.value;
                }
            }
            window.__PRIMER_PP_LOADED__ = true;
            return true;
        })()
        """,
        _timeout=45,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if client.eval_js(BRIDGE_EXPR):
            return
        time.sleep(0.25)
    raise RuntimeError("probe bridge did not become ready")


def read_probe(client: CDP) -> dict:
    if not client.eval_js(BRIDGE_EXPR):
        raise RuntimeError("probe bridge is unavailable")
    report = sanitize_probe_report(
        client.eval_js("window.__PRIMER_PP_GET_PROBE_REPORT__()", _timeout=10)
    )
    if not isinstance(report, dict):
        raise RuntimeError("probe bridge returned an invalid report")
    return report


def export_probe(
    port: int | None,
    *,
    inject: bool = False,
    mutate_page: bool = False,
    allow_remote: bool = False,
    finder: Callable[..., str] = find_gemini_page_ws,
    cdp_factory: Callable[..., CDP] = CDP,
) -> dict:
    if inject:
        require_mutation_opt_in(mutate_page)
    endpoint = finder(port, allow_remote=allow_remote)
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        if not inject:
            return read_probe(client)
        with RestoredState(
            lambda: capture_injection_state(client),
            lambda state: restore_injection_state(client, state),
        ):
            inject_userscript(client)
            return read_probe(client)
    finally:
        client.close_transport()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export a sanitized Primer++ probe")
    parser.add_argument("--port", type=int, help="Loopback CDP HTTP port")
    parser.add_argument("--out", type=Path, help="Optional JSON output path")
    parser.add_argument("--force", action="store_true", help="Replace an existing output")
    parser.add_argument("--inject-userscript", action="store_true")
    parser.add_argument(
        "--mutate-page",
        action="store_true",
        help="Permit temporary userscript injection; state is restored in finally",
    )
    parser.add_argument("--allow-remote-cdp", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.out:
            ensure_output_available(args.out, force=args.force)
        report = export_probe(
            args.port,
            inject=args.inject_userscript,
            mutate_page=args.mutate_page,
            allow_remote=args.allow_remote_cdp,
        )
        text = json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
        if args.out:
            write_text_safely(args.out, text, force=args.force)
        else:
            print(text, end="")
    except FileExistsError:
        print("export_adapter_probe: output exists; use --force", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"export_adapter_probe: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print("export_adapter_probe: complete", file=sys.stderr if not args.out else sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
