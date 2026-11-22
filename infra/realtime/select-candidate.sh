#!/usr/bin/env bash
# The dedicated runner stores only the latest release's revision and digest. Environment secrets
# are collected separately for every dispatch and never go into this record.
set -euo pipefail
umask 077
state_dir=${1:?realtime state directory}
record="$state_dir/latest-candidate"
fail() { echo "::error::$*" >&2; exit 1; }

[[ "$GITHUB_REF" == refs/heads/develop ]] || fail 'Candidates must come from develop.'
case "$GITHUB_EVENT_NAME" in push|workflow_dispatch) ;; *) fail 'Unexpected candidate event.' ;; esac
previous_revision=
previous_digest=
if [[ -f "$record" ]]; then
  read -r previous_revision previous_digest < "$record"
  [[ "$previous_revision" =~ ^[0-9a-f]{40}$ && "$previous_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'Invalid candidate record.'
fi

if [[ -n "${RESUME_DIGEST:-}" ]]; then
  [[ "$GITHUB_EVENT_NAME" == workflow_dispatch && -z "${PUBLISHED_DIGEST:-}" ]] || fail 'A resume must skip publishing.'
  [[ "$RESUME_DIGEST" == "$previous_digest" ]] || fail 'This digest is not the latest recorded candidate.'
  revision=$previous_revision
  digest=$previous_digest
else
  revision=$GITHUB_SHA
  digest=${PUBLISHED_DIGEST:?Missing published digest}
  [[ "$revision" =~ ^[0-9a-f]{40}$ && "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'Invalid published candidate.'
  if [[ -n "$previous_revision" ]]; then
    git merge-base --is-ancestor "$previous_revision" "$revision" || fail 'An older publication cannot replace the latest candidate.'
  fi
fi

# This checkout is develop as seen when the serialised candidate job starts. An unrelated
# frontend or DB migration commit can land while prod catches up; newer server releases take precedence.
bash infra/realtime/check-candidate-revision.sh "$revision" HEAD

if [[ -z "${RESUME_DIGEST:-}" ]]; then
  mkdir -p -- "$state_dir"
  pending=$(mktemp "$state_dir/latest-candidate.XXXXXX")
  trap 'rm -f -- "$pending"' EXIT
  printf '%s %s\n' "$revision" "$digest" > "$pending"
  mv -- "$pending" "$record"
fi
printf 'revision=%s\ndigest=%s\n' "$revision" "$digest" >> "$GITHUB_OUTPUT"
printf 'Realtime candidate `%s` from `%s`. Resume on develop with `resume_digest=%s`.\n' "$digest" "$revision" "$digest" >> "$GITHUB_STEP_SUMMARY"
