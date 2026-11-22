# 아지트 멀티플레이 실행 구성

신규 EC2에서 Spring realtime 컨테이너 하나를 개발과 운영이 함께 사용한다. CloudFront가 `/ws/realtime`의 브라우저 HTTPS와 WSS 요청을 EC2의 HTTP 8080으로 전달한다. realtime은 WebSocket 입장 토큰의 서명과 발급자를 확인하고, 해당 환경의 PostgreSQL과 방에 연결한다. 같은 모임 ID를 쓰더라도 개발과 운영의 방 상태는 분리된다.

| 환경 | 토큰 발급자 | 읽기 설정 |
| --- | --- | --- |
| 개발 | `jarihana-api-dev` | `REALTIME_DEV_TOKEN_KEY`, `REALTIME_DEV_DB_JDBC_URL`, `REALTIME_DEV_DB_USERNAME`, `REALTIME_DEV_DB_PASSWORD` |
| 운영 | `jarihana-api-prod` | `REALTIME_PROD_TOKEN_KEY`, `REALTIME_PROD_DB_JDBC_URL`, `REALTIME_PROD_DB_USERNAME`, `REALTIME_PROD_DB_PASSWORD` |

## 공용 컨테이너 배포

PR에서는 GitHub 호스팅 러너에서 서버·배포 경로와 두 PostgreSQL의 WebSocket 동작을 검증한다. PR 검증은 realtime 테스트와 검증에 사용하는 SQL에도 실행한다. develop 자동 배포는 이미지 빌드 입력, 공용 Compose·Alloy·배포 스크립트, workflow에 대한 변경으로 시작한다. [Realtime Deploy](../../.github/workflows/realtime-deploy.yml)

- 준비 잡 두 개와 배포 잡은 `jarihana-realtime` 라벨의 Linux ARM64 러너 한 대에서 실행한다. 러너 서비스 계정으로 Docker와 Compose를 실행할 수 있어야 한다.
- 준비 잡은 기존 GitHub `dev`·`prod` Environment에서 `RDS_URL`, `DB_USERNAME`, `DB_PASSWORD`, `FRONTEND_ORIGIN`, `ACCESS_TOKEN_SECRET`을 읽는다. 환경별 JDBC 주소와 입장 키를 계산해 배포 잡에 전달한다. 배포 잡은 두 Origin을 합쳐 `REALTIME_ALLOWED_ORIGINS`로 설정한다.
- CloudFront에 EC2 원본을 `HTTP only`, 포트 `8080`, 빈 Origin path로 등록한다. Behavior 경로는 `/ws/realtime`, 캐시 정책은 `CachingDisabled`로 지정한다. Origin request policy에서 `Origin`, `Sec-WebSocket-Key`, `Sec-WebSocket-Version`을 전달한다.

- GitHub `dev`와 `prod` Environment의 `REALTIME_WEBSOCKET_URL`은 API의 입장 주소와 프론트 빌드의 `APP_REALTIME_WEBSOCKET_URL`에 들어간다. 두 환경에 같은 WSS 주소를 줄 수 있다. 프론트는 이를 HTTPS 주소로 바꿔 가구와 소품의 기능 정의를 읽는다. 값이 비어 있으면 브라우저의 현재 Origin을 사용한다. 운영 API는 realtime Compose 오버레이가 포함된 배포 제어 태그를 사용한다. [운영 배포 절차](../blue-green-deploy/docs/deployment.md)

정확한 `/ws/realtime` Behavior가 필요하다. 일반 HTTP GET은 공개 기능 정의를, WebSocket Upgrade는 실시간 입장을 처리한다. 교차 출처 조회를 위해 CloudFront가 개발·운영의 `Origin`을 전달하고 응답의 CORS 헤더를 유지하도록 설정한다. 개발·운영 프론트는 공개 직전에 실제 프론트 Origin으로 `GET /ws/realtime`을 요청한다. HTTP 200, CORS, 정의 v1의 좌석 수·상판 칸 수·수납 용량을 확인한 뒤 게시한다.

후보 이미지는 `compose run --rm --no-deps -T realtime --check-runtime --server.port=0`으로 두 환경의 이관 상태와 읽기 권한을 검사한다. 선행 검사가 실패하면 현재 컨테이너와 연결이 유지된다. 교체 뒤 `/healthz` 검사에서 실패하면 마지막 성공 이미지·Compose·Alloy 설정으로 복구하고 다시 검사한다.

개발은 develop 백엔드 배포, 운영은 main의 **Production Release** 수동 실행에서 `backend_only`로 먼저 Flyway를 실행할 수 있다. 이 경로는 기존 프론트를 유지하고 공개 realtime 확인을 건너뛴다. 한쪽만 준비됐다면 후보의 Actions 요약에서 `sha256:…` digest를 확인한다. 두 DB 이관이 커밋된 뒤 **Realtime Deploy → Run workflow**에서 `develop`과 같은 `resume_digest`를 지정한다. 새 실행은 이미지 빌드를 생략하고 두 보호 환경에서 현재 자격을 다시 준비한다. 후보의 원본 커밋에 맞는 배포 설정과 이미지 라벨을 대조하고 양쪽 DB를 다시 검사한다. 공개 GET이 개발·운영 Origin 모두에서 통과하면 개발 프론트 배포와 운영 `frontend_only` 배포를 실행할 수 있다.

