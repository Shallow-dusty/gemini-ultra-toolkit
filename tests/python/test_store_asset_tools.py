"""Offline safety tests for store-assets Python tooling."""

from __future__ import annotations

import importlib
import io
import json
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = REPO_ROOT / "store-assets" / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))


MODULE_NAMES = (
    "cdp_client",
    "cdp_probe",
    "probe_dom",
    "probe_panel",
    "quick_shot",
    "export_adapter_probe",
    "capture_store_shots",
    "shoot_settings",
    "shoot_5_alt_theme",
)


def module(name: str):
    return importlib.import_module(name)


class FakeClient:
    def __init__(self, *, probe_value=None, fail_screenshot_at: int | None = None):
        self.probe_value = probe_value
        self.fail_screenshot_at = fail_screenshot_at
        self.closed = False
        self.viewport = {"width": 900, "height": 700, "dpr": 1.25}
        self.viewport_changes: list[tuple[int, int, float]] = []
        self.restored: list[dict] = []
        self.screenshots: list[Path] = []
        self.sent: list[tuple[str, dict]] = []

    def eval_js(self, expression, **_kwargs):
        if isinstance(self.probe_value, BaseException):
            raise self.probe_value
        return self.probe_value

    def get_viewport(self):
        return dict(self.viewport)

    def set_viewport(self, width, height, dpr=1.0):
        self.viewport_changes.append((width, height, dpr))

    def restore_viewport(self, state):
        self.restored.append(dict(state))

    def screenshot(self, path, *, force=False, **_kwargs):
        destination = Path(path)
        call_index = len(self.screenshots) + 1
        if self.fail_screenshot_at == call_index:
            raise RuntimeError("screenshot failure with ws://secret.invalid/token")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"png")
        self.screenshots.append(destination)
        return destination

    def wait_for(self, *_args, **_kwargs):
        return True

    def send(self, method, **params):
        self.sent.append((method, params))
        return {"result": {"value": True}}

    def close_transport(self):
        self.closed = True


class ImportSafetyTests(unittest.TestCase):
    def test_all_tools_are_import_safe_without_network_or_file_writes(self):
        for name in reversed(MODULE_NAMES):
            sys.modules.pop(name, None)
        with (
            patch("urllib.request.urlopen", side_effect=AssertionError("network attempted")),
            patch("socket.create_connection", side_effect=AssertionError("network attempted")),
            patch.object(Path, "mkdir", side_effect=AssertionError("write attempted")),
            patch.object(Path, "open", side_effect=AssertionError("write attempted")),
            patch.object(Path, "write_bytes", side_effect=AssertionError("write attempted")),
            patch.object(Path, "write_text", side_effect=AssertionError("write attempted")),
        ):
            for name in MODULE_NAMES:
                imported = importlib.import_module(name)
                self.assertTrue(callable(imported.main))


