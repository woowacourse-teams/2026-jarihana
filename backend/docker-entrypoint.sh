#!/bin/sh
set -eu

set -- -jar app.jar "$@"
if [ "${OTEL_SDK_DISABLED:-true}" = "false" ] && [ "${OTEL_TRACES_EXPORTER:-}" = "otlp" ]; then
    set -- -javaagent:/opt/opentelemetry/opentelemetry-javaagent.jar "$@"
fi

exec java "$@"
