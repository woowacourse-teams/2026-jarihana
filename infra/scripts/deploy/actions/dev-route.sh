#!/usr/bin/env bash
set -euo pipefail
set +x

reject() { printf '::error::%s\n' "$1" >&2; exit 1; }

[[ ${GITHUB_REF:-} == refs/heads/develop ]] || reject 'Use the develop deployment workflow.'
dev_enabled=${BG_DEV_AUTO_ENABLED:-false}
prod_enabled=${BG_PROD_AUTO_ENABLED:-false}
[[ $dev_enabled == true || $dev_enabled == false ]] || reject 'BLUE_GREEN_DEV_ENABLED must be true or false.'
[[ $prod_enabled == true || $prod_enabled == false ]] || reject 'BLUE_GREEN_PROD_ENABLED must be true or false.'
[[ $dev_enabled != true || $prod_enabled != true ]] || reject 'dev and prod share the standby EC2; disable dev Blue-Green before enabling prod.'

mode=legacy
route=legacy
case ${GITHUB_EVENT_NAME:-} in
  push)
    [[ -z ${BG_REQUESTED_MODE:-} ]] || reject 'Push deployments cannot supply a manual mode.'
    if [[ $dev_enabled == true ]]; then route=blue-green; mode=deploy; fi
    ;;
  workflow_dispatch)
    mode=${BG_REQUESTED_MODE:-legacy}
    case $mode in
      legacy)
        [[ $dev_enabled != true ]] || reject 'Legacy deployment is disabled while dev Blue-Green is active; restore dev before switching modes.'
        ;;
      bootstrap|deploy)
        [[ $prod_enabled != true ]] || reject 'The standby EC2 is reserved for prod; dev Blue-Green cannot run.'
        route=blue-green
        ;;
      *) reject 'Choose legacy, bootstrap, or deploy.' ;;
    esac
    ;;
  *) reject 'Use a develop push or explicit workflow dispatch.' ;;
esac

printf 'route=%s\nmode=%s\n' "$route" "$mode" >> "${GITHUB_OUTPUT:?Actions output file is required}"
