"""One deployment under a durable lock; interrupted runs require explicit reconciliation."""
import hashlib
from typing import assert_never
from uuid import uuid4

from pydantic import ValidationError

from .models import Action, DeploymentRequest, DeploymentState, Phase, Topology
from .ports import Adapters, DeploymentFailure, Health, Policy
from .recovery import require_healthy_target, require_owner, rollback
from .session import Session
from .state_store import StateConflict, StateStore


class DeploymentController:
    def __init__(self, store: StateStore, adapters: Adapters, topology: Topology):
        self.store = store
        self.adapters = adapters
        self.topology = topology

    def run(self, request: DeploymentRequest, policy: Policy = Policy()) -> DeploymentState:
        if not request.rollback_compatible:
            raise DeploymentFailure("developer-confirmed rollback schema/payload compatibility is required")
        with self.store.lock():
            active = self.adapters.proxy.active()
            self.store.create(DeploymentState(
                deployment_id=request.deployment_id, session_id=uuid4(), old=active, target=active.other(),
                image=request.image, parent_run_id=request.parent_run_id, parent_attempt=request.parent_attempt,
                topology_digest=hashlib.sha256(self.topology.model_dump_json().encode()).hexdigest(),
                heartbeat=self.adapters.clock.now(),
            ))
            session = Session(self.store, self.topology, self.adapters)
            session.deadline = self.adapters.clock.monotonic() + policy.total_seconds
            try:
                self._prepare(session, policy)
                self._handoff(session, policy)
                if self._observe(session, policy):
                    self._cleanup(session, policy)
            except (DeploymentFailure, StateConflict, OSError, ValidationError) as error:
                latest = self.store.read()
                if latest is None:
                    raise StateConflict("deployment journal disappeared") from error
                if latest.phase is not Phase.ATTENTION:
                    match error:
                        case ValidationError():
                            reason = "structured deployment result failed schema validation"
                        case DeploymentFailure() | StateConflict() | OSError():
                            reason = str(error)
                        case unreachable:
                            assert_never(unreachable)
                    self.store.update(latest, phase=Phase.ATTENTION, reason=reason)
                latest = self.store.read()
                if latest is None:
                    raise StateConflict("deployment journal disappeared") from error
                return latest
            return session.state

    def _prepare(self, session: Session, policy: Policy) -> None:
        old = session.app(Action.STATUS, session.state.old, policy)
        if not old.healthy or not old.running or old.authority.phase not in ("COMPLETE", "IDLE"):
            raise DeploymentFailure("active app or previous deployment is not ready")
        require_owner(session, session.state.old)
        target = self.topology.host(session.state.target)
        session.effect(Action.START_EC2, target.slot, lambda: self.adapters.cloud.start(target))
        session.wait(lambda: self.adapters.cloud.running(target), policy.startup_seconds, policy)
        candidate = session.app(Action.PREPARE, target.slot, policy)
        if not candidate.healthy or not candidate.running or not candidate.drained():
            raise DeploymentFailure("candidate must be healthy and paused before promotion")
        session.app(Action.BEGIN, session.state.old, policy)

    def _handoff(self, session: Session, policy: Policy) -> None:
        needed = policy.observation_seconds + policy.recovery_reserve_seconds + policy.worker_drain_seconds + 3 * policy.command_seconds
        if session.remaining() < needed:
            raise DeploymentFailure("not enough controller budget for handoff, observation and recovery")
        old = session.state.old
        target = session.state.target
        session.phase(Phase.HANDOFF)
        session.app(Action.HANDOFF, old, policy)
        session.app(Action.PAUSE, old, policy)
        session.wait(lambda: session.app(Action.STATUS, old, policy).drained(),
                     policy.worker_drain_seconds, policy)
        session.app(Action.RELEASE, old, policy)
        if session.remaining() < policy.observation_seconds + policy.recovery_reserve_seconds:
            raise DeploymentFailure("observation and recovery budget is insufficient; HTTP stays on previous app")
        session.phase(Phase.SWITCHING)
        ticket = session.effect(Action.SWITCH, target, lambda: self.adapters.proxy.switch(self.topology.host(target)))
        if self.adapters.proxy.active() is not target:
            raise DeploymentFailure("reload returned but the fresh route is not the candidate")
        session.save(session.state.model_copy(update={"drain_ticket": ticket,
                                                      "switched_at": self.adapters.clock.now()}))
        session.app(Action.ACTIVATE, target, policy)
        require_owner(session, target)
        session.app(Action.OBSERVE, target, policy)
        session.phase(Phase.OBSERVING)

    def _observe(self, session: Session, policy: Policy) -> bool:
        start = self.adapters.clock.monotonic()
        wall = self.adapters.clock.now()
        failures = 0
        while True:
            session.tick()
            status = session.app(Action.STATUS, session.state.target, policy)
            health = self.adapters.telemetry.health(self.topology.host(session.state.target))
            if health is Health.UNKNOWN:
                raise DeploymentFailure("observation data is missing or stale")
            try:
                route_matches = self.adapters.proxy.active() is session.state.target
            except DeploymentFailure:
                route_matches = False
            healthy = status.healthy and status.running and status.image == session.state.image
            healthy = healthy and health is Health.HEALTHY and route_matches
            if healthy:
                require_owner(session, session.state.target)
            failures = 0 if healthy else failures + 1
            elapsed = self.adapters.clock.monotonic() - start
            skew = abs((self.adapters.clock.now() - wall).total_seconds() - elapsed)
            if skew > policy.clock_skew_seconds:
                raise DeploymentFailure("clock continuity cannot be demonstrated")
            if failures >= policy.consecutive_failures:
                rollback(session, policy)
                return False
            # A late failure near the end must not be treated as successful observation.
            if elapsed >= policy.observation_seconds and failures == 0:
                return True
            if elapsed > policy.observation_seconds + policy.poll_seconds * policy.consecutive_failures:
                raise DeploymentFailure("observation ended without continuous healthy evidence")
            self.adapters.clock.sleep(policy.poll_seconds)

    def _cleanup(self, session: Session, policy: Policy) -> None:
        session.phase(Phase.DRAINING_HTTP)
        ticket = session.state.drain_ticket
        if ticket is None:
            raise DeploymentFailure("old connection generation was not captured")
        old = session.state.old
        session.wait(lambda: self.adapters.proxy.drained(ticket)
                     and session.app(Action.STATUS, old, policy).requests_drained(),
                     policy.http_drain_seconds, policy)
        require_healthy_target(session, policy)
        # Seal first. A delayed stop grant must never race an automatic rollback to A.
        session.save(session.state.model_copy(update={"phase": Phase.SEALED, "rollback_sealed": True}))
        session.app(Action.COMPLETE, session.state.target, policy)
        stopped = session.app(Action.STOP_APP, old, policy)
        if stopped.running or not stopped.normal_exit or not stopped.requests_drained():
            raise DeploymentFailure("normal application shutdown was not proved")
        require_healthy_target(session, policy)
        host = self.topology.host(old)
        session.effect(Action.STOP_EC2, old, lambda: self.adapters.cloud.stop(host))
        session.wait(lambda: self.adapters.cloud.stopped(host), policy.startup_seconds, policy)
        session.phase(Phase.COMPLETE)

    def reconcile(self) -> DeploymentState:
        """Record the observed route; never replay a potentially accepted dispatch/stop."""
        with self.store.lock():
            state = self.store.read()
            if state is None:
                raise StateConflict("no deployment to reconcile")
            if state.phase in (Phase.COMPLETE, Phase.ROLLED_BACK) and state.pending is None:
                return state
            active = self.adapters.proxy.active()
            reason = f"reconcile required; actual HTTP slot={active.value}"
            if state.pending is not None and state.pending_run is None:
                matches = self.adapters.apps.find(state.pending)
                reason += f"; matching child runs={len(matches)}"
            # Recovered elapsed time is never used to complete the 900-second observation.
            return self.store.update(state, phase=Phase.ATTENTION, reason=reason)
