#!/usr/bin/env bash
# Execute boundary checks without AWS/GitHub credentials or production access.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/scripts/deploy/actions/common.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEST_DIR"' EXIT
passed=0
pass() { passed=$((passed+1)); printf 'ok common: %s\n' "$1"; }
reject() { if ( "$@" ) >"$TEST_DIR/rejected.log" 2>&1; then printf 'unexpected acceptance: %s\n' "$*" >&2; exit 1; fi; }

ENVIRONMENT=dev; RUN_ID=100; ATTEMPT=1; BRANCH=develop; BG_MODE=deploy
GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
CONTROL_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
REPO=woowacourse-teams/2026-jarihana; WORKFLOW_ID=9
GITHUB_OUTPUT="$TEST_DIR/output"
MOCK_API_BODY=$(jq -cn --arg sha "$GITHUB_SHA" --arg repo "$REPO" '{id:100,run_attempt:1,head_sha:$sha,head_branch:"develop",workflow_id:9,path:".github/workflows/backend-dev-deploy.yml",event:"workflow_dispatch",repository:{id:1321030074,full_name:$repo},head_repository:{id:1321030074,full_name:$repo},status:"in_progress",conclusion:null}')
bg_github() { printf '%s\n' "$MOCK_API_BODY"; }
bg_live; pass 'approved live parent accepted'
original=$MOCK_API_BODY
for status in queued waiting pending requested; do
  MOCK_API_BODY=$(jq -c --arg status "$status" '.status=$status' <<< "$original")
  bg_live; pass "approved nonterminal parent accepted ($status)"
  MOCK_API_BODY=$(jq -c '.head_sha="wrong"' <<< "$MOCK_API_BODY")
  reject bg_live; pass "nonterminal parent still checks SHA ($status)"
done
for mutation in '.run_attempt=2' '.head_sha="wrong"' '.head_branch="main"' '.status="completed"' '.repository.id=1' '.head_repository.id=1' '.workflow_id=1' '.path=".github/workflows/other.yml"' '.conclusion="cancelled"'; do
  MOCK_API_BODY=$(jq -c "$mutation" <<< "$original"); reject bg_live; pass "different parent rejected ($mutation)"
done
for mutation in '.status="unknown"' '.status=null' 'del(.status)' 'del(.conclusion)' '.status="queued" | .conclusion="cancelled"'; do
  MOCK_API_BODY=$(jq -c "$mutation" <<< "$original"); reject bg_live; pass "invalid lifecycle rejected ($mutation)"
done
MOCK_API_BODY=$original; BG_MODE=bootstrap
MOCK_API_BODY=$(jq -c '.event="push"' <<< "$original"); reject bg_live; pass 'push cannot bootstrap'
MOCK_API_BODY=$original; BG_MODE=deploy

FAKE_NOW=1000
bg_now() { printf '%s\n' "$FAKE_NOW"; }
bg_github() { printf 'read\n' >> "$TEST_DIR/api-reads"; printf '%s\n' "$MOCK_API_BODY"; }
BG_READ_ONLY_VERIFIED_AT=0
bg_live_readonly
MOCK_API_BODY=$(jq -c '.status="completed" | .conclusion="cancelled"' <<< "$original")
bg_live_readonly
[[ $(wc -l < "$TEST_DIR/api-reads") -eq 1 ]] || exit 1
reject bg_live
pass 'observation may reuse a bounded successful read but mutations always recheck cancellation'
FAKE_NOW=1030
reject bg_live_readonly
reject bg_live_readonly
[[ $(wc -l < "$TEST_DIR/api-reads") -eq 4 ]] || exit 1
FAKE_NOW=999
reject bg_live_readonly
pass 'expired or backwards-clock parent reads are refreshed; failed reads are not cached'
MOCK_API_BODY=$original; FAKE_NOW=1000; BG_READ_ONLY_VERIFIED_AT=0

