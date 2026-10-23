from typing import Final

from pydantic import Field, SecretStr, StrictBool, ValidationError

from .docker_shutdown import ContainerPin
from .nginx_switch import Runner
from .ports import DeploymentFailure
from .worker_settings import WorkerSettings

PROFILE_FORMAT: Final = '''{
"container_id":{{json .Id}},"image_id":{{json .Image}},
"started_at":{{json .State.StartedAt}},"restart_count":{{json .RestartCount}},
"running":{{json .State.Running}},"environment":{{json .Config.Env}}
}'''
DB_URL: Final = "jdbc:postgresql://jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com:5432/jarihana_dev?sslmode=require"


class WorkerProfile(ContainerPin):
    running: StrictBool
    environment: tuple[SecretStr, ...] = Field(repr=False)


def verify_profile(settings: WorkerSettings, runner: Runner) -> None:
    try:
        profile = WorkerProfile.model_validate_json(runner.run((
            "docker", "inspect", "--format", PROFILE_FORMAT, "--", settings.container.container_id)))
    except (ValidationError, OSError, DeploymentFailure):
        raise DeploymentFailure("worker rehearsal container profile could not be verified") from None
    if (ContainerPin.model_validate(profile.model_dump(exclude={"environment", "running"})) != settings.container
            or not profile.running):
        raise DeploymentFailure("worker rehearsal container generation differs")
    values: dict[str, str] = {}
    for entry in profile.environment:
        name, separator, value = entry.get_secret_value().partition("=")
        if not separator or name in values:
            raise DeploymentFailure("worker rehearsal environment is ambiguous")
        values[name] = value
    expected = {
        "DB_URL": DB_URL, "APP_VERSION": settings.expected_image, "PUSH_ENABLED": "false",
        "PUSH_WORKER_ENABLED": "false", "PUSH_WORKER_CONTROL_ENABLED": "true",
        "PUSH_WORKER_ENVIRONMENT": settings.topology.environment,
        "PUSH_WORKER_HOST_ID": settings.topology.b.host_id,
    }
    if any(values.get(name) != value for name, value in expected.items()):
        raise DeploymentFailure("worker rehearsal requires the fixed dev DB and disabled delivery/scheduler")
