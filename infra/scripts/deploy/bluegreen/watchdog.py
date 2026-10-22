"""A stale controller blocks cleanup; it never takes over worker ownership."""
from datetime import datetime

from .models import DeploymentState, Phase
from .state_store import StateStore


def inspect(store: StateStore, now: datetime, stale_seconds: float = 60) -> DeploymentState | None:
    state = store.read()
    if state is None or state.phase in (Phase.COMPLETE, Phase.ROLLED_BACK, Phase.ATTENTION):
        return state
    age = (now - state.heartbeat).total_seconds()
    if age < 0 or age >= stale_seconds:
        return store.update(state, phase=Phase.ATTENTION, reason="controller heartbeat is stale or clock moved backwards")
    return state
