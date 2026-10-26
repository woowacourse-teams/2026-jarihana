#!/bin/sh
set -eu
# Install a separate root-owned copy per environment with the literal path set below.
# Environment is never accepted from SSH arguments or SSH_ORIGINAL_COMMAND.
exec /usr/bin/head -c 4194305 -- /var/lib/jarihana-deploy/ENVIRONMENT/state.json
