from dataclasses import dataclass
from itertools import chain, repeat
from typing import ClassVar, final, override
from uuid import uuid4

from bluegreen.child_artifacts import ChildArtifact
from bluegreen.child_execution import ChildContext, MachineIdentity
from bluegreen.child_worker import worker_artifact
from bluegreen.github_runs import GitHubRuns
from bluegreen.models import Action, AppStatus, Authority, Phase
from bluegreen.ports import DeploymentFailure, UnknownResult
from bluegreen.spring_status import (
    Activity,
    Identity,
    SpringStatus,
    Worker,
    WorkerAuthority,
)
from bluegreen.spring_worker import SpringWorker, WorkerResponse
from bluegreen.worker_command import WorkerPayload
from github_fixture import GitHubFixture
from github_server import ApiServer, Reply
from pydantic import SecretStr
from test_child_status import BindingJournal


@dataclass(frozen=True, slots=True)
class WorkerContext:
    management: ApiServer
    machine: MachineIdentity
    control: SpringWorker
    context: ChildContext


@final
class ChildWorkerTest(GitHubFixture):
    worker_path: ClassVar[str] = "/actuator/workercontrol"

    def __init__(self, methodName: str = "runTest") -> None:
        super().__init__(methodName)
        self.resources: WorkerContext | None = None
        self.post_path: str = self.worker_path + "/pause"

    @override
    def setUp(self) -> None:
        super().setUp()
        management = self.enterContext(ApiServer())
        machine = MachineIdentity(environment=self.topology.environment,
            host_id=self.topology.a.host_id, instance_id=self.topology.a.instance_id)
        control = SpringWorker(self.api.clients.writes, management.server.server_port,
                              SecretStr("local-worker-fixture-token-0123456789"), machine, self.clock)
        self.resources = WorkerContext(management, machine, control, ChildContext(self.topology, self.receipt.run, machine))

    @property
    def worker(self) -> WorkerContext:
        if self.resources is None:
            self.fail("worker fixture is not initialized")
        return self.resources

    @property
    def management(self) -> ApiServer:
        return self.worker.management

    @property
    def control(self) -> SpringWorker:
        return self.worker.control

    @property
    def context(self) -> ChildContext:
        return self.worker.context

    def execute(self) -> bytes:
        return worker_artifact(self.command, self.context, GitHubRuns(self.api, self.apps.context),
                               self.store, self.control, self.clock)

    def test_pause_preserves_in_flight_work_and_uses_exact_command_fences(self) -> None:
        before, _ = self.prepare(in_flight=1)

        artifact = ChildArtifact.model_validate_json(self.execute())

        self.assertEqual("DRAINING", artifact.receipt.status.worker)
        self.assertEqual(1, artifact.receipt.status.in_flight)
        posts = [request for request in self.management.requests if request.method == "POST"]
        self.assertEqual(1, len(posts))
        body = WorkerPayload.model_validate_json(posts[0].body)
        self.assertEqual(7, body.expectedRevision)
        self.assertEqual(3, body.epoch)
        self.assertEqual(before.boot_id, body.targetBootId)
        self.assertEqual(self.command.command_id, body.commandId)
        self.assertIsNone(body.deadline.tzinfo)
        self.assertEqual(9, body.deadline.hour)
        self.assertNotIn('"nextPhase"', posts[0].body.decode())
        self.assertNotIn("X-Jarihana-Worker-Control-Token", posts[0].body.decode())

    def test_release_is_blocked_before_post_while_work_is_running(self) -> None:
        _ = self.prepare(Action.RELEASE, in_flight=1)

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assert_no_post()

    def test_release_of_drained_owner_produces_unassigned_receipt(self) -> None:
        _ = self.prepare(Action.RELEASE)

        artifact = ChildArtifact.model_validate_json(self.execute())

        self.assertEqual("UNASSIGNED", artifact.receipt.status.authority.status)
        self.assertIsNone(artifact.receipt.status.authority.owner_host)

    def test_activate_requires_released_authority_and_claims_current_boot(self) -> None:
        _ = self.prepare(Action.ACTIVATE)

        artifact = ChildArtifact.model_validate_json(self.execute())

        self.assertEqual("ACTIVE", artifact.receipt.status.worker)
        self.assertEqual(self.command.boot_id, artifact.receipt.status.authority.owner_boot)

    def test_unhealthy_candidate_cannot_activate_worker(self) -> None:
        _ = self.prepare(Action.ACTIVATE)
        self.management.route("GET", "/actuator/health/readiness", Reply(503, b'{"status":"DOWN"}'))

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assert_no_post()

    def test_wrong_boot_is_rejected_before_post(self) -> None:
        before, after = self.prepare()
        self.responses(before.model_copy(update={"boot_id": uuid4()}), after, "pause")

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assert_no_post()

    def test_changed_authority_revision_is_rejected_before_post(self) -> None:
        before, after = self.prepare()
        self.responses(before.model_copy(update={"authority": before.authority.model_copy(update={"revision": 9})}),
                       after, "pause")

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assert_no_post()

    def test_expired_grant_is_rejected_before_management_access(self) -> None:
        _ = self.prepare()
        self.clock.sleep(61)

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assertEqual([], self.management.requests)

    def test_revocation_after_post_cannot_produce_success_artifact(self) -> None:
        _ = self.prepare()
        revoked = self.state.model_copy(update={"phase": Phase.ATTENTION})
        journal = BindingJournal(chain(repeat(self.state, 4), repeat(revoked)))

        with self.assertRaises(DeploymentFailure):
            _ = worker_artifact(self.command, self.context, GitHubRuns(self.api, self.apps.context),
                                journal, self.control, self.clock)

        self.assertEqual(1, sum(request.method == "POST" for request in self.management.requests))

    def test_changed_boot_after_post_cannot_produce_success_artifact(self) -> None:
        before, after = self.prepare()
        self.responses(before, after.model_copy(update={"boot_id": uuid4()}), "pause")

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assertEqual(1, sum(request.method == "POST" for request in self.management.requests))

    def test_revoked_grant_blocks_all_management_requests(self) -> None:
        _ = self.prepare()
        _ = self.store.update(self.state, phase=Phase.ATTENTION)

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assertEqual([], self.management.requests)

    def test_github_cancellation_before_effect_blocks_post(self) -> None:
        _ = self.prepare()
        running = self.api_run.model_copy(update={"status": "in_progress", "conclusion": None})
        for suffix in ("", "/attempts/1"):
            self.server.route("GET", f"{self.root}/actions/runs/11{suffix}", Reply(
                body=running.model_dump_json().encode(), next_reply=Reply(body=self.api_run.model_copy(
                    update={"conclusion": "cancelled"}).model_dump_json().encode())))

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assert_no_post()

    def test_disconnected_post_is_unknown_and_never_repeated(self) -> None:
        _ = self.prepare()
        self.management.route("POST", self.post_path, Reply(disconnect=True))

        with self.assertRaises(UnknownResult):
            _ = self.execute()

        self.assertEqual(1, sum(request.method == "POST" for request in self.management.requests))

    def test_conflict_is_rejected_without_exposing_response_body(self) -> None:
        _ = self.prepare()
        self.management.route("POST", self.post_path, Reply(409, b'{"secret":"sensitive"}'))

        with self.assertRaises(DeploymentFailure) as error:
            _ = self.execute()

        self.assertNotIn("sensitive", str(error.exception))
        self.assertEqual(1, sum(request.method == "POST" for request in self.management.requests))

    def test_invalid_success_response_is_unknown_without_retry(self) -> None:
        _ = self.prepare()
        self.management.route("POST", self.post_path, Reply(body=b'{"success":true}'))

        with self.assertRaises(UnknownResult):
            _ = self.execute()

        self.assertEqual(1, sum(request.method == "POST" for request in self.management.requests))

    def test_followup_status_failure_is_unknown_without_retry(self) -> None:
        _ = self.prepare()
        self.management.route("GET", "/actuator/health/readiness", Reply(body=b'{"status":"UP"}', next_reply=Reply(500)))

        with self.assertRaises(UnknownResult):
            _ = self.execute()

        self.assertEqual(1, sum(request.method == "POST" for request in self.management.requests))

    def test_unsupported_operation_is_rejected_before_any_requests(self) -> None:
        _ = self.prepare()
        self.command = self.command.model_copy(update={"action": Action.STOP_EC2})

        with self.assertRaises(DeploymentFailure):
            _ = self.execute()

        self.assert_no_post()

    def test_profile_recheck_failure_blocks_post(self) -> None:
        _ = self.prepare()
        checks: list[bool] = []

        def verify_local() -> None:
            checks.append(True)
            if len(checks) == 2:
                raise DeploymentFailure("local profile changed")

        with self.assertRaises(DeploymentFailure):
            _ = worker_artifact(self.command, self.context, GitHubRuns(self.api, self.apps.context),
                                self.store, self.control, self.clock, verify_local=verify_local)

        self.assert_no_post()
        self.assertEqual(2, len(checks))

    def assert_no_post(self) -> None:
        self.assertFalse(any(request.method == "POST" for request in self.management.requests))

    def prepare(self, action: Action = Action.PAUSE, *, in_flight: int = 0) -> tuple[AppStatus, AppStatus]:
        authority = Authority(deployment_id=self.command.deployment_id, epoch=3, revision=7, phase="HANDOFF",
                              owner_host=self.receipt.status.host_id, owner_boot=self.receipt.status.boot_id, status="ACTIVE")
        before = self.receipt.status.model_copy(update={"authority": authority, "worker": "ACTIVE", "in_flight": in_flight})
        after = before.model_copy(update={"authority": authority.model_copy(update={"revision": 8, "status": "DRAINING"}),
                                          "worker": "DRAINING" if in_flight else "PAUSED"})
        if action is Action.RELEASE:
            before = before.model_copy(update={"worker": "DRAINING" if in_flight else "PAUSED",
                "authority": authority.model_copy(update={"status": "DRAINING"})})
            after = before.model_copy(update={"authority": before.authority.model_copy(update={
                "revision": 8, "owner_host": None, "owner_boot": None, "status": "UNASSIGNED"})})
        if action is Action.ACTIVATE:
            before = before.model_copy(update={"worker": "PAUSED", "authority": authority.model_copy(update={
                "owner_host": None, "owner_boot": None, "status": "UNASSIGNED"})})
            after = before.model_copy(update={"worker": "ACTIVE", "authority": authority.model_copy(update={"revision": 8})})
        self.command = self.command.model_copy(update={"action": action, "phase": Phase.HANDOFF, "authority": before.authority})
        self.state = self.store.save(self.state, self.state.model_copy(update={
            "revision": self.state.revision + 1, "phase": Phase.HANDOFF, "pending": self.command, "authority": before.authority}))
        self.bind()
        self.set_run(self.api_run.model_copy(update={"status": "in_progress", "conclusion": None}))
        self.responses(before, after, action.value)
        return before, after

    def wire(self, status: AppStatus) -> SpringStatus:
        authority = status.authority
        if authority.deployment_id is None:
            self.fail("fixture authority must have a deployment")
        owner = None if authority.owner_host is None or authority.owner_boot is None else Identity(
            hostId=authority.owner_host, bootId=authority.owner_boot)
        return SpringStatus(version=status.image, environment=status.environment,
            identity=Identity(hostId=status.host_id, bootId=status.boot_id),
            worker=Worker.model_validate({"state": status.worker, "inFlight": status.in_flight, "unresolved": status.unresolved}),
            authority=WorkerAuthority(environment=status.environment, deploymentId=authority.deployment_id,
                epoch=authority.epoch, phase=authority.phase, revision=authority.revision, authorityRevision=1,
                owner=owner, status=authority.status),
            activity=Activity(httpInFlight=status.http_in_flight or 0, backgroundInFlight=0,
                              backgroundDrained=status.background_drained))

    def responses(self, before: AppStatus, after: AppStatus, operation: str) -> None:
        self.post_path = self.worker_path + "/" + operation
        self.management.route("GET", self.worker_path, Reply(body=self.wire(before).model_dump_json().encode(),
            next_reply=Reply(body=self.wire(after).model_dump_json().encode())))
        self.management.route("GET", "/actuator/health/readiness", Reply(body=b'{"status":"UP"}'))
        response = WorkerResponse(success=True, code=None, message=None, authority=self.wire(after).authority)
        self.management.route("POST", self.post_path, Reply(body=response.model_dump_json().encode()))
