"""Take one screenshot without implicit viewport or overwrite side effects."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Callable

from cdp_client import (
    CDP,
    RestoredState,
    ensure_output_available,
    find_gemini_page_ws,
    require_mutation_opt_in,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO_ROOT / "store-assets" / "screenshots" / "_probe_shot.png"


def take_screenshot(
    output: str | Path,
    *,
    port: int | None = None,
    force: bool = False,
    mutate_page: bool = False,
    width: int = 1280,
    height: int = 800,
    dpr: float = 1.0,
    allow_remote: bool = False,
    finder: Callable[..., str] = find_gemini_page_ws,
    cdp_factory: Callable[..., CDP] = CDP,
) -> Path:
    destination = ensure_output_available(output, force=force)
    endpoint = finder(port, allow_remote=allow_remote)
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        if not mutate_page:
            return client.screenshot(destination, force=force)
        require_mutation_opt_in(mutate_page)
        with RestoredState(client.get_viewport, client.restore_viewport):
            client.set_viewport(width, height, dpr=dpr)
            return client.screenshot(destination, force=force)
    finally:
        client.close_transport()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Capture one safe local CDP screenshot")
    parser.add_argument("--port", type=int, help="Loopback CDP HTTP port")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true", help="Replace an existing output")
    parser.add_argument("--mutate-page", action="store_true", help="Temporarily emulate a viewport")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=800)
    parser.add_argument("--dpr", type=float, default=1.0)
    parser.add_argument("--allow-remote-cdp", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.width <= 0 or args.height <= 0 or args.dpr <= 0:
        print("quick_shot: invalid viewport", file=sys.stderr)
        return 2
    try:
        take_screenshot(
            args.out,
            port=args.port,
            force=args.force,
            mutate_page=args.mutate_page,
            width=args.width,
            height=args.height,
            dpr=args.dpr,
            allow_remote=args.allow_remote_cdp,
        )
    except FileExistsError:
        print("quick_shot: output exists; use --force", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"quick_shot: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print("quick_shot: screenshot written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
