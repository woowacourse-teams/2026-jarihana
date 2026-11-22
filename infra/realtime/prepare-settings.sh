#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DB_USERNAME:?Set DB_USERNAME in the API Environment}"
: "${DB_PASSWORD:?Set DB_PASSWORD in the API Environment}"
: "${ACCESS_TOKEN_SECRET:?Set ACCESS_TOKEN_SECRET in the API Environment}"
if [[ ! "$RDS_URL" =~ ^[a-zA-Z0-9.-]+$ || ! "$FRONTEND_ORIGIN" =~ ^https?://[^/,[:space:]]+$ ]]; then
  echo 'Expected an RDS hostname and a single frontend origin.' >&2
  exit 1
fi

token_key=$(printf '%s' "$ACCESS_TOKEN_SECRET" | node infra/realtime/derive-token-key.mjs "$TARGET")
unset ACCESS_TOKEN_SECRET
echo "::add-mask::$token_key"
jdbc_url="jdbc:postgresql://$RDS_URL:5432/jarihana_$TARGET?sslmode=require"

# A dedicated runner keeps this private tmpfs directory available between jobs.
mkdir -p -- "$REALTIME_HANDOFF_ROOT"
[[ -O "$REALTIME_HANDOFF_ROOT" && ! -L "$REALTIME_HANDOFF_ROOT" ]]
chmod 700 "$REALTIME_HANDOFF_ROOT"
run_attempt="$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
find "$REALTIME_HANDOFF_ROOT" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*-[0-9]*' \
  ! -name "$run_attempt" -mmin +60 -exec rm -rf -- {} +
handoff_dir="$REALTIME_HANDOFF_ROOT/$run_attempt"
mkdir -p -- "$handoff_dir"
pending=$(mktemp "$handoff_dir/$TARGET.XXXXXX")
trap 'rm -f -- "$pending"' EXIT
printf '%s\0' "$token_key" "$jdbc_url" "$DB_USERNAME" "$DB_PASSWORD" "$FRONTEND_ORIGIN" > "$pending"
mv -- "$pending" "$handoff_dir/$TARGET"