환경 설정은 전용 러너의 `/dev/shm`에서 실행·시도별로 전달한 뒤 지운다. 재개는 새로운 수동 실행으로 시작한다. 후보 선택과 두 DB 검사 이후 실제 교체 직전에, 최신 develop과 후보 원본의 배포 입력을 비교한다. 비교 범위는 workflow의 `push.paths`를 사용한다. 프론트·문서·SQL 변경 뒤에도 기존 후보를 재개할 수 있다.

공용 realtime을 교체하면 상판·수납 소품의 월드 좌표가 빠진다. 두 환경에서 새 프론트 게시를 이어서 진행하고, 기존 브라우저 탭은 게시 후 새로고침한다. 게시 사이에 이전 탭이 소품 상태를 읽으면 표시나 공유 연결이 실패할 수 있다. QA에서는 새로고침한 탭으로 재접속해 상판 소품의 표시와 클릭, 수납 슬롯의 점유와 꺼내기를 확인한다. 착석은 `seatRefs`를 보내지 않는 연결에도 이전 좌석 필드를 제공한다.

## 로컬 빌드와 설정 확인

1. JDK 21·Node 24·Docker를 준비한다. 가구 치수와 부착면은 V46, 도면별 시작 위치와 미저장 기본 방은 V47에 있다. 가구 기능과 슬롯 수는 realtime의 `contracts/asset-capabilities.json`에 있다. 화면의 상판 위치와 새 브라우저의 착석 위치는 프론트가 계산한다.
2. `realtime/`에서 `./gradlew test bootJar`를 실행한다. 이미지 빌드 방법과 앱의 제한값은 [realtime README](../../realtime/README.md)를 따른다.
3. [예제 설정](.env.example)을 로컬 설정 파일로 복사하고 검증용 값과 이미지 digest를 입력한다.
4. 저장소 루트에서 `docker compose --env-file <설정파일> -f infra/realtime/compose.yaml config --quiet`로 확인한다.

브라우저와 CloudFront 사이에서 TLS를 처리하고 CloudFront에서 EC2까지는 평문 HTTP를 사용한다. EC2 보안 그룹의 TCP 8080 소스를 CloudFront origin-facing 관리형 접두사 목록으로 제한한다. Compose가 EC2의 8080을 컨테이너의 8080에 연결한다.

## 모니터링

같은 Compose의 Alloy가 Actuator 지표를 5초마다, 앱 헬스와 호스트·Alloy 지표를 10초마다 수집한다. Docker에서 공용 realtime 컨테이너의 stdout·stderr를 읽는다. 지표와 로그는 기존 저장소 변수 `MONITORING_BIND_ADDRESS`로 지정된 모니터링 EC2의 사설 주소 `:8080`으로 보낸다. 모니터링 EC2 보안 그룹의 TCP 8080 인바운드에 realtime EC2 보안 그룹을 허용한다. Actuator 관리 포트 `8081`과 Alloy 관리 포트 `12345`는 realtime EC2의 loopback에만 열려 있다.

Grafana의 **Jarihana → 자리하나 · 아지트 실시간**에서 개발·운영의 방과 접속자 지표, 입장 결과, DB 풀, 공용 서버 자원과 로그를 확인한다. 로그와 호스트 지표는 공용 컨테이너·EC2 기준이다. 대시보드는 기존 Monitoring Deploy가 `develop`의 변경을 배포할 때 등록한다.

배포 후 EC2에서 `curl -fsS http://127.0.0.1:12345/-/ready`로 Alloy를 확인한다. Grafana에서는 Prometheus의 `up{job="jarihana-realtime"}`, `probe_success{job="jarihana-realtime-health"}`가 모두 1인지 확인하고 Loki에서 `{job="jarihana-realtime"}`로 컨테이너 로그를 조회한다. 공용 WebSocket 경로는 브라우저 Origin을 넣어 별도로 확인한다.

## PostgreSQL 연결

`RDS_URL`에 등록된 호스트의 5432 포트로 연결한다. 개발은 `jarihana_dev`, 운영은 `jarihana_prod`를 사용하며 기존 API의 DB 계정으로 접속한다. PostgreSQL이 RDS라면 DB 보안 그룹의 TCP 5432 인바운드 소스를 realtime EC2의 보안 그룹으로 지정하고, EC2에서 DB의 사설 엔드포인트를 쓸 수 있는지 확인한다. 가구·아바타 저장과 스키마 변경은 기존 백엔드가 담당한다.

