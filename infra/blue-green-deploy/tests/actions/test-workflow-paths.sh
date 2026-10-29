#!/usr/bin/env bash
# Exercise the actual pinned-control workflow run blocks against isolated checkouts.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
TEST_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEST_DIR"' EXIT
passed=0

extract_block() {
  local workflow=$1 entrypoint=$2 output=$3
  awk -v marker="script=infra/blue-green-deploy/scripts/actions/$entrypoint.sh" '
    /^        run: \|$/ { capture=1; block=""; matched=0; next }
    capture && /^          / {
      line=substr($0, 11)
      block=block line "\n"
      if (index(line, marker)) matched=1
      next
    }
    capture {
      if (matched) { printf "%s", block; count++ }
      capture=0; matched=0
    }
    END {
      if (capture && matched) { printf "%s", block; count++ }
      if (count != 1) exit 1
    }
  ' "$workflow" > "$output" || { printf 'Expected exactly one run block for %s\n' "$entrypoint" >&2; exit 1; }
}

run_cases() {
  local workflow=$1 entrypoint=$2 expected_arg=$3 case_name dir status expected
  local block=$TEST_DIR/$entrypoint-block.sh
  extract_block "$ROOT/.github/workflows/$workflow" "$entrypoint" "$block"
  for case_name in new legacy both neither new_failure; do
    dir=$TEST_DIR/$entrypoint-$case_name
    mkdir -p "$dir/infra/blue-green-deploy/scripts/actions" "$dir/infra/scripts/deploy/actions"
    if [[ $case_name == new || $case_name == both || $case_name == new_failure ]]; then
      cat > "$dir/infra/blue-green-deploy/scripts/actions/$entrypoint.sh" <<'STUB'
printf 'new:%s:%s\n' "$#" "${1-}" >> "$TRACE_FILE"
exit "${NEW_EXIT:-0}"
STUB
    fi
    if [[ $case_name == legacy || $case_name == both || $case_name == new_failure ]]; then
      cat > "$dir/infra/scripts/deploy/actions/$entrypoint.sh" <<'STUB'
printf 'legacy:%s:%s\n' "$#" "${1-}" >> "$TRACE_FILE"
STUB
    fi
    : > "$dir/trace"
    status=0
    (cd "$dir" && TRACE_FILE="$dir/trace" BG_OPERATION=operation-fixture BG_PHASE=phase-fixture \
      NEW_EXIT=$([[ $case_name == new_failure ]] && printf 23 || printf 0) bash "$block") > "$dir/output" 2>&1 || status=$?
    case $case_name in
      neither)
        [[ $status != 0 && ! -s $dir/trace ]] && grep -q '::error::' "$dir/output" || {
          printf '%s neither did not fail explicitly\n' "$entrypoint" >&2; exit 1;
        }
        ;;
      *)
        expected=0
        [[ $case_name != new_failure ]] || expected=23
        [[ $status == "$expected" ]] || { printf '%s %s returned %s, expected %s\n' "$entrypoint" "$case_name" "$status" "$expected" >&2; exit 1; }
        if [[ $case_name == legacy ]]; then expected=legacy; else expected=new; fi
        if [[ -n $expected_arg ]]; then
          printf '%s:1:%s\n' "$expected" "$expected_arg" > "$dir/expected"
        else
          printf '%s:0:\n' "$expected" > "$dir/expected"
        fi
        diff -u "$dir/expected" "$dir/trace"
        ;;
    esac
    passed=$((passed + 1))
    printf 'PASS workflow-path %s %s\n' "$entrypoint" "$case_name"
  done
}

run_cases backend-app-operation.yml app operation-fixture
run_cases backend-bluegreen-phase.yml coordinator phase-fixture
run_cases backend-bluegreen-deploy.yml queue-guard ''
printf 'WORKFLOW_PATH_TESTS_PASSED=%s\n' "$passed"
