"""Import-safe, read-only probe for sanitized Primer++ panel structure."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Callable, Mapping

from cdp_client import CDP, find_gemini_page_ws


PANEL_PROBE_EXPRESSION = r"""
(() => {
    const panel = document.getElementById('gemini-monitor-panel-v7');
    if (!panel) return { panelPresent: false, buttonCount: 0, detailsOpen: false };
    const details = document.getElementById('g-details-pane');
    return {
        panelPresent: true,
        buttonCount: panel.querySelectorAll('button, [role="button"]').length,
        detailsOpen: !!details && getComputedStyle(details).display !== 'none'
    };
})()
"""


def normalize_probe(value: Any) -> dict[str, int | bool]:
    if not isinstance(value, Mapping):
        raise ValueError("panel probe returned an invalid value")
    count = value.get("buttonCount")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise ValueError("panel probe returned an invalid button count")
    return {
        "panel_present": value.get("panelPresent") is True,
        "button_count": count,
        "details_open": value.get("detailsOpen") is True,
    }


def probe_panel(client: CDP) -> dict[str, int | bool]:
    return normalize_probe(client.eval_js(PANEL_PROBE_EXPRESSION))


def run_probe(
    port: int | None = None,
    *,
    allow_remote: bool = False,
    finder: Callable[..., str] = find_gemini_page_ws,
    cdp_factory: Callable[..., CDP] = CDP,
) -> dict[str, int | bool]:
    endpoint = finder(port, allow_remote=allow_remote)
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        return probe_panel(client)
    finally:
        client.close_transport()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe sanitized panel structure")
    parser.add_argument("--port", type=int, help="Loopback CDP HTTP port")
    parser.add_argument("--allow-remote-cdp", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = run_probe(args.port, allow_remote=args.allow_remote_cdp)
    except Exception as exc:
        print(f"probe_panel: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