V45의 도면 43개와 모임 참조에 V46의 가구 122종, V47의 도면별 시작 위치·기본 방을 추가한다. V47은 기존에 해당 스키마 도면을 읽던 계정에 필요한 열의 SELECT 권한을 부여한다. 이후 만든 전용 계정은 기존 입장·도면 조회 권한과 함께 `space_runtime_migration.version`, `space_furniture_catalog(kind, definition)`, `space_blueprint_runtime(template_key, blueprint_version, spawn, default_room)`을 읽을 수 있어야 한다. 후보의 실제 기동 자격으로 이를 검증한다.

이미 이전 입장 토큰 형식으로 서비스 중이라면 API의 발급 방식과 realtime의 검증 방식이 모두 전환된 뒤 새 토큰으로 접속할 수 있다. 전환 시간을 잡고 기존 환경값을 보관한다. 이전 컨테이너로 돌아갈 경우 해당 API의 토큰 발급 버전도 함께 복원한다.

## 운영 동작

- 이동·좌석·손 물건·진행 작업은 환경별 방의 서버 메모리에 있다. 인스턴스를 재시작하면 개발과 운영의 일시 상태가 초기화되고 사용자는 새 방 세대로 재입장한다.
- 기존 API 배포는 실시간 컨테이너를 재시작하지 않는다. DB에서 권한 재확인이 유효 기한보다 오래 실패하면 접속이 종료된다.
- 저장 배치·권한은 주기 조회로 갱신한다. 현재는 DB 커밋 순간 모든 클라이언트에 반영되는 트랜잭션이 아니다. 클라이언트의 저장 성공과 realtime의 새 revision 적용은 구분한다.
- 오래된 layoutRevision 명령은 거절한다. 최신 배치를 로딩할 때까지 공유 조작을 대기시킨다. 착석·물건·생산 작업 정리는 새 배치 적용과 같은 방 처리 흐름을 사용한다.
- v10 이하 배치를 사용하는 모임은 기존 도면과 가구를 계속 편집할 수 있다. 공동 입장은 모임장이 템플릿 전체 교체로 기본 가구를 새로 배치하고 지원 문서 버전으로 저장한 뒤에 가능하다.
- 큐·연결·방 정원은 상한이 있다. 느린 사용자 때문에 모든 방 상태 처리가 멈추지 않도록 소켓 전송은 별도 실행 흐름에 둔다.
- 예제 메모리·CPU 값은 실행 제한의 시작값이며 수용 인원 근거가 아니다. 실제 장면과 동시 방 수를 정해 지연·CPU·메모리·네트워크를 측정해야 한다.

## 확인할 시나리오

독립 사용자 A/B와 늦은 C의 이동·착석·손 물건, 같은 좌석/물건 경쟁, 중복 명령, 가구 이동·삭제 중 진행 작업, 이전 연결 close, 권한 상실, DB 장애, realtime 재시작을 확인한다. 로컬 프로토콜 검증은 실제 계정·운영 WSS·다른 네트워크 검증을 대신하지 않는다.

`bootJar` 빌드 후 Docker를 실행하고 저장소 루트에서 Node 24로 `node infra/realtime/verify-protocol.mjs`를 실행한다. 검증 스크립트는 개발·운영용으로 분리한 PostgreSQL 17 컨테이너 두 개에 기반 스키마와 아지트·아바타 마이그레이션을 적용하고, 읽기 전용 계정 두 개로 실제 Spring WebSocket 서버 하나를 연결한다. 같은 모임과 회원 ID로 개발과 운영에 동시에 접속해 배치·좌석·접속 권한·아바타가 각각의 DB와 방에 반영되는지 확인한다. `JAVA_HOME`은 JDK 21 경로로 지정한다. `REALTIME_PREVIOUS_JAR`에 직전 릴리스 JAR 경로를 주면 개발만 이관한 시점에도 기존 서버의 WebSocket이 명령을 처리하는지 검증한다. 결과와 로그는 출력된 임시 디렉터리에 남는다.

프론트 production build 후 `--browser`를 추가하면 설치된 Playwright Chromium의 별도 브라우저 세션 두 개로 입장·인사·이동과 카메라 꺼내기·촬영 미리보기·활동 작성 화면 첨부를 확인한다. 게시 버튼은 누르지 않는다. 미리보기 서버는 loopback의 빈 포트를 할당받으므로 기존 5193 서버를 건드리지 않는다. 계정·모임 HTTP 응답은 fixture이고 멀티플레이 WebSocket은 실제 서버다.

실행 결과와 운영 전 확인할 항목은 [M1·M2 검증 기록](VERIFICATION.md)에 남겼다.

계약은 [실시간 v1](../../contracts/realtime/v1/README.md)을 따른다. 선택 이유와 변경 이력은 [공통 아키텍처 문서](../../docs/clubhouse-realtime-architecture.md), 서버 경계는 [인프라 ADR 0007](../docs/adr/0007-clubhouse-realtime-service.md), 공용 배포·기존 설정 재사용은 [인프라 ADR 0008](../docs/adr/0008-shared-realtime-deployment.md)에 있다. [인프라 ADR 0009](../docs/adr/0009-projector-livekit-direction.md)의 화면 공유는 아직 이 배포에 포함하지 않는다.
