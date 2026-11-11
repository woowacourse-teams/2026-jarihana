#!/usr/bin/env bash

# Only exact optional mappings from the allowlist can differ.
app_compose_protected_content() {
  awk '
    /^[^ ]/ { services = ($0 == "services:"); backend = environment = 0 }
    /^  [^ ]/ { backend = (services && $0 == "  backend:"); environment = 0 }
    /^    [^ ]/ { environment = (backend && $0 == "    environment:") }
    environment && $0 == "      POINTS_STARTS_AT: \"${POINTS_STARTS_AT:-}\"" { next }
    { print }
  ' "$1"
}

app_compose_matches_control() {
  local approved release
  approved=$(app_compose_protected_content "$1") || return 1
  release=$(app_compose_protected_content "$2") || return 1
  [[ "$release" == "$approved" ]]
}
