#!/usr/bin/env bash
set -euo pipefail
DIRECTORY=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir "$TEST_DIR/bin"
printf '#!%s\n' "$BASH" >"$TEST_DIR/bin/bash"
cat >>"$TEST_DIR/bin/bash" <<'MOCK'
set -euo pipefail
[[ ${1##*/} == deployment-api-budget-case.sh ]]
shift
printf '%s\n' "$*" >>"$TRACE"
exit "${CASE_EXIT:-0}"
MOCK
chmod +x "$TEST_DIR/bin/bash"
export PATH="$TEST_DIR/bin:$PATH" TRACE="$TEST_DIR/all"
RUNNER="$DIRECTORY/run-api-budget.sh"
"$BASH" "$RUNNER" >"$TEST_DIR/full.log"
[[ $(wc -l <"$TRACE") -eq 12 ]]
[[ $(sort -u "$TRACE" | wc -l) -eq 12 ]]
: >"$TEST_DIR/combined"
for shard in 0 1 2 3; do
  export TRACE="$TEST_DIR/shard-$shard"
  "$BASH" "$RUNNER" "$shard" 4 >"$TEST_DIR/shard-$shard.log"
  [[ $(wc -l <"$TRACE") -eq 3 ]]
  cat "$TRACE" >>"$TEST_DIR/combined"
done
sort "$TEST_DIR/all" >"$TEST_DIR/expected"
sort "$TEST_DIR/combined" >"$TEST_DIR/actual"
cmp "$TEST_DIR/expected" "$TEST_DIR/actual"
echo 'PASS api-budget-runner four shards cover all 12 scenarios exactly once'
for args in '0 0' '4 4' '-1 4' '0 invalid' '0 13' '01 4' '0 4 extra'; do
  read -r -a arguments <<<"$args"
  status=0
  "$BASH" "$RUNNER" "${arguments[@]}" >"$TEST_DIR/invalid.log" 2>&1 || status=$?
  [[ $status == 2 ]]
done
echo 'PASS api-budget-runner invalid shards fail before execution'
export TRACE="$TEST_DIR/failed" CASE_EXIT=7
status=0
"$BASH" "$RUNNER" 0 4 >"$TEST_DIR/failed.log" 2>&1 || status=$?
[[ $status == 7 && $(wc -l <"$TRACE") -eq 1 ]]
echo 'PASS api-budget-runner scenario failure fails its shard'
