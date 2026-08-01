"""Capture the five store screenshots with explicit, restored page mutation."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Callable, Mapping

from cdp_client import (
    CDP,
    RestoredState,
    ensure_outputs_available,
    find_gemini_page_ws,
    require_mutation_opt_in,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "store-assets" / "screenshots"
PANEL_ID = "gemini-monitor-panel-v7"
SHOT_NAMES = (
    "01-panel-counter.png",
    "02-details-pane.png",
    "03-dashboard-heatmap.png",
    "04-settings.png",
    "05-settings-scrolled.png",
)


def output_paths(output_dir: str | Path) -> tuple[Path, ...]:
    root = Path(output_dir).expanduser()
    return tuple(root / name for name in SHOT_NAMES)


def capture_page_state(client: CDP) -> dict[str, Any]:
    ui_state = client.eval_js(r"""
        (() => {
            const details = document.getElementById('g-details-pane');
            return {
                detailsExpanded: !!details && details.classList.contains('expanded'),
                tourSeen: localStorage.getItem('gm_gemini_tour_seen'),
                onboardingSeen: localStorage.getItem('gm_gemini_onboarding_seen'),
                blockingOverlay: !!document.querySelector(
                    '.settings-overlay, .dashboard-overlay, .onboarding-overlay, #gemini-onboarding-modal'
                )
            };
        })()
    """)
    if not isinstance(ui_state, Mapping):
        raise RuntimeError("page state probe failed")
    if ui_state.get("blockingOverlay") is True:
        raise RuntimeError("capture requires a page without an existing overlay")
    return {
        "viewport": client.get_viewport(),
        "detailsExpanded": ui_state.get("detailsExpanded") is True,
        "tourSeen": ui_state.get("tourSeen"),
        "onboardingSeen": ui_state.get("onboardingSeen"),
    }


def restore_page_state(client: CDP, state: Mapping[str, Any]) -> None:
    payload = json.dumps({
        "detailsExpanded": state.get("detailsExpanded") is True,
        "tourSeen": state.get("tourSeen"),
        "onboardingSeen": state.get("onboardingSeen"),
    })
    try:
        client.eval_js(f"""
            (() => {{
                const before = {payload};
                for (const overlay of document.querySelectorAll('.settings-overlay, .dashboard-overlay')) {{
                    const closer = overlay.querySelector(
                        '.settings-close, [aria-label="Close"], [aria-label="关闭"]'
                    );
                    if (closer) closer.click();
                }}
                const details = document.getElementById('g-details-pane');
                const expanded = !!details && details.classList.contains('expanded');
                if (expanded !== before.detailsExpanded) {{
                    document.querySelector('#{PANEL_ID} .gemini-toggle-btn')?.click();
                }}
                for (const [key, value] of [
                    ['gm_gemini_tour_seen', before.tourSeen],
                    ['gm_gemini_onboarding_seen', before.onboardingSeen]
                ]) {{
                    if (value === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, value);
                }}
                return true;
            }})()
        """)
    finally:
        client.restore_viewport(state["viewport"])


def prepare_page(client: CDP, *, width: int, height: int, dpr: float) -> None:
    client.set_viewport(width, height, dpr=dpr)
    client.eval_js(r"""
        (() => {
            localStorage.setItem('gm_gemini_tour_seen', 'true');
            localStorage.setItem('gm_gemini_onboarding_seen', JSON.stringify({
                counter: true, folders: true, export: true, 'prompt-vault': true,
                'default-model': true, 'batch-delete': true, 'quote-reply': true,
                'ui-tweaks': true
            }));
            return true;
        })()
    """)
    if not client.eval_js("!!window.__PRIMER_PP_LOADED__"):
        raise RuntimeError("Primer++ must already be loaded; this tool never injects by default")
    client.wait_for(f"!!document.getElementById('{PANEL_ID}')", timeout=20)


def set_details_expanded(client: CDP, expanded: bool) -> None:
    result = client.eval_js(f"""
        (() => {{
            const details = document.getElementById('g-details-pane');
            const current = !!details && details.classList.contains('expanded');
            if (current !== {str(expanded).lower()}) {{
                const toggle = document.querySelector('#{PANEL_ID} .gemini-toggle-btn');
                if (!toggle) return false;
                toggle.click();
            }}
            return true;
        }})()
    """)
    if result is not True:
        raise RuntimeError("details pane toggle is unavailable")


def click_details_action(client: CDP, pattern: str) -> None:
    expression = f"""
        (() => {{
            const pane = document.getElementById('g-details-pane');
            if (!pane) return false;
            const pattern = new RegExp({json.dumps(pattern)}, 'i');
            for (const button of pane.querySelectorAll('button, [role="button"]')) {{
                const label = button.title || button.getAttribute('aria-label') || button.textContent || '';
                if (pattern.test(label.trim())) {{ button.click(); return true; }}
            }}
            return false;
        }})()
    """
    if client.eval_js(expression) is not True:
        raise RuntimeError("requested panel action is unavailable")


def close_active_modal(client: CDP) -> None:
    closed = client.eval_js(r"""
        (() => {
            const overlay = document.querySelector('.settings-overlay, .dashboard-overlay');
            if (!overlay) return true;
            const closer = overlay.querySelector(
                '.settings-close, [aria-label="Close"], [aria-label="关闭"]'
            );
            if (!closer) return false;
            closer.click();
            return true;
        })()
    """)
    if closed is not True:
        raise RuntimeError("active modal cannot be closed safely")


def scroll_settings_to_bottom(client: CDP) -> None:
    if client.eval_js(r"""
        (() => {
            const body = document.querySelector('.settings-modal .settings-body');
            if (!body) return false;
            body.scrollTop = body.scrollHeight;
            return true;
        })()
    """) is not True:
        raise RuntimeError("settings body is unavailable")


def capture_store_shots(
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
) -> tuple[Path, ...]:
    require_mutation_opt_in(mutate_page)
    destinations = ensure_outputs_available(output_paths(output_dir), force=force)
    endpoint = finder(port, allow_remote=allow_remote)
    client = cdp_factory(endpoint, allow_remote=allow_remote)
    try:
        with RestoredState(
            lambda: capture_page_state(client),
            lambda state: restore_page_state(client, state),
        ):
            prepare_page(client, width=width, height=height, dpr=dpr)
            set_details_expanded(client, False)
            sleep(0.2)
            client.screenshot(destinations[0], force=force)

            set_details_expanded(client, True)
            sleep(0.2)
            client.screenshot(destinations[1], force=force)

            click_details_action(client, r"stats|统计")
            sleep(0.2)
            client.screenshot(destinations[2], force=force)
            close_active_modal(client)

            set_details_expanded(client, True)
            click_details_action(client, r"settings|设置")
            client.wait_for("!!document.querySelector('.settings-modal')", timeout=15)
            sleep(0.2)
            client.screenshot(destinations[3], force=force)
            scroll_settings_to_bottom(client)
            sleep(0.2)
            client.screenshot(destinations[4], force=force)
        return destinations
    finally:
        client.close_transport()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Capture store screenshots safely")
    parser.add_argument("--port", type=int, help="Loopback CDP HTTP port")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--force", action="store_true", help="Replace existing screenshots")
    parser.add_argument(
        "--mutate-page",
        action="store_true",
        help="Permit temporary UI/localStorage/viewport changes; all are restored",
    )
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=800)
    parser.add_argument("--dpr", type=float, default=1.0)
    parser.add_argument("--allow-remote-cdp", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.width <= 0 or args.height <= 0 or args.dpr <= 0:
        print("capture_store_shots: invalid viewport", file=sys.stderr)
        return 2
    try:
        capture_store_shots(
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
        print("capture_store_shots: --mutate-page is required", file=sys.stderr)
        return 2
    except FileExistsError:
        print("capture_store_shots: output exists; use --force", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"capture_store_shots: failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print("capture_store_shots: screenshots written and page state restored")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
