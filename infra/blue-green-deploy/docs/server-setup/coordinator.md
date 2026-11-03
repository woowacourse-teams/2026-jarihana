# Nginx와 배포 제어기 호스트 구성

[서버 구성](README.md)의 관리자 입력, OS 도구와 고정 제어 릴리스를 먼저 준비한다.
아래는 새 호스트에서 수행할 수동 절차다. 기존 설치본의 경로/권한/실행 원본은 대조했지만,
이 명령 전체를 빈 서버에서 실행하는 검증은 하지 않았다. 이미 운영 중인 호스트에 덮어쓰지 않는다.

진행 순서는 계정/설정 준비 → [앱 A/B의 키와 PAUSED 앱 준비](app-hosts.md) →
허가 조회 연결 → Nginx 기동 → watchdog/수집기 → [완료 판정](README.md#완료-판정과-검증-범위)이다.
`CONTROL_DIR`, `CONTROL_SHA`, `CONTROL_REF`는 [릴리스 준비](README.md#고정-제어-릴리스-준비)에서 정한 값이다.

## 계정과 보호 디렉터리

관리자 Bash에서 실행한다. Docker 그룹은 [필수 설정](README.md#보호된-설정과-권한)의 신뢰 경계를 따른다.

```bash
set -euo pipefail
test "$(id -u)" -eq 0
getent group jarihana-coordinator >/dev/null || groupadd --system jarihana-coordinator
id -u jarihana-coordinator >/dev/null 2>&1 || useradd --system \
  --gid jarihana-coordinator --create-home --home-dir /var/lib/jarihana-coordinator \
  --shell /bin/bash jarihana-coordinator
usermod -aG docker jarihana-coordinator
install -d -o root -g root -m 0755 /etc/jarihana-deploy /var/lib/jarihana-deploy
install -d -o root -g jarihana-coordinator -m 0750 /etc/jarihana-deploy/prod
install -d -o jarihana-coordinator -g jarihana-coordinator -m 0700 \
  /var/lib/jarihana-deploy/prod /var/lib/jarihana-deploy/prod/nginx \
  /var/lib/jarihana-deploy/prod/nginx/generations
install -d -o jarihana-coordinator -g jarihana-coordinator -m 0750 \
  /opt/jarihana-coordinator-runner
```

runner는 [등록 절차](README.md#runner-등록과-부팅-설정)에 따라 이 계정으로 등록한다.
설치 패키지를 root로 풀었다면 runner 디렉터리만 해당 계정 소유로 맞춘다.
보호된 설정과 제어 릴리스까지 runner 소유로 바꾸지 않는다.

## coordinator 설정

관리자가 보호된 작업 디렉터리에 `full-coordinator.example.json`을 복사해 수정한다.
실제 값을 채운 파일을 아래 입력 경로에 준비한다. 원본 예시의 dev/주소/ID/SHA를 그대로 사용하지 않는다.

| 필드 | 채울 내용 |
| --- | --- |
| repository | 저장소 이름과 id는 예시의 고정값 유지 |
| topology | environment=prod, 실제 Nginx/A/B instance ID, private upstream, 서로 다른 host_id |
| topology.control | 승인한 CONTROL_REF/CONTROL_SHA. 앱 A/B와 전체 topology가 동일해야 함 |
| ec2 | 실제 account_id, VPC와 ap-northeast-2 |
| nginx | `/var/lib/jarihana-deploy/prod/nginx`, 실제 Compose container 이름, loopback probe port |
| telemetry | 사설 gateway의 `/prometheus`, 허용 최신성과 실패 기준은 [상태 확인](../status.md#관찰-기준) 참조 |

```bash
INPUT_DIR=/root/jarihana-reconstruction
install -d -o root -g root -m 0700 "$INPUT_DIR"
# INPUT_DIR/coordinator.json은 관리자가 예시를 편집해 채운 보호된 입력이다.
test -f "$INPUT_DIR/coordinator.json"
jq -e --arg ref "$CONTROL_REF" --arg sha "$CONTROL_SHA" \
  '.topology.environment=="prod" and .topology.control.ref==$ref and .topology.control.sha==$sha' \
  "$INPUT_DIR/coordinator.json" >/dev/null
install -o root -g jarihana-coordinator -m 0640 "$INPUT_DIR/coordinator.json" \
  /etc/jarihana-deploy/prod/coordinator.json
runuser -u jarihana-coordinator -- bash -c \
  'ENVIRONMENT=prod
   source "$1/infra/blue-green-deploy/scripts/actions/common.sh"
   source "$1/infra/blue-green-deploy/scripts/actions/cloud.sh"
   bg_config "$2"
   bg_machine "$(jq -r .topology.coordinator_instance_id "$2")"
   bg_ec2_state A
   bg_ec2_state B' \
  _ "$CONTROL_DIR" /etc/jarihana-deploy/prod/coordinator.json
```

신규 환경에서는 빈 `state.json`이나 성공 모양의 저널을 만들지 않는다. 최초 저널은 승인된
bootstrap workflow가 만든다. 기존 환경의 백업은 별도로 보존하고 [이관 중단 조건](README.md#재구성-절차)을 확인한다.
EC2 역할과 gateway allowlist는 이 호스트의 신원을 기준으로 별도 준비한다.
EC2 최소 권한의 리소스 구분은 [AWS 공식 예시](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ExamplePolicies_EC2.html)를
따르고, 실제 허용 작업은 [cloud.sh](../../scripts/actions/cloud.sh) 원본에서 대조한다.

## 앱의 읽기 전용 SSH 허가 조회

먼저 [각 앱에서 생성한 공개키](app-hosts.md#worker-토큰과-ssh-키)를 운영 채널로 받아
`INPUT_DIR/app-A.pub`, `INPUT_DIR/app-B.pub`에 한 줄씩 준비한다. private key를 가져오지 않는다.
공개키 지문과 출발지 private IP를 해당 앱의 운영 인수 기록과 대조한다.

```bash
getent group jarihana-grant >/dev/null || groupadd --system jarihana-grant
id -u jarihana-grant >/dev/null 2>&1 || useradd --system --gid jarihana-grant \
  --create-home --home-dir /var/lib/jarihana-grant --shell /bin/sh jarihana-grant
chown root:root /var/lib/jarihana-grant
chmod 0755 /var/lib/jarihana-grant
install -d -o root -g root -m 0755 /var/lib/jarihana-grant/.ssh /usr/local/libexec
helper_tmp=$(mktemp)
sed 's@/ENVIRONMENT/@/prod/@g' \
  "$CONTROL_DIR/infra/blue-green-deploy/controller/read-deployment-grant.sh" > "$helper_tmp"
sh -n "$helper_tmp"
install -o root -g root -m 0755 "$helper_tmp" /usr/local/libexec/jarihana-read-prod-deployment-grant
rm -- "$helper_tmp"
sudoers_tmp=$(mktemp)
printf '%s\n' 'jarihana-grant ALL=(jarihana-coordinator) NOPASSWD: /usr/local/libexec/jarihana-read-prod-deployment-grant ""' > "$sudoers_tmp"
visudo -cf "$sudoers_tmp"
install -o root -g root -m 0440 "$sudoers_tmp" /etc/sudoers.d/jarihana-prod-grant
rm -- "$sudoers_tmp"
authorized_tmp=$(mktemp)
for slot in A B; do
  case "$slot" in A) topology_key=a ;; B) topology_key=b ;; esac
  private_ip=$(jq -r --arg k "$topology_key" '.topology[$k].upstream|split(":")[0]' \
    /etc/jarihana-deploy/prod/coordinator.json)
  read -r key_type key_blob _ < "$INPUT_DIR/app-$slot.pub"
  test "$key_type" = ssh-ed25519
  [[ $key_blob =~ ^[A-Za-z0-9+/=]+$ ]]
  printf 'from="%s",restrict,command="sudo -n -u jarihana-coordinator /usr/local/libexec/jarihana-read-prod-deployment-grant" %s %s\n' \
    "$private_ip" "$key_type" "$key_blob" >> "$authorized_tmp"
done
install -o root -g root -m 0644 "$authorized_tmp" /var/lib/jarihana-grant/.ssh/authorized_keys
rm -- "$authorized_tmp"
sshd -t
systemctl enable --now ssh
```

`jarihana-grant`는 Docker 그룹이나 coordinator 그룹에 넣지 않는다. 로그인 shell은 강제 명령의
실행에 필요하므로 nologin으로 막는 대신 비밀번호 인증을 허용하지 않고, 키의 from/restrict/command로
제한한다. 임의 sudo, TTY, 포트 전달 권한을 추가하지 않는다. helper는 원본대로 고정 prod 저널만 읽는다.

앱의 known-hosts에는 이 Nginx의 `/etc/ssh/ssh_host_ed25519_key.pub`에 해당하는 host key를 배포한다.
관리자가 SSM 등 신뢰 경로에서 지문을 확인한 뒤 전달한다. `ssh-keyscan` 결과를 대조 없이 신뢰하지 않는다.
최초 저널이 아직 없으면 SSH 연결이 되더라도 조회가 실패할 수 있다. 저널을 위조하지 말고
bootstrap 이후 앱 문서의 실제 runner 읽기를 확인한다.

## Nginx 초기 경로와 기동

신규 환경의 A가 승인 digest로 READY/PAUSED인 것을 확인한 뒤 진행한다.
기존 환경에서는 A라는 이름을 믿고 경로를 바꾸지 말고 확인된 활성 슬롯으로 구성한다.

```bash
NGINX_PROJECT=jarihana-edge-prod
CONFIG=/etc/jarihana-deploy/prod/coordinator.json
test "$(jq -r '.nginx.container' "$CONFIG")" = "$NGINX_PROJECT-nginx-1"
read -r -p '검증한 nginx@sha256:... 이미지: ' NGINX_IMAGE
[[ $NGINX_IMAGE =~ @sha256:[a-f0-9]{64}$ ]]
read -r -p 'CloudFront origin에 사용할 host HTTP port: ' NGINX_HTTP_PORT
[[ $NGINX_HTTP_PORT =~ ^[0-9]+$ ]] && (( NGINX_HTTP_PORT>0 && NGINX_HTTP_PORT<65536 ))
NGINX_PROBE_PORT=$(jq -r '.nginx.probe_port' "$CONFIG")
NGINX_DEPLOY_DIRECTORY=$(jq -r '.nginx.directory' "$CONFIG")
upstream=$(jq -r '.topology.a.upstream' "$CONFIG")
nginx_tmp=$(mktemp)
sed -e "s/@UPSTREAM@/$upstream/g" -e 's/@SLOT@/A/g' \
  "$CONTROL_DIR/infra/blue-green-deploy/nginx/nginx.conf.template" > "$nginx_tmp"
install -o jarihana-coordinator -g jarihana-coordinator -m 0600 "$nginx_tmp" \
  "$NGINX_DEPLOY_DIRECTORY/current.conf"
rm -- "$nginx_tmp"
printf 'NGINX_IMAGE=%s\nNGINX_LISTEN_ADDRESS=0.0.0.0\nNGINX_HTTP_PORT=%s\nNGINX_PROBE_PORT=%s\nNGINX_DEPLOY_DIRECTORY=%s\n' \
  "$NGINX_IMAGE" "$NGINX_HTTP_PORT" "$NGINX_PROBE_PORT" "$NGINX_DEPLOY_DIRECTORY" > "$INPUT_DIR/nginx.env"
install -o root -g jarihana-coordinator -m 0640 "$INPUT_DIR/nginx.env" /etc/jarihana-deploy/prod/nginx.env
docker pull "$NGINX_IMAGE"
docker run --rm --entrypoint sh "$NGINX_IMAGE" -c 'for tool in curl sh tr awk; do command -v "$tool" || exit 1; done'
docker run --rm --entrypoint nginx \
  -v "$NGINX_DEPLOY_DIRECTORY:/etc/nginx/deploy:ro" "$NGINX_IMAGE" -t -c /etc/nginx/deploy/current.conf
docker compose --env-file /etc/jarihana-deploy/prod/nginx.env -p "$NGINX_PROJECT" \
  -f "$CONTROL_DIR/infra/blue-green-deploy/nginx/docker-compose.yml" up -d nginx
curl --fail --silent --show-error --max-time 3 --include \
  "http://127.0.0.1:$NGINX_PROBE_PORT/__deployment"
```

probe는 실제 API 성공과 A의 슬롯/예상/실제 upstream이 모두 일치해야 한다.
0.0.0.0의 listener는 CloudFront origin의 접근 제한과 SG 검토가 끝난 새 서버에서만 공개한다.
CloudFront origin DNS/port와 다른 behavior를 보존한 뒤 외부 요청을 확인한다.
Nginx 컨테이너 이름은 Compose 프로젝트 이름과 연결되므로 임의로 바꾸지 않는다.

## watchdog 설치

원본 unit의 기본 실행 경로 대신 승인 release 경로를 instance drop-in에 고정한다.
설정과 상태 디렉터리를 먼저 준비해야 한다. 배포 동결 중에는 timer를 기동하지 않는다.

```bash
install -d -o root -g root -m 0755 /opt/jarihana-deploy
install -o root -g root -m 0644 \
  "$CONTROL_DIR/infra/blue-green-deploy/controller/systemd/jarihana-deploy-watchdog@.service" \
  /etc/systemd/system/jarihana-deploy-watchdog@.service
install -o root -g root -m 0644 \
  "$CONTROL_DIR/infra/blue-green-deploy/controller/systemd/jarihana-deploy-watchdog@.timer" \
  /etc/systemd/system/jarihana-deploy-watchdog@.timer
install -d -o root -g root -m 0755 /etc/systemd/system/jarihana-deploy-watchdog@prod.service.d
cat > /etc/systemd/system/jarihana-deploy-watchdog@prod.service.d/control-release.conf <<EOF
[Service]
WorkingDirectory=$CONTROL_DIR
ExecStart=
ExecStart=/bin/bash $CONTROL_DIR/infra/blue-green-deploy/scripts/actions/coordinator.sh watchdog
EOF
chmod 0644 /etc/systemd/system/jarihana-deploy-watchdog@prod.service.d/control-release.conf
systemctl daemon-reload
systemctl show --no-pager jarihana-deploy-watchdog@prod.service -p User -p ExecStart -p DropInPaths
# 신규 환경 준비 완료 또는 기존 환경의 재개 조건을 충족한 뒤 실행한다.
systemctl enable --now jarihana-deploy-watchdog@prod.timer
systemctl show --no-pager jarihana-deploy-watchdog@prod.timer -p ActiveState -p TimersMonotonic
```

watchdog의 10초 주기는 배포 단계의 잠금 대기 15초와 다른 값이다.
watchdog은 배포 허가를 새로 만들거나 앱을 중지하지 않는다. 실제 실행 경로를 `systemctl show`로 대조한다.

## 중앙 수집기와 최종 확인

중앙 수집기는 control tag에서 복사하지 않는다. 수집기 원본이 포함된 별도 승인 checkout을
준비한 뒤 [중앙 수집기의 설치 순서](../../../docs/observability/CENTRAL-DEPLOYMENT-COLLECTOR.md#관리-원본과-재구성)를 따른다.
앱 Alloy와 서로 다른 설정, Compose 프로젝트와 WAL을 사용한다.

새 서버에서 [상태 확인](../status.md)과 [완료 판정](README.md#완료-판정과-검증-범위)을
수행한 뒤에만 운영 배포를 재개한다. 이 문서의 명령 구문 확인은 실제 CloudFront, IAM과
GitHub job 실행 성공을 대신하지 않는다.
