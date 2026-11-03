# 앱 A/B 호스트 구성

[서버 구성](README.md)의 입력과 고정 제어 릴리스를 각 호스트에 준비한다.
이 절차는 새 서버용이며, 기존 앱의 재시작/교체 명령이 아니다. 기존 활성 A에서 설정을 읽기
대조했지만 B의 현재 내부 설정, 새 호스트 설치와 아래 최초 기동 명령 전체는 미검증이다.

## 계정, 슬롯과 보호된 설정

각 서버의 관리자 Bash에서 실행한다. `CONTROL_DIR`는 [릴리스 준비](README.md#고정-제어-릴리스-준비)의
root 소유 Git checkout이다. 동일 서버에 A/B 앱 두 개를 설치하지 않는다.

```bash
set -euo pipefail
test "$(id -u)" -eq 0
read -r -p '이 호스트의 논리 슬롯 A 또는 B: ' APP_SLOT
[[ $APP_SLOT == A || $APP_SLOT == B ]]
getent group jarihana-runner >/dev/null || groupadd --system jarihana-runner
id -u jarihana-runner >/dev/null 2>&1 || useradd --system --gid jarihana-runner \
  --create-home --home-dir /var/lib/jarihana-runner --shell /bin/bash jarihana-runner
usermod -aG docker jarihana-runner
install -d -o root -g root -m 0755 /etc/jarihana-deploy /var/lib/jarihana-deploy
install -d -o root -g jarihana-runner -m 0750 /etc/jarihana-deploy/prod
install -d -o jarihana-runner -g jarihana-runner -m 0700 \
  "/var/lib/jarihana-deploy/prod/app-$APP_SLOT"
install -d -o jarihana-runner -g jarihana-runner -m 0750 /opt/jarihana-prod-actions-runner
INPUT_DIR=/root/jarihana-reconstruction
install -d -o root -g root -m 0700 "$INPUT_DIR"
```

관리자가 `full-app-A.example.json` 또는 `full-app-B.example.json`을 보호된 입력에 복사해 수정한다.
environment=prod, local_slot, 실제 host_id, instance ID, private port, coordinator_address와
container_name/project를 채운다. topology 전체는 Nginx와 같아야 한다.
운영 담당자가 파일명이나 runner 표시 이름을 믿지 않고 EC2 instance ID를 기준으로 대조한다.

```bash
test -f "$INPUT_DIR/app-$APP_SLOT.json"
jq -e --arg slot "$APP_SLOT" --arg ref "$CONTROL_REF" --arg sha "$CONTROL_SHA" \
  '.local_slot==$slot and .topology.environment=="prod" and .topology.control.ref==$ref and .topology.control.sha==$sha' \
  "$INPUT_DIR/app-$APP_SLOT.json" >/dev/null
install -o root -g jarihana-runner -m 0640 "$INPUT_DIR/app-$APP_SLOT.json" \
  "/etc/jarihana-deploy/prod/app-$APP_SLOT.json"
install -o root -g jarihana-runner -m 0640 \
  "$CONTROL_DIR/infra/blue-green-deploy/controller/app-compose.yml" /etc/jarihana-deploy/prod/app-compose.yml
cmp -s "$CONTROL_DIR/infra/blue-green-deploy/controller/app-compose.yml" /etc/jarihana-deploy/prod/app-compose.yml
runuser -u jarihana-runner -- bash -c \
  'ENVIRONMENT=prod
   source "$1/infra/blue-green-deploy/scripts/actions/common.sh"
   bg_config "$2"
   bg_machine "$(jq -r ".topology.${3,,}.instance_id" "$2")"' \
  _ "$CONTROL_DIR" "/etc/jarihana-deploy/prod/app-$APP_SLOT.json" "$APP_SLOT"
```

runner는 [공통 등록 절차](README.md#runner-등록과-부팅-설정)에 따라 jarihana-runner로 실행한다.
BLUE_GREEN_PROD_A_RUNNER/B_RUNNER의 라벨과 실제 서버를 대응시킨다.
서비스 기동 뒤 User와 Docker 그룹을 확인하며 root로 대신 실행하지 않는다.

## worker 토큰과 SSH 키

아래 생성은 비밀 원본이 아직 없는 신규 환경에만 적용한다. 기존 환경의 토큰이나 SSH 키를
재생성하면 기존 컨테이너/authorized_keys와 달라지므로 보호 백업 복원과 갱신 계획을 먼저 확인한다.

```bash
umask 077
test ! -e /etc/jarihana-deploy/prod/worker-token
openssl rand -hex 32 > "$INPUT_DIR/worker-token"
install -o root -g jarihana-runner -m 0640 "$INPUT_DIR/worker-token" /etc/jarihana-deploy/prod/worker-token
test ! -e /etc/jarihana-deploy/prod/grant-key
ssh-keygen -q -t ed25519 -N '' -f "$INPUT_DIR/grant-key"
install -o root -g jarihana-runner -m 0640 "$INPUT_DIR/grant-key" /etc/jarihana-deploy/prod/grant-key
install -o root -g root -m 0644 "$INPUT_DIR/grant-key.pub" /etc/jarihana-deploy/prod/grant-key.pub
ssh-keygen -lf /etc/jarihana-deploy/prod/grant-key.pub
```

공개키만 Nginx 담당자에게 전달하고 [authorized_keys 설치](coordinator.md#앱의-읽기-전용-ssh-허가-조회)를 진행한다.
known-hosts는 신뢰 경로로 받은 Nginx host key와 실제 coordinator private IP를 묶은 한 줄이다.
일반 포트 22의 형식은 `PRIVATE_IP ssh-ed25519 PUBLIC_HOST_KEY`이며 관리자가 지문을 대조한 파일을
`INPUT_DIR/known-hosts`에 준비한다. 비밀키 값이나 토큰을 화면에 출력하지 않는다.

```bash
test -f "$INPUT_DIR/known-hosts"
install -o root -g jarihana-runner -m 0640 "$INPUT_DIR/known-hosts" /etc/jarihana-deploy/prod/known-hosts
```

아래 SSH 검사는 bootstrap 이후 coordinator에 실제 저널이 생긴 뒤 수행한다.
신규 환경의 준비 단계에서는 이 블록을 건너뛰고 앱 Alloy와 A의 PAUSED 준비로 진행한다.
조회 실패를 피하려고 저널을 위조하지 않는다.

```bash
runuser -u jarihana-runner -- bash -c '
  c="/etc/jarihana-deploy/prod/app-$1.json"
  ssh -T -i /etc/jarihana-deploy/prod/grant-key -o BatchMode=yes \
    -o StrictHostKeyChecking=yes -o UpdateHostKeys=no \
    -o UserKnownHostsFile=/etc/jarihana-deploy/prod/known-hosts -o ConnectTimeout=3 \
    "jarihana-grant@$(jq -r .coordinator_address "$c")" |
    jq -e "{environment,phase,run_id,control_sha,topology_digest}"
' _ "$APP_SLOT"
```

키 소유권이 root/0640이므로 실제 서비스 계정에서 검사한다. 관리자 root의 SSH 검사 결과만으로
runner의 읽기 성공 여부를 판단하지 않는다. 이전 서버의 SSH 세션이나 private key를 다른 호스트와 공유하지 않는다.

## 앱 Alloy

앱과 다른 Compose 프로젝트로 구성한다. [앱 Alloy 계약](README.md#앱-alloy와-조회-경로)에 있는
변수 이름과 WAL 복원 기준을 따른다. 저장소 checkout의 임시 작업 경로 대신 root 소유의 고정 경로에 설치한다.

```bash
install -d -o root -g root -m 0755 /opt/jarihana-app-observability
install -o root -g root -m 0644 "$CONTROL_DIR/infra/blue-green-deploy/controller/observability-compose.yml" \
  /opt/jarihana-app-observability/docker-compose.yml
install -o root -g root -m 0644 "$CONTROL_DIR/infra/monitoring/alloy/config.alloy" \
  /opt/jarihana-app-observability/config.alloy
install -o root -g root -m 0644 "$CONTROL_DIR/infra/monitoring/alloy/postgres-queries.yaml" \
  /opt/jarihana-app-observability/postgres-queries.yaml
# 아래는 환경 파일의 키 목록이다. 보호 원본에서 실제 값을 준비하며 이 예시로 기동하지 않는다.
cat > "$INPUT_DIR/alloy.env.example" <<'ENV'
DEPLOY_ENVIRONMENT=prod
DEPLOY_HOST_ID=REPLACE_ME
MANAGEMENT_PORT=8081
ALLOY_CONFIG_FILE=/opt/jarihana-app-observability/config.alloy
POSTGRES_QUERIES_FILE=/opt/jarihana-app-observability/postgres-queries.yaml
ALLOY_STORAGE_VOLUME=REPLACE_ME
PROMETHEUS_REMOTE_WRITE_URL=REPLACE_ME
LOKI_PUSH_URL=REPLACE_ME
POSTGRES_MONITOR_DSN=REPLACE_ME
ENV
```

관리자가 이 키를 가진 `INPUT_DIR/alloy.env`를 준비한다. DEPLOY_HOST_ID는 해당 슬롯의 host_id,
MANAGEMENT_PORT는 app JSON과 같게 한다. 외부 WAL은 실제 이름을 이어받는다.
신규 빈 환경에서만 volume을 생성한다. 기존 WAL을 복원해야 하는데 찾지 못하면 중단한다.

```bash
test -f "$INPUT_DIR/alloy.env"
if grep -q REPLACE_ME "$INPUT_DIR/alloy.env"; then exit 1; fi
install -o root -g root -m 0600 "$INPUT_DIR/alloy.env" /etc/jarihana-deploy/prod/alloy.env
read -r -p 'alloy.env와 같은 이 호스트 전용 WAL volume 이름: ' ALLOY_STORAGE_VOLUME
read -r -p '새 WAL이면 new, 기존 WAL 복원이면 restore: ' WAL_MODE
case "$WAL_MODE" in
  new)
    if docker volume inspect "$ALLOY_STORAGE_VOLUME" >/dev/null 2>&1; then exit 1; fi
    docker volume create "$ALLOY_STORAGE_VOLUME" >/dev/null ;;
  restore) docker volume inspect "$ALLOY_STORAGE_VOLUME" >/dev/null ;;
  *) exit 1 ;;
esac
docker compose --env-file /etc/jarihana-deploy/prod/alloy.env -p jarihana-app-observability-prod \
  -f /opt/jarihana-app-observability/docker-compose.yml config --quiet
docker compose --env-file /etc/jarihana-deploy/prod/alloy.env -p jarihana-app-observability-prod \
  -f /opt/jarihana-app-observability/docker-compose.yml run --rm --no-deps alloy validate /etc/alloy/config.alloy
docker compose --env-file /etc/jarihana-deploy/prod/alloy.env -p jarihana-app-observability-prod \
  -f /opt/jarihana-app-observability/docker-compose.yml up -d alloy
curl --fail --silent --show-error http://127.0.0.1:12345/-/ready
curl --fail --silent --show-error http://127.0.0.1:12345/-/healthy
```

restore는 보호된 백업에서 WAL 데이터를 복원한 volume이 이미 있다는 뜻이다. 이름만 같은 빈 volume은
복원으로 간주하지 않는다. 데이터 복원 시 쓰기를 멈춘 일관된 백업, UID/GID와 접근 권한을 대조한다.
Docker daemon의 enable과 Alloy의 restart policy로 부팅 후에도 volume/config를 읽는지 확인한다.
같은 host_id의 이중 전송을 피하도록 기존 Alloy 전환은 별도 변경 작업으로 진행한다.
volume 생성/복원과 재부팅, 새 host_id의 로그 도착은 미검증이며 [상태 확인](../status.md)을 수행한다.

## 신규 환경의 A를 PAUSED로 준비

이 절은 worker 권한이 미할당인 신규 환경에서만 실행한다. 기존 owner, 미해결 intent나 기존
컨테이너가 있으면 멈춘다. 신규 B 앱은 기동하지 않고 최초 prepare workflow에 맡긴다.
bootstrap workflow 자체는 앱을 설치하지 않으므로 A의 최초 PAUSED 기동 준비가 필요하다.

관리자가 [앱 workflow](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/backend-app-operation.yml)의
env를 기준으로 값을 Bash 형식으로 인용한 `INPUT_DIR/bootstrap.env`를 준비한다.
GitHub Variables 이름과 프로세스 안의 이름이 다른 OAuth 설정은 workflow의 대응을 그대로 사용한다.

| 입력 그룹 | bootstrap.env의 키 |
| --- | --- |
| DB/인증 | RDS_URL, DB_USERNAME, DB_PASSWORD, ACCESS_TOKEN_SECRET, FRONTEND_ORIGIN |
| 초대 | INVITATION_TOKEN_ACTIVE_KEY_ID, INVITATION_TOKEN_KEY_PRIMARY, INVITATION_TOKEN_KEY_PREVIOUS |
| OAuth | GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, GITHUB_OAUTH_REDIRECT_URI |
| push | PUSH_ENABLED, PUSH_WORKER_ENABLED, PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY, PUSH_VAPID_SUBJECT |
| 이미지 | IMAGE_S3_BUCKET, IMAGE_S3_REGION, IMAGE_S3_KEY_PREFIX, IMAGE_S3_PUBLIC_BASE_URL, IMAGE_CDN_DELIVERY_BASE_URL, IMAGE_CLOUDFRONT_KEY_PAIR_ID, IMAGE_CLOUDFRONT_PRIVATE_KEY |
| 선택 | SENTRY_BACKEND_DSN |

필수 값과 활성 기능에 필요한 키를 보호 원본에서 채우며 선택 값만 빈 값을 허용한다.
RDS_URL은 endpoint만, PEM은 Bash 인용 안에서 줄바꿈을 보존한다. bootstrap.env는
컨테이너 기동 환경을 전달하는 파일이며 Compose 구조나 PAUSED/graceful 설정은 변경하지 않는다.

```bash
test "$APP_SLOT" = A
test -f "$INPUT_DIR/bootstrap.env"
install -o root -g jarihana-runner -m 0640 "$INPUT_DIR/bootstrap.env" /etc/jarihana-deploy/prod/bootstrap.env
# 다음 블록은 별도 jarihana-runner Bash에서 실행한다. 관리자 셸의 변수를 이어받지 않는다.
runuser -u jarihana-runner -- bash
```

```bash
set -euo pipefail
set +x
c=/etc/jarihana-deploy/prod/app-A.json
env_file=/etc/jarihana-deploy/prod/bootstrap.env
if grep -q REPLACE_ME "$env_file"; then exit 1; fi
bash -n "$env_file" 2>/dev/null || { printf '환경 파일 구문 확인 실패\n' >&2; exit 1; }
set -a
. "$env_file"
set +a
[[ $RDS_URL =~ ^[a-zA-Z0-9.-]+$ ]]
read -r -p '승인 backend 이미지의 40자리 commit tag: ' BOOTSTRAP_IMAGE_TAG
read -r -p '승인 sha256 digest: ' BACKEND_DIGEST
[[ $BOOTSTRAP_IMAGE_TAG =~ ^[a-f0-9]{40}$ ]]
[[ $BACKEND_DIGEST =~ ^sha256:[a-f0-9]{64}$ ]]
export BACKEND_DIGEST BACKEND_IMAGE=ghcr.io/woowacourse-teams/jarihana-backend
export DEPLOY_ENVIRONMENT=prod DEPLOY_DB_NAME=jarihana_prod
export DEPLOY_HOST_ID="$(jq -r .topology.a.host_id "$c")"
export APP_BIND_ADDRESS="$(jq -r '.topology.a.upstream|split(":")[0]' "$c")"
export APP_PORT="$(jq -r .app_port "$c")" MANAGEMENT_PORT="$(jq -r .management_port "$c")"
export DEPLOY_CONTAINER="$(jq -r .container_name "$c")"
export WORKER_CONTROL_TOKEN="$(cat /etc/jarihana-deploy/prod/worker-token)"
project=$(jq -r .project "$c")
test -z "$(docker ps -aq --filter "name=^/$DEPLOY_CONTAINER$")"
bootstrap_auth_dir=$(mktemp -d /var/lib/jarihana-deploy/prod/app-A/registry.XXXXXX)
export DOCKER_CONFIG="$bootstrap_auth_dir"
trap 'rm -rf -- "$bootstrap_auth_dir"' EXIT
read -r -p 'GHCR 읽기 권한을 가진 사용자: ' registry_user
read -r -s -p 'GHCR 읽기 토큰: ' registry_token
printf '\n'
printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin
unset registry_token
docker pull "$BACKEND_IMAGE:$BOOTSTRAP_IMAGE_TAG" >/dev/null
docker image inspect --format '{{json .RepoDigests}}' "$BACKEND_IMAGE:$BOOTSTRAP_IMAGE_TAG" |
  jq -e --arg expected "$BACKEND_IMAGE@$BACKEND_DIGEST" 'index($expected)!=null' >/dev/null
docker compose --env-file /dev/null -p "$project" -f /etc/jarihana-deploy/prod/app-compose.yml config --quiet >/dev/null 2>&1
docker compose --env-file /dev/null -p "$project" -f /etc/jarihana-deploy/prod/app-compose.yml up -d --no-build --pull never backend
docker logout ghcr.io >/dev/null
rm -rf -- "$bootstrap_auth_dir"
trap - EXIT
unset DOCKER_CONFIG
ready=false
deadline=$(( $(date +%s)+600 ))
while (( $(date +%s)<deadline )); do
  if curl --fail --silent --max-time 3 "http://127.0.0.1:$MANAGEMENT_PORT/actuator/health/readiness" |
    jq -e '.status=="UP"' >/dev/null; then ready=true; break; fi
  sleep 5
done
test "$ready" = true
printf 'header = "X-Jarihana-Worker-Control-Token: %s"\n' "$WORKER_CONTROL_TOKEN" |
  curl --config - --fail --silent --show-error --max-time 3 \
    "http://127.0.0.1:$MANAGEMENT_PORT/actuator/workercontrol" |
  jq -e --arg digest "$BACKEND_DIGEST" --arg host "$DEPLOY_HOST_ID" \
    '.environment=="prod" and .version==$digest and .identity.hostId==$host and
    .worker.state=="PAUSED" and .worker.inFlight==0 and .worker.unresolved==0 and
    .activity.httpInFlight==0 and .activity.backgroundInFlight==0 and .activity.backgroundDrained and
    (.authority==null or (.authority.owner==null and .authority.status=="UNASSIGNED" and
      (.authority.phase=="IDLE" or .authority.phase=="COMPLETE")))' >/dev/null
unset WORKER_CONTROL_TOKEN
exit
```

이 준비 명령은 평소의 prepare 허가를 대신하지 않는다. 실패하면 컨테이너와 DB 상태를 조사한 뒤
재개하며 인증용 임시 디렉터리도 소유자가 확인해 정리한다. 기동 뒤 bootstrap.env의 보관/제거는
조직의 비밀 관리 절차를 따르고 유일한 원본을 지우지 않는다. 검사 후 runner 셸을 종료해 비밀 환경을 폐기한다.

## 최초 등록과 재개

Nginx probe가 A를 확인하고 신규 B에 앱이 없음을 확인한 뒤 관리자가 신규 B를 stopped로 준비한다.
가동 중인 기존 B를 강제 중지하는 절차가 아니다. 정상 운영의 이전 앱 중지는 제어기에 맡긴다.
[최초 worker 등록](README.md#최초-worker-등록)에서 main의 Production Release를 실행한다.
완료 후 실제 runner의 SSH 읽기, ACTIVE owner, 관측과 공개 API를 확인한다.
BLUE_GREEN_PROD_ENABLED 재개, A→B/B→A, 롤백과 취소는 별도 실환경에서 검증하며,
문서 작성과 구문 확인만으로 완료 처리하지 않는다.
