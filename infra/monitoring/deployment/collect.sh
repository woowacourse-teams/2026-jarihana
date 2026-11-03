#!/usr/bin/env bash
set -euo pipefail
set +x
DIRECTORY=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$DIRECTORY/../../scripts/deploy/actions/common.sh"
source "$DIRECTORY/../../scripts/deploy/actions/cloud.sh"
source "$DIRECTORY/../../scripts/deploy/actions/nginx.sh"
source "$DIRECTORY/journal.sh"
source "$DIRECTORY/traffic.sh"
ENVIRONMENT=${1:?Usage: collect.sh dev|prod}
[[ $# == 1 && ( "$ENVIRONMENT" == dev || "$ENVIRONMENT" == prod ) ]] || exit 2
CONFIG_ROOT=${BG_OBSERVABILITY_CONFIG_ROOT:-/etc/jarihana-deploy}
DEPLOY_ROOT=${BG_OBSERVABILITY_DEPLOY_ROOT:-/var/lib/jarihana-deploy}
BG_OBSERVABILITY_STATE_DIR=${BG_OBSERVABILITY_ROOT:-/var/lib/jarihana-observability}/$ENVIRONMENT
[[ "$CONFIG_ROOT" == /* && "$DEPLOY_ROOT" == /* && "$BG_OBSERVABILITY_STATE_DIR" == /* ]] || exit 2
umask 077
mkdir -p "$BG_OBSERVABILITY_STATE_DIR/textfile"
exec 9>"$BG_OBSERVABILITY_STATE_DIR/collector.lock"
flock -n 9 || exit 0
BG_OBSERVABILITY_NOW=$(date +%s)
BASE="environment=\"$ENVIRONMENT\""
metric() { printf '%s{%s} %s\n' "$1" "${3:-$BASE}" "$2"; }
source_result() {
  local source=$1 ok=$2 stamp=0 path="$BG_OBSERVABILITY_STATE_DIR/observed-$1"
  if [[ "$ok" == 1 ]]; then printf '%s\n' "$BG_OBSERVABILITY_NOW" > "$path"; fi
  if [[ -f "$path" ]]; then read -r stamp < "$path"; [[ "$stamp" =~ ^[0-9]+$ ]] || stamp=0; fi
  metric jarihana_deployment_source_success "$ok" "$BASE,source=\"$source\""
  metric jarihana_deployment_source_observed_timestamp_seconds "$stamp" "$BASE,source=\"$source\""
}
collect() {
  local slot host labels value ok route=-1 active=-1 current ticket drain=-1 traffic
  metric jarihana_deployment_collector_timestamp_seconds "$BG_OBSERVABILITY_NOW"
  if ! CONFIG=$( (bg_config "$CONFIG_ROOT/$ENVIRONMENT/coordinator.json"; printf '%s' "$CONFIG") 2>/dev/null) ||
     ! jq -e --arg env "$ENVIRONMENT" '.topology.environment==$env and (has("local_slot")|not)' <<< "$CONFIG" >/dev/null; then
    metric jarihana_deployment_phase -1; metric jarihana_nginx_active_slot -1
    source_result config 0; return
  fi
  source_result config 1
  observe_journal "$DEPLOY_ROOT/$ENVIRONMENT/state.json"
  metric jarihana_deployment_phase "$PHASE"
  metric jarihana_deployment_lease_valid "$LEASE"
  source_result journal "$JOURNAL_OK"
  if [[ "$JOURNAL" != null ]]; then
    labels=$(jq -r --arg env "$ENVIRONMENT" '"environment=\"\($env)\",run_id=\"\(.run_id)\",sha=\"\(.sha)\",old=\"\(.old)\",target=\"\(.target)\",mode=\"\(.mode)\""' <<< "$JOURNAL")
    metric jarihana_deployment_info 1 "$labels"
    for value in created_at heartbeat expires_at; do
      case "$value" in created_at) slot=created;; expires_at) slot=expires;; *) slot=$value;; esac
      metric "jarihana_deployment_${slot}_timestamp_seconds" "$(jq -r ".$value" <<< "$JOURNAL")"
    done
  fi
  ok=0
  if route=$(bg_route 2>/dev/null); then
    case "$route" in A) active=1;ok=1;; B) active=2;ok=1;; *) route=unknown;; esac
  else route=unknown; fi
  metric jarihana_nginx_active_slot "$active"; source_result nginx "$ok"
  for slot in A B; do
    host=$(bg_host "$slot")
    labels="$BASE,slot=\"$slot\",host_id=\"$(jq -r '.host_id' <<< "$host")\",instance_id=\"$(jq -r '.instance_id' <<< "$host")\""
    metric jarihana_deployment_slot_info 1 "$labels"
    value=-1; if [[ "$route" != unknown ]]; then value=0; [[ "$route" != "$slot" ]] || value=1; fi
    metric jarihana_nginx_route "$value" "$labels"
    value=-1; ok=0
    if current=$(bg_ec2_state "$slot" 2>/dev/null); then
      case "$current" in stopped) value=0;; running) value=1;; pending) value=2;; stopping) value=3;; esac
      [[ "$value" == -1 ]] || ok=1
    fi
    metric jarihana_ec2_state "$value" "$labels"; source_result "ec2_$slot" "$ok"
  done
  ok=0
  # Recovery keeps its own worker generation, including NEEDS_ATTENTION afterward.
  ticket=$(jq -c 'if .http_recovered==true or .phase=="ROLLING_BACK" or .phase=="ROLLED_BACK"
    then .rollback_drain_ticket else .drain_ticket end // null' <<< "$JOURNAL")
  if jq -e 'type=="object" and (.container_id|type=="string") and (.generation|type=="string") and (.workers|type=="array" and length>0 and all(.[];type=="string" and test("^[0-9]+:[0-9]+$")))' <<< "$ticket" >/dev/null 2>&1 && current=$(bg_capture 2>/dev/null); then
    if jq -e --argjson old "$ticket" '.container_id==$old.container_id and .generation==$old.generation' <<< "$current" >/dev/null; then
      ok=1; drain=0
      if jq -e --argjson old "$ticket" '[.workers[] as $w|$old.workers[]|select(.==$w)]|length==0' <<< "$current" >/dev/null; then drain=1; fi
    fi
  fi
  metric jarihana_nginx_old_workers_drained "$drain"; source_result nginx_drain "$ok"
  if traffic=$(collect_nginx_traffic); then
    printf '%s\n' "$traffic"
    ok=0
    if grep -Eq '^jarihana_nginx_traffic_collection_success\{[^}]*\} 1$' <<< "$traffic"; then ok=1; fi
    source_result traffic "$ok"
  else source_result traffic 0; fi
}
temporary=$(mktemp "$BG_OBSERVABILITY_STATE_DIR/textfile/.deployment.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
collect > "$temporary"
chmod 644 "$temporary"
mv -f -- "$temporary" "$BG_OBSERVABILITY_STATE_DIR/textfile/deployment.prom"
