# 채팅 블루그린 배포

현재 운영 workflow와 `docker-compose.yml`은 기존 단일 backend 배포를 유지한다.
`docker-compose.bluegreen.yml`과 `scripts/deploy-bluegreen.py`는 별도 호스트 이전 후 사용하는
블루그린 경로다. **기존 production workflow를 동시에 실행하면 안 된다.**
`backend-bluegreen-prod-deploy.yml`은 `workflow_dispatch` 전용 수동 배포다.
main 브랜치와 prod environment에서만 실행하며 기존 workflow와 같은 concurrency group을 쓴다.
기존 자동 workflow는 그대로 보존되어 있으므로 호스트 이전 전에 비활성화해야 한다.

## 확인한 배포 경계

저장소의 기존 backend는 호스트 8080과 loopback 8081을 점유한다. 앱용 reverse proxy,
운영 TLS 종단과 실제 호스트 자원은 이 작업에서 확인하지 않았다. 모니터링 nginx는 별도 서비스다.
새 경로는 Linux Docker host networking, Compose 2.24.4 이상, Python 3을 요구한다.
nginx가 8080을 받고 Blue 18080/18081, Green 28080/28081을 loopback에만 노출한다.
관리 포트는 외부에 열지 않는다. 두 앱의 DB와 LISTEN 채널은 같아야 한다.

## 최초 호스트 이전 (별도 운영 작업)

1. 호스트의 실제 TLS/프록시/보안그룹/8080 소비자와 CPU·메모리·DB pool 여유를 확인한다.
   앞단 TLS 프록시가 신뢰 가능한 `X-Forwarded-Proto`를 설정하고 WebSocket Upgrade를 전달하는지
   확인한다. 새 nginx는 TLS 인증서나 외부 라우팅을 추측하지 않는다.
2. 기존 자동 배포를 중지하고, 아래 초기화 명령으로 runner 홈에 설정을 생성한다.
   `BLUEGREEN_STATE_DIR`은 이 절대 경로의 상위 디렉터리, BLUE_TAG/GREEN_TAG/BACKEND_TAG는
   검증할 이미지 태그로 설정한다. 나머지 환경 변수는 기존 production Compose 계약과 같다.
3. 별도 포트의 `backend-blue`를 먼저 올린다. `--no-deps`를 사용해 기존 Alloy를 교체하지 않는다.
   readiness와 아래 인증 smoke를 확인한다. listener가 연결되지 않은 후보는 전환하지 않는다.
4. 초기화 명령이 생성한 `proxy/nginx.conf`와 `state.json`의 Blue 태그·포트를 검토한다.
   기존 8080 컨테이너를 중지하는 시점과 짧은 최초 포트 인계는 운영자가 따로 계획한다.
   스크립트는 기존 backend 컨테이너를 자동 중지·삭제하지 않는다. DB/volume을 삭제하지 않는다.
5. nginx proxy를 띄우고 공개 경로·인증 WebSocket을 확인한다. Alloy는 새 Compose의
   `/etc/alloy` 디렉터리 구성을 `alloy validate /etc/alloy`로 검증 후 교체한다.
   Blue는 기존 app target(18081), Green은 추가 app_green target(28081)으로 별도 수집한다.
   `instance`로 두 앱을 구분한다. 로그는 `color` 라벨로 구분한다. 기존 인프라 health 지표의
   단일 Blue 대상과 별개로 각 인스턴스 `up`, listener 상태·socket 수를 반드시 감시한다.
6. 모든 확인 후에만 `migration-approved` 파일을 만든다. 블루그린 호스트에서는
   기존 workflow를 다시 켜지 않는다. marker는 호스트 상태를 자동 증명하지 않는다.

```sh
python3 infra/scripts/deploy-bluegreen.py \
  --state-dir "$HOME/.jarihana/bluegreen" --tag "$BACKEND_TAG" --initialize blue
```

초기화는 로컬 파일만 생성하고 기존 설정이 있으면 거절한다. 컨테이너를 시작·중지하거나
`migration-approved`를 만들지 않는다. 서비스 시작은 기존 production 환경 변수를 제공한 상태에서
`docker compose -f infra/docker-compose.bluegreen.yml up -d --no-deps backend-blue`,
포트 인계 후 동일 Compose의 `up -d --no-deps proxy`로 수행한다.

## 전환과 롤백

```sh
python3 infra/scripts/deploy-bluegreen.py \
  --state-dir "$HOME/.jarihana/bluegreen" --tag "$BACKEND_TAG"
```

