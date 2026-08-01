"""Capture settings screenshots with explicit mutation and guaranteed restore."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Callable

from capture_store_shots import (
    capture_page_state,
    click_details_action,
    restore_page_state,
    scroll_settings_to_bottom,
    set_details_expanded,
)
from cdp_client import (
    CDP,
    RestoredState,
    ensure_outputs_available,
    find_gemini_page_ws,
    require_mutation_opt_in,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "store-assets" / "screenshots"
SHOT_NAMES = ("04-settings.png", "05-settings-scrolled.png")


def capture_settings(
    output_dir: str | Path,
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
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[Path, Path]:
    require_mutation_opt_in(mutate_page)
    root = Path(output_dir).expanduser()
    first, second = ensure_outputs_available(
        (root / SHOT_NAMES[0], root / SHOT_NAMES[1]),
        force=force,
    )
    endpoint = finder(port, allow_remote=allow_remote)
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        with RestoredState(
            lambda: capture_page_state(client),
            lambda state: restore_page_state(client, state),
        ):
            client.set_viewport(width, height, dpr=dpr)
            set_details_expanded(client, True)
            click_details_action(client, r"settings|设置")
            client.wait_for(
                "!!document.querySelector('.settings-modal') && "
                "document.querySelectorAll('.settings-modal .settings-row').length > 3",
                timeout=15,
            )
            sleep(0.2)
            client.screenshot(first, force=force)
            scroll_settings_to_bottom(client)
            sleep(0.2)
            client.screenshot(second, force=force)
        return first, second
    finally:
        client.close_transport()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Capture settings screenshots safely")
    parser.add_argument("--port", type=int, help="Loopback CDP HTTP port")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--mutate-page", action="store_true")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=800)
    parser.add_argument("--dpr", type=float, default=1.0)
    parser.add_argument("--allow-remote-cdp", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.width <= 0 or args.height <= 0 or args.dpr <= 0:
        print("shoot_settings: invalid viewport", file=sys.stderr)
        return 2
    try:
        capture_settings(
            args.output_dir,
            port=args.port,
            force=args.force,
            mutate_page=args.mutate_page,
            width=args.width,
            height=args.height,
            dpr=args.dpr,
            allow_remote=args.allow_remote_cdp,
        )
    except PermissionError:
        print("shoot_settings: --mutate-page is required", file=sys.stderr)
        return 2
    except FileExistsError:
        print("shoot_settings: output exists; use --force", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"shoot_settings: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print("shoot_settings: screenshots written and page state restored")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
