#!/usr/bin/env bash
set -euo pipefail
[[ "$GITHUB_REPOSITORY" == woowacourse-teams/2026-jarihana && "$GITHUB_RUN_ATTEMPT" == 1 ]]
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]
[[ "$BG_ENVIRONMENT" == prod ]]
case "$GITHUB_EVENT_NAME" in
  push)
    [[ "$BG_MODE" == deploy && "$BG_PROD_AUTO_ENABLED" == true ]]
    [[ "$INPUT_FRONTEND_ONLY" == false && "$INPUT_BACKEND_ONLY" == false && -z "$INPUT_TAG" ]]
    ;;
  workflow_dispatch) ;;
  *) exit 1 ;;
esac
[[ "$BG_MODE" == deploy || "$BG_MODE" == bootstrap ]]
[[ "$BG_DEV_AUTO_ENABLED" == true || "$BG_DEV_AUTO_ENABLED" == false ]]
[[ "$BG_PROD_AUTO_ENABLED" == true || "$BG_PROD_AUTO_ENABLED" == false ]]
[[ -n "$BG_A_RUNNER" && -n "$BG_B_RUNNER" && "$BG_A_RUNNER" != "$BG_B_RUNNER" ]] || {
  echo '::error::환경별 A/B runner 라벨을 서로 다른 전용 라벨로 설정해야 합니다.'
  exit 1
}
[[ "$RDS_URL" =~ ^[a-zA-Z0-9.-]+$ ]] || {
  echo '::error::RDS_URL에는 운영 데이터베이스 호스트 이름만 지정할 수 있습니다.'
  exit 1
}
[[ "$GITHUB_REF" == refs/heads/main ]]
[[ "$BG_DEV_AUTO_ENABLED" != true ]] || {
  echo '::error::운영 배포 전에 공유 대기 서버의 개발 배포를 비활성화해야 합니다.'
  exit 1
}
frontend_only=false
backend_only=false
[[ "$INPUT_FRONTEND_ONLY" != true || "$INPUT_BACKEND_ONLY" != true ]] || {
  echo '::error::프론트 전용과 백엔드 전용은 함께 선택할 수 없습니다.'; exit 1;
}
if [[ "$BG_MODE" == deploy ]]; then
  if [[ "$INPUT_FRONTEND_ONLY" == true ]]; then
    frontend_only=true
  elif [[ "$INPUT_BACKEND_ONLY" == true ]]; then
    backend_only=true
  elif [[ "$GITHUB_EVENT_NAME" == push && "${BEFORE_SHA:-}" =~ ^[a-f0-9]{40}$ && "$BEFORE_SHA" != 0000000000000000000000000000000000000000 ]]; then
    git cat-file -e "$BEFORE_SHA^{commit}"
    shared=(infra .github/workflows/backend-{prod-deploy,prod-deploy-v2,bluegreen-deploy,bluegreen-deploy-v2,app-operation,bluegreen-phase,bluegreen-app-v2}.yml)
    backend_changes=$(git diff --name-only "$BEFORE_SHA" "$GITHUB_SHA" -- backend "${shared[@]}")
    frontend_changes=$(git diff --name-only "$BEFORE_SHA" "$GITHUB_SHA" -- frontend .github/workflows/frontend-prod-deploy.yml "${shared[@]}")
    if [[ -z "$backend_changes" && -n "$frontend_changes" ]]; then
      frontend_only=true
    elif [[ -z "$frontend_changes" && -n "$backend_changes" ]]; then
      backend_only=true
    fi
  fi
fi
echo "frontend_only=$frontend_only" >> "$GITHUB_OUTPUT"
echo "backend_only=$backend_only" >> "$GITHUB_OUTPUT"
if [[ "$frontend_only" == true ]]; then
  [[ -z "$INPUT_TAG" ]] || { echo '::error::프론트 전용 배포에서는 백엔드 이미지를 바꿀 수 없습니다.'; exit 1; }
  # 실제 이미지 다이제스트는 코디네이터가 마지막 완료 저널에서 읽는다.
  echo "digest=sha256:$(printf '%064d' 0)" >> "$GITHUB_OUTPUT"
  exit 0
fi
if [[ "$BG_MODE" == deploy ]]; then
  compose=$(mktemp)
  trap 'rm -f -- "$compose"' EXIT
  git show "$GITHUB_SHA:infra/blue-green-deploy/controller/app-compose.yml" > "$compose"
  bash infra/blue-green-deploy/scripts/actions/compose-preflight.sh "$compose" "$BG_ENVIRONMENT"
fi
if [[ "$BG_MODE" == bootstrap ]]; then
  [[ "$GITHUB_EVENT_NAME" == workflow_dispatch && -n "$INPUT_TAG" ]]
fi
if [[ -n "$INPUT_TAG" ]]; then
  [[ "$INPUT_TAG" =~ ^[a-f0-9]{40}$ ]]
  tag="$INPUT_TAG"
else
  tag="tree-$(git rev-parse HEAD:backend)"
fi
image=ghcr.io/woowacourse-teams/jarihana-backend
docker pull "${image}:${tag}"
resolved="$(docker image inspect --format '{{json .RepoDigests}}' "${image}:${tag}")"
digest="$(jq -er --arg image "$image" '[.[] | select(startswith($image + "@"))] | unique | if length == 1 then .[0] | split("@")[1] else error("ambiguous digest") end' <<< "$resolved")"
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
if [[ "$BG_MODE" == deploy && -n "$INPUT_TAG" ]]; then
  tree_tag="tree-$(git rev-parse HEAD:backend)"
  docker pull "${image}:${tree_tag}"
  tree_resolved="$(docker image inspect --format '{{json .RepoDigests}}' "${image}:${tree_tag}")"
  tree_digest="$(jq -er --arg image "$image" '[.[] | select(startswith($image + "@"))] | unique | if length == 1 then .[0] | split("@")[1] else error("ambiguous digest") end' <<< "$tree_resolved")"
  [[ "$digest" == "$tree_digest" ]] || { echo '::error::지정한 이미지가 운영 커밋의 백엔드 이미지와 다릅니다.'; exit 1; }
fi
echo "digest=$digest" >> "$GITHUB_OUTPUT"