class SafetyPrimitiveTests(unittest.TestCase):
    def setUp(self):
        self.cdp = module("cdp_client")

    def test_loopback_url_policy_and_port_validation(self):
        allowed = (
            "ws://127.0.0.1:9222/devtools/page/id",
            "ws://[::1]:9222/devtools/page/id",
            "http://localhost:9222/json",
        )
        for endpoint in allowed:
            self.assertEqual(self.cdp.validate_cdp_url(endpoint), endpoint)
        with self.assertRaisesRegex(ValueError, "explicit opt-in"):
            self.cdp.validate_cdp_url("ws://example.com/devtools/page/id")
        self.assertEqual(
            self.cdp.validate_cdp_url(
                "wss://example.com/devtools/page/id",
                allow_remote=True,
            ),
            "wss://example.com/devtools/page/id",
        )
        with self.assertRaisesRegex(ValueError, "ws or wss"):
            self.cdp.validate_cdp_websocket_url("http://127.0.0.1:9222/json")
        for endpoint in (
            "relative/path",
            "ftp://127.0.0.1/file",
            "ws://user:secret@127.0.0.1:9222/page",
            "ws://127.0.0.1:99999/page",
            "ws://tools.localhost:9222/page",
        ):
            with self.assertRaises(ValueError):
                self.cdp.validate_cdp_url(endpoint)
        for value in (False, 0, 65536, "junk"):
            with self.assertRaises(ValueError):
                self.cdp.validate_port(value)
        self.assertEqual(self.cdp.validate_port(" 9222 "), 9222)

    def test_outputs_are_exclusive_and_force_is_explicit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "nested" / "result.bin"
            self.cdp.write_bytes_safely(output, b"first")
            self.assertEqual(output.read_bytes(), b"first")
            with self.assertRaises(FileExistsError):
                self.cdp.write_bytes_safely(output, b"second")
            self.assertEqual(output.read_bytes(), b"first")
            self.cdp.write_bytes_safely(output, b"forced", force=True)
            self.assertEqual(output.read_bytes(), b"forced")

            text_output = root / "report.json"
            self.cdp.write_text_safely(text_output, "{}\n")
            with self.assertRaises(FileExistsError):
                self.cdp.write_text_safely(text_output, "changed")
            self.assertEqual(text_output.read_text(encoding="utf-8"), "{}\n")
            with self.assertRaises(ValueError):
                self.cdp.ensure_outputs_available((root / "same", root / "same"))

    def test_output_preflight_does_not_create_directories(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "missing" / "file.bin"
            self.assertEqual(self.cdp.ensure_output_available(output), output)
            self.assertFalse(output.parent.exists())

    def test_restored_state_runs_on_success_and_failure_without_masking_primary(self):
        events = []
        with self.cdp.RestoredState(
            lambda: events.append("capture") or "before",
            lambda value: events.append(f"restore:{value}"),
        ) as state:
            self.assertEqual(state, "before")
            events.append("action")
        self.assertEqual(events, ["capture", "action", "restore:before"])

        primary = RuntimeError("primary")
        with self.assertRaises(RuntimeError) as caught:
            with self.cdp.RestoredState(lambda: "state", lambda _state: (_ for _ in ()).throw(ValueError())):
                raise primary
        self.assertIs(caught.exception, primary)
        self.assertTrue(any("restoration failed" in note for note in primary.__notes__))

        with self.assertRaises(ValueError):
            with self.cdp.RestoredState(lambda: "state", lambda _state: (_ for _ in ()).throw(ValueError())):
                pass

    def test_mutation_requires_explicit_opt_in(self):
        with self.assertRaises(PermissionError):
            self.cdp.require_mutation_opt_in(False)
        self.assertIsNone(self.cdp.require_mutation_opt_in(True))

    def test_transport_cleanup_never_sends_a_browser_close_command(self):
        class SilentSocket:
            def __init__(self):
                self.closed = False
                self.sent = []

            def settimeout(self, _timeout):
                return None

            def send(self, payload):
                self.sent.append(payload)

            def recv(self):
                if self.closed:
                    raise OSError("closed")
                raise TimeoutError("idle")

            def close(self):
                self.closed = True

        transport = SilentSocket()
        client = self.cdp.CDP(
            "ws://127.0.0.1:9222/devtools/page/id",
            connection_factory=lambda _url: transport,
            enable_domains=False,
        )
        client.close_transport()
        self.assertTrue(transport.closed)
        self.assertEqual(transport.sent, [])

        failing_transport = SilentSocket()
        with self.assertRaises(self.cdp.CDPError):
            self.cdp.CDP(
                "ws://127.0.0.1:9222/devtools/page/id",
                default_timeout=0.001,
                connection_factory=lambda _url: failing_transport,
            )
        self.assertTrue(failing_transport.closed)
        self.assertNotIn("Browser.close", "".join(failing_transport.sent))

    def test_restore_viewport_clears_the_device_metrics_override(self):
        client = object.__new__(self.cdp.CDP)
        client.send = Mock(return_value={})

        client.restore_viewport({"width": 900, "height": 700, "dpr": 1.25})

        client.send.assert_called_once_with("Emulation.clearDeviceMetricsOverride")

    def test_discovery_uses_injected_loopback_opener_and_rejects_remote_ws(self):
        class Response:
            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps(self.payload).encode()

        opened = []

        def opener(url, timeout):
            opened.append((url, timeout))
            return Response([
                {
                    "type": "page",
                    "url": "https://evil.example/?next=gemini.google.com",
                    "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/evil-query",
                },
                {
                    "type": "page",
                    "url": "https://gemini.google.com.evil.example/",
                    "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/evil-host",
                },
                {
                    "type": "page",
                    "url": "https://gemini.google.com/app",
                    "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/id",
                },
            ])

        with tempfile.TemporaryDirectory() as temp:
            endpoint = self.cdp.find_gemini_page_ws(
                9222,
                opener=opener,
                environ={},
                port_file=Path(temp) / "absent",
            )
        self.assertEqual(endpoint, "ws://127.0.0.1:9222/devtools/page/id")
        self.assertEqual(opened, [("http://127.0.0.1:9222/json", 1)])
        self.assertTrue(self.cdp.is_gemini_page_url("https://gemini.google.com/app"))
        for spoof in (
            "http://gemini.google.com/app",
            "https://gemini.google.com.evil.example/",
            "https://evil.example/?next=gemini.google.com",
            "https://user:secret@gemini.google.com/app",
            None,
        ):
            self.assertFalse(self.cdp.is_gemini_page_url(spoof))

        def remote_opener(_url, _timeout):
            return Response([{
                "type": "page",
                "url": "https://gemini.google.com/app",
                "webSocketDebuggerUrl": "wss://remote.example/devtools/page/id",
            }])

        with tempfile.TemporaryDirectory() as temp, self.assertRaises(RuntimeError):
            self.cdp.find_gemini_page_ws(
                9222,
                opener=remote_opener,
                environ={},
                port_file=Path(temp) / "absent",
            )

    def test_explicit_discovery_port_fails_closed_without_ambient_fallbacks(self):
        opened = []

        def unavailable(url, timeout):
            opened.append((url, timeout))
            raise OSError("unavailable")

        with tempfile.TemporaryDirectory() as temp:
            port_file = Path(temp) / "cdp-port"
            port_file.write_text("63366", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                self.cdp.find_gemini_page_ws(
                    9444,
                    extra_ports=(9222,),
                    scan_range=(9223, 9224),
                    opener=unavailable,
                    environ={"PRIMER_PP_CDP_PORT": "50000"},
                    port_file=port_file,
                )

        self.assertEqual(opened, [("http://127.0.0.1:9444/json", 1)])


class ProbeWorkflowTests(unittest.TestCase):
    def test_cdp_probe_only_closes_transport_and_never_logs_endpoint(self):
        probe = module("cdp_probe")
        client = FakeClient()
        factory = Mock(return_value=client)
        probe.probe_endpoint(
            "ws://127.0.0.1:9222/devtools/page/secret",
            cdp_factory=factory,
        )
        self.assertTrue(client.closed)
        self.assertEqual(client.sent[0][0], "Runtime.evaluate")
        self.assertFalse(hasattr(client, "browser_close"))

        stderr = io.StringIO()
        with patch.object(probe, "probe_endpoint", side_effect=RuntimeError("wss://secret.example/token")):
            with redirect_stderr(stderr):
                status = probe.main(["--endpoint", "ws://127.0.0.1:9222/page/id"])
        self.assertEqual(status, 1)
        self.assertNotIn("secret.example", stderr.getvalue())

    def test_dom_probe_is_read_only_by_default_and_restores_mutated_viewport_on_failure(self):
        probe = module("probe_dom")
        safe_client = FakeClient(probe_value={
            "panelPresent": True,
            "detailsPresent": False,
            "navigationCount": 2,
        })
        report = probe.run_probe(
            finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
            cdp_factory=lambda *_args, **_kwargs: safe_client,
        )
        self.assertEqual(report["navigation_count"], 2)
        self.assertEqual(safe_client.viewport_changes, [])
        self.assertEqual(safe_client.restored, [])
        self.assertTrue(safe_client.closed)

        failing_client = FakeClient(probe_value=RuntimeError("bad DOM"))
        with self.assertRaises(RuntimeError):
            probe.run_probe(
                mutate_page=True,
                finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
                cdp_factory=lambda *_args, **_kwargs: failing_client,
            )
        self.assertEqual(failing_client.viewport_changes, [(1280, 800, 1.0)])
        self.assertEqual(failing_client.restored, [failing_client.viewport])
        self.assertTrue(failing_client.closed)

    def test_panel_probe_only_returns_sanitized_scalars(self):
        probe = module("probe_panel")
        client = FakeClient(probe_value={
            "panelPresent": True,
            "buttonCount": 4,
            "detailsOpen": True,
            "html": "<secret>",
        })
        report = probe.run_probe(
            finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
            cdp_factory=lambda *_args, **_kwargs: client,
        )
        self.assertEqual(report, {
            "panel_present": True,
            "button_count": 4,
            "details_open": True,
        })
        self.assertNotIn("html", report)

    def test_quick_shot_preflights_output_and_restores_viewport(self):
        shot = module("quick_shot")
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "shot.png"
            output.write_bytes(b"existing")
            finder = Mock(side_effect=AssertionError("must not connect"))
            with self.assertRaises(FileExistsError):
                shot.take_screenshot(output, finder=finder)
            finder.assert_not_called()
            self.assertEqual(output.read_bytes(), b"existing")

            output.unlink()
            client = FakeClient()
            shot.take_screenshot(
                output,
                mutate_page=True,
                finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
                cdp_factory=lambda *_args, **_kwargs: client,
            )
            self.assertEqual(output.read_bytes(), b"png")
            self.assertEqual(client.restored, [client.viewport])
            self.assertTrue(client.closed)

    def test_export_sanitizes_and_restores_injection_on_failure(self):
        exporter = module("export_adapter_probe")
        sanitized = exporter.sanitize_probe_report({
            "app": "Primer++",
            "version": "13",
            "url": "https://secret.example",
            "adapter": {
                "schemaVersion": 2,
                "evidence": ["selector:[data-secret]"],
                "summary": {"total": 1},
                "reason": "password=secret",
            },
            "token": "secret",
        })
        self.assertEqual(sanitized, {
            "app": "Primer++",
            "version": "13",
            "adapter": {
                "schemaVersion": 2,
                "summary": {"total": 1},
                "reason": "[redacted]",
            },
        })

        class InjectionRestoreClient(FakeClient):
            def __init__(self):
                super().__init__()
                self.evaluated = []

            def eval_js(self, expression, **kwargs):
                self.evaluated.append((expression, kwargs))
                if "const savedBindings" in expression:
                    return {
                        "snapshot": True,
                        "loaded": False,
                        "bridge": False,
                        "staleStop": False,
                    }
                return True

        client = InjectionRestoreClient()
        with (
            patch.object(exporter, "inject_userscript"),
            patch.object(exporter, "read_probe", side_effect=RuntimeError("failed after injection")),
        ):
            with self.assertRaises(RuntimeError):
                exporter.export_probe(
                    None,
                    inject=True,
                    mutate_page=True,
                    finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
                    cdp_factory=lambda *_args, **_kwargs: client,
                )
        self.assertIn("const savedBindings", client.evaluated[0][0])
        self.assertIn("const before = window[snapshotKey]", client.evaluated[-1][0])
        self.assertTrue(client.evaluated[-1][1]["await_promise"])
        self.assertTrue(client.closed)

    def test_export_sanitizer_enforces_field_schemas_recursively(self):
        exporter = module("export_adapter_probe")
        sanitized = exporter.sanitize_probe_report({
            "app": "Primer++ for Gemini™",
            "version": "v13.2.0-beta.1",
            "generatedAt": "2026-08-01T01:02:03.456Z",
            "checkedAt": "not-a-timestamp",
            "lifecycle": "ready",
            "status": "available",
            "action": "delegate-native",
            "owner": "primer-adapter",
            "kind": "integration-surface",
            "id": "adapter.current",
            "nativeCapability": "rich_cards",
            "code": "ADAPTER_OK",
            "reasonCode": "selector_missing",
            "statuses": ["available", "password=secret"],
            "enabled": ["counter", "../secret"],
            "reason": "https://secret.example/private",
            "features": {"id": "feature.current", "token": "secret"},
            "checks": [
                {
                    "id": "selector.required",
                    "required": True,
                    "ok": False,
                    "sourceCode": "DOM_SELECTOR_MISSING",
                },
                {"id": "../secret", "sourceCode": "bad-code"},
            ],
            "url": "https://secret.example",
        })

        self.assertEqual(sanitized["app"], "Primer++ for Gemini™")
        self.assertEqual(sanitized["version"], "v13.2.0-beta.1")
        self.assertEqual(sanitized["generatedAt"], "2026-08-01T01:02:03.456Z")
        self.assertEqual(sanitized["checkedAt"], "[redacted]")
        self.assertEqual(sanitized["lifecycle"], "ready")
        self.assertEqual(sanitized["status"], "available")
        self.assertEqual(sanitized["action"], "delegate-native")
        self.assertEqual(sanitized["owner"], "primer-adapter")
        self.assertEqual(sanitized["kind"], "integration-surface")
        self.assertEqual(sanitized["id"], "adapter.current")
        self.assertEqual(sanitized["nativeCapability"], "rich_cards")
        self.assertEqual(sanitized["code"], "ADAPTER_OK")
        self.assertEqual(sanitized["reasonCode"], "[redacted]")
        self.assertEqual(sanitized["statuses"], ["available", "[redacted]"])
        self.assertEqual(sanitized["enabled"], ["counter", "[redacted]"])
        self.assertEqual(sanitized["reason"], "[redacted]")
        self.assertEqual(sanitized["features"], {"id": "feature.current"})
        self.assertEqual(sanitized["checks"][0]["sourceCode"], "DOM_SELECTOR_MISSING")
        self.assertEqual(sanitized["checks"][1], {
            "id": "[redacted]",
            "sourceCode": "[redacted]",
        })
        self.assertNotIn("url", sanitized)

    def test_injection_restore_removes_only_resources_created_by_the_tool(self):
        exporter = module("export_adapter_probe")

        class RecordingClient:
            def __init__(self):
                self.calls = []

            def eval_js(self, expression, **kwargs):
                self.calls.append((expression, kwargs))
                if "savedBindings" in expression:
                    return {
                        "snapshot": True,
                        "loaded": False,
                        "bridge": False,
                        "staleStop": True,
                    }
                return True

        client = RecordingClient()
        state = exporter.capture_injection_state(client)
        self.assertEqual(state, {
            "snapshot": True,
            "loaded": False,
            "bridge": False,
            "staleStop": True,
        })
        exporter.restore_injection_state(client, state)
        capture_expression = client.calls[0][0]
        expression, kwargs = client.calls[-1]
        self.assertIn("const staleStop = stopBinding.present && !loaded && !bridge", capture_expression)
        self.assertIn("injectionAttempted: false", capture_expression)
        self.assertIn("injectedStop: null", capture_expression)
        self.assertIn("before.bindings", expression)
        self.assertIn("delete window[snapshotKey]", expression)
        self.assertIn("before.gmStorage", expression)
        self.assertIn("if (before.injectionAttempted)", expression)
        self.assertIn("typeof before.injectedStop === 'function'", expression)
        self.assertIn("name === '__PRIMER_PP_STOP__' && before.staleStop", expression)
        stop_index = expression.index("if (temporaryStop) await temporaryStop.call(window)")
        dom_index = expression.index("if (!before.panelPresent)")
        storage_index = expression.index("const currentGmKeys = []")
        bindings_index = expression.index("for (const [name, binding] of Object.entries(before.bindings))")
        snapshot_index = expression.index("delete window[snapshotKey]")
        present_branch = re.search(
            r"else\s+if\s*\(\s*binding\.present\s*\)",
            expression[bindings_index:],
        )
        self.assertIsNotNone(present_branch)
        present_branch_index = bindings_index + present_branch.start()
        present_restore_index = expression.index(
            "Object.defineProperty(window, name, binding.descriptor)",
            present_branch_index,
        )
        absent_branch_index = expression.index("else", present_restore_index)
        absent_delete_index = expression.index("delete window[name]", absent_branch_index)
        self.assertLess(stop_index, dom_index)
        self.assertLess(dom_index, storage_index)
        self.assertLess(storage_index, bindings_index)
        self.assertLess(bindings_index, present_branch_index)
        self.assertLess(present_branch_index, present_restore_index)
        self.assertLess(present_restore_index, absent_branch_index)
        self.assertLess(absent_branch_index, absent_delete_index)
        self.assertLess(absent_delete_index, snapshot_index)
        self.assertLess(bindings_index, snapshot_index)
        self.assertTrue(kwargs["await_promise"])
        for evaluated, _options in client.calls:
            self.assertIsNone(re.search(r"\bGM_getValue\s*\(", evaluated))
            self.assertIsNone(re.search(r"\[\s*['\"]GM_getValue['\"]\s*\]\s*\(", evaluated))

        class ProbeClient:
            def __init__(self):
                self.calls = []
                self.values = iter((True, {"app": "Primer++", "token": "hidden"}))

            def eval_js(self, expression, **_kwargs):
                self.calls.append(expression)
                return next(self.values)

        probe_client = ProbeClient()
        self.assertEqual(exporter.read_probe(probe_client), {"app": "Primer++"})
        for evaluated in probe_client.calls:
            self.assertIsNone(re.search(r"\bGM_getValue\s*\(", evaluated))
            self.assertIsNone(re.search(r"\[\s*['\"]GM_getValue['\"]\s*\]\s*\(", evaluated))

    def test_injection_wrapper_cleans_stale_stop_and_captures_new_stop_before_loaded(self):
        exporter = module("export_adapter_probe")

        class InjectionClient:
            def __init__(self):
                self.calls = []
                self.bridge_checks = 0

            def eval_js(self, expression, **kwargs):
                self.calls.append((expression, kwargs))
                if expression == exporter.BRIDGE_EXPR:
                    self.bridge_checks += 1
                    return self.bridge_checks > 1
                if expression == "!!window.__PRIMER_PP_LOADED__":
                    return False
                return True

        with tempfile.TemporaryDirectory() as temp:
            repo_root = Path(temp)
            source_marker = "window.__STORE_TEST_SOURCE_RAN__ = true;"
            (repo_root / "primer-pp.user.js").write_text(source_marker, encoding="utf-8")
            client = InjectionClient()

            exporter.inject_userscript(client, repo_root=repo_root)

        expression = next(
            evaluated
            for evaluated, _kwargs in client.calls
            if source_marker in evaluated
        )
        stale_cleanup = expression.index("const removed = delete window.__PRIMER_PP_STOP__")
        attempted = expression.index("before.injectionAttempted = true")
        try_start = expression.index("try {", attempted)
        source = expression.index(source_marker)
        finally_start = expression.index("finally", source)
        injected_stop = expression.index("before.injectedStop = currentStop.value", finally_start)
        loaded = expression.index("window.__PRIMER_PP_LOADED__ = true", injected_stop)
        self.assertLess(stale_cleanup, attempted)
        self.assertLess(attempted, try_start)
        self.assertLess(try_start, source)
        self.assertLess(source, finally_start)
        self.assertLess(finally_start, injected_stop)
        self.assertLess(injected_stop, loaded)
        self.assertIn("stale userscript stop cannot be removed", expression)

    def test_actual_capture_and_restore_expressions_cover_page_state(self):
        capture = module("capture_store_shots")

        class StateClient:
            def __init__(self, fail_restore=False):
                self.calls = []
                self.events = []
                self.restored = []
                self.fail_restore = fail_restore

            def eval_js(self, expression, **_kwargs):
                self.calls.append(expression)
                self.events.append(("eval", expression))
                if "blockingOverlay" in expression:
                    return {
                        "detailsExpanded": False,
                        "tourSeen": None,
                        "onboardingSeen": "old",
                        "blockingOverlay": False,
                    }
                if self.fail_restore:
                    raise RuntimeError("restore failed")
                return True

            def get_viewport(self):
                return {"width": 900, "height": 700, "dpr": 1.25}

            def restore_viewport(self, state):
                self.events.append(("viewport", state))
                self.restored.append(state)

        client = StateClient()
        state = capture.capture_page_state(client)
        self.assertEqual(state["onboardingSeen"], "old")
        client.events.clear()
        capture.restore_page_state(client, state)
        restore_expression = client.calls[-1]
        self.assertIn("localStorage.removeItem(key)", restore_expression)
        self.assertIn("localStorage.setItem(key, value)", restore_expression)
        self.assertIn("expanded !== before.detailsExpanded", restore_expression)
        self.assertEqual(client.restored, [state["viewport"]])
        self.assertEqual([kind for kind, _value in client.events], ["eval", "viewport"])
        overlay_index = restore_expression.index("document.querySelectorAll")
        details_index = restore_expression.index("expanded !== before.detailsExpanded")
        storage_index = restore_expression.index("localStorage.removeItem(key)")
        self.assertLess(overlay_index, details_index)
        self.assertLess(details_index, storage_index)

        failing = StateClient(fail_restore=True)
        with self.assertRaises(RuntimeError):
            capture.restore_page_state(failing, state)
        self.assertEqual(failing.restored, [state["viewport"]])
        self.assertEqual([kind for kind, _value in failing.events], ["eval", "viewport"])

    def test_actual_theme_snapshot_and_restore_reselects_original_theme(self):
        theme = module("shoot_5_alt_theme")

        class ThemeClient:
            def __init__(self, fail_theme=False):
                self.calls = []
                self.events = []
                self.restored = []
                self.fail_theme = fail_theme

            def eval_js(self, expression, **_kwargs):
                self.calls.append(expression)
                self.events.append(("eval", expression))
                if "blockingOverlay" in expression:
                    return {
                        "detailsExpanded": True,
                        "tourSeen": "true",
                        "onboardingSeen": "old",
                        "blockingOverlay": False,
                    }
                if "const known = ['auto', 'glass', 'cyber', 'paper']" in expression:
                    return "glass"
                if "const needle = \"glass\"" in expression and self.fail_theme:
                    raise RuntimeError("theme restore failed")
                return True

            def get_viewport(self):
                return {"width": 900, "height": 700, "dpr": 1.0}

            def restore_viewport(self, state):
                self.events.append(("viewport", state))
                self.restored.append(state)

        client = ThemeClient()
        state = theme.capture_theme_state(client)
        self.assertEqual(state["theme"], "glass")
        client.events.clear()
        theme.restore_theme_state(client, state)
        self.assertTrue(any('const needle = "glass"' in expression for expression in client.calls))
        self.assertEqual(client.restored, [state["viewport"]])
        self.assertEqual([kind for kind, _value in client.events], ["eval", "eval", "viewport"])
        self.assertIn('const needle = "glass"', client.events[0][1])
        self.assertIn("localStorage.removeItem(key)", client.events[1][1])

        failing = ThemeClient(fail_theme=True)
        with self.assertRaises(RuntimeError):
            theme.restore_theme_state(failing, state)
        self.assertEqual([kind for kind, _value in failing.events], ["eval", "eval", "viewport"])
        self.assertIn("localStorage.setItem(key, value)", failing.events[1][1])
        self.assertEqual(failing.restored, [state["viewport"]])


class CaptureWorkflowTests(unittest.TestCase):
    def test_store_capture_restores_on_success_and_screenshot_failure(self):
        capture = module("capture_store_shots")
        with tempfile.TemporaryDirectory() as temp:
            restored = []
            client = FakeClient()
            with (
                patch.object(capture, "capture_page_state", return_value={"viewport": {"width": 900}}),
                patch.object(capture, "restore_page_state", side_effect=lambda _client, state: restored.append(state)),
                patch.object(capture, "prepare_page"),
                patch.object(capture, "set_details_expanded"),
                patch.object(capture, "click_details_action"),
                patch.object(capture, "close_active_modal"),
                patch.object(capture, "scroll_settings_to_bottom"),
            ):
                paths = capture.capture_store_shots(
                    temp,
                    mutate_page=True,
                    finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
                    cdp_factory=lambda *_args, **_kwargs: client,
                    sleep=lambda _seconds: None,
                )
            self.assertEqual(len(paths), 5)
            self.assertEqual(len(restored), 1)
            self.assertTrue(client.closed)

        with tempfile.TemporaryDirectory() as temp:
            restored = []
            client = FakeClient(fail_screenshot_at=3)
            with (
                patch.object(capture, "capture_page_state", return_value={"viewport": {"width": 900}}),
                patch.object(capture, "restore_page_state", side_effect=lambda _client, state: restored.append(state)),
                patch.object(capture, "prepare_page"),
                patch.object(capture, "set_details_expanded"),
                patch.object(capture, "click_details_action"),
                patch.object(capture, "close_active_modal"),
                patch.object(capture, "scroll_settings_to_bottom"),
            ):
                with self.assertRaises(RuntimeError):
                    capture.capture_store_shots(
                        temp,
                        mutate_page=True,
                        finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
                        cdp_factory=lambda *_args, **_kwargs: client,
                        sleep=lambda _seconds: None,
                    )
            self.assertEqual(len(restored), 1)
            self.assertTrue(client.closed)

    def test_store_capture_requires_opt_in_and_preflights_all_assets(self):
        capture = module("capture_store_shots")
        finder = Mock(side_effect=AssertionError("must not connect"))
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(PermissionError):
                capture.capture_store_shots(temp, finder=finder)
            finder.assert_not_called()

            existing = Path(temp) / capture.SHOT_NAMES[2]
            existing.write_bytes(b"protected")
            with self.assertRaises(FileExistsError):
                capture.capture_store_shots(temp, mutate_page=True, finder=finder)
            finder.assert_not_called()
            self.assertEqual(existing.read_bytes(), b"protected")

    def test_settings_and_theme_workflows_restore_after_failure(self):
        settings = module("shoot_settings")
        capture = module("capture_store_shots")
        with tempfile.TemporaryDirectory() as temp:
            client = FakeClient(fail_screenshot_at=2)
            restored = []
            with (
                patch.object(settings, "capture_page_state", return_value={"viewport": {"width": 900}}),
                patch.object(settings, "restore_page_state", side_effect=lambda _client, state: restored.append(state)),
                patch.object(settings, "set_details_expanded"),
                patch.object(settings, "click_details_action"),
                patch.object(settings, "scroll_settings_to_bottom"),
            ):
                with self.assertRaises(RuntimeError):
                    settings.capture_settings(
                        temp,
                        mutate_page=True,
                        finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
                        cdp_factory=lambda *_args, **_kwargs: client,
                        sleep=lambda _seconds: None,
                    )
            self.assertEqual(len(restored), 1)
            self.assertTrue(client.closed)

        theme = module("shoot_5_alt_theme")
        with tempfile.TemporaryDirectory() as temp:
            client = FakeClient(fail_screenshot_at=1)
            restored = []
            with (
                patch.object(theme, "capture_theme_state", return_value={"theme": "Glass", "viewport": {}}),
                patch.object(theme, "restore_theme_state", side_effect=lambda _client, state: restored.append(state)),
                patch.object(theme, "set_details_expanded"),
                patch.object(theme, "click_theme"),
            ):
                with self.assertRaises(RuntimeError):
                    theme.capture_theme_screenshot(
                        Path(temp) / "theme.png",
                        mutate_page=True,
                        finder=lambda *_args, **_kwargs: "ws://127.0.0.1:9222/page/id",
                        cdp_factory=lambda *_args, **_kwargs: client,
                        sleep=lambda _seconds: None,
                    )
            self.assertEqual(restored[0]["theme"], "Glass")
            self.assertTrue(client.closed)

    def test_cli_errors_do_not_echo_sensitive_exception_text(self):
        capture = module("capture_store_shots")
        stderr = io.StringIO()
        with patch.object(
            capture,
            "capture_store_shots",
            side_effect=RuntimeError("https://secret.example DOM password=secret"),
        ):
            with redirect_stderr(stderr):
                status = capture.main(["--mutate-page"])
        self.assertEqual(status, 1)
        output = stderr.getvalue()
        self.assertNotIn("secret.example", output)
        self.assertNotIn("password", output)


if __name__ == "__main__":
    unittest.main()
