#!/usr/bin/env bash
set -euo pipefail
revision=${1:?candidate revision}
head=$(git rev-parse --verify "${2:?develop reference}^{commit}")
if ! git merge-base --is-ancestor "$revision" "$head"; then
  echo 'Candidate revision is not on develop. Keeping the current deployment.' >&2
  exit 1
fi

# Use the automatic deployment filter at the develop revision we are comparing against.
# Restrict the GitHub glob subset to exact paths and recursive directories so Git agrees.
workflow=.github/workflows/realtime-deploy.yml
if ! paths=$(git show "$head:$workflow" | awk -v workflow="$workflow" '
  $0 == "on:" { in_events = 1; next }
  /^[^ #]/ { in_events = 0 }
  in_events && $0 == "  push:" { in_push = 1; next }
  /^  [^ #]/ { in_push = 0 }
  in_push && $0 == "    paths:" { reading = 1; next }
  !in_push || /^    [^ #]/ { reading = 0 }
  reading && /^ *($|#)/ { next }
  reading {
    if ($0 !~ /^      - "[-a-zA-Z0-9._\/]+(\/[*][*])?"$/) exit 1
    sub(/^      - "/, "")
    sub(/"$/, "")
    if ($0 == workflow) found_workflow = 1
    print
  }
  END { if (!found_workflow) exit 1 }
'); then
  echo 'Cannot read the realtime deploy path filter. Keeping the current deployment.' >&2
  exit 1
fi

pathspecs=()
while IFS= read -r path; do
  pathspecs+=(":(top,glob)$path")
done <<< "$paths"

if git diff --quiet --no-ext-diff --no-renames "$revision" "$head" -- "${pathspecs[@]}"; then
  exit 0
else
  if [[ $? -ne 1 ]]; then
    echo 'Cannot compare the candidate with develop. Keeping the current deployment.' >&2
    exit 1
  fi
  echo 'Develop contains newer realtime deployment changes. Keeping the current deployment.' >&2
  exit 1
fi
