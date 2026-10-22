"""Inverse handoff; HTTP recovery alone never grants worker ownership."""
from .models import Action, Phase, Slot
from .ports import DeploymentFailure, Health, Policy
from .session import Session


def require_owner(session: Session, slot: Slot) -> None:
    state = session.state
    app = state.old_app if slot is state.old else state.target_app
    authority = state.authority
    if (app is None or authority is None or app.worker != "ACTIVE" or not app.running
            or authority.owner_host != app.host_id or authority.owner_boot != app.boot_id
            or authority.status != "ACTIVE"):
        raise DeploymentFailure("worker ownership does not match the expected process")


def rollback(session: Session, policy: Policy) -> None:
    if session.state.rollback_sealed:
        raise DeploymentFailure("automatic rollback window is closed")
    session.phase(Phase.ROLLING_BACK)
    old = session.state.old
    target = session.state.target
    fallback = session.app(Action.STATUS, old, policy)
    if not fallback.healthy or not fallback.running:
        raise DeploymentFailure("previous application is also unhealthy; no repeated switching")
    ticket = session.effect(Action.SWITCH, old, lambda: session.adapters.proxy.switch(session.topology.host(old)))
    if session.adapters.proxy.active() is not old:
        raise DeploymentFailure("HTTP rollback could not be confirmed")
    session.save(session.state.model_copy(update={"http_recovered": True, "drain_ticket": ticket}))
    candidate = session.app(Action.STATUS, target, policy)
    authority = candidate.authority
    session.app(Action.HANDOFF, old, policy)
    if authority.owner_host == candidate.host_id and authority.owner_boot == candidate.boot_id:
        session.app(Action.PAUSE, target, policy)
        session.wait(lambda: session.app(Action.STATUS, target, policy).drained(),
                     policy.worker_drain_seconds, policy)
        session.app(Action.RELEASE, target, policy)
    elif authority.owner_host is not None:
        raise DeploymentFailure("unknown worker owner prevents inverse handoff")
    session.app(Action.ACTIVATE, old, policy)
    require_owner(session, old)
    session.app(Action.OBSERVE, old, policy)
    session.app(Action.COMPLETE, old, policy)
    session.save(session.state.model_copy(update={"worker_recovered": True}))
    session.wait(lambda: session.adapters.proxy.drained(ticket)
                 and session.app(Action.STATUS, target, policy).requests_drained(),
                 policy.http_drain_seconds, policy)
    session.phase(Phase.ROLLED_BACK)


def require_healthy_target(session: Session, policy: Policy) -> None:
    target = session.state.target
    app = session.app(Action.STATUS, target, policy)
    if not app.healthy or not app.running or app.image != session.state.image:
        raise DeploymentFailure("candidate readiness, real API or image check failed")
    if session.adapters.proxy.active() is not target:
        raise DeploymentFailure("actual HTTP route does not match candidate")
    if session.adapters.telemetry.health(session.topology.host(target)) is not Health.HEALTHY:
        raise DeploymentFailure("telemetry is unhealthy or its freshness cannot be confirmed")
    require_owner(session, target)