mkdir "$TEST_DIR/state"
if [[ $(uname -s) == Linux ]]; then
  bg_atomic "$TEST_DIR/state/state.json" '{"revision":1}'
  [[ $(jq -r '.revision' "$TEST_DIR/state/state.json") == 1 ]] || exit 1
  [[ $(stat -c '%a' "$TEST_DIR/state/state.json") == 600 ]] || exit 1
  bg_atomic "$TEST_DIR/state/state.json" '{"revision":2}'
  [[ $(jq -r '.revision' "$TEST_DIR/state/state.json") == 2 ]] || exit 1
  reject bg_atomic "$TEST_DIR/state/state.json" 'not JSON'
  ln -s "$TEST_DIR/state/state.json" "$TEST_DIR/link"
  reject bg_atomic "$TEST_DIR/link" '{"revision":3}'
  pass 'atomic state replacement preserves private mode and refuses invalid/symlink writes'
  if [[ $(id -u) == 0 ]]; then
    chmod 700 "$TEST_DIR" "$TEST_DIR/state"
    printf '{"safe":true}' > "$TEST_DIR/state/protected.json"; chmod 640 "$TEST_DIR/state/protected.json"
    bg_root_file "$TEST_DIR/state/protected.json" 100 true
    chmod 644 "$TEST_DIR/state/protected.json"
    reject bg_root_file "$TEST_DIR/state/protected.json" 100 true
    chmod 660 "$TEST_DIR/state/protected.json"
    reject bg_root_file "$TEST_DIR/state/protected.json" 100
    chmod 640 "$TEST_DIR/state/protected.json"
    reject bg_root_file "$TEST_DIR/state/protected.json" 2
    pass 'real Linux permissions reject public secrets, writable and oversized configuration'
    for example in full-app-A.example.json full-coordinator.example.json; do
      cp "$ROOT/infra/deploy/controller/$example" "$TEST_DIR/state/config.json"
      chmod 640 "$TEST_DIR/state/config.json"
      bg_config "$TEST_DIR/state/config.json"
      pass "valid root example accepted ($example)"
    done
    for mutation in '.management_port=8081.5' '.app_port=.management_port' '.compose_file="/etc/jarihana-deploy/prod/app-compose.yml"' '.worker_token_file="/etc/jarihana-deploy/prod/worker-token"'; do
      jq "$mutation" "$ROOT/infra/deploy/controller/full-app-A.example.json" > "$TEST_DIR/state/config.json"
      reject bg_config "$TEST_DIR/state/config.json"
      pass "invalid app configuration rejected ($mutation)"
    done
    for mutation in '.nginx.directory="/var/lib/jarihana-deploy/prod/nginx"' '.telemetry.url="http://user:password@host/prometheus"' '.ec2.region="other"'; do
      jq "$mutation" "$ROOT/infra/deploy/controller/full-coordinator.example.json" > "$TEST_DIR/state/config.json"
      reject bg_config "$TEST_DIR/state/config.json"
      pass "invalid coordinator configuration rejected ($mutation)"
    done
  fi
fi

if command -v timeout >/dev/null; then
  mkdir "$TEST_DIR/bin"
  cat > "$TEST_DIR/bin/ssh" <<'SSH'
#!/usr/bin/env bash
cat "$BG_TEST_GRANT_FILE"
SSH
  chmod 700 "$TEST_DIR/bin/ssh"
  export PATH="$TEST_DIR/bin:$PATH" BG_TEST_GRANT_FILE="$TEST_DIR/grant.json"
  # File permissions were exercised above. Here only the SSH transport is a double.
  bg_root_file() { :; }
  BG_IMAGE_DIGEST=sha256:$(printf 'a%.0s' {1..64})
  CONFIG='{"topology":{"environment":"dev","a":{"slot":"A"},"b":{"slot":"B"}},"coordinator_address":"10.0.0.5","journal_key":"/etc/jarihana-deploy/dev/grant-key","known_hosts":"/etc/jarihana-deploy/dev/known-hosts"}'
  grant=$(jq -cn --arg sha "$GITHUB_SHA" --arg control "$CONTROL_SHA" --arg image "$BG_IMAGE_DIGEST" --arg topology "$(bg_topology_digest)" '{schema_version:2,environment:"dev",run_id:100,attempt:1,sha:$sha,control_sha:$control,mode:"deploy",image:$image,topology_digest:$topology,phase:"PREPARING",old:"A",target:"B",created_at:1000,heartbeat:1000,expires_at:2000,deployment_id:"11111111-1111-1111-1111-111111111111",pending:{id:"22222222-2222-2222-2222-222222222222",operation:"prepare",slot:"B",deadline:1500},switched:false,sealed:false,observation_failed:false}')
  printf '%s\n' "$grant" > "$BG_TEST_GRANT_FILE"
  bg_grant prepare B
  pass 'exact fresh SSH grant accepted'
  for mutation in '.phase="NEEDS_ATTENTION"' '.phase="SEALED"' '.pending.operation="stop"' '.pending.slot="A"' '.pending.deadline=1000' '.run_id=101' '.sha="wrong"' '.topology_digest="changed"' '.old="B"' '.pending.id="------------------------------------"'; do
    jq -c "$mutation" <<< "$grant" > "$BG_TEST_GRANT_FILE"
    reject bg_grant prepare B
    pass "unsafe or stale grant rejected ($mutation)"
  done
  printf '%s\n' "$grant" > "$BG_TEST_GRANT_FILE"
  MOCK_API_BODY=$(jq -c '.status="completed"' <<< "$original")
  reject bg_grant prepare B
  pass 'a fresh journal cannot authorize an ended GitHub run'
  MOCK_API_BODY=$original
fi
bg_uuid() { printf '11111111-1111-1111-1111-111111111111\n'; }
bg_output result '{"safe":true}'
grep -q '^result<<bg-' "$GITHUB_OUTPUT" && grep -q '{"safe":true}' "$GITHUB_OUTPUT"
reject bg_output 'bad-name' value
pass 'Actions outputs use bounded names and multiline delimiters'
printf 'COMMON_TESTS_PASSED=%s\n' "$passed"
