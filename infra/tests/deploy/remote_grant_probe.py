# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic==2.14.0", "httpx2[http2,brotli,zstd]==2.16.0"]
# ///
# Run only through run_cloud_grant_e2e.py on the allowlisted B rehearsal host.
import sys
from ipaddress import IPv4Address
from pathlib import Path

from bluegreen.child_execution import ChildContext, ChildGate
from bluegreen.ec2_identity import local_machine, metadata_client
from bluegreen.models import Command, RunIdentity, Topology
from bluegreen.ports import DeploymentFailure, SystemClock
from bluegreen.ssh_journal import SshJournal


def main() -> None:
    root = Path(sys.argv[1])
    topology = Topology.model_validate_json((root / "topology.json").read_bytes())
    command = Command.model_validate_json((root / "command.json").read_bytes())
    run = RunIdentity.model_validate_json((root / "run.json").read_bytes())
    with metadata_client() as client:
        machine = local_machine(client, topology.environment, topology.b.host_id)
    reader = SshJournal(IPv4Address("10.0.3.51"), root / "key", root / "known_hosts")
    gate = ChildGate(ChildContext(topology, run, machine), reader, SystemClock())
    if sys.argv[2] in ("allow", "watch"):
        state = gate.state(command)
        print(f"REMOTE_GRANT_ALLOWED revision={state.revision} instance={machine.instance_id}", flush=True)
        if sys.argv[2] == "allow":
            return
        if sys.stdin.readline() != "\n":
            raise DeploymentFailure("revocation synchronization was lost")
    try:
        _ = gate.state(command)
    except DeploymentFailure:
        print("REMOTE_GRANT_REVOKED")
        return
    raise DeploymentFailure("revoked remote grant was accepted")


if __name__ == "__main__":
    main()
