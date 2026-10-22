"""The local e2e adapter must consume measured application activity."""
from pathlib import Path
import sys
import unittest

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/deploy"))
from local_spring import EndpointActivity


class LocalActivityContractTests(unittest.TestCase):
    def test_activity_requires_measured_counters(self) -> None:
        # Given: a response from an older endpoint without measured activity.
        payload = '{"backgroundDrained": true}'
        # When / Then: missing measurements must not become zero.
        with self.assertRaises(ValidationError):
            EndpointActivity.model_validate_json(payload)

    def test_activity_rejects_string_boolean_and_negative_count(self) -> None:
        # Given
        payloads = ('{"httpInFlight": 0, "backgroundInFlight": 0, "backgroundDrained": "true"}',
                    '{"httpInFlight": -1, "backgroundInFlight": 0, "backgroundDrained": true}')
        # When / Then
        for payload in payloads:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                EndpointActivity.model_validate_json(payload)

    def test_activity_preserves_running_request_count(self) -> None:
        # Given
        payload = '{"httpInFlight": 2, "backgroundInFlight": 1, "backgroundDrained": false}'
        # When
        result = EndpointActivity.model_validate_json(payload)
        # Then
        self.assertEqual(result.httpInFlight, 2)
        self.assertEqual(result.backgroundInFlight, 1)
        self.assertFalse(result.backgroundDrained)
