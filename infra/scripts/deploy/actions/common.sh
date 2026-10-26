#!/usr/bin/env bash
# Shared boundaries for the native Actions jobs. No deployment sequence lives here.
set -euo pipefail
set +x

SCRIPT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BG_READ_ONLY_VERIFIED_AT=0

bg_die() { printf '::error::%s\n' "$*" >&2; exit 1; }
bg_require() { local message=$1; shift; "$@" || bg_die "$message"; }
bg_now() { date +%s; }
bg_uuid() { cat /proc/sys/kernel/random/uuid; }
bg_topology_digest() { jq -Sc '.topology' <<< "$CONFIG" | sha256sum | cut -d ' ' -f 1; }

bg_root_file() {
    local path=$1 maximum=${2:-65536} private=${3:-false} uid mode size directory
    [[ -f "$path" && ! -L "$path" && "$path" == /* ]] || bg_die 'Expected a protected absolute regular file.'
    read -r uid mode size < <(stat -Lc '%u %a %s' -- "$path")
    [[ "$uid" == 0 && "$mode" =~ ^[0-7]{3,4}$ && "$size" -le "$maximum" ]] || bg_die 'Protected file owner or size differs.'
    (( (8#$mode & 0022) == 0 )) || bg_die 'Protected file is writable by another account.'
    if [[ "$private" == true ]]; then
        (( (8#$mode & 0007) == 0 )) || bg_die 'Secret file is readable by other accounts.'
    fi
    directory=$(dirname -- "$path")
    [[ ! -L "$directory" ]] || bg_die 'Protected configuration directory is a symlink.'
    read -r uid mode < <(stat -Lc '%u %a' -- "$directory")
    [[ "$uid" == 0 ]] && (( (8#$mode & 0022) == 0 )) || bg_die 'Protected configuration directory is writable.'
}

bg_config() {
    bg_root_file "$1"
    CONFIG=$(cat -- "$1")
    jq -es 'length == 1 and (.[0] | type == "object")' <<< "$CONFIG" >/dev/null || bg_die 'Invalid configuration JSON.'
    jq -e '
      .repository.full_name == "woowacourse-teams/2026-jarihana" and .repository.id == 1321030074 and
      (.topology.environment == "dev" or .topology.environment == "prod") and
      .topology.a.slot == "A" and .topology.b.slot == "B" and
      (.topology.a.instance_id | test("^i-[a-f0-9]{8,17}$")) and
      (.topology.b.instance_id | test("^i-[a-f0-9]{8,17}$")) and
      (.topology.coordinator_instance_id | test("^i-[a-f0-9]{8,17}$")) and
      .topology.a.instance_id != .topology.b.instance_id and
      .topology.coordinator_instance_id != .topology.a.instance_id and
      .topology.coordinator_instance_id != .topology.b.instance_id and
      .topology.a.host_id != .topology.b.host_id and .topology.a.upstream != .topology.b.upstream and
      ([.topology.a.host_id,.topology.b.host_id] | all(test("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"))) and
      ([.topology.a.upstream,.topology.b.upstream] | all(test("^[0-9.]+:[0-9]{1,5}$"))) and
      (.topology.control.ref | test("^refs/tags/deployment-control-[A-Za-z0-9._-]+$")) and
      (.topology.control.sha | test("^[a-f0-9]{40}$"))
    ' <<< "$CONFIG" >/dev/null || bg_die 'Repository, environment or A/B topology is invalid.'
    jq -e '
      def port: type == "number" and floor == . and . >= 1024 and . <= 65535;
      .topology.environment as $env |
      if has("local_slot") then
        (.local_slot == "A" or .local_slot == "B") and
        (.management_port | port) and (.app_port | port) and .management_port != .app_port and
        (.topology[(.local_slot | ascii_downcase)].upstream | split(":")[1] | tonumber) == .app_port and
        .image_repository == "ghcr.io/woowacourse-teams/jarihana-backend" and
        (.container_name | test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$")) and
        (.project | test("^[a-z0-9][a-z0-9_-]{0,63}$")) and
        .compose_file == ("/etc/jarihana-deploy/" + $env + "/app-compose.yml") and
        .worker_token_file == ("/etc/jarihana-deploy/" + $env + "/worker-token") and
        .journal_key == ("/etc/jarihana-deploy/" + $env + "/grant-key") and
        .known_hosts == ("/etc/jarihana-deploy/" + $env + "/known-hosts")
      else
        .nginx.directory == ("/var/lib/jarihana-deploy/" + $env + "/nginx") and
        (.nginx.container | test("^[A-Za-z0-9][A-Za-z0-9_.-]*$")) and (.nginx.probe_port | port) and
        .ec2.region == "ap-northeast-2" and (.ec2.account_id | test("^[0-9]{12}$")) and
        (.ec2.vpc_id | test("^vpc-[a-f0-9]{8,17}$")) and
        (.telemetry.url | test("^https?://[A-Za-z0-9._-]+(:[0-9]{1,5})?(/[A-Za-z0-9._/-]*)?$")) and
        (.telemetry.max_age_seconds | type == "number" and . > 0 and . <= 120) and
        (.telemetry.max_error_ratio | type == "number" and . >= 0 and . <= 1) and
        (.telemetry.max_mean_seconds | type == "number" and . > 0)
      end
    ' <<< "$CONFIG" >/dev/null || bg_die 'Protected paths, ports or adapter settings belong to another scope.'
}

bg_github() {
    local path=$1 body status temporary
    [[ "$path" == /* && "$path" != *$'\n'* && "$path" != *$'\r'* ]] || bg_die 'Invalid fixed GitHub API path.'
    [[ "${GH_TOKEN:-}" =~ ^[A-Za-z0-9_.-]+$ ]] || bg_die 'GitHub token is missing or malformed.'
    temporary=$(mktemp)
    chmod 600 "$temporary"
    # A private stdin curl configuration keeps Authorization out of process arguments.
    if ! status=$(printf 'header = "Authorization: Bearer %s"\n' "$GH_TOKEN" |
        curl -q --config - --silent --noproxy '*' --proto '=https' --max-redirs 0 \
          --connect-timeout 3 --max-time 10 --max-filesize 2097152 \
          --header 'Accept: application/vnd.github+json' --header 'X-GitHub-Api-Version: 2022-11-28' \
          --header 'Accept-Encoding: identity' --output "$temporary" --write-out '%{http_code}' \
          "https://api.github.com$path"); then
        rm -f -- "$temporary"
        bg_die 'GitHub read failed; preserve deployment state.'
    fi
    if [[ "$status" != 200 ]] || (( $(wc -c < "$temporary") > 2097152 )); then
        rm -f -- "$temporary"
        bg_die 'GitHub read was rejected or oversized; preserve deployment state.'
    fi
    body=$(cat -- "$temporary")
    rm -f -- "$temporary"
    jq -es 'length == 1 and (.[0] | type == "object")' <<< "$body" >/dev/null || bg_die 'GitHub returned invalid JSON.'
    printf '%s\n' "$body"
}

bg_live() {
    local actual path
    path=".github/workflows/backend-$ENVIRONMENT-deploy.yml"
    # The actual filenames use dev/prod, not the display environment name.
    actual=$(bg_github "/repos/$REPO/actions/runs/$RUN_ID")
    jq -e --argjson run "$RUN_ID" --arg sha "$GITHUB_SHA" --arg branch "$BRANCH" \
      --arg path "$path" --arg ref "refs/heads/$BRANCH" --arg repo "$REPO" --argjson workflow "$WORKFLOW_ID" '
      .id == $run and .run_attempt == 1 and .head_sha == $sha and .head_branch == $branch and
      .workflow_id == $workflow and (.path == $path or .path == ($path + "@" + $ref)) and
      (.event == "push" or .event == "workflow_dispatch") and
      .repository.id == 1321030074 and .head_repository.id == 1321030074 and
      .repository.full_name == $repo and .head_repository.full_name == $repo and
      .status == "in_progress" and .conclusion == null
    ' <<< "$actual" >/dev/null || bg_die 'The approved deployment run is no longer live.'
    if [[ "$BG_MODE" == bootstrap ]]; then
        jq -e '.event == "workflow_dispatch"' <<< "$actual" >/dev/null || bg_die 'Bootstrap must be manual.'
    fi
}

# Observation performs no server mutations. Bound successful parent-read reuse to
# 30 seconds; every state-changing phase still calls uncached bg_live directly.
bg_live_readonly() {
    local now
    now=$(bg_now)
    if (( BG_READ_ONLY_VERIFIED_AT > 0 && now >= BG_READ_ONLY_VERIFIED_AT && now-BG_READ_ONLY_VERIFIED_AT < 30 )); then
        return 0
    fi
    bg_live || bg_die 'Read-only parent verification failed.'
    BG_READ_ONLY_VERIFIED_AT=$now
}

bg_machine() {
    local expected=$1 token actual
    token=$(curl -q --silent --fail --noproxy '*' --max-redirs 0 --connect-timeout 2 --max-time 3 \
      --request PUT --header 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
      http://169.254.169.254/latest/api/token) || bg_die 'IMDSv2 token could not be obtained.'
    [[ "$token" =~ ^[A-Za-z0-9_=+./-]+$ && ${#token} -le 4096 ]] || bg_die 'Invalid IMDSv2 token.'
    actual=$(printf 'header = "X-aws-ec2-metadata-token: %s"\n' "$token" |
      curl -q --config - --silent --fail --noproxy '*' --max-redirs 0 --connect-timeout 2 --max-time 3 \
        --max-filesize 128 http://169.254.169.254/latest/meta-data/instance-id) || bg_die 'IMDSv2 instance identity failed.'
    [[ "$actual" == "$expected" ]] || bg_die 'Runner is on a different EC2 instance.'
}

bg_init() {
    local role=$1 file actual workflow expected name
    ENVIRONMENT=${BG_ENVIRONMENT:?}; RUN_ID=${GITHUB_RUN_ID:?}; ATTEMPT=${GITHUB_RUN_ATTEMPT:?}
    [[ "$ENVIRONMENT" == dev || "$ENVIRONMENT" == prod ]] || bg_die 'Invalid deployment environment.'
    [[ "$RUN_ID" =~ ^[1-9][0-9]*$ && "$ATTEMPT" == 1 ]] || bg_die 'Workflow reruns are not allowed.'
    [[ "${BG_MODE:-deploy}" == deploy || "${BG_MODE:-}" == bootstrap ]] || bg_die 'Invalid deployment mode.'
    BG_MODE=${BG_MODE:-deploy}
    [[ "${BG_IMAGE_DIGEST:-}" =~ ^sha256:[a-f0-9]{64}$ ]] || bg_die 'Expected an immutable image digest.'
    case "$role" in
      coordinator) name=jarihana-coordinator; file="/etc/jarihana-deploy/$ENVIRONMENT/coordinator.json" ;;
      app)
        [[ "${BG_SLOT:-}" == A || "${BG_SLOT:-}" == B ]] || bg_die 'Invalid application slot.'
        name=jarihana-runner; file="/etc/jarihana-deploy/$ENVIRONMENT/app-$BG_SLOT.json" ;;
      *) bg_die 'Invalid deployment role.' ;;
    esac
    [[ $(id -un) == "$name" ]] || bg_die 'Use the dedicated deployment account.'
    bg_config "$file"
    [[ $(jq -r '.topology.environment' <<< "$CONFIG") == "$ENVIRONMENT" ]] || bg_die 'Configuration environment differs.'
    CONTROL_SHA=$(jq -r '.topology.control.sha' <<< "$CONFIG")
    expected=$(jq -r '.topology.control.ref' <<< "$CONFIG")
    [[ "${BG_CONTROL_REF:-}" == "$expected" || "refs/tags/${BG_CONTROL_REF:-}" == "$expected" ]] || bg_die 'Control tag differs from administrator settings.'
    actual=$(git -C "$SCRIPT_ROOT" rev-parse HEAD)
    [[ "$actual" == "$CONTROL_SHA" ]] || bg_die 'Checked-out control code is not the approved SHA.'
    REPO=$(jq -r '.repository.full_name' <<< "$CONFIG")
    [[ "${GITHUB_REPOSITORY:-}" == "$REPO" && "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || bg_die 'Deployment repository or SHA differs.'
    BRANCH=main; [[ "$ENVIRONMENT" != dev ]] || BRANCH=develop
    expected="$REPO/.github/workflows/backend-$ENVIRONMENT-deploy.yml@refs/heads/$BRANCH"
    [[ "${GITHUB_REF:-}" == "refs/heads/$BRANCH" && "${GITHUB_WORKFLOW_REF:-}" == "$expected" ]] || bg_die 'Use the approved environment workflow and branch.'
    workflow=$(bg_github "/repos/$REPO/actions/workflows/backend-$ENVIRONMENT-deploy.yml")
    WORKFLOW_ID=$(jq -er --arg path ".github/workflows/backend-$ENVIRONMENT-deploy.yml" \
      'select(.path == $path and .state == "active") | .id | select(type == "number" and . > 0)' <<< "$workflow")
    bg_live
    if [[ "$role" == coordinator ]]; then
        bg_machine "$(jq -r '.topology.coordinator_instance_id' <<< "$CONFIG")"
        STATE_FILE="/var/lib/jarihana-deploy/$ENVIRONMENT/state.json"
    else
        [[ $(jq -r '.local_slot' <<< "$CONFIG") == "$BG_SLOT" ]] || bg_die 'Application configuration is for another slot.'
        bg_machine "$(jq -r --arg slot "$BG_SLOT" '.topology[($slot | ascii_downcase)].instance_id' <<< "$CONFIG")"
    fi
    umask 077
}

bg_atomic() {
    local path=$1 value=$2 temporary
    [[ -d $(dirname -- "$path") && ! -L "$path" ]] || bg_die 'Atomic state destination is invalid.'
    jq -es 'length == 1 and (.[0] | type == "object")' <<< "$value" >/dev/null || bg_die 'Refusing to save invalid state.'
    temporary=$(mktemp "$(dirname -- "$path")/.state.XXXXXX")
    chmod 600 "$temporary"
    printf '%s\n' "$value" > "$temporary"
    sync -f "$temporary"
    mv -f -- "$temporary" "$path"
    sync -f "$(dirname -- "$path")"
}

bg_grant() {
    local operation=$1 slot=$2 key hosts address temporary now
    key=$(jq -er '.journal_key' <<< "$CONFIG"); hosts=$(jq -er '.known_hosts' <<< "$CONFIG")
    address=$(jq -er '.coordinator_address | select(test("^[0-9.]+$"))' <<< "$CONFIG")
    [[ $(dirname -- "$key") == "/etc/jarihana-deploy/$ENVIRONMENT" && \
       $(dirname -- "$hosts") == "/etc/jarihana-deploy/$ENVIRONMENT" ]] || bg_die 'Grant key paths belong to another environment.'
    bg_root_file "$key" 16384 true; bg_root_file "$hosts"
    temporary=$(mktemp); chmod 600 "$temporary"
    if ! timeout 10 ssh -T -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=yes \
      -o "UserKnownHostsFile=$hosts" -o ConnectTimeout=3 -o ConnectionAttempts=1 \
      -o ServerAliveInterval=2 -o ServerAliveCountMax=2 "jarihana-grant@$address" > "$temporary" 2>/dev/null; then
        rm -f -- "$temporary"; bg_die 'Fresh coordinator grant could not be read.'
    fi
    if (( $(wc -c < "$temporary") > 4194304 )); then
        rm -f -- "$temporary"; bg_die 'Coordinator grant is oversized.'
    fi
    STATE=$(cat -- "$temporary"); rm -f -- "$temporary"
    jq -es 'length == 1 and (.[0] | type == "object")' <<< "$STATE" >/dev/null || bg_die 'Invalid coordinator grant JSON.'
    now=$(bg_now)
    jq -e --argjson run "$RUN_ID" --arg sha "$GITHUB_SHA" --arg control "$CONTROL_SHA" \
      --arg env "$ENVIRONMENT" --arg mode "$BG_MODE" --arg operation "$operation" --arg slot "$slot" \
      --arg image "$BG_IMAGE_DIGEST" --arg topology "$(bg_topology_digest)" --argjson now "$now" '
      .schema_version == 2 and .environment == $env and .run_id == $run and .attempt == 1 and
      .sha == $sha and .control_sha == $control and .mode == $mode and .image == $image and
      .topology_digest == $topology and (.old == "A" or .old == "B") and
      (.target == "A" or .target == "B") and .old != .target and
      .phase != "NEEDS_ATTENTION" and .expires_at > $now and
      .heartbeat <= $now and .created_at <= $now and
      .pending.operation == $operation and .pending.slot == $slot and .pending.deadline > $now and
      ([.deployment_id,.pending.id] | all(type == "string" and test("^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$"))) and
      (if $operation == "prepare" then .phase == "PREPARING" and .mode == "deploy" and $slot == .target
       elif $operation == "bootstrap" then .phase == "PREPARING" and .mode == "bootstrap" and $slot == .old
       elif $operation == "handoff" then .phase == "HANDOFF" and $slot == .old
       elif $operation == "activate" then .phase == "SWITCHING" and .switched and (.sealed | not) and $slot == .target
       elif $operation == "observe" then .phase == "OBSERVING" and .switched and (.sealed | not) and $slot == .target
       elif $operation == "complete" then .phase == "SEALED" and .sealed and $slot == .target
       elif $operation == "stop" then .phase == "SEALED" and .sealed and $slot == .old
       elif $operation == "rollback" then .phase == "ROLLING_BACK" and .http_recovered and (.sealed | not)
       else false end) and
      (.observation_failed != true or $operation != "observe")
    ' <<< "$STATE" >/dev/null || bg_die 'Deployment grant expired, was revoked, or belongs to another operation.'
    if [[ "$operation" == observe ]]; then bg_live_readonly; else bg_live; fi
}

bg_output() {
    local key=$1 value=$2 delimiter
    [[ "$key" =~ ^[a-z_][a-z0-9_]*$ && -n "${GITHUB_OUTPUT:-}" ]] || bg_die 'Invalid Actions output destination.'
    delimiter="bg-$(bg_uuid)"
    printf '%s<<%s\n%s\n%s\n' "$key" "$delimiter" "$value" "$delimiter" >> "$GITHUB_OUTPUT"
}
