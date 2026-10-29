#!/usr/bin/env bash
# Execute the actual hosted preflight blocks without Docker or cloud credentials.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
extract() {
  awk -v marker="$2" '
    /^        run: \|$/ { capture=1; block=""; matched=0; next }
    capture && /^          / { line=substr($0,11); block=block line "\n"; if(index(line,marker)) matched=1; next }
    capture { if(matched) { printf "%s",block; count++ }; capture=0 }
    END { if(capture && matched) { printf "%s",block; count++ }; if(count!=1) exit 1 }
  ' "$1" >"$3"
}
extract "$ROOT/.github/workflows/backend-prod-deploy.yml" '"$ENABLED" != true' "$TEST_DIR/enabled.sh"
extract "$ROOT/.github/workflows/backend-bluegreen-deploy.yml" 'frontend_only=false' "$TEST_DIR/resolve.sh"
export GITHUB_EVENT_NAME=push MODE=deploy ENABLED=false
if bash "$TEST_DIR/enabled.sh" >"$TEST_DIR/off.log" 2>&1; then exit 1; fi
grep -q '::error::' "$TEST_DIR/off.log"
echo 'PASS release-workflow disabled_push_no_deployment'
GITHUB_EVENT_NAME=workflow_dispatch MODE=deploy
if bash "$TEST_DIR/enabled.sh" >"$TEST_DIR/off.log" 2>&1; then exit 1; fi
echo 'PASS release-workflow disabled_manual_deploy_no_deployment'
MODE=bootstrap; bash "$TEST_DIR/enabled.sh"
echo 'PASS release-workflow disabled_bootstrap_explicit_exception'
MODE=deploy ENABLED=true; bash "$TEST_DIR/enabled.sh"
echo 'PASS release-workflow enabled_deploy'
mkdir -p "$TEST_DIR/source" "$TEST_DIR/deployment-control/infra/blue-green-deploy/scripts/actions" "$TEST_DIR/bin"
cat >"$TEST_DIR/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$DOCKER_TRACE"
if [[ $1 == image ]]; then
  tag=${!#}; number=1
  [[ $tag != *:tree-* ]] || number=2
  printf '["ghcr.io/woowacourse-teams/jarihana-backend@sha256:%064d"]\n' "$number"
fi
MOCK
cat >"$TEST_DIR/bin/git" <<'MOCK'
#!/usr/bin/env bash
case $1 in
  rev-parse) printf '%040d\n' 4;;
  diff)
    case ${CHANGE_SCOPE:-both} in
      backend) [[ " $* " != *' backend '* ]];;
      frontend) [[ " $* " != *' frontend '* ]];;
      both|infra) exit 1;;
    esac;;
esac
MOCK
chmod +x "$TEST_DIR/bin/"*
export PATH="$TEST_DIR/bin:$PATH" DOCKER_TRACE="$TEST_DIR/docker.log"
export GITHUB_REPOSITORY=woowacourse-teams/2026-jarihana GITHUB_RUN_ATTEMPT=1 GITHUB_REF=refs/heads/main
export BG_CONTROL_REF=refs/tags/deployment-control-test BG_ENVIRONMENT=prod BG_MODE=deploy BG_A_RUNNER=prod-A BG_B_RUNNER=prod-B
export BG_DEV_AUTO_ENABLED=false BG_PROD_AUTO_ENABLED=true RDS_URL=rds.example INPUT_TAG='' INPUT_FRONTEND_ONLY=true INPUT_BACKEND_ONLY=false BEFORE_SHA=''
export GITHUB_OUTPUT="$TEST_DIR/output" GITHUB_SHA=2222222222222222222222222222222222222222
if (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh") >"$TEST_DIR/old.log" 2>&1; then exit 1; fi
[[ ! -e $DOCKER_TRACE ]]
grep -q 'lacks coordinated frontend release capability' "$TEST_DIR/old.log"
echo 'PASS release-workflow old_control_rejected_before_mutation'
echo 'FE_RELEASE_CAPABILITY=2' >"$TEST_DIR/deployment-control/infra/blue-green-deploy/scripts/actions/frontend.sh"
if (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh") >"$TEST_DIR/v2.log" 2>&1; then exit 1; fi
[[ ! -e $DOCKER_TRACE ]]
echo 'PASS release-workflow control_without_api_budget_rejected'
echo 'FE_RELEASE_CAPABILITY=3' >"$TEST_DIR/deployment-control/infra/blue-green-deploy/scripts/actions/frontend.sh"
(cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh")
grep -qx frontend_only=true "$GITHUB_OUTPUT"
[[ ! -e $DOCKER_TRACE ]]
echo 'PASS release-workflow frontend_only_does_not_resolve_source_backend'
INPUT_BACKEND_ONLY=true
if (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh") >"$TEST_DIR/conflict.log" 2>&1; then exit 1; fi
[[ ! -e $DOCKER_TRACE ]]
echo 'PASS release-workflow conflicting_scopes_rejected_before_mutation'
INPUT_FRONTEND_ONLY=false INPUT_BACKEND_ONLY=false BEFORE_SHA=1111111111111111111111111111111111111111
GITHUB_EVENT_NAME=push
for scope in backend frontend both infra; do
  export CHANGE_SCOPE=$scope
  : >"$GITHUB_OUTPUT"
  (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh")
  case $scope in
    backend) grep -qx backend_only=true "$GITHUB_OUTPUT"; grep -qx frontend_only=false "$GITHUB_OUTPUT";;
    frontend) grep -qx frontend_only=true "$GITHUB_OUTPUT"; grep -qx backend_only=false "$GITHUB_OUTPUT";;
    both|infra) grep -qx frontend_only=false "$GITHUB_OUTPUT"; grep -qx backend_only=false "$GITHUB_OUTPUT";;
  esac
  echo "PASS release-workflow automatic_scope_$scope"
done
BEFORE_SHA=''
INPUT_FRONTEND_ONLY=false INPUT_TAG=1111111111111111111111111111111111111111
if (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh") >"$TEST_DIR/mismatch.log" 2>&1; then exit 1; fi
grep -q 'must match the caller backend tree' "$TEST_DIR/mismatch.log"
echo 'PASS release-workflow manual_backend_tag_mismatch_rejected'
