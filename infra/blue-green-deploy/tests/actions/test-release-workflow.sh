#!/usr/bin/env bash
# Exercise release routing with real Compose parsing and a fixture image registry response.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
extract() {
  awk -v marker="$2" '
    /^        run: \|-?$/ { capture=1; block=""; matched=0; next }
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
# 진입점에서 실제 사용하는 선택 스텝을 실행한다.
extract "$ROOT/.github/workflows/backend-prod-deploy.yml" 'workflow_dispatch:V2)' "$TEST_DIR/engine.sh"
check_engine() {
  local event=$1 selected=$2 expected=$3
  : > "$TEST_DIR/engine-output"
  GITHUB_EVENT_NAME="$event" SELECTED="$selected" GITHUB_OUTPUT="$TEST_DIR/engine-output" bash "$TEST_DIR/engine.sh"
  [[ $(cat "$TEST_DIR/engine-output") == "engine=$expected" ]]
}
manual="$ROOT/.github/workflows/backend-prod-deploy.yml"
automatic="$ROOT/.github/workflows/backend-prod-deploy-v2.yml"
if grep -q '^  push:' "$manual" || grep -q '^  workflow_dispatch:' "$automatic"; then exit 1; fi
grep -qx '  push:' "$automatic"
grep -qx '      - main' "$automatic"
grep -qx '    uses: ./.github/workflows/backend-bluegreen-deploy-v2.yml' "$automatic"
grep -qx '  group: backend-prod-deploy' "$automatic"
grep -qx '  group: backend-prod-deploy' "$manual"
check_engine workflow_dispatch '' V1
check_engine workflow_dispatch V1 V1
check_engine workflow_dispatch V2 V2
if GITHUB_EVENT_NAME=workflow_dispatch SELECTED=unknown GITHUB_OUTPUT="$TEST_DIR/engine-output" bash "$TEST_DIR/engine.sh"; then exit 1; fi
echo 'PASS release-workflow main 자동 배포는 V2 한 번, 수동 배포는 V1 또는 V2'
extract "$ROOT/.github/workflows/backend-bluegreen-prepare-v2.yml" '"$GITHUB_WORKFLOW_REF"' "$TEST_DIR/v2-gate.sh"
(
  export GITHUB_REPOSITORY=woowacourse-teams/2026-jarihana GITHUB_REF=refs/heads/main BG_ENVIRONMENT=prod
  export GITHUB_EVENT_NAME=push MODE=deploy ENABLED=true
  export GITHUB_WORKFLOW_REF="$GITHUB_REPOSITORY/.github/workflows/backend-prod-deploy-v2.yml@refs/heads/main"
  # Actions invokes Bash run steps with errexit enabled.
  bash -e "$TEST_DIR/v2-gate.sh"
  for denied in GITHUB_EVENT_NAME=workflow_dispatch MODE=bootstrap ENABLED=false GITHUB_REF=refs/heads/develop; do
    if env "$denied" bash -e "$TEST_DIR/v2-gate.sh"; then exit 1; fi
  done
  GITHUB_WORKFLOW_REF="$GITHUB_REPOSITORY/.github/workflows/backend-prod-deploy.yml@refs/heads/main"
  if bash -e "$TEST_DIR/v2-gate.sh"; then exit 1; fi
  GITHUB_EVENT_NAME=workflow_dispatch
  export REQUESTED_MODE=deploy
  bash -e "$TEST_DIR/v2-gate.sh"
  MODE=bootstrap ENABLED=false
  if bash -e "$TEST_DIR/v2-gate.sh"; then exit 1; fi
  export REQUESTED_MODE=bootstrap
  bash -e "$TEST_DIR/v2-gate.sh"
)
echo 'PASS release-workflow V2 호출 파일, 이벤트, 운영 허용 여부 확인'
mkdir -p "$TEST_DIR/source" "$TEST_DIR/bin"
mkdir -p "$TEST_DIR/source/infra/blue-green-deploy/scripts/actions"
cp "$ROOT/infra/blue-green-deploy/scripts/actions/compose-preflight.sh" "$TEST_DIR/source/infra/blue-green-deploy/scripts/actions/"
export REAL_GIT=$(command -v git)
export REAL_DOCKER=$(command -v docker)
export RELEASE_COMPOSE_FIXTURE="$ROOT/infra/blue-green-deploy/controller/app-compose.yml"
cat >"$TEST_DIR/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$DOCKER_TRACE"
if [[ $1 == compose ]]; then exec "$REAL_DOCKER" "$@"; fi
if [[ "$1 $2" == "manifest inspect" ]]; then
  [[ $# == 4 && $3 == --verbose ]] || exit 1
  case ${REGISTRY_FIXTURE:-arm64} in
    denied) exit 1 ;;
    index) echo '[{"Descriptor":{"digest":"sha256:child"}}]'; exit 0 ;;
  esac
  number=2
  [[ $4 == *:tree-* || ${REGISTRY_FIXTURE:-} != mismatch ]] || number=1
  digest=$(printf 'sha256:%064d' "$number")
  arch=arm64
  [[ ${REGISTRY_FIXTURE:-} != amd64 ]] || arch=amd64
  [[ ${REGISTRY_FIXTURE:-} != malformed ]] || digest=invalid
  printf '{"Descriptor":{"mediaType":"application/vnd.oci.image.manifest.v1+json","digest":"%s","platform":{"os":"linux","architecture":"%s"}}}\n' "$digest" "$arch"
  exit 0
fi
if [[ $1 == image ]]; then
  tag=${!#}; number=1
  [[ $tag != *:tree-* ]] || number=2
  printf '["ghcr.io/woowacourse-teams/jarihana-backend@sha256:%064d"]\n' "$number"
fi
MOCK
cat >"$TEST_DIR/bin/git" <<'MOCK'
#!/usr/bin/env bash
if [[ ${USE_REAL_GIT:-false} == true ]]; then exec "$REAL_GIT" "$@"; fi
case $1 in
  show) cat "$RELEASE_COMPOSE_FIXTURE";;
  rev-parse) if [[ $2 == HEAD ]]; then echo "${CHECKOUT_SHA:-$GITHUB_SHA}"; else printf '%040d\n' 4; fi;;
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
export BG_ENVIRONMENT=prod BG_MODE=deploy BG_A_RUNNER=prod-A BG_B_RUNNER=prod-B
export BG_DEV_AUTO_ENABLED=false BG_PROD_AUTO_ENABLED=true RDS_URL=rds.example INPUT_TAG='' INPUT_FRONTEND_ONLY=true INPUT_BACKEND_ONLY=false BEFORE_SHA=''
export GITHUB_OUTPUT="$TEST_DIR/output" GITHUB_SHA=2222222222222222222222222222222222222222
export CHECKOUT_SHA=1111111111111111111111111111111111111111
if (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh") >"$TEST_DIR/wrong-sha.log" 2>&1; then exit 1; fi
[[ ! -e $DOCKER_TRACE ]]
echo 'PASS release-workflow mismatched_checkout_rejected_before_mutation'
unset CHECKOUT_SHA
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
export CHANGE_SCOPE=backend
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
INPUT_FRONTEND_ONLY=false INPUT_BACKEND_ONLY=false BEFORE_SHA=''
REAL_COMPOSE_FIXTURE=$RELEASE_COMPOSE_FIXTURE
printf 'services: [\n' >"$TEST_DIR/invalid-compose.yml"
export RELEASE_COMPOSE_FIXTURE="$TEST_DIR/invalid-compose.yml"
: >"$DOCKER_TRACE"
if (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh") >"$TEST_DIR/invalid-compose.log" 2>&1; then exit 1; fi
grep -q 'Release Compose syntax or model is invalid' "$TEST_DIR/invalid-compose.log"
! grep -q '^pull ' "$DOCKER_TRACE"
echo 'PASS release-workflow invalid_compose_rejected_before_image_pull_or_plan'
export RELEASE_COMPOSE_FIXTURE=$REAL_COMPOSE_FIXTURE
BG_ENVIRONMENT=dev GITHUB_REF=refs/heads/develop BG_PROD_AUTO_ENABLED=false INPUT_TAG=''
: >"$DOCKER_TRACE"
(cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh")
grep -q '^compose .*config --no-interpolate' "$DOCKER_TRACE"
echo 'PASS release-workflow development_deploy_checks_compose'
BG_ENVIRONMENT=prod GITHUB_REF=refs/heads/main BG_PROD_AUTO_ENABLED=true
BG_MODE=bootstrap GITHUB_EVENT_NAME=workflow_dispatch INPUT_TAG=1111111111111111111111111111111111111111
: >"$DOCKER_TRACE"
(cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh")
! grep -q '^compose ' "$DOCKER_TRACE"
echo 'PASS release-workflow bootstrap_keeps_existing_container_contract'
BG_MODE=deploy GITHUB_EVENT_NAME=push
BEFORE_SHA=''
INPUT_FRONTEND_ONLY=false INPUT_TAG=1111111111111111111111111111111111111111
if (cd "$TEST_DIR/source" && bash "$TEST_DIR/resolve.sh") >"$TEST_DIR/mismatch.log" 2>&1; then exit 1; fi
grep -q 'must match the caller backend tree' "$TEST_DIR/mismatch.log"
echo 'PASS release-workflow manual_backend_tag_mismatch_rejected'

# 수동 V2가 운영에서 실행할 대상과 실제로 조회하는 이미지를 함께 확인한다.
compact_resolve="$ROOT/infra/blue-green-deploy/scripts/compact/resolve.sh"
export GITHUB_EVENT_NAME=workflow_dispatch INPUT_TAG='' CHANGE_SCOPE=both
for scope in frontend backend both; do
  INPUT_FRONTEND_ONLY=false INPUT_BACKEND_ONLY=false
  case $scope in frontend) INPUT_FRONTEND_ONLY=true;; backend) INPUT_BACKEND_ONLY=true;; esac
  : > "$GITHUB_OUTPUT"
  : > "$DOCKER_TRACE"
  (cd "$TEST_DIR/source" && bash "$compact_resolve")
  grep -qx "frontend_only=$INPUT_FRONTEND_ONLY" "$GITHUB_OUTPUT"
  grep -qx "backend_only=$INPUT_BACKEND_ONLY" "$GITHUB_OUTPUT"
  if [[ $scope == frontend ]]; then
    [[ ! -s $DOCKER_TRACE ]]
  else
    grep -q '^manifest inspect --verbose .*:tree-' "$DOCKER_TRACE"
    if grep -Eq '^(pull |image inspect )' "$DOCKER_TRACE"; then exit 1; fi
  fi
  echo "PASS release-workflow manual_v2_scope_$scope"
done
export INPUT_FRONTEND_ONLY=false INPUT_BACKEND_ONLY=true INPUT_TAG="$GITHUB_SHA"
: > "$DOCKER_TRACE"
: > "$GITHUB_OUTPUT"
(cd "$TEST_DIR/source" && bash "$compact_resolve")
[[ $(grep -c '^manifest inspect --verbose ' "$DOCKER_TRACE") == 2 ]]
grep -qx "digest=$(printf 'sha256:%064d' 2)" "$GITHUB_OUTPUT"
if (cd "$TEST_DIR/source" && RELEASE_COMPOSE_FIXTURE="$TEST_DIR/invalid-compose.yml" bash "$compact_resolve"); then exit 1; fi
[[ $(grep -c '^manifest inspect --verbose ' "$DOCKER_TRACE") == 2 ]]
for registry_fixture in mismatch denied index amd64 malformed; do
  : > "$GITHUB_OUTPUT"
  if (cd "$TEST_DIR/source" && REGISTRY_FIXTURE="$registry_fixture" bash "$compact_resolve"); then exit 1; fi
  if grep -q '^digest=' "$GITHUB_OUTPUT"; then exit 1; fi
done
echo 'PASS release-workflow V2 verifies both tag digests and rejects unusable manifests'
: > "$GITHUB_OUTPUT"
: > "$DOCKER_TRACE"
(cd "$TEST_DIR/source" && BG_MODE=bootstrap INPUT_BACKEND_ONLY=false bash "$compact_resolve")
grep -qx "digest=$(printf 'sha256:%064d' 1)" "$GITHUB_OUTPUT"
grep -q '^pull ' "$DOCKER_TRACE"
if grep -q '^manifest ' "$DOCKER_TRACE"; then exit 1; fi
echo 'PASS release-workflow V2 bootstrap resolves the historical image'
export INPUT_TAG=''
export INPUT_FRONTEND_ONLY=true INPUT_BACKEND_ONLY=true
if (cd "$TEST_DIR/source" && bash "$compact_resolve"); then exit 1; fi
export GITHUB_EVENT_NAME=push INPUT_FRONTEND_ONLY=false INPUT_BACKEND_ONLY=false USE_REAL_GIT=true
cd "$TEST_DIR/source"
mkdir -p backend frontend infra/blue-green-deploy/controller .github/workflows .github/scripts
cp "$REAL_COMPOSE_FIXTURE" infra/blue-green-deploy/controller/app-compose.yml
touch backend/file frontend/file
git init -q
git config user.name fixture
git config user.email fixture@example.com
git config commit.gpgsign false
git config core.hooksPath /dev/null
git add .
git commit -qm initial
catalog_dir=backend/src/main/resources/db/migration
mkdir -p "$catalog_dir"
for scope in frontend backend both workflow build-helper unrelated_migration v48 v49 after_catalogs; do
  BEFORE_SHA=$(git rev-parse HEAD)
  case $scope in
    frontend) echo changed >> frontend/file ;;
    backend) echo changed >> backend/file ;;
    both) echo both >> frontend/file; echo both >> backend/file ;;
    workflow) touch .github/workflows/backend-prod-deploy-v2.yml ;;
    build-helper) touch .github/scripts/production-frontend-build.cjs ;;
    unrelated_migration) echo changed >> frontend/file; touch "$catalog_dir/V50__unrelated.sql" ;;
    v48) echo changed >> frontend/file; touch "$catalog_dir/V48__space_furniture_interactions.sql" ;;
    v49) echo changed >> frontend/file; touch "$catalog_dir/V49__space_portable_item_catalog.sql" ;;
    after_catalogs) echo changed >> frontend/file; echo changed >> backend/file ;;
  esac
  git add .
  git commit -qm "$scope"
  GITHUB_SHA=$(git rev-parse HEAD)
  : > "$GITHUB_OUTPUT"
  : > "$DOCKER_TRACE"
  bash "$compact_resolve"
  case $scope in
    frontend) grep -qx frontend_only=true "$GITHUB_OUTPUT"; grep -qx backend_only=false "$GITHUB_OUTPUT"; [[ ! -s $DOCKER_TRACE ]] ;;
    backend|v48|v49) grep -qx backend_only=true "$GITHUB_OUTPUT"; grep -qx frontend_only=false "$GITHUB_OUTPUT"; grep -q '^manifest inspect --verbose .*:tree-' "$DOCKER_TRACE" ;;
    *) grep -qx frontend_only=false "$GITHUB_OUTPUT"; grep -qx backend_only=false "$GITHUB_OUTPUT"; grep -q '^manifest inspect --verbose .*:tree-' "$DOCKER_TRACE" ;;
  esac
  echo "PASS release-workflow automatic_v2_scope_$scope"
