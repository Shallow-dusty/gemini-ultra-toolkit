"""Import-safe CDP connectivity probe that never closes the user's browser."""

from __future__ import annotations

import argparse
import sys
from typing import Callable

from cdp_client import CDP, CDPError, find_gemini_page_ws, validate_cdp_websocket_url


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe a local CDP page transport")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--endpoint", help="Explicit page-level WebSocket endpoint")
    source.add_argument("--port", type=int, help="Loopback CDP HTTP discovery port")
    parser.add_argument(
        "--allow-remote-cdp",
        action="store_true",
        help="Allow a non-loopback endpoint (unsafe; disabled by default)",
    )
    return parser


def resolve_endpoint(
    endpoint: str | None,
    port: int | None,
    *,
    allow_remote: bool,
    finder: Callable[..., str] = find_gemini_page_ws,
) -> str:
    if endpoint:
        return validate_cdp_websocket_url(endpoint, allow_remote=allow_remote)
    return finder(port, allow_remote=allow_remote)


def probe_endpoint(
    endpoint: str,
    *,
    allow_remote: bool = False,
    cdp_factory: Callable[..., CDP] = CDP,
) -> None:
    client = cdp_factory(
        endpoint,
        allow_remote=allow_remote,
        enable_domains=False,
    )
    try:
        result = client.send(
            "Runtime.evaluate",
            expression="true",
            returnByValue=True,
        )
        if result.get("result", {}).get("value") is not True:
            raise CDPError("transport probe returned an invalid result")
    finally:
        # Transport-only teardown: never sends a browser-close command.
        client.close_transport()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        endpoint = resolve_endpoint(
            args.endpoint,
            args.port,
            allow_remote=args.allow_remote_cdp,
        )
        probe_endpoint(endpoint, allow_remote=args.allow_remote_cdp)
    except Exception as exc:
        print(f"cdp_probe: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print("cdp_probe: local transport ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
