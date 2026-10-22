"""Accept only the bounded, digest-verified ZIP belonging to the exact child run."""
import hashlib
import stat
import zlib
from dataclasses import dataclass
from io import BytesIO
from zipfile import BadZipFile, ZipFile

from .child_artifacts import MAX_ARTIFACT_BYTES
from .github_http import GitHubError, GitHubHttp
from .github_models import Artifact, Artifacts, artifact_name, parse_response
from .github_runs import GitHubContext
from .models import Command, RunIdentity
from .ports import DeploymentFailure


@dataclass(frozen=True, slots=True)
class ArtifactRequest:
    command: Command
    run: RunIdentity


def unpack_result(payload: bytes, artifact: Artifact) -> bytes:
    if (len(payload) != artifact.size_in_bytes
            or f"sha256:{hashlib.sha256(payload).hexdigest()}" != artifact.digest):
        raise DeploymentFailure("artifact ZIP size or digest does not match")
    try:
        with ZipFile(BytesIO(payload)) as archive:
            entries = archive.infolist()
            if len(entries) != 1:
                raise DeploymentFailure("child artifact must contain exactly one result file")
            entry = entries[0]
            mode = entry.external_attr >> 16
            if (entry.filename != "child-result.json" or entry.is_dir() or entry.flag_bits & 1
                    or stat.S_ISLNK(mode) or entry.file_size > MAX_ARTIFACT_BYTES):
                raise DeploymentFailure("child artifact ZIP entry is unsafe or oversized")
            with archive.open(entry) as stream:
                result = stream.read(MAX_ARTIFACT_BYTES + 1)
            if len(result) > MAX_ARTIFACT_BYTES:
                raise DeploymentFailure("child result exceeds its size limit")
            return result
    except (BadZipFile, RuntimeError, NotImplementedError, EOFError, zlib.error):
        raise DeploymentFailure("child artifact ZIP could not be read") from None


class GitHubArtifacts:
    def __init__(self, api: GitHubHttp, context: GitHubContext) -> None:
        self.api: GitHubHttp = api
        self.context: GitHubContext = context

    def fetch(self, request: ArtifactRequest) -> bytes | None:
        command, run = request.command, request.run
        matches: list[Artifact] = []
        seen: set[int] = set()
        total: int | None = None
        for page in range(1, 11):
            path = f"{self.context.root}/actions/runs/{run.run_id}/artifacts?per_page=100&page={page}"
            result = parse_response(self.api.get(path, command.deadline), Artifacts)
            if total is None:
                total = result.total_count
            if result.total_count != total or total > 1000:
                raise DeploymentFailure("GitHub artifact listing is unstable or exceeds its limit")
            for artifact in result.artifacts:
                if artifact.id in seen:
                    raise DeploymentFailure("GitHub artifact listing repeats an artifact")
                seen.add(artifact.id)
                if artifact.name == artifact_name(command, run.run_id):
                    matches.append(artifact)
            if len(seen) == total:
                break
            if not result.artifacts or len(seen) > total:
                raise DeploymentFailure("GitHub artifact listing is incomplete")
        if len(seen) != total or len(matches) > 1:
            raise DeploymentFailure("child artifact listing is incomplete or ambiguous")
        if not matches:
            return None
        artifact = matches[0]
        origin = artifact.workflow_run
        repository, release = self.context.repository, self.context.topology.control
        if (artifact.expired or artifact.expires_at <= self.api.clock.now()
                or artifact.created_at > self.api.clock.now() or origin.id != run.run_id
                or origin.repository_id != repository.id or origin.head_repository_id != repository.id
                or origin.head_branch != release.ref.removeprefix("refs/tags/") or origin.head_sha != release.sha):
            raise DeploymentFailure("child artifact source is expired or does not match the run")
        reply = self.api.api(f"{self.context.root}/actions/artifacts/{artifact.id}/zip", command.deadline)
        if reply.status != 302:
            raise GitHubError(reply.status)
        if reply.location is None:
            raise DeploymentFailure("artifact redirect is missing its location")
        return unpack_result(self.api.download(reply.location, command.deadline, repository), artifact)