`CHAT_SMOKE_ACCESS_TOKEN`, `CHAT_SMOKE_ORIGIN`, `CHAT_SMOKE_GROUP_ID`가 필요하다.
운영자가 전용 smoke 회원의 짧은 유효 accessToken과 소속 그룹을 제공한다. 토큰은 명령행·로그에
출력하지 않는다. 기본 `chat-smoke.py`는 인증 목록 조회, CSRF 쿠키, WebSocket Upgrade,
STOMP CONNECTED, 개인 경로 SUBSCRIBE 전송과 이력 GET을 확인한다. 메시지를 쓰지 않는다.
Simple Broker는 subscription receipt를 보장하지 않으므로 이 검사는 상대방 전달을 증명하지 않는다.
실제 두 회원 전송과 커서 복구는 격리된 통합 시험에서 별도로 확인해야 한다.

수동 workflow에서는 prod environment secret `CHAT_SMOKE_ACCESS_TOKEN`, variable
`CHAT_SMOKE_GROUP_ID`를 추가한다. Origin은 기존 `FRONTEND_ORIGIN`을 사용한다.
기존 production 환경 변수·secrets도 그대로 필요하다. 만료된 토큰이면 기존 서버 smoke에서
실패하여 전환을 시작하지 않는다. 실행 입력 `image_tag`는 develop에서 빌드·검증한 전체
40자리 커밋 SHA여야 한다. workflow는 이미지를 빌드하거나 legacy backend를 중지하지 않는다.
Compose 및 Alloy 구성·실행 readiness를 확인한 뒤 배포 스크립트를 호출하고, 실패 로그는
서비스별 최근 80줄로 제한한다. 성공·실패와 관계없이 GHCR에서 로그아웃한다.

배포는 파일 lock을 잡고 현재 state/config 일치를 확인한다. 기존 서버와 proxy smoke 성공 후
비활성 색상만 생성한다. 후보 readiness(DB+chatListener 포함)와 인증 smoke 이후 nginx config를
원자 교체하고 `nginx -t` 및 reload를 실행한다. 신규 요청의 색상 헤더와 인증 smoke를 재확인한다.
기존 nginx worker는 기존 socket을 유지한다. 기본 30초, 최대 60초 동안 새 서버 health를 점검한다.
검증에 실패하면 기존 nginx 설정을 복원·reload·재검증하고 기존 state 및 컨테이너를 유지한다.
실패 후보도 진단용으로 남긴다. 롤백 자체가 실패하면 성공으로 보고하지 않고 즉시 운영 점검한다.

성공 시 `state.json`을 원자 교체한 후 이전 앱에 SIGTERM을 보내 최대 45초 기다린다.
백엔드 종료 수명주기가 기존 socket을 GOING_AWAY(1001)로 닫는다. 브라우저는 새 서버로 연결해
REST cursor catch-up을 수행해야 한다. 연결을 다른 프로세스로 이전하는 것이 아니다.
nginx의 최종 worker 제한은 120초다. 정상 종료가 실패하면 Docker 제한 이후 강제 종료될 수 있다.
이전 앱 stop 실패 시 새 state와 route는 유지하고 명령은 실패한다. 남은 구 앱을 진단한다.
SIGKILL/정전 사이 config/state가 어긋나면 다음 배포는 중단한다. 실행 중 proxy 색상과 두 서버
상태를 확인하고 config/state를 수동 조정해야 한다. 이전 이미지·컨테이너는 삭제하지 않는다.

이전 버전으로 다시 배포하려면 기존 성공 태그를 `--tag`로 지정한다. schema/event는 두 버전이
함께 읽을 수 있어야 한다. Flyway는 추가형 테이블·nullable/default 필드부터 배포하고, 컬럼 제거,
의미 변경, 알 수 없는 NOTIFY version 강제 전환은 롤백 기간 이후 별도 배포한다.
SQL rollback으로 이미 저장된 채팅을 삭제하지 않는다.

## 로컬 검증

```sh
python3 -m unittest discover -s infra/scripts -p 'test_deploy_bluegreen.py' -v
python3 infra/scripts/test_bluegreen_proxy.py
```

명령 주입 fixture로 readiness/reload/routed smoke/drain/state 저장 실패 및 성공·stop 실패를
검증한다. 별도 proxy 시험은 로컬 Docker의 Python/nginx 임시 컨테이너 두 개를 생성해 HTTP 전환,
Upgrade, 신규 socket의 Green 연결, 기존 socket의 Blue 유지와 Blue 롤백을 확인한다.
시험이 생성한 컨테이너만 제거한다. 인증, 실제 앱 drain과 DB 메시지 복구는 이 fixture 범위 밖이다.
실제 앱·PostgreSQL 통합 시험은 [채팅 검증 안내](chat-verification/README.md)의
`continuity.mjs`로 실행한다. LISTEN 재연결, nginx 전환 중 100건 전송, 기존/신규 소켓,
정상 종료 코드 1001, REST 복구와 재시작 후 저장 이력을 확인한다.
운영 호스트 이전 후에도 해당 환경의 인증·프록시·재연결 smoke를 별도로 확인한다.
