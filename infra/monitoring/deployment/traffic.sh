#!/usr/bin/env bash

# Sourced by collect.sh; the caller serializes polls and validates CONFIG.
collect_nginx_traffic() (
  set -o pipefail
  umask 077
  local state work container identity identity_after mapping previous since until increments next
  local max_bytes=4194304 max_lines=20000
  state="$BG_OBSERVABILITY_STATE_DIR/nginx-traffic.json"
  work=''
  trap '[[ -z "$work" ]] || rm -rf -- "$work"' EXIT

  traffic_failed() {
    printf 'jarihana_nginx_traffic_collection_success{environment="%s"} 0\n' "$ENVIRONMENT"
    printf 'jarihana_nginx_traffic_observed_at_seconds{environment="%s"} 0\n' "$ENVIRONMENT"
  }

  [[ "$BG_OBSERVABILITY_NOW" =~ ^[0-9]+$ ]] || { traffic_failed; return; }
  until=$((BG_OBSERVABILITY_NOW - 2))
  [[ "$until" -ge 30 ]] || { traffic_failed; return; }
  container=$(jq -er '.nginx.container' <<< "$CONFIG") || { traffic_failed; return; }
  mapping=$(jq -cS '[.topology.a,.topology.b]' <<< "$CONFIG") || { traffic_failed; return; }
  identity=$(timeout 5 docker inspect --format '{{.Id}}' "$container" 2>/dev/null) || { traffic_failed; return; }
  [[ "$identity" =~ ^[a-f0-9]{64}$ ]] || { traffic_failed; return; }

  previous='null'
  if [[ -e "$state" ]]; then
    previous=$(jq -ce 'select(
      .version == 1 and (.container_id | type == "string") and
      (.mapping | type == "array" and length == 2) and
      (.cursor | type == "number" and floor == . and . >= 0) and
      (.counts | type == "object") and
      ([.counts.A,.counts.B] | all(type == "number" and floor == . and . >= 0)))
    ' "$state" 2>/dev/null) || { traffic_failed; return; }
  fi
  if ! jq -e --arg id "$identity" --argjson mapping "$mapping" \
    '.container_id == $id and .mapping == $mapping' <<< "$previous" >/dev/null; then
    previous=$(jq -cn --arg id "$identity" --argjson mapping "$mapping" --argjson cursor "$((until - 30))" \
      '{version:1,container_id:$id,mapping:$mapping,cursor:$cursor,counts:{A:0,B:0}}')
  fi
  since=$(jq -r '.cursor' <<< "$previous")
  # A backwards wall clock cannot safely move the persisted watermark.
  [[ "$until" -ge "$since" ]] || { traffic_failed; return; }
  work=$(mktemp -d "$BG_OBSERVABILITY_STATE_DIR/.traffic.XXXXXX") || { traffic_failed; return; }
  # Bound output before buffering it; a truncated stream is a failed poll.
  if ! timeout 10 docker logs --timestamps --since "$since" --until "$until" "$container" 2>&1 \
    | head -c "$((max_bytes + 1))" > "$work/logs"; then
    traffic_failed; return
  fi
  if [[ $(wc -c < "$work/logs") -gt "$max_bytes" || $(wc -l < "$work/logs") -gt "$max_lines" ]]; then
    traffic_failed; return
  fi
  identity_after=$(timeout 5 docker inspect --format '{{.Id}}' "$container" 2>/dev/null) || { traffic_failed; return; }
  [[ "$identity_after" == "$identity" ]] || { traffic_failed; return; }

  # Docker emits UTC RFC3339 timestamps. Comparing whole seconds gives [since,until)
  # even when Docker replays the inclusive boundary or multiple requests share it.
  increments=$(jq -Rnce --argjson mapping "$mapping" --argjson since "$since" --argjson until "$until" '
    ($since | todateiso8601 | .[0:19]) as $low |
    ($until | todateiso8601 | .[0:19]) as $high |
    reduce inputs as $line ({A:0,B:0};
      if ($line | test("^[^ ]+ [0-9]{4}-[0-9]{2}-[0-9]{2}T")) then
        ($line | capture("^(?<timestamp>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,9})?Z) [^ ]+ [A-Z]+ (?<path>[^ ]+) (?<status>[1-5][0-9]{2}) upstream=(?<upstream>[^ ]+) upstream_status=[^ ]+ request_time=[0-9.]+ upstream_time=[^ ]+$") // error("invalid access log")) as $entry |
        if $entry.timestamp[0:19] >= $low and $entry.timestamp[0:19] < $high and
           ($entry.path | startswith("/__deployment") | not) then
          if $entry.upstream == $mapping[0].upstream then .A += 1
          elif $entry.upstream == $mapping[1].upstream then .B += 1
          else . end
        else . end
      else . end)
  ' < "$work/logs" 2>/dev/null) || { traffic_failed; return; }
  next=$(jq -ce --argjson delta "$increments" --argjson cursor "$until" \
    '.cursor = $cursor | .counts.A += $delta.A | .counts.B += $delta.B' <<< "$previous") || { traffic_failed; return; }
  printf '%s\n' "$next" > "$work/state.json" || { traffic_failed; return; }
  mv -f -- "$work/state.json" "$state" || { traffic_failed; return; }

  printf '# HELP jarihana_nginx_requests_total Observed completed upstream requests; resets on container or mapping change.\n'
  printf '# TYPE jarihana_nginx_requests_total counter\n'
  jq -r --arg environment "$ENVIRONMENT" '
    . as $state | .mapping[] |
    "jarihana_nginx_requests_total{environment=\($environment|tojson),slot=\(.slot|tojson),host_id=\(.host_id|tojson),instance_id=\(.instance_id|tojson)} \($state.counts[.slot])"
  ' <<< "$next"
  printf 'jarihana_nginx_traffic_collection_success{environment="%s"} 1\n' "$ENVIRONMENT"
  printf 'jarihana_nginx_traffic_observed_at_seconds{environment="%s"} %s\n' "$ENVIRONMENT" "$until"
)
