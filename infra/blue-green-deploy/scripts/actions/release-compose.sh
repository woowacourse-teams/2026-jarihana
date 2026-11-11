#!/usr/bin/env bash

# Validate Docker's resolved model before touching the existing standby container.
# Business environment values and resource limits belong to the application release.
app_validate_release_compose() {
  jq -e --arg image "$IMAGE_REPOSITORY@$BG_IMAGE_DIGEST" --arg container "$CONTAINER" \
    --arg host "$HOST_ID" --arg environment "$ENVIRONMENT" --arg digest "$BG_IMAGE_DIGEST" \
    --arg db "jdbc:postgresql://$RDS_URL:5432/jarihana_$ENVIRONMENT?sslmode=require" \
    --arg bind "$APP_BIND_ADDRESS" --arg app_port "$APP_PORT" --arg management_port "$MANAGEMENT_PORT" '
    def only($allowed): (keys - $allowed | length) == 0;
    only(["name", "services", "networks"]) and
    (.services | keys) == ["backend"] and
    (.networks | keys) == ["default"] and
    (.networks.default | only(["name", "ipam"]) and (.ipam // {}) == {}) and
    (.services.backend |
      only(["image", "container_name", "restart", "ports", "environment", "networks",
        "command", "entrypoint", "labels", "logging", "mem_limit", "mem_reservation",
        "cpus", "pids_limit", "stop_grace_period", "init", "read_only", "healthcheck"]) and
      .image == $image and .container_name == $container and .restart == "no" and
      .command == null and .entrypoint == null and .networks == {"default": null} and
      (.mem_limit | tonumber) > 0 and
      (.stop_grace_period | IN("2m0s", "120s")) and
      (.logging.driver | IN("local", "json-file")) and
      all(.ports[]; only(["mode", "host_ip", "target", "published", "protocol"]) and
        .protocol == "tcp" and (.mode // "ingress") == "ingress") and
      ([.ports[] | {host_ip, target, published}] | sort_by(.target)) ==
        [{host_ip: $bind, target: 8080, published: $app_port},
         {host_ip: "127.0.0.1", target: 8081, published: $management_port}] and
      (.environment |
        all(.[]; type == "string") and
        .DB_URL == $db and .SPRING_PROFILES_ACTIVE == $environment and .APP_VERSION == $digest and
        .PUSH_WORKER_CONTROL_ENABLED == "true" and .PUSH_WORKER_START_PAUSED == "true" and
        .PUSH_WORKER_HOST_ID == $host and .PUSH_WORKER_ENVIRONMENT == $environment and
        .WORKER_CONTROL_TOKEN == env.WORKER_CONTROL_TOKEN and
        .SERVER_SHUTDOWN == "graceful" and .SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE == "90s" and
        (.JDK_JAVA_OPTIONS | test("^-Xms[0-9]+[kKmMgG] -Xmx[0-9]+[kKmMgG]$")) and
        # Spring property aliases and JVM system properties must not override the contract.
        all(keys[]; test("^[A-Z][A-Z0-9_]*$") and
          (if test("^(JARIHANA_|SPRING_|MANAGEMENT_|SERVER_|JAVA_|JDK_|LOADER_)") then
            IN("SPRING_PROFILES_ACTIVE", "SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE",
              "SERVER_SHUTDOWN", "JDK_JAVA_OPTIONS")
           else true end))))
  ' "$1" >/dev/null 2>&1
}
