"""Export Primer++ adapter probe data from a live Gemini tab over CDP.

Default behavior is read-only: the script expects Primer++ to already be loaded
and exposes no storage or transcript bodies. Use --inject-userscript only for an
isolated smoke run where injecting the repo-built userscript is acceptable.

Examples:
    python3 store-assets/scripts/export_adapter_probe.py --port 63366
    python3 store-assets/scripts/export_adapter_probe.py --out docs/research/live-probe.json
    python3 store-assets/scripts/export_adapter_probe.py --inject-userscript
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from cdp_client import CDP, GM_POLYFILL_JS, find_gemini_page_ws, load_userscript


REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_EXPR = "typeof window.__PRIMER_PP_GET_PROBE_REPORT__ === 'function'"


def inject_userscript(cdp: CDP) -> None:
    cdp.eval_js(GM_POLYFILL_JS)
    if cdp.eval_js(BRIDGE_EXPR):
        return
    if not cdp.eval_js("!!window.__PRIMER_PP_LOADED__"):
        source = load_userscript(REPO_ROOT)
        cdp.eval_js(
            "(() => { try { " + source + " } catch (e) { "
            "console.error('[primer++] probe inject failed:', e); throw e; } "
            "window.__PRIMER_PP_LOADED__ = true; return true; })();",
            _timeout=45,
        )
    deadline = time.time() + 10
    while time.time() < deadline:
        if cdp.eval_js(BRIDGE_EXPR):
            return
        time.sleep(0.25)
    raise RuntimeError("Primer++ probe bridge did not become available after injection")


def export_probe(port: int | None, inject: bool) -> dict:
    ws = find_gemini_page_ws(port)
    cdp = CDP(ws)
    try:
        if inject:
            inject_userscript(cdp)
        if not cdp.eval_js(BRIDGE_EXPR):
            raise RuntimeError(
                "Primer++ probe bridge is unavailable. Open a Gemini tab with "
                "Primer++ loaded, or rerun with --inject-userscript for an "
                "isolated smoke run."
            )
        return cdp.eval_js("window.__PRIMER_PP_GET_PROBE_REPORT__()", _timeout=10)
    finally:
        cdp.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, help="CDP HTTP port, for example 63366")
    parser.add_argument("--out", type=Path, help="Optional JSON output path")
    parser.add_argument(
        "--inject-userscript",
        action="store_true",
        help="Inject the repo-built userscript first if the probe bridge is missing",
    )
    args = parser.parse_args()

    try:
        report = export_probe(args.port, args.inject_userscript)
    except Exception as exc:
        print(f"export_adapter_probe: {exc}", file=sys.stderr)
        return 1

    text = json.dumps(report, indent=2, ensure_ascii=False)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
