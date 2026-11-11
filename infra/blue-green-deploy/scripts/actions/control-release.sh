#!/usr/bin/env bash
set -euo pipefail

control_changed() (
  local repository=$1 previous=$2 candidate=$3 temporary status
  git -C "$repository" cat-file -e "$previous^{commit}" || return 2
  git -C "$repository" cat-file -e "$candidate^{commit}" || return 2
  temporary=$(mktemp -d)
  trap 'rm -rf "$temporary"' EXIT
  git -C "$repository" diff --quiet "$previous" "$candidate" -- \
    infra/blue-green-deploy/scripts infra/blue-green-deploy/control \
    infra/blue-green-deploy/controller infra/blue-green-deploy/nginx \
    ':(exclude)infra/blue-green-deploy/controller/app-compose.yml' && status=0 || status=$?
  [[ $status != 1 ]] || return 0
  [[ $status == 0 ]] || return 2
  local compose=infra/blue-green-deploy/controller/app-compose.yml
  git -C "$repository" show "$previous:$compose" >"$temporary/previous" || return 2
  git -C "$repository" show "$candidate:$compose" >"$temporary/candidate" || return 2
  # Use the installed allowlist, so a new exception also requires a control upgrade.
  git -C "$repository" show "$previous:infra/blue-green-deploy/scripts/actions/release-compose.sh" >"$temporary/compare.sh" || return 0
  source "$temporary/compare.sh"
  if app_compose_matches_control "$temporary/previous" "$temporary/candidate"; then return 1; fi
)

control_tag() {
  [[ $1 =~ ^[a-f0-9]{40}$ ]] || return 1
  printf 'refs/tags/deployment-control-prod-%s\n' "$1"
}

control_select() {
  [[ $GITHUB_REPOSITORY == woowacourse-teams/2026-jarihana && $GITHUB_REF == refs/heads/main && $GITHUB_RUN_ATTEMPT == 1 ]]
  local config=$1 journal=$2 previous ref current tag_record changed
  previous=$(jq -er '.topology.control.sha' "$config")
  ref=$(jq -er '.topology.control.ref' "$config")
  [[ $previous =~ ^[a-f0-9]{40}$ && $ref =~ ^refs/tags/deployment-control-[A-Za-z0-9._-]+$ ]]
  git fetch --no-tags origin "$ref"
  [[ $(git rev-parse 'FETCH_HEAD^{commit}') == "$previous" ]]
  [[ $(git rev-parse HEAD) == "$GITHUB_SHA" ]]
  if control_changed "$PWD" "$previous" "$GITHUB_SHA"; then changed=true
  else
    [[ $? == 1 ]] || return 1
    changed=false
  fi
  # A previous upgrade may have finished before image resolution/build failed.
  # Revalidate all hosts and renew that exact journal transition on a new run.
  if [[ $(jq -er .control_sha "$journal") != "$previous" ]]; then changed=true; fi
  if [[ $changed == true ]]; then
    ref=$(control_tag "$GITHUB_SHA")
    tag_record=$(gh api "repos/$GITHUB_REPOSITORY/git/matching-refs/${ref#refs/}")
    if [[ $(jq length <<<"$tag_record") == 0 ]]; then
      gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" -f ref="$ref" -f sha="$GITHUB_SHA" >/dev/null
    fi
    current=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/${ref#refs/}" --jq .object.sha)
    [[ $current == "$GITHUB_SHA" ]] || { echo 'Control tag points to another commit' >&2; return 1; }
    echo changed=true >>"$GITHUB_OUTPUT"
  else
    echo changed=false >>"$GITHUB_OUTPUT"
  fi
  printf 'control_ref=%s\n' "$ref" >>"$GITHUB_OUTPUT"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  control_select /etc/jarihana-deploy/prod/coordinator.json /var/lib/jarihana-deploy/prod/state.json
fi
