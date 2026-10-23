"""Read a coordinator journal through a host-key-pinned, forced-command SSH key."""
import subprocess
import tempfile
from dataclasses import dataclass
from ipaddress import IPv4Address
from pathlib import Path
from typing import Final

from pydantic import ValidationError

from .models import DeploymentState
from .ports import DeploymentFailure

MAX_GRANT_BYTES: Final = 65536


@dataclass(frozen=True, slots=True)
class SshJournal:
    address: IPv4Address
    key: Path
    known_hosts: Path

    def read(self) -> DeploymentState:
        """Open a new authenticated connection for every gate check; never reuse a snapshot."""
        command = (
            "ssh", "-F", "/dev/null", "-T", "-i", str(self.key.resolve()),
            "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
            "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={self.known_hosts.resolve()}",
            "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ClearAllForwardings=yes",
            "-o", "ConnectTimeout=3", "-o", "ConnectionAttempts=1",
            "-o", "ControlMaster=no", "-o", "ControlPath=none",
            f"jarihana-grant@{self.address}", "read-current-grant",
        )
        try:
            with tempfile.TemporaryFile() as output:
                result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=output,
                                        stderr=subprocess.DEVNULL, timeout=10, check=False)
                if result.returncode != 0:
                    raise DeploymentFailure("current coordinator grant could not be fetched")
                _ = output.seek(0)
                payload = output.read(MAX_GRANT_BYTES + 1)
        except (OSError, subprocess.TimeoutExpired):
            raise DeploymentFailure("coordinator grant connection failed") from None
        if len(payload) > MAX_GRANT_BYTES:
            raise DeploymentFailure("coordinator grant exceeds its size limit")
        try:
            return DeploymentState.model_validate_json(payload)
        except ValidationError:
            raise DeploymentFailure("coordinator grant failed schema validation") from None
