"""Typed GitHub API boundaries; unrelated upstream fields may evolve."""
from typing import Annotated, ClassVar, Final, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    ValidationError,
)

from .models import Command, Digest, Record
from .ports import DeploymentFailure

PositiveId = Annotated[int, Field(strict=True, gt=0)]
Sha = Annotated[str, Field(pattern=r"^[a-f0-9]{40}$")]
MAX_ZIP_BYTES: Final = 262144


class GitHubRecord(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore", strict=True)


class RepositoryPin(Record):
    full_name: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$")]
    id: PositiveId
    download_hosts: tuple[Annotated[str, Field(pattern=r"^[a-z0-9]+(?:[.-][a-z0-9]+)*$")], ...]
    allow_github_result_storage: StrictBool = False


class Repository(GitHubRecord):
    id: PositiveId
    full_name: str


class GitObject(GitHubRecord):
    sha: Sha
    type: Literal["commit", "tag"]


class GitRef(GitHubRecord):
    ref: str
    object: GitObject


class Tag(GitHubRecord):
    object: GitObject


class Workflow(GitHubRecord):
    id: PositiveId
    path: str
    state: Literal["active"]


class DispatchResult(GitHubRecord):
    workflow_run_id: PositiveId


class WorkflowRun(GitHubRecord):
    id: PositiveId
    run_attempt: PositiveId
    workflow_id: PositiveId
    path: str
    head_branch: str
    head_sha: Sha
    event: str
    display_title: str
    created_at: AwareDatetime
    status: str
    conclusion: str | None
    repository: Repository
    head_repository: Repository


class Runs(GitHubRecord):
    total_count: Annotated[int, Field(ge=0)]
    workflow_runs: tuple[WorkflowRun, ...]


class ArtifactRun(GitHubRecord):
    id: PositiveId
    repository_id: PositiveId
    head_repository_id: PositiveId
    head_branch: str
    head_sha: Sha


class Artifact(GitHubRecord):
    id: PositiveId
    name: str
    size_in_bytes: Annotated[int, Field(ge=1, le=MAX_ZIP_BYTES)]
    expired: bool
    digest: Digest
    created_at: AwareDatetime
    expires_at: AwareDatetime
    workflow_run: ArtifactRun


class Artifacts(GitHubRecord):
    total_count: Annotated[int, Field(ge=0)]
    artifacts: tuple[Artifact, ...]


def parse_response[T: BaseModel](payload: bytes, model: type[T]) -> T:
    """Do not include upstream payloads or validation values in failure output."""
    try:
        return model.model_validate_json(payload)
    except ValidationError:
        raise DeploymentFailure("GitHub response failed schema validation") from None


def command_name(command: Command) -> str:
    return f"bg-{command.deployment_id}-{command.command_id}"


def artifact_name(command: Command, run_id: int) -> str:
    return f"child-result-{command.deployment_id}-{command.command_id}-{run_id}-1"
