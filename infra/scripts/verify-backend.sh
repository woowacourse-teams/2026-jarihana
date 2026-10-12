#!/usr/bin/env bash
# 배포 후 점검: readiness 대기와 스모크 테스트.
# 배포 직후와 롤백 직후에 같은 점검을 쓴다. 하나라도 실패하면 0이 아닌 값으로 끝난다.
# 사용법: verify-backend.sh <dev|prod>
set -euo pipefail

env_name="${1:?환경 이름(dev 또는 prod)이 필요하다}"
project="jarihana-${env_name}"

container_id="$(docker ps -q \
  --filter "label=com.docker.compose.project=${project}" \
  --filter 'label=com.docker.compose.service=backend')"
if [ -z "${container_id}" ]; then
  echo "점검 실패: ${project}의 backend 컨테이너가 없다"
  exit 1
fi

# readiness 대기: 관리 포트의 health는 DB 연결 상태를 포함하므로 준비 상태 확인으로 쓴다.
# 기동 중이거나 재시작을 되풀이하는 동안에는 기다리고, 120초 안에 UP이 아니면 실패한다.
ready=false
for _ in $(seq 1 40); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:8081/actuator/health | grep -q '"status":"UP"'; then
    ready=true
    break
  fi
  sleep 3
done
if [ "${ready}" != true ]; then
  echo "점검 실패: 120초 안에 health가 UP이 되지 않았다"
  exit 1
fi

# 스모크 테스트: 관리 포트 지표, 포트 바인딩, 공개 API, 공개 포트의 관리 엔드포인트 차단.
metrics="$(curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:8081/actuator/prometheus)"
[[ "${metrics}" == *jvm_memory_used_bytes* ]]
[[ "${metrics}" == *hikaricp_connections_active* ]]
[[ "${metrics}" == *"environment=\"${env_name}\""* ]]

test "$(docker port "${container_id}" 8081/tcp)" = "127.0.0.1:8081"

api_status="$(curl --silent --show-error --max-time 10 \
  --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8080/api/groups)"
test "${api_status}" = "200"

public_metrics_status="$(curl --silent --show-error --max-time 10 \
  --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8080/api/actuator/prometheus)"
test "${public_metrics_status}" = "403"

echo "점검 통과: $(docker inspect -f '{{.Config.Image}}' "${container_id}")"
