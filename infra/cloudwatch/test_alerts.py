import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("alerts.py")
SPEC = importlib.util.spec_from_file_location("cloudwatch_alerts", MODULE_PATH)
alerts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(alerts)


class AlertTemplateTest(unittest.TestCase):

    def setUp(self):
        self.template = alerts.template()
        self.resources = self.template["Resources"]

    def test_http_5xx_alarms_use_the_environment_log_groups(self):
        expected_groups = {
            "Prod": "/jarihana/prod/application",
            "Dev": "/jarihana/dev/application",
        }

        for prefix, log_group in expected_groups.items():
            metric_filter = self.resources[f"{prefix}Http5xxLogFilter"]
            properties = metric_filter["Properties"]

            self.assertEqual(log_group, properties["LogGroupName"])
            self.assertEqual(alerts.HTTP_5XX_LOG_PATTERN, properties["FilterPattern"])
            self.assertEqual(
                0,
                properties["MetricTransformations"][0]["DefaultValue"],
            )
            self.assertIn(f"{prefix}Http5xxLogAlarm", self.resources)
            self.assertNotIn(f"{prefix}Http5xxMetricAlarm", self.resources)

    def test_dev_switch_controls_all_dev_application_resources(self):
        for resource_name in (
            "DevHttp5xxLogFilter",
            "DevHttp5xxLogAlarm",
            "DevApplicationCpuHigh",
            "DevGcOverheadHigh",
            "DevAppTelemetryMissing",
        ):
            self.assertEqual(
                "EnableDevApplicationAlarms",
                self.resources[resource_name]["Condition"],
            )

        self.assertNotIn("Condition", self.resources["ProdHttp5xxLogFilter"])
        self.assertEqual(
            "true",
            self.template["Parameters"]["EnableDevApplicationAlarms"]["Default"],
        )

    def test_deferred_log_parameters_are_removed(self):
        parameters = self.template["Parameters"]

        for parameter_name in (
            "ProdBackendLogGroupName",
            "ProdHttp5xxLogPattern",
            "DevBackendLogGroupName",
            "DevHttp5xxLogPattern",
        ):
            self.assertNotIn(parameter_name, parameters)


if __name__ == "__main__":
    unittest.main()
