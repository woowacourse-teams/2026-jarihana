#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/blue-green-deploy/scripts/actions/queue-guard.sh"
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bg-queue-guard.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir "$TEST_DIR/bin"
export GUARD_CLOCK="$TEST_DIR/clock" GUARD_EVENTS="$TEST_DIR/events" GUARD_CASE
export GITHUB_REPOSITORY=woowacourse-teams/2026-jarihana GITHUB_RUN_ID=123 GITHUB_RUN_ATTEMPT=1
export GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa GH_TOKEN=test-not-a-secret
cat > "$TEST_DIR/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
method=GET; output=; url=
while (( $# )); do
  case $1 in
    --request) method=$2; shift 2;;
    --output) output=$2; shift 2;;
    https:*) url=$1; shift;;
    *) shift;;
  esac
done
cat >/dev/null
printf '%s %s\n' "$method" "$url" >> "$GUARD_EVENTS"
[[ $url == "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/123"* ]] || exit 90
if [[ $method == POST ]]; then
  [[ $url == */cancel ]] || exit 91
  : > "$output"
  [[ $GUARD_CASE != unknown-post ]] || exit 7
  printf 202; exit
fi
if [[ $url != *'/attempts/1/jobs?per_page=100' ]]; then
  jq -cn --arg repo "$GITHUB_REPOSITORY" --arg sha "$GITHUB_SHA" --arg scenario "$GUARD_CASE" --argjson now "$(cat "$GUARD_CLOCK")" '
    {id:123,head_sha:$sha,run_attempt:1,status:"in_progress",conclusion:null,repository:{id:1321030074,full_name:$repo},head_repository:{id:1321030074,full_name:$repo}} |
    if $scenario=="rerun" then .run_attempt=2
    elif $scenario=="wrong-parent-sha" then .head_sha="foreign"
    elif $scenario=="wrong-parent-id" then .id=124
    elif $scenario=="wrong-repository" then .repository.id=1
    elif $scenario=="wrong-head-repository" then .head_repository.full_name="foreign/repo"
    elif $scenario=="malformed-repository" then .repository="invalid"
    elif $scenario=="missing-conclusion" then del(.conclusion)
    elif $scenario=="parent-cancelled" then .conclusion="cancelled"
    elif $scenario=="parent-queued-timeout" then .status="queued"
    elif $scenario=="parent-transition" then .status=(["in_progress","queued","waiting","pending","requested","in_progress","completed"][($now/30|floor)])
    elif ($scenario|startswith("parent-")) then .status=($scenario|ltrimstr("parent-")) else . end' > "$output"
else
  [[ $GUARD_CASE != query-failure ]] || exit 7
  jq -cn --arg scenario "$GUARD_CASE" --argjson now "$(cat "$GUARD_CLOCK")" --arg sha "$GITHUB_SHA" '
    {id:1,run_id:123,head_sha:$sha,name:"blue-green / prepare / operation",status:"queued",labels:["jarihana-dev-b"]} |
    if $scenario=="wrong-sha" then .head_sha="foreign" elif $scenario=="wrong-run" then .run_id=124
    elif ($scenario=="parent-transition" or ($scenario|IN("parent-queued","parent-waiting","parent-pending","parent-requested"))) then .status="in_progress"
    elif $scenario=="reset" and $now==60 then .status="in_progress"
    elif $scenario=="waiting" then .status="waiting"
    elif $scenario=="hosted" then .labels=["ubuntu-latest"] else . end |
    {total_count:1,jobs:[.]} |
    if ($scenario=="result" or (($scenario=="reset" or $scenario=="waiting" or $scenario=="hosted") and $now>=390) or (($scenario|IN("parent-queued","parent-waiting","parent-pending","parent-requested")) and $now>=60)) then
      .jobs += [{id:2,run_id:123,head_sha:$sha,name:"blue-green / deployment-result",status:"completed",labels:["ubuntu-latest"]}] | .total_count=2
    elif $scenario=="too-many" then .total_count=101
    elif $scenario=="fractional" then .jobs[0].id=1.5
    elif $scenario=="oversized" then .padding=("x" * 2097153) else . end' > "$output"
fi
printf 200
MOCK
chmod +x "$TEST_DIR/bin/curl"
export PATH="$TEST_DIR/bin:$PATH"
q_now() { cat "$GUARD_CLOCK"; }
sleep() {
  [[ $1 == 30 ]] || { echo "Guardian poll must be 30 seconds" >&2; return 1; }
  local now; now=$(cat "$GUARD_CLOCK")
  if [[ $GUARD_CASE == expiry ]]; then now=7200
  elif [[ $GUARD_CASE == backwards ]]; then now=-1
  else now=$((now+$1)); fi
  printf '%s\n' "$now" > "$GUARD_CLOCK"
}
run_case() {
  local scenario=$1 expected=$2 cancels=$3 code=0 actual
  export GUARD_CASE=$scenario
  printf '0\n' > "$GUARD_CLOCK"; : > "$GUARD_EVENTS"
  ( main ) > "$TEST_DIR/output" 2>&1 || code=$?
  [[ $code == "$expected" ]] || { cat "$TEST_DIR/output"; echo "Unexpected exit: $scenario $code"; return 1; }
  actual=$(awk '$1=="POST"{n++} END{print n+0}' "$GUARD_EVENTS")
  [[ $actual == "$cancels" ]] || { echo "Wrong cancellation count: $scenario $actual"; return 1; }
  if grep -Fq -- "$GH_TOKEN" "$TEST_DIR/output" "$GUARD_EVENTS"; then echo 'Token leaked'; return 1; fi
  if [[ $scenario == queued || $scenario == parent-queued-timeout ]]; then
    [[ $(cat "$GUARD_CLOCK") == 300 ]] || { echo 'Queue trigger missed 300-second threshold'; return 1; }
    [[ $(awk '$1=="GET"{n++} END{print n+0}' "$GUARD_EVENTS") == 22 ]] || { echo 'Unexpected guardian API read budget'; return 1; }
  fi
  case $scenario in
    wrong-parent-sha) grep -q 'identity differs: head_sha' "$TEST_DIR/output";;
    wrong-parent-id) grep -q 'identity differs: run_id' "$TEST_DIR/output";;
    rerun) grep -q 'identity differs: run_attempt' "$TEST_DIR/output";;
    wrong-repository) grep -q 'identity differs: repository' "$TEST_DIR/output";;
    wrong-head-repository) grep -q 'identity differs: head_repository' "$TEST_DIR/output";;
    parent-unknown|parent-cancelled|missing-conclusion) grep -q 'lifecycle is unknown or already concluded' "$TEST_DIR/output";;
  esac
  printf 'PASS queue-guard %s\n' "$scenario"
}
run_case queued 1 1
run_case parent-queued 0 0
run_case parent-waiting 0 0
run_case parent-pending 0 0
run_case parent-requested 0 0
run_case parent-transition 0 0
run_case parent-queued-timeout 1 1
run_case parent-unknown 1 1
run_case parent-cancelled 1 1
run_case wrong-parent-sha 1 1
run_case wrong-parent-id 1 1
run_case wrong-repository 1 1
run_case wrong-head-repository 1 1
run_case malformed-repository 1 1
run_case missing-conclusion 1 1
run_case reset 0 0
run_case result 0 0
run_case waiting 0 0
run_case hosted 0 0
run_case expiry 1 1
run_case backwards 1 1
run_case query-failure 1 1
run_case unknown-post 1 1
run_case wrong-sha 1 1
run_case wrong-run 1 1
run_case rerun 1 1
run_case too-many 1 1
run_case fractional 1 1
run_case oversized 1 1
