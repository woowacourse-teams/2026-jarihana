import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "prepare-aws.sh"


class PrepareAwsTest(unittest.TestCase):
    def run_prepare(self, **env_overrides):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            calls = temp / "calls.log"
            existing = env_overrides.pop("MOCK_EXISTING_GROUPS", "")
            mock_bin = temp / "bin"
            mock_bin.mkdir()

            (mock_bin / "curl").write_text(textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                printf 'curl %s\\n' "$*" >> "${MOCK_CALLS_FILE}"
                case "${*: -1}" in
                  */api/token)
                    printf 'token'
                    ;;
                  */dynamic/instance-identity/document)
                    printf '{"instanceId":"%s","region":"%s"}' "${MOCK_INSTANCE_ID:-i-expected}" "${MOCK_REGION:-ap-northeast-2}"
                    ;;
                  *)
                    printf 'unexpected curl call: %s\\n' "$*" >&2
                    exit 9
                    ;;
                esac
                """
            ))
            (mock_bin / "aws").write_text(textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                printf 'aws %s\\n' "$*" >> "${MOCK_CALLS_FILE}"
                if [[ "$1 $2" == "sts get-caller-identity" ]]; then
                  printf '{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:role/test"}\\n'
                  exit 0
                fi
                if [[ "$1 $2" == "logs describe-log-groups" ]]; then
                  group=""
                  previous=""
                  for arg in "$@"; do
                    if [[ "${previous}" == "--log-group-name-prefix" ]]; then
                      group="${arg}"
                      break
                    fi
                    previous="${arg}"
                  done
                  if [[ ",${MOCK_EXISTING_GROUPS}," == *",${group},"* ]]; then
                    printf '%s\\n' "${group}"
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "logs create-log-group" ]]; then
                  if [[ "${MOCK_AWS_CREATE_FAIL:-}" == "1" ]]; then
                    printf 'create failed\\n' >&2
                    exit 42
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "logs put-retention-policy" ]]; then
                  exit 0
                fi
                printf 'unexpected aws call: %s\\n' "$*" >&2
                exit 8
                """
            ))
            for command in mock_bin.iterdir():
                command.chmod(0o755)

            env = os.environ.copy()
            for key in (
                "TARGET_ENVIRONMENT",
                "APPLICATION_LOG_RETENTION_DAYS",
                "CLOUDWATCH_LOG_GROUP",
                "MOCK_AWS_CREATE_FAIL",
                "MOCK_EXISTING_GROUPS",
                "MOCK_INSTANCE_ID",
                "MOCK_REGION",
            ):
                env.pop(key, None)
            env.update({
                "PATH": f"{mock_bin}{os.pathsep}{env['PATH']}",
                "MOCK_CALLS_FILE": str(calls),
                "MOCK_EXISTING_GROUPS": existing,
                "EXPECTED_INSTANCE_ID": "i-expected",
            })
            env.update(env_overrides)

            result = subprocess.run(
                ["bash", str(SCRIPT)],
                cwd=SCRIPT.parents[2],
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            call_lines = calls.read_text().splitlines() if calls.exists() else []
            return result, call_lines

    def aws_calls(self, call_lines):
        return [line for line in call_lines if line.startswith("aws ")]

    def test_dev_creates_shared_metrics_and_dev_application_groups(self):
        result, calls = self.run_prepare(TARGET_ENVIRONMENT="dev")

        self.assertEqual(result.returncode, 0, result.stderr)
        aws_calls = self.aws_calls(calls)
        self.assertIn("aws logs create-log-group --log-group-name /jarihana/current/prometheus", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /jarihana/current/prometheus --retention-in-days 7", aws_calls)
        self.assertIn("aws logs create-log-group --log-group-name /jarihana/dev/application", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /jarihana/dev/application --retention-in-days 14", aws_calls)
        self.assertNotIn("aws logs create-log-group --log-group-name /jarihana/prod/application", aws_calls)

    def test_prod_uses_selected_application_group_with_custom_retention(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="prod",
            APPLICATION_LOG_RETENTION_DAYS="30",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        aws_calls = self.aws_calls(calls)
        self.assertIn("aws logs create-log-group --log-group-name /jarihana/prod/application", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /jarihana/prod/application --retention-in-days 30", aws_calls)
        self.assertNotIn("aws logs create-log-group --log-group-name /jarihana/dev/application", aws_calls)

    def test_unset_environment_defaults_to_prod_application_group(self):
        result, calls = self.run_prepare()

        self.assertEqual(result.returncode, 0, result.stderr)
        aws_calls = self.aws_calls(calls)
        self.assertIn("aws logs create-log-group --log-group-name /jarihana/prod/application", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /jarihana/prod/application --retention-in-days 14", aws_calls)

    def test_empty_override_uses_default_application_group(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="dev",
            CLOUDWATCH_LOG_GROUP="",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        aws_calls = self.aws_calls(calls)
        self.assertIn("aws logs create-log-group --log-group-name /jarihana/dev/application", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /jarihana/dev/application --retention-in-days 14", aws_calls)

    def test_existing_groups_are_not_created_but_retention_is_updated(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="dev",
            MOCK_EXISTING_GROUPS="/jarihana/current/prometheus,/jarihana/dev/application",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        aws_calls = self.aws_calls(calls)
        self.assertNotIn("aws logs create-log-group --log-group-name /jarihana/current/prometheus", aws_calls)
        self.assertNotIn("aws logs create-log-group --log-group-name /jarihana/dev/application", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /jarihana/current/prometheus --retention-in-days 7", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /jarihana/dev/application --retention-in-days 14", aws_calls)

    def test_override_application_group_is_validated_and_used(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="prod",
            CLOUDWATCH_LOG_GROUP="/custom/app-log_#1",
            APPLICATION_LOG_RETENTION_DAYS="60",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        aws_calls = self.aws_calls(calls)
        self.assertIn("aws logs create-log-group --log-group-name /custom/app-log_#1", aws_calls)
        self.assertIn("aws logs put-retention-policy --log-group-name /custom/app-log_#1 --retention-in-days 60", aws_calls)

    def test_invalid_environment_is_rejected_before_external_calls(self):
        result, calls = self.run_prepare(TARGET_ENVIRONMENT="stage")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unsupported TARGET_ENVIRONMENT", result.stderr)
        self.assertEqual(calls, [])

    def test_invalid_retention_is_rejected_before_external_calls(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="prod",
            APPLICATION_LOG_RETENTION_DAYS="365",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unsupported APPLICATION_LOG_RETENTION_DAYS", result.stderr)
        self.assertEqual(calls, [])

    def test_invalid_override_group_is_rejected_before_external_calls(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="prod",
            CLOUDWATCH_LOG_GROUP="aws/bad",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unsupported CLOUDWATCH_LOG_GROUP", result.stderr)
        self.assertEqual(calls, [])

    def test_reserved_metrics_group_override_is_rejected_before_external_calls(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="prod",
            CLOUDWATCH_LOG_GROUP="/jarihana/current/prometheus",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Reserved CLOUDWATCH_LOG_GROUP", result.stderr)
        self.assertEqual(calls, [])

    def test_expected_instance_mismatch_stops_before_aws_calls(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="prod",
            MOCK_INSTANCE_ID="i-other",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to operate on unexpected EC2", result.stderr)
        self.assertEqual(self.aws_calls(calls), [])

    def test_aws_create_failure_is_propagated(self):
        result, calls = self.run_prepare(
            TARGET_ENVIRONMENT="prod",
            MOCK_AWS_CREATE_FAIL="1",
        )

        self.assertEqual(result.returncode, 42)
        self.assertIn("create failed", result.stderr)
        self.assertIn("aws logs create-log-group --log-group-name /jarihana/current/prometheus", self.aws_calls(calls))


if __name__ == "__main__":
    unittest.main()