done
BEFORE_SHA=$(git rev-parse HEAD~3)
: > "$GITHUB_OUTPUT"
bash "$compact_resolve"
grep -qx backend_only=true "$GITHUB_OUTPUT"
grep -qx frontend_only=false "$GITHUB_OUTPUT"
echo 'PASS release-workflow automatic_v2_catalogs_added_in_multi_commit_push'

: > "$GITHUB_OUTPUT"
: > "$DOCKER_TRACE"
GITHUB_EVENT_NAME=workflow_dispatch INPUT_FRONTEND_ONLY=true bash "$compact_resolve"
grep -qx frontend_only=true "$GITHUB_OUTPUT"
grep -qx backend_only=false "$GITHUB_OUTPUT"
[[ ! -s $DOCKER_TRACE ]]
echo 'PASS release-workflow manual_v2_frontend_after_catalogs'

BEFORE_SHA=0000000000000000000000000000000000000000
: > "$GITHUB_OUTPUT"
bash "$compact_resolve"
grep -qx frontend_only=false "$GITHUB_OUTPUT"
grep -qx backend_only=false "$GITHUB_OUTPUT"
: > "$DOCKER_TRACE"
for denied in BG_MODE=bootstrap BG_PROD_AUTO_ENABLED=false INPUT_FRONTEND_ONLY=true INPUT_TAG="$GITHUB_SHA" GITHUB_REF=refs/heads/develop BEFORE_SHA=ffffffffffffffffffffffffffffffffffffffff; do
  if env "$denied" bash "$compact_resolve"; then exit 1; fi
done
[[ ! -s $DOCKER_TRACE ]]
echo 'PASS release-workflow 정상 main push만 자동 V2 배포 허용'
