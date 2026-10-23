#!/bin/sh
set -eu
[ "$#" -eq 0 ] || exit 1
exec /usr/bin/head -c 65537 -- /var/lib/jarihana-deploy/status-rehearsal/state.json
