import importlib.util
import io
import json
import unittest
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch


SCRIPT = Path(__file__).parents[2] / "scripts" / "deploy" / "app-operation.py"
SPEC = importlib.util.spec_from_file_location("app_operation", SCRIPT)
app_operation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(app_operation)

TOKEN = "test-worker-control-token-with-at-least-32-bytes"
COMMAND = {
    "deploymentId": "a852fb21-f613-42ec-b960-b60d31519ee0",
    "epoch": 4,
    "commandId": "213ac97d-c281-47fd-bfc5-5891765eff17",
    "targetHostId": "prod-a",
    "targetBootId": "85c12362-617d-4fd9-a45e-6fcdde5e8e99",
    "expectedPhase": "HANDOFF",
    "deadline": "2026-10-22T19:30:00",
    "expectedRevision": 12,
}


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class AppOperationTest(unittest.TestCase):
    def test_status_uses_fixed_loopback_url_and_machine_token(self):
        response_body = b'{"worker":{"state":"PAUSED"}}'
        with patch.object(app_operation.urllib.request, "urlopen", return_value=FakeResponse(response_body)) as urlopen:
            result = app_operation.execute("status", None, TOKEN)

        request = urlopen.call_args.args[0]
        self.assertEqual("http://127.0.0.1:8081/actuator/workercontrol", request.full_url)
        self.assertEqual("GET", request.method)
        self.assertEqual(TOKEN, request.get_header("X-jarihana-worker-control-token"))
        self.assertEqual({"worker": {"state": "PAUSED"}}, result)

    def test_phase_sends_only_validated_json_to_fixed_operation_path(self):
        payload = {**COMMAND, "nextPhase": "OBSERVE"}
        with patch.object(app_operation.urllib.request, "urlopen", return_value=FakeResponse(b'{"success":true}')) as urlopen:
            result = app_operation.execute("phase", payload, TOKEN)

        request = urlopen.call_args.args[0]
        self.assertEqual("http://127.0.0.1:8081/actuator/workercontrol/phase", request.full_url)
        self.assertEqual("POST", request.method)
        self.assertEqual(payload, json.loads(request.data))
        self.assertEqual({"success": True}, result)

    def test_unknown_operation_and_extra_command_fields_are_rejected_without_network_access(self):
        with patch.object(app_operation.urllib.request, "urlopen") as urlopen:
            with self.assertRaises(app_operation.InputError):
                app_operation.execute("shell", COMMAND, TOKEN)
            with self.assertRaises(app_operation.InputError):
                app_operation.execute("activate", {**COMMAND, "shell": "echo unsafe"}, TOKEN)
            with self.assertRaises(app_operation.InputError):
                app_operation.execute("phase", {**COMMAND, "nextPhase": []}, TOKEN)

        urlopen.assert_not_called()

    def test_phase_requires_next_phase_and_machine_token_must_be_long_enough(self):
        with patch.object(app_operation.urllib.request, "urlopen") as urlopen:
            with self.assertRaises(app_operation.InputError):
                app_operation.execute("phase", COMMAND, TOKEN)
            with self.assertRaises(app_operation.InputError):
                app_operation.execute("status", None, "short")

        urlopen.assert_not_called()

    def test_http_conflict_exits_with_failure_without_printing_machine_token(self):
        rejection = HTTPError(app_operation.BASE_URL + "/activate", 409, "Conflict", None, io.BytesIO(b""))
        stderr = io.StringIO()
        with patch.object(app_operation.urllib.request, "urlopen", side_effect=rejection):
            with patch.object(app_operation.sys, "stdin", io.StringIO(json.dumps(COMMAND))):
                with patch.object(app_operation.sys, "stderr", stderr):
                    with patch.dict(app_operation.os.environ, {"WORKER_CONTROL_TOKEN": TOKEN}):
                        result = app_operation.main(["activate"])

        self.assertEqual(1, result)
        self.assertIn("HTTP 409", stderr.getvalue())
        self.assertNotIn(TOKEN, stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
