"""A real journal and loopback API boundary for application adapter tests."""
import hashlib
import json
import tempfile
import unittest
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import httpx2
from bluegreen.child_artifacts import serialize_artifact
from bluegreen.github_applications import GitHubApplications
from bluegreen.github_http import GitHubClients, GitHubHttp
from bluegreen.github_models import (
    Artifact,
    ArtifactRun,
    Artifacts,
    Repository,
    RepositoryPin,
    Runs,
    WorkflowRun,
    artifact_name,
    command_name,
)
from bluegreen.github_runs import GitHubContext
from bluegreen.models import (
    Action,
    Command,
    DeploymentState,
    Phase,
    Receipt,
    RunIdentity,
    Slot,
)
from controller_fakes import NEW_IMAGE, fixture
from github_server import ApiServer, Reply
from pydantic import SecretStr


class GitHubFixture(unittest.TestCase):
    def setUp(self) -> None:
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.topology, self.store, adapters = fixture(Path(directory))
        self.clock = adapters.clock
        self.status = adapters.apps.nodes[Slot.A]
        self.command = Command(command_id=uuid4(), deployment_id=uuid4(), parent_run_id=100, parent_attempt=1,
                               phase=Phase.PREPARING, action=Action.STATUS, host=self.topology.a,
                               boot_id=self.status.boot_id, image=NEW_IMAGE,
                               deadline=self.clock.now() + timedelta(seconds=60), authority=self.status.authority)
        self.run = RunIdentity(run_id=11, attempt=1, workflow=self.topology.control.workflow,
                               ref=self.topology.control.ref, sha=self.topology.control.sha, event="workflow_dispatch")
        self.state = self.store.create(DeploymentState(deployment_id=self.command.deployment_id, session_id=uuid4(),
                                                      parent_run_id=100, parent_attempt=1, image=NEW_IMAGE,
                                                      topology_digest=hashlib.sha256(self.topology.model_dump_json().encode()).hexdigest(),
                                                      pending=self.command))
        self.server = self.enterContext(ApiServer())
        self.root = "/repos/team/service"
        repository = Repository(id=7, full_name="team/service")
        self.api_run = WorkflowRun(id=11, run_attempt=1, workflow_id=5,
                                   path=f".github/workflows/{self.run.workflow}@{self.run.ref}",
                                   head_branch="control-v1", head_sha=self.run.sha, event="workflow_dispatch",
                                   display_title=command_name(self.command), created_at=self.clock.now(),
                                   status="completed", conclusion="success", repository=repository, head_repository=repository)
        self.server.route("GET", self.root, Reply(body=repository.model_dump_json().encode()))
        self.server.route("GET", f"{self.root}/git/ref/tags/control-v1", Reply(body=json.dumps({
            "ref": self.run.ref, "object": {"type": "commit", "sha": self.run.sha}}).encode()))
        self.server.route("GET", f"{self.root}/actions/workflows/{self.run.workflow}", Reply(body=json.dumps({
            "id": 5, "path": f".github/workflows/{self.run.workflow}", "state": "active"}).encode()))
        self.set_run(self.api_run)
        self.dispatch_path = f"{self.root}/actions/workflows/5/dispatches"
        self.server.route("POST", self.dispatch_path, Reply(body=b'{"workflow_run_id":11}'))
        self.list_path = f"{self.root}/actions/workflows/5/runs?event=workflow_dispatch&head_sha={self.run.sha}&per_page=100&page=1"
        self.set_matches((self.api_run,))
        self.receipt = Receipt(schema_version=1, command=self.command, run=self.run, success=True, status=self.status)
        self.download_requests: list[httpx2.Request] = []
        self.zip_payload = self.zip(serialize_artifact(self.receipt, None))
        self.download_status = 200
        self.download_hook = lambda: None

        def download(request: httpx2.Request) -> httpx2.Response:
            self.download_requests.append(request)
            self.download_hook()
            return httpx2.Response(self.download_status, content=self.zip_payload)

        reads = self.enterContext(httpx2.Client(base_url=self.server.url, trust_env=False))
        writes = self.enterContext(httpx2.Client(base_url=self.server.url, trust_env=False))
        downloads = self.enterContext(httpx2.Client(transport=httpx2.MockTransport(download), trust_env=False))
        self.api = GitHubHttp(GitHubClients(reads, writes, downloads), SecretStr("fixture-token"), self.clock)
        pin = RepositoryPin(id=7, full_name="team/service", download_hosts=("results.example",))
        self.apps = GitHubApplications(self.api, GitHubContext(pin, self.topology), self.store)
        self.artifact_path = f"{self.root}/actions/runs/11/artifacts?per_page=100&page=1"
        self.artifact = Artifact(id=9, name=artifact_name(self.command, 11), size_in_bytes=len(self.zip_payload),
                                 expired=False, digest=f"sha256:{hashlib.sha256(self.zip_payload).hexdigest()}",
                                 created_at=self.clock.now(), expires_at=self.clock.now() + timedelta(hours=1),
                                 workflow_run=ArtifactRun(id=11, repository_id=7, head_repository_id=7,
                                                          head_branch="control-v1", head_sha=self.run.sha))
        self.set_artifacts((self.artifact,))
        self.download_path = f"{self.root}/actions/artifacts/9/zip"
        self.server.route("GET", self.download_path, Reply(302, location="https://results.example/signed?secret=fixture"))

    @staticmethod
    def zip(payload: bytes, name: str = "child-result.json") -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr(name, payload)
        return buffer.getvalue()

    def bind(self) -> None:
        current = self.store.read()
        assert current is not None
        self.state = self.store.save(current, current.model_copy(update={"pending_run": self.run,
                                                                         "revision": current.revision + 1}))

    def set_run(self, run: WorkflowRun) -> None:
        for suffix in ("", "/attempts/1"):
            self.server.route("GET", f"{self.root}/actions/runs/11{suffix}", Reply(body=run.model_dump_json().encode()))

    def set_matches(self, runs: tuple[WorkflowRun, ...]) -> None:
        self.server.route("GET", self.list_path, Reply(body=Runs(total_count=len(runs), workflow_runs=runs).model_dump_json().encode()))

    def set_artifacts(self, artifacts: tuple[Artifact, ...]) -> None:
        self.server.route("GET", self.artifact_path,
                          Reply(body=Artifacts(total_count=len(artifacts), artifacts=artifacts).model_dump_json().encode()))
