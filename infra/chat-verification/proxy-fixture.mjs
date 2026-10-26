import assert from "node:assert/strict";

// Local continuity-test proxy. Ports belong to the dedicated test backends.
export function localChatProxyConfig(color) {
  assert.ok(color === "blue" || color === "green", "Unknown local test backend");
  const port = color === "blue" ? 8097 : 8096;
  return `worker_processes auto;
pid /var/run/nginx.pid;
error_log /dev/stderr warn;
worker_shutdown_timeout 120s;
events { worker_connections 4096; }
http {
  access_log off;
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  server {
    listen 8080;
    location / {
      proxy_pass http://host.docker.internal:${port};
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
      proxy_read_timeout 90s;
      proxy_send_timeout 30s;
      add_header X-Jarihana-Color ${color} always;
    }
  }
}
`;
}
