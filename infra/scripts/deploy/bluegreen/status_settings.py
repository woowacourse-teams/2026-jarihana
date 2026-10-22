"""Administrator-owned configuration and secret-file boundary for the STATUS child."""
import os
import stat
from ipaddress import IPv4Address
from pathlib import Path

from pydantic import Field, SecretStr, model_validator

from .github_models import RepositoryPin
from .models import Record, Topology
from .ports import DeploymentFailure


class StatusSettings(Record):
    repository: RepositoryPin
    topology: Topology
    coordinator_address: IPv4Address
    journal_key: Path
    known_hosts: Path
    worker_token_file: Path
    management_port: int = Field(ge=1, le=65535)

    @model_validator(mode="after")
    def rehearsal_only(self) -> "StatusSettings":
        if (self.repository.full_name != "woowacourse-teams/2026-jarihana"
                or self.topology.environment != "dev-rehearsal"
                or self.topology.coordinator_instance_id != "i-01449d708ceef309b"
                or self.topology.a.instance_id != "i-0a43bb4e0154e0f1f"
                or self.topology.b.instance_id != "i-0430ff91d1af2fb37"
                or str(self.coordinator_address) != "10.0.3.51"):
            raise DeploymentFailure("STATUS configuration is not the allowlisted dev rehearsal")
        if not all(path.is_absolute() for path in (self.journal_key, self.known_hosts, self.worker_token_file)):
            raise DeploymentFailure("STATUS configuration requires absolute local paths")
        return self


def root_file(path: Path, limit: int, *, private: bool = False) -> bytes:
    with path.open("rb") as handle:
        info = os.fstat(handle.fileno())
        if (info.st_uid != 0 or not stat.S_ISREG(info.st_mode) or info.st_mode & 0o022
                or (private and info.st_mode & 0o007)):
            raise DeploymentFailure("STATUS configuration or secret permissions are invalid")
        payload = handle.read(limit + 1)
    if len(payload) > limit:
        raise DeploymentFailure("STATUS configuration or secret exceeds its size limit")
    return payload


def worker_token(settings: StatusSettings) -> SecretStr:
    token = root_file(settings.worker_token_file, 4096, private=True).decode("ascii").strip()
    if len(token.encode()) < 32:
        raise DeploymentFailure("STATUS worker token is invalid")
    return SecretStr(token)
