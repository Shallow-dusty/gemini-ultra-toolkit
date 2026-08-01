"""Import-safe structural DOM probe with optional, restored viewport emulation."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Callable, Mapping

from cdp_client import CDP, RestoredState, find_gemini_page_ws, require_mutation_opt_in


DOM_PROBE_EXPRESSION = r"""
(() => {
    const panel = document.getElementById('gemini-monitor-panel-v7');
    const details = document.getElementById('g-details-pane');
    return {
        panelPresent: !!panel,
        detailsPresent: !!details,
        navigationCount: document.querySelectorAll('nav').length
    };
})()
"""


def normalize_probe(value: Any) -> dict[str, int | bool]:
    if not isinstance(value, Mapping):
        raise ValueError("DOM probe returned an invalid value")
    count = value.get("navigationCount")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise ValueError("DOM probe returned an invalid navigation count")
    return {
        "panel_present": value.get("panelPresent") is True,
        "details_present": value.get("detailsPresent") is True,
        "navigation_count": count,
    }


def probe_dom(client: CDP) -> dict[str, int | bool]:
    return normalize_probe(client.eval_js(DOM_PROBE_EXPRESSION))


def run_probe(
    *,
    port: int | None = None,
    mutate_page: bool = False,
    width: int = 1280,
    height: int = 800,
    dpr: float = 1.0,
    allow_remote: bool = False,
    finder: Callable[..., str] = find_gemini_page_ws,
    cdp_factory: Callable[..., CDP] = CDP,
) -> dict[str, int | bool]:
    endpoint = finder(port, allow_remote=allow_remote)
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        if not mutate_page:
            return probe_dom(client)
        require_mutation_opt_in(mutate_page)
        with RestoredState(client.get_viewport, client.restore_viewport):
            client.set_viewport(width, height, dpr=dpr)
            return probe_dom(client)
    finally:
        client.close_transport()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe safe structural Gemini DOM facts")
    parser.add_argument("--port", type=int, help="Loopback CDP HTTP port")
    parser.add_argument("--mutate-page", action="store_true", help="Temporarily emulate a viewport")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=800)
    parser.add_argument("--dpr", type=float, default=1.0)
    parser.add_argument("--allow-remote-cdp", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.width <= 0 or args.height <= 0 or args.dpr <= 0:
        print("probe_dom: invalid viewport", file=sys.stderr)
        return 2
    try:
        report = run_probe(
            port=args.port,
            mutate_page=args.mutate_page,
            width=args.width,
            height=args.height,
            dpr=args.dpr,
            allow_remote=args.allow_remote_cdp,
        )
    except Exception as exc:
        print(f"probe_dom: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
