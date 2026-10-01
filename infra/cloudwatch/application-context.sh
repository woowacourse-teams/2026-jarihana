#!/usr/bin/env bash

target_environment="${TARGET_ENVIRONMENT-prod}"
case "${target_environment}" in
  prod)
    api_url=http://127.0.0.1:8080
    management_url=http://127.0.0.1:8081
    ;;
  dev)
    api_url=http://127.0.0.1:80
    management_url=http://127.0.0.1:81
    ;;
  *)
    printf 'Unsupported TARGET_ENVIRONMENT: %s (use prod or dev)\n' "${target_environment}" >&2
    exit 1
    ;;
esac
printf 'Application environment: %s; API: %s; management: %s\n' \
  "${target_environment}" "${api_url}" "${management_url}"
