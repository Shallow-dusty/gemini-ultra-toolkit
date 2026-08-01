"""Capture one alternate-theme screenshot and always restore the prior theme."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Callable, Mapping

from capture_store_shots import (
    capture_page_state,
    restore_page_state,
    set_details_expanded,
)
from cdp_client import (
    CDP,
    RestoredState,
    ensure_output_available,
    find_gemini_page_ws,
    require_mutation_opt_in,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO_ROOT / "store-assets" / "screenshots" / "05-theme-cyber.png"
KNOWN_THEMES = frozenset({"auto", "glass", "cyber", "paper"})


def selected_theme(client: CDP) -> str:
    value = client.eval_js(r"""
        (() => {
            const pane = document.getElementById('g-details-pane');
            const known = ['auto', 'glass', 'cyber', 'paper'];
            for (const row of pane?.querySelectorAll('.detail-row[aria-pressed="true"]') || []) {
                const text = (row.textContent || '').trim().toLowerCase();
                const key = known.find(theme => text === theme || text.endsWith(` ${theme}`));
                if (key) return key;
            }
            return null;
        })()
    """)
    if not isinstance(value, str) or value not in KNOWN_THEMES:
        raise RuntimeError("current theme cannot be identified safely")
    return value


def click_theme(client: CDP, theme_name: str) -> None:
    if not isinstance(theme_name, str) or theme_name.strip().lower() not in KNOWN_THEMES:
        raise ValueError("theme must be one of auto, glass, cyber or paper")
    needle = theme_name.strip().lower()
    changed = client.eval_js(f"""
        (() => {{
            const pane = document.getElementById('g-details-pane');
            if (!pane) return false;
            const needle = {json.dumps(needle)};
            for (const row of pane.querySelectorAll('.detail-row')) {{
                const text = (row.textContent || '').trim().toLowerCase();
                if (text === needle || text.endsWith(` ${{needle}}`)) {{ row.click(); return true; }}
            }}
            return false;
        }})()
    """)
    if changed is not True:
        raise RuntimeError("requested theme is unavailable")


def capture_theme_state(client: CDP) -> dict[str, Any]:
    state = capture_page_state(client)
    state["theme"] = selected_theme(client)
    return state


def restore_theme_state(client: CDP, state: Mapping[str, Any]) -> None:
    try:
        click_theme(client, str(state["theme"]))
    finally:
        restore_page_state(client, state)


def capture_theme_screenshot(
    output: str | Path,
    *,
    theme: str = "Cyber",
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
) -> Path:
    require_mutation_opt_in(mutate_page)
    destination = ensure_output_available(output, force=force)
    endpoint = finder(port, allow_remote=allow_remote)
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        with RestoredState(
            lambda: capture_theme_state(client),
            lambda state: restore_theme_state(client, state),
        ):
            client.set_viewport(width, height, dpr=dpr)
            set_details_expanded(client, True)
            click_theme(client, theme)
            sleep(0.2)
            client.screenshot(destination, force=force)
        return destination
    finally:
        client.close_transport()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Capture an alternate-theme screenshot safely")
    parser.add_argument("--port", type=int, help="Loopback CDP HTTP port")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--theme", default="Cyber")
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
        print("shoot_5_alt_theme: invalid viewport", file=sys.stderr)
        return 2
    try:
        capture_theme_screenshot(
            args.out,
            theme=args.theme,
            port=args.port,
            force=args.force,
            mutate_page=args.mutate_page,
            width=args.width,
            height=args.height,
            dpr=args.dpr,
            allow_remote=args.allow_remote_cdp,
        )
    except PermissionError:
        print("shoot_5_alt_theme: --mutate-page is required", file=sys.stderr)
        return 2
    except FileExistsError:
        print("shoot_5_alt_theme: output exists; use --force", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"shoot_5_alt_theme: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print("shoot_5_alt_theme: screenshot written and prior theme restored")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
