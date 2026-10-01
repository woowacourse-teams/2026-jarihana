import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("discord-monitor.py")
SPEC = importlib.util.spec_from_file_location("discord_monitor", MODULE_PATH)
monitor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(monitor)


class DiscordMonitorTest(unittest.TestCase):

    def test_relevant_alarms_allowlist_names_and_states(self):
        response = {
            "MetricAlarms": [
                {"AlarmName": "[DEV] error", "StateValue": "ALARM", "StateUpdatedTimestamp": "t1"},
                {"AlarmName": "[PROD] healthy", "StateValue": "OK", "StateUpdatedTimestamp": "t2"},
                {"AlarmName": "[EC2] host", "StateValue": "INSUFFICIENT_DATA", "StateUpdatedTimestamp": "t3"},
                {"AlarmName": "unrelated", "StateValue": "ALARM", "StateUpdatedTimestamp": "t4"},
                {"AlarmName": "[DEV] unknown", "StateValue": "BROKEN", "StateUpdatedTimestamp": "t5"},
            ]
        }

        self.assertEqual(
            {
                "[DEV] error": {"state": "ALARM", "updated": "t1"},
                "[EC2] host": {"state": "INSUFFICIENT_DATA", "updated": "t3"},
                "[PROD] healthy": {"state": "OK", "updated": "t2"},
            },
            monitor.relevant_alarms(response),
        )

    def test_only_alarm_entry_and_recovery_are_notified(self):
        self.assertTrue(monitor.state_transition("OK", "ALARM"))
        self.assertTrue(monitor.state_transition("INSUFFICIENT_DATA", "ALARM"))
        self.assertTrue(monitor.state_transition("ALARM", "OK"))
        self.assertFalse(monitor.state_transition("OK", "OK"))
        self.assertFalse(monitor.state_transition("ALARM", "INSUFFICIENT_DATA"))

    def test_first_run_initializes_without_sending(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            sent = []
            original_fetch = monitor.fetch_alarms
            original_send = monitor.send_to_discord
            try:
                monitor.fetch_alarms = lambda region: {
                    "MetricAlarms": [{
                        "AlarmName": "[DEV] error",
                        "StateValue": "ALARM",
                        "StateUpdatedTimestamp": "t1",
                    }]
                }
                monitor.send_to_discord = lambda webhook, payload: sent.append(payload)
                monitor.run_once("ap-northeast-2", state_path, "https://discord.test/webhook")
            finally:
                monitor.fetch_alarms = original_fetch
                monitor.send_to_discord = original_send

            self.assertEqual([], sent)
            self.assertEqual("ALARM", monitor.load_state(state_path)["[DEV] error"]["state"])

    def test_transition_sends_a_safe_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            monitor.save_state(state_path, {
                "[DEV] error": {"state": "OK", "updated": "old"},
            })
            sent = []
            original_fetch = monitor.fetch_alarms
            original_send = monitor.send_to_discord
            try:
                monitor.fetch_alarms = lambda region: {
                    "MetricAlarms": [{
                        "AlarmName": "[DEV] error",
                        "StateValue": "ALARM",
                        "StateUpdatedTimestamp": "new",
                    }]
                }
                monitor.send_to_discord = lambda webhook, payload: sent.append((webhook, payload))
                monitor.run_once("ap-northeast-2", state_path, "https://discord.test/webhook")
            finally:
                monitor.fetch_alarms = original_fetch
                monitor.send_to_discord = original_send

            self.assertEqual(1, len(sent))
            self.assertEqual("https://discord.test/webhook", sent[0][0])
            self.assertEqual("**CloudWatch ALARM** | [DEV] error\nnew", sent[0][1]["content"])
            self.assertEqual({"parse": []}, sent[0][1]["allowed_mentions"])


if __name__ == "__main__":
    unittest.main()
