#!/usr/bin/env bash
bg_nginx_container() { jq -r '.nginx.container' <<<"$CONFIG"; }
bg_capture() {
  local container identity generation workers
  container=$(bg_nginx_container)
  identity=$(timeout 10 docker inspect --format '{{.Id}}' "$container") || return 1
  generation=$(timeout 10 docker inspect --format '{{.State.StartedAt}}/{{.RestartCount}}' "$container") || return 1
  workers=$(timeout 10 docker exec "$container" sh -c '
for entry in /proc/[0-9]*; do
 command=$(tr "\000" " " < "$entry/cmdline" 2>/dev/null) || continue
 case "$command" in "nginx: worker process"*) awk "{print \$1 \":\" \$22}" "$entry/stat" 2>/dev/null;; esac
done') || return 1
  [[ -n $identity && $generation == */* && -n $workers ]] || return 1
  [[ $(timeout 10 docker inspect --format '{{.Id}}' "$container") == "$identity" && $(timeout 10 docker inspect --format '{{.State.StartedAt}}/{{.RestartCount}}' "$container") == "$generation" ]] || return 1
  jq -cen --arg id "$identity" --arg generation "$generation" --arg workers "$workers" '{container_id:$id,generation:$generation,workers:($workers|split("\n"))} | select(all(.workers[];test("^[0-9]+:[0-9]+$")))'
}
bg_route() {
  local raw headers body slot expected actual marker
  raw=$(curl --noproxy '*' --fail --silent --show-error --include --max-time 3 --max-filesize 65536 -H 'Connection: close' -H 'Cache-Control: no-cache' "http://127.0.0.1:$(jq -r '.nginx.probe_port' <<<"$CONFIG")/__deployment") || return 1
  raw=${raw//$'\r'/}; headers=${raw%%$'\n\n'*}; body=${raw#*$'\n\n'}
  slot=$(awk -F ': ' 'tolower($1)=="x-jarihana-slot"{print $2}' <<<"$headers")
  expected=$(bg_host "$slot" | jq -r '.upstream') || return 1
  marker=$(awk -F ': ' 'tolower($1)=="x-jarihana-target"{print $2}' <<<"$headers")
  actual=$(awk -F ': ' 'tolower($1)=="x-jarihana-upstream"{print $2}' <<<"$headers")
  [[ $marker == "$expected" && $actual == "$expected" ]] || return 1
  jq -e '.success==true' <<<"$body" >/dev/null || return 1
  printf '%s\n' "$slot"
}
bg_direct() {
  local raw
  raw=$(timeout 10 docker exec "$(bg_nginx_container)" curl --noproxy '*' --fail --silent --show-error --max-time 3 --max-filesize 65536 -H 'Connection: close' "http://$(bg_host "$1" | jq -r '.upstream')/api/groups?size=1") || return 1
  jq -e '.success==true' <<<"$raw" >/dev/null
}
bg_await_route() {
  local deadline=$(( $(bg_now)+10 )) count=0 actual
  while (( $(bg_now)<deadline )); do
    actual=$(bg_route) || actual=unknown
    if [[ $actual == "$1" ]]; then count=$((count+1)); else count=0; fi
    (( count>=3 )) && return 0
    sleep 0.1
  done
  return 1
}
bg_publish_config() {
  local directory temporary
  directory=$(jq -r '.nginx.directory' <<<"$CONFIG")
  bg_owned_directory "$directory"
  bg_owned_file "$directory/current.conf"
  temporary=$(mktemp "$directory/.publish.XXXXXX") || return 1
  printf '%s\n' "$1" > "$temporary"
  chmod 600 "$temporary"; sync -f "$temporary" || return 1
  mv -f "$temporary" "$directory/current.conf" && sync -f "$directory"
}
bg_reload() { bg_live; timeout 10 docker exec "$(bg_nginx_container)" nginx -s reload -c /etc/nginx/deploy/current.conf; }
bg_switch_http() {
  local slot=$1 rescue=${2:-false} directory generation content previous previous_slot ticket old_ticket
  directory=$(jq -r '.nginx.directory' <<<"$CONFIG")
  bg_owned_file "$directory/current.conf"
  previous=$(cat "$directory/current.conf")
  ticket=$(bg_capture) || return 1
  if [[ $rescue == true ]]; then
    old_ticket=$(jq -c '.drain_ticket' <<<"$STATE")
    jq -e --argjson old "$old_ticket" '.container_id==$old.container_id and .generation==$old.generation' <<<"$ticket" >/dev/null || return 1
    bg_direct "$slot" || return 1
  else
    previous_slot=$(bg_route) || return 1
  fi
  generation="$(bg_uuid).conf"
  content=$(sed -e "s/@UPSTREAM@/$(bg_host "$slot" | jq -r '.upstream')/g" -e "s/@SLOT@/$slot/g" "$SCRIPT_ROOT/../../nginx/nginx.conf.template") || return 1
  mkdir -p "$directory/generations"
  bg_owned_directory "$directory/generations"
  (set -o noclobber; printf '%s\n' "$content" > "$directory/generations/$generation") || return 1
  timeout 10 docker exec "$(bg_nginx_container)" nginx -t -c "/etc/nginx/deploy/generations/$generation" || return 1
  bg_guard
  if [[ $rescue != true ]]; then
    bg_save "$(jq -c --argjson ticket "$ticket" '.switched=true | .drain_ticket=$ticket' <<<"$STATE")"
  fi
  if ! { bg_publish_config "$content" && bg_reload && bg_await_route "$slot"; }; then
    if [[ $rescue != true ]]; then bg_publish_config "$previous" && bg_reload && bg_await_route "$previous_slot" || return 1; fi
    return 1
  fi
  bg_guard
  # Read by coordinator.sh after the switch returns.
  # shellcheck disable=SC2034
  TICKET=$ticket
}
bg_drained() {
  local current ticket=$1
  current=$(bg_capture) || return 1
  jq -e --argjson old "$ticket" '.container_id==$old.container_id and .generation==$old.generation and ([.workers[] as $w | $old.workers[] | select(.==$w)]|length==0)' <<<"$current" >/dev/null
}
