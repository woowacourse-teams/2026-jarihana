from collections.abc import Callable

from bluegreen.child_artifacts import ChildArtifact
from bluegreen.child_execution import ChildContext, MachineIdentity
from bluegreen.child_worker import worker_artifact
from bluegreen.github_runs import GitHubRuns
from bluegreen.models import Phase
from bluegreen.ports import DeploymentFailure
from bluegreen.spring_status import (
    Activity,
    Identity,
    SpringStatus,
    Worker,
    WorkerAuthority,
)
from bluegreen.spring_worker import SpringWorker
from github_fixture import GitHubFixture
from github_server import ApiServer, Reply
from pydantic import SecretStr
from test_child_worker import WorkerContext


class ChildWorkerReadTest(GitHubFixture):
    def prepare_read(self) -> WorkerContext:
        self.bind()
        self.set_run(self.api_run.model_copy(update={"status": "in_progress", "conclusion": None}))
        management = self.enterContext(ApiServer())
        status = self.receipt.status
        authority = status.authority
        assert authority.deployment_id is not None and authority.owner_host is not None and authority.owner_boot is not None
        raw = SpringStatus(version=status.image, environment=status.environment,
            identity=Identity(hostId=status.host_id, bootId=status.boot_id),
            worker=Worker(state="ACTIVE", inFlight=2, unresolved=0),
            authority=WorkerAuthority(environment=status.environment, deploymentId=authority.deployment_id,
                epoch=authority.epoch, revision=authority.revision, authorityRevision=1, phase=authority.phase,
                owner=Identity(hostId=authority.owner_host, bootId=authority.owner_boot), status=authority.status),
            activity=Activity(httpInFlight=1, backgroundInFlight=2, backgroundDrained=False))
        management.route("GET", "/actuator/workercontrol", Reply(body=raw.model_dump_json().encode()))
        management.route("GET", "/actuator/health/readiness", Reply(body=b'{"status":"UP"}'))
        machine = MachineIdentity(environment=status.environment, host_id=status.host_id, instance_id=status.instance_id)
        control = SpringWorker(self.api.clients.writes, management.server.server_port,
            SecretStr("local-read-fixture-token-0123456789"), machine, self.clock)
        return WorkerContext(management, machine, control, ChildContext(self.topology, self.receipt.run, machine))

    def read(self, resource: WorkerContext, verify: Callable[[], None]) -> bytes:
        return worker_artifact(self.command, resource.context, GitHubRuns(self.api, self.apps.context),
            self.store, resource.control, self.clock, verify_local=verify)

    def test_status_reads_active_worker_and_in_flight_counts_without_post(self) -> None:
        # Given
        resource = self.prepare_read()
        checks: list[bool] = []
        # When
        artifact = ChildArtifact.model_validate_json(self.read(resource, lambda: checks.append(True)))
        # Then
        self.assertEqual("ACTIVE", artifact.receipt.status.worker)
        self.assertEqual(2, artifact.receipt.status.in_flight)
        self.assertEqual(self.receipt.status.authority, artifact.receipt.status.authority)
        self.assertFalse(artifact.receipt.status.background_drained)
        self.assertEqual(2, len(checks))
        self.assertEqual(["GET", "GET"], [request.method for request in resource.management.requests])

    def test_profile_change_after_read_prevents_success_artifact(self) -> None:
        # Given
        resource = self.prepare_read()
        checks: list[bool] = []

        def verify() -> None:
            checks.append(True)
            if len(checks) == 2:
                raise DeploymentFailure("candidate restarted during read")

        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = self.read(resource, verify)
        self.assertFalse(any(request.method == "POST" for request in resource.management.requests))

    def test_revocation_after_read_prevents_success_artifact(self) -> None:
        # Given
        resource = self.prepare_read()
        checks: list[bool] = []

        def verify() -> None:
            checks.append(True)
            if len(checks) == 2:
                _ = self.store.update(self.state, phase=Phase.ATTENTION)

        # When / Then
        with self.assertRaises(DeploymentFailure):
            _ = self.read(resource, verify)
        self.assertFalse(any(request.method == "POST" for request in resource.management.requests))
