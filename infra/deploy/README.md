# 운영 Blue-Green 배포 제어

별도 Nginx EC2가 고정된 앱 A/B의 준비·전환·관찰·종료 순서를 조정하기 위한 코드다.
현재는 **제어 로직, Nginx·Docker 종료·GitHub API 어댑터, 로컬 검증**을 구현했다.
Nginx 전용 runner의 실제 Actions 검사와 B→Nginx의 IMDSv2·읽기 전용 SSH 허가 조회도 검증했다.
읽기 전용 STATUS child workflow의 실제 B 실행과 부모의 run/artifact 검증도 통과했다.
STATUS 전용 coordinator workflow의 실제 Nginx 실행과 B 요청·결과 수집·영속 저널 일치까지 검증했다.
상태 변경 작업, AWS 실행 어댑터·관측·상시 서비스 연결은 남아 있다.
worker 상태 변경의 명령 변환·실행 허가·로컬 관리 API 호출·결과 검증 라이브러리도 구현했다.
이 경로의 [범위와 격리 검증](child-contract.md#worker-상태-변경-실행-경로)을 실제 상태 변경 workflow 연결과 구분한다.
[A/B worker child의 CLI·workflow·서버 설정](worker-child/README.md)은 로컬 검증과 시험 서버 설치를 마쳤다.
각 전용 runner의 격리 프로필·사설 허가 조회를 확인했고,
별도 Nginx 부모에서 B와 A 각각의 `BEGIN → COMPLETE` 실행·결과 회수를 검증했다.
시험 후 두 서버의 worker 명령 허용 목록은 닫았다.
각 시험에서 worker는 대기 상태를 유지했다. A/B 권한 인계·HTTP 전환·15분 관찰은 아직 검증하지 않았다.
이 파일의 설정을 복사하는 것만으로 운영 배포가 활성화되지 않는다.
설계 배경은 [인프라 ADR 0005](../docs/adr/0005-nginx-ec2-blue-green-deployment.md)를 따른다.

## 동작 순서

```text
현재 실제 HTTP 대상과 worker owner 확인
  -> 상대 EC2 시작 -> 고정 digest 후보 준비 -> 후보 PAUSED·실제 API 정상 확인
  -> 기존 worker 신규 선점 중단 -> 완료 확인 -> DB 권한 반납
  -> nginx -t -> 설정 파일 atomic rename -> reload -> 새 연결의 실제 API 응답 확인
  -> 새 worker 활성화 -> 최소 900초 관찰
  -> 이전 Nginx worker 종료 + 앱 HTTP/백그라운드 종료 증거 확인
  -> 자동 롤백 창 닫기 -> 이전 앱 정상 종료 증거 -> 최신 대상 재확인 -> 이전 EC2 중지

관찰 중 신규 장애 -> 이전 앱 정상 확인 -> HTTP 복구
                 -> 신규 worker 중단·완료·권한 반납 -> 이전 worker 활성화
                 -> 신규 쪽 잔여 HTTP 종료 확인 -> ROLLED_BACK (배포 결과는 실패)

불명확·취소·응답 유실·watchdog 감지 -> NEEDS_ATTENTION -> 두 EC2 유지
```

HTTP 복구와 worker 복구 결과는 별도 필드다. B worker와 통신하지 못하면 HTTP만 A로 복구해도
A worker를 활성화하지 않는다. `SEALED` 이후에는 이전 서버를 중지하는 명령이 지연 실행될 수 있으므로
자동으로 A로 돌아가지 않는다. 완료 후 장애의 복구는 별도 운영 절차다.

## 코드 위치

| 파일 | 책임 |
| --- | --- |
| `scripts/deploy/bluegreen/models.py` | 설정·명령·결과·저널 JSON의 타입과 입력 검사 |
| `scripts/deploy/bluegreen/state_store.py` | controller flock, revision 비교, atomic rename와 fsync |
| `scripts/deploy/bluegreen/session.py` | 실행 전 의도 저장, exact child run 저장, deadline·heartbeat |
| `scripts/deploy/bluegreen/controller.py` | 준비·인계·전환·900초 관찰·안전 종료 순서 |
| `scripts/deploy/bluegreen/recovery.py` | HTTP 복구와 역방향 worker 인계 |
| `scripts/deploy/bluegreen/github_operations.py` | control ref/SHA/event/attempt, 명령·artifact·인스턴스 일치 검사 |
| `scripts/deploy/bluegreen/child_execution.py` | child의 최신 허가·실제 실행·머신·프로세스 대조 |
| `scripts/deploy/bluegreen/ec2_identity.py` | IMDSv2로 실제 로컬 EC2 instance ID 조회 |
| `scripts/deploy/bluegreen/ssh_journal.py` | 고정 host key·읽기 전용 키로 최신 coordinator journal 조회 |
| `scripts/deploy/bluegreen/child_status.py` | 실제 GitHub 실행·최신 허가·앱 boot를 확인한 STATUS 결과 생성 |
| `scripts/deploy/bluegreen/spring_status.py` | 로컬 Spring 관리 API의 worker·HTTP·background 상태 조회 |
| `scripts/deploy/bluegreen/child_artifacts.py` | 정확한 명령/run과 종료 증거를 묶은 엄격한 결과 JSON |
| `scripts/deploy/bluegreen/github_applications.py` | GitHub dispatch·정확한 run 조회·poll·취소와 최신 저널 검사 |
| `scripts/deploy/bluegreen/github_runs.py` | 고정 저장소·control tag/SHA·workflow·실행 차수·명령 이름 대조 |
| `scripts/deploy/bluegreen/github_http.py` | 제한된 HTTP 전송·POST 재시도 금지·인증 분리 다운로드 |
| `scripts/deploy/bluegreen/github_artifacts.py` | artifact 출처·만료·SHA-256·ZIP 검사 |
| `scripts/deploy/bluegreen/nginx_switch.py` | 실제 Nginx 설정 검사·적용·복구, 기존 worker 세대 추적 |
| `scripts/deploy/bluegreen/docker_shutdown.py` | 같은 컨테이너 세대·사전 drain·종료 코드·OOM·재시작 검사와 종료 증거 생성 |
| `scripts/deploy/bluegreen/docker_runtime.py` | 비밀값 없는 제한 inspect와 강제 종료 없는 고정 SIGTERM 명령 |
| `scripts/deploy/watchdog.py` | stale heartbeat를 attention으로 기록하는 제한된 CLI |

위 경로는 `infra/` 기준이다. GitHub 전송 라이브러리는 읽기 전용 STATUS workflow까지 검증했으며
전체 coordinator 자동 실행에는 아직 연결하지 않았다.
AWS 전송과 상태 변경 child 작업의 신원·허가 검사 연결도 남아 있다.
[GitHub 연결 계약](github-actions-adapter.md)에 현재 범위와 연결 조건을 정리했다.
child 실행 검사·결과 계약·읽기 전용 CLI의 범위는 [서버별 작업 계약](child-contract.md)을 따른다.
배포 입력의 `rollback_compatible=true`는 개발자가 구·신버전의 DB/데이터 호환성을 확인했다는 명시적 확인이다.
이 값이 스키마나 데이터의 호환성을 자동 분석하거나 DB를 원복하지 않는다.

## 상태·명령 안전 규칙

- 예시 상태 디렉터리는 `/var/lib/jarihana-deploy/prod`다. 토큰·DB 비밀번호는 저널에 쓰지 않는다.
- controller 전체 잠금과 짧은 상태 쓰기 잠금을 분리한다. watchdog은 controller가 멈춰 있어도 상태를 변경할 수 있다.
- 모든 외부 변경 전에 command ID·대상·boot·기한·예상 worker 권한을 기록한다. 쓰기 실패 시 다음 외부 작업을 실행하지 않는다.
- dispatch 응답 유실은 실패와 다르다. 조회 결과가 정확히 한 run일 때만 연결하며, 0개나 여러 개면 보류한다.
- 동일한 workflow라도 보호된 control tag의 SHA, event, attempt가 다르면 결과를 받지 않는다.
- artifact에는 schema, 동일 명령, 정확한 run/attempt, 환경·인스턴스·boot가 필요하다. 빠진 작업 수를 0으로 채우지 않는다.
- child는 실행 직전에도 `authorize()`와 자신의 실제 인스턴스/boot 검사를 해야 한다. 운영에서 이를 전달·확인하는 경로는 다음 단계에 연결한다.
- 재시작 후 `reconcile()`은 실제 HTTP 대상을 확인하고 미완료를 기록한다. 과거 명령 재전송이나 관찰 시간 이어 붙이기를 자동 수행하지 않는다.
- 성공 판정은 `COMPLETE`뿐이다. `ROLLED_BACK`과 `NEEDS_ATTENTION`은 workflow를 실패로 끝내야 한다.

관찰 900초 외 수치는 초안이다. 기본 검사 5초, 연속 실패 3회, worker drain 120초, HTTP drain 300초,
전체 3600초·복구 예산 600초이며 비운영 실측 후 확정한다. 단조 시계로 대기를 제한하고 wall clock의
불연속이 관찰되면 종료를 보류한다. 관측 누락도 정상으로 취급하지 않는다.

## Nginx 설정의 적용 범위

`nginx/docker-compose.yml`은 이미지 digest와 설정 디렉터리를 필수 입력으로 받는다. 예를 들어 이미 검증한
이미지의 `nginx@sha256:...`를 사용한다. 최초 `current.conf`는 `NginxSwitch.initialize(host)`로 생성하고
Compose를 실행한다. 이후 파일 하나를 개별 bind mount하지 말고 **설정 디렉터리 전체**를 mount한다.
후보와 이전 설정은 세대별 파일로 보관하고 `current.conf`는 일반 파일의 atomic rename으로 교체한다.
실제 Docker bind 환경에서 symlink 교체 시 읽기 오류가 재현되어 일반 파일 교체를 사용한다.

- 기본 public listen은 호스트 `127.0.0.1:8080`, 검사 listen은 `127.0.0.1:18082`다. 운영 진입점 설정은 아직 아니다.
- 검사 포트는 실제 `/api/groups?size=1`을 요청한다. 새 연결·정상 JSON·slot 표식·upstream을 확인한다.
  production에는 고정 사설 IP를 설정하여 실제 upstream 주소도 대조한다. 표식만으로 앱 digest/boot를 증명하지 않고 child 상태와 함께 확인한다.
- 후보 `nginx -t` 성공 후 적용·reload하고 연속 3개 새 연결로 실제 적용을 확인한다. 실패하면 이전 설정과 경유 응답을 복구한다.
- reload 전에 `(container ID, worker PID, 커널 시작 tick)`을 기록한다. 그 worker가 남아 있으면 HTTP 종료가 아니다.
  Nginx 재시작도 종료 증거로 쓰지 않는다. 강제 `worker_shutdown_timeout`은 설정하지 않는다.
- 공개 경로에서 actuator를 차단한다. 검사 경로와 topology 표식은 host loopback 포트에만 둔다.
- `proxy_next_upstream off`로 배포 중 쓰기 요청을 다른 서버에 자동 재시도하지 않는다. WebSocket upgrade를 전달한다.
- timeout·요청 크기는 초안이다. 실제 장기 요청·WebSocket ping·업로드 요구를 확인해야 한다.
- `X-Forwarded-Proto https`는 CloudFront viewer HTTPS 강제와 origin 접근 제한을 전제로 한다.
  Host/쿠키/OAuth, 원본 TLS·인증서·직접 접근 제한, 클라이언트 IP 신뢰는 운영 이관에서 end-to-end 확인해야 한다.

Nginx reload가 새 worker를 시작하면서 기존 연결을 이전 worker에 남긴다는 동작은
[공식 제어 문서](https://nginx.org/en/docs/control.html)에 근거한다.

## 앱 종료 증거

`DockerStopper`는 **운영 CLI가 아닌 라이브러리**다. 실제 앱 e2e의 `LocalApps`가 저널의 sealed STOP_APP
허가를 매번 재검사하도록 연결했다. 운영 child가 이 허가를 안전하게 전달·재검사하는 경로는 아직 없다.

- 시작 때 전체 container ID·Docker image ID·StartedAt·RestartCount를 고정하고 앱 boot와 함께 사용한다.
  Docker image ID는 실행 이미지의 config digest이며 레지스트리 manifest digest 검증을 대체하지 않는다.
- STOP_APP·정확한 boot, HTTP/worker/scheduler drain과 worker 권한 반납을 확인한다. auto-remove 컨테이너는 거부한다.
- `docker stop --signal SIGTERM --timeout -1 -- <전체 ID>`를 **한 번만** 실행한다. 이름으로 대상을 다시 선택하지 않는다.
- 별도 관찰 상한(초안 120초, polling 0.25초)과 명령 기한을 검사한다. 취소·허가 철회·응답 유실·시간 초과는
  성공으로 바꾸지 않으며 EC2를 중지하지 않는다. Docker의 강제 SIGKILL을 예약하지 않는다.
- 시간 초과 시 대기 중인 로컬 Docker CLI만 종료한다. daemon이 이미 받은 SIGTERM은 취소할 수 없어 앱이 나중에
  종료될 수 있다. 따라서 두 EC2를 보존하고 실제 상태를 확인해야 하며, 같은 명령을 자동 재전송하지 않는다.
- 같은 컨테이너 세대, 재시작 없음, OOMKilled=false, 실제 프로세스 종료, Docker stop 성공과 exit 0/143을 모두
  확인한 뒤에만 normal_exit를 반환한다. 137만 보고 OOM이라고 단정하지 않으며 SIGKILL도 정상 종료로 인정하지 않는다.
- `ShutdownEvidence`는 command·boot·컨테이너 세대·종료 시각과 코드를 담는다. 로컬 앱 e2e는 `shutdown-*.json`으로
  저장한다. 운영 child artifact에 이 증거를 전달하는 연결과 실제 EC2 중지 직전의 재검증은 후속 작업이다.

이 증거는 사전 drain 후 프로세스가 정상적인 종료 코드로 끝났다는 범위다. 모든 사용자 정의 shutdown hook이나
프레임워크 내부 작업 완료를 인증하지 않는다. 운영에는 JVM의 exec entrypoint, Spring graceful shutdown의 실제 설정,
Compose·runner의 종료/재시작 정책, 경쟁 배포·외부 재시작 방지까지 함께 연결해야 한다.
원리는 [Docker stop 문서](https://docs.docker.com/reference/cli/docker/container/stop/)를 따른다.

## 로컬 검증

Python 3.12+와 Pydantic·httpx2를 사용한다. 테스트 실행 파일에 의존성 버전을 고정했으며,
기존 표준 라이브러리 unittest 구성을 유지한다. GitHub 테스트는 임시 localhost HTTP 포트를 열고,
서명된 다운로드 응답은 HTTP transport fixture를 사용한다. 실제 GitHub/AWS 접근은 없다.
서버 설치와 runtime 캐시 준비는 다음 단계다.

```sh
uv run infra/tests/deploy/run_tests.py

# 실제 Nginx + HTTP fixture 두 개: 긴 요청 보존·설정 오류 거부
uv run infra/tests/deploy/run_nginx_drain_e2e.py

# 실제 Docker: 정상 TERM·외부 SIGKILL 거부·TERM 무시 시 프로세스 보존
uv run infra/tests/deploy/run_shutdown_e2e.py

# 먼저 backend/에서 ./gradlew bootJar로 현재 jar를 만든다.
# JARIHANA_E2E_JAVA_IMAGE에는 Java 21이 확인된 로컬 Docker 이미지 ID를 설정한다.
# e.g. export JARIHANA_E2E_JAVA_IMAGE=sha256:<locally-verified-image-id>
uv run infra/tests/deploy/run_local_e2e.py
```

실제 앱 e2e는 전용 Docker network·PostgreSQL·Java 프로세스 두 개·Nginx를 생성하고 자신이 만든 자원만 정리한다.
서로 같은 현재 jar에 fixture 버전 표식을 달아 A→B→A·역방향 worker 권한 복구와 연속 HTTP 요청을 검증한다.
따라서 과거 바이너리·DB 호환성, 외부 푸시 전송, 실제 15분 경과, CloudFront·IAM·실제 runner를 검증한 것은 아니다.
900초는 가상 시계이며 AWS·GitHub·telemetry는 테스트 어댑터다.

**HTTP/업무 스케줄러 활동 수치는 앱 관리 API의 `activity`에서 측정한다.** 로컬 어댑터도
`httpInFlight`, `backgroundInFlight`, `backgroundDrained`를 필수 입력으로 사용한다.
범위와 종료 판단의 제약은 [내부 API 계약](../../backend/docs/operations/worker-control-api.md)을 따른다.
SIGTERM 종료 어댑터는 로컬 앱 시험에 연결했고, 운영 child·AWS와 증거 artifact 전달은 아직 미연결이다.
값이 없으면 controller는 cleanup을 허가하지 않으며 과거 fixture의 exit code 단독 판정은 사용하지 않는다.
실제 푸시 처리와 commit 경계는 별도 백엔드 통합 테스트로 검증한다.

## Watchdog 설치 전제

`controller/systemd/`는 설치용 예시이며 아직 어느 서버에도 설치하지 않았다.
전용 사용자, `/opt/jarihana-deploy` checkout, `/var/lib/jarihana-deploy`, uv 실행 경로·Python·의존성 캐시를 먼저 준비한다.
타이머는 offline 모드로 실행하고 60초 stale을 attention으로 기록할 뿐 복구·EC2 중지·알림 발송을 수행하지 않는다.
실제 알림과 private metrics는 다음 관측 연결 작업이다. 설치 후 권한·동시 접근·재부팅·NoData를 따로 검증한다.
