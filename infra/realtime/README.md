# 아지트 멀티플레이 실행 구성

신규 EC2에서 Spring realtime 컨테이너 하나를 개발과 운영이 함께 사용한다. CloudFront가 브라우저의 WSS를 받고 `/ws/realtime`을 EC2의 HTTP 8080으로 전달한다. realtime은 입장 토큰의 서명과 발급자를 확인하고, 해당 환경의 PostgreSQL과 방에 연결한다. 같은 모임 ID를 쓰더라도 개발과 운영의 방 상태는 분리된다.

| 환경 | 토큰 발급자 | 읽기 설정 |
| --- | --- | --- |
| 개발 | `jarihana-api-dev` | `REALTIME_DEV_TOKEN_KEY`, `REALTIME_DEV_DB_JDBC_URL`, `REALTIME_DEV_DB_USERNAME`, `REALTIME_DEV_DB_PASSWORD` |
| 운영 | `jarihana-api-prod` | `REALTIME_PROD_TOKEN_KEY`, `REALTIME_PROD_DB_JDBC_URL`, `REALTIME_PROD_DB_USERNAME`, `REALTIME_PROD_DB_PASSWORD` |

## 공용 컨테이너 배포

관련 파일이 `develop`에 들어오면 [Realtime Deploy](../../.github/workflows/realtime-deploy.yml)가 카탈로그와 Gradle 테스트, 두 임시 PostgreSQL DB를 사용하는 WebSocket 격리 검증을 실행하고 ARM64 이미지를 GHCR에 발행한다. 배포 잡은 개발과 운영이 함께 쓰는 컨테이너를 교체한다. 워크플로 파일이 기본 브랜치인 `main`에 반영된 후에는 Actions에서 `develop`을 선택해 수동으로 실행할 수 있다. PR에서는 GitHub 호스팅 러너에서 검증만 실행한다.

- 준비 잡 두 개와 배포 잡은 `jarihana-realtime` 라벨의 Linux ARM64 러너 한 대에서 실행한다. 러너 서비스 계정으로 Docker와 Compose를 실행할 수 있어야 한다.
- 준비 잡은 기존 GitHub `dev`·`prod` Environment에서 `RDS_URL`, `DB_USERNAME`, `DB_PASSWORD`, `FRONTEND_ORIGIN`, `ACCESS_TOKEN_SECRET`을 읽는다. 환경별 JDBC 주소와 입장 키를 계산해 배포 잡에 전달한다. 배포 잡은 두 Origin을 합쳐 `REALTIME_ALLOWED_ORIGINS`로 설정한다.
- CloudFront에 EC2 원본을 `HTTP only`, 포트 `8080`, 빈 Origin path로 등록한다. Behavior 경로는 `/ws/realtime`, 캐시 정책은 `CachingDisabled`로 지정한다. Origin request policy에서 `Origin`, `Sec-WebSocket-Key`, `Sec-WebSocket-Version`을 전달한다.

- 기존 API 배포의 GitHub `dev`와 `prod` Environment에 각각 `REALTIME_WEBSOCKET_URL`을 지정한다. 두 환경에 같은 WSS 주소를 줄 수 있다. API는 입장 조건을 만족하는 요청에 토큰을 발급한다. 브라우저 연결에는 공용 컨테이너와 CloudFront 경로가 필요하다. 운영 API는 realtime Compose 오버레이가 포함된 배포 제어 태그를 사용한다. [운영 배포 절차](../blue-green-deploy/docs/deployment.md)

서버는 정확히 `/ws/realtime`에 연결을 받는다. `/ws/realtime/*`만 등록하면 끝에 `/`가 없는 이 주소와 일치하지 않으므로 정확한 경로의 Behavior가 필요하다. 기존 프론트 배포의 CDN 사전 검사는 정확한 경로와 기존 wildcard 경로를 모두 허용하지만, 이 검사를 통과했다고 실제 WebSocket 연결까지 확인한 것은 아니다.

배포 잡은 이미지 digest로 Compose를 갱신하고 EC2에서 `http://127.0.0.1:8080/healthz`를 확인한다. 이 점검에는 개발과 운영 양쪽 PostgreSQL의 연결과 조회 권한이 포함된다. 실패하면 현재 Actions 설정으로 마지막 성공 이미지, Compose와 Alloy 설정을 복원한다. 첫 배포에는 복원 기록이 없다.

준비 잡은 설정을 EC2의 메모리 파일시스템 `/dev/shm`에 실행 번호와 시도 번호별로 저장한다. 배포 잡이 끝날 때 삭제하며, 강제 종료로 남은 설정은 다음 준비 잡이 1시간 경과 후 정리한다. 재시도할 때는 **Re-run all jobs**를 선택해 이번 시도의 설정을 다시 준비한다.

## 로컬 빌드와 설정 확인

1. Node 24로 저장소 루트의 `node contracts/realtime/export-runtime.cjs --check`를 실행한다. 카탈로그·레이아웃을 변경했다면 먼저 같은 명령에서 `--check`를 빼고 판정용 JSON을 갱신한다.
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

첫 배포 전에 개발·운영 백엔드의 Flyway가 두 DB에 `V39__member_avatar.sql`과 `V40__group_space.sql`을 적용했는지 확인한다. 백엔드 배포와 realtime 배포가 동시에 시작되면 마이그레이션이 끝나기 전에 realtime 헬스체크가 실패할 수 있다. 이때 두 DB의 마이그레이션이 끝난 뒤 realtime 실행의 **Re-run all jobs**를 선택한다. 별도 조회 계정을 사용한다면 두 DB에서 `member_avatar`의 `member_id`와 외형 컬럼에 대한 `SELECT` 권한이 필요하다.

이미 이전 입장 토큰 형식으로 서비스 중이라면 API의 발급 방식과 realtime의 검증 방식이 모두 전환된 뒤 새 토큰으로 접속할 수 있다. 전환 시간을 잡고 기존 환경값을 보관한다. 이전 컨테이너로 돌아갈 경우 해당 API의 토큰 발급 버전도 함께 복원한다.

## 운영 동작

- 이동·좌석·손 물건·진행 작업은 환경별 방의 서버 메모리에 있다. 인스턴스를 재시작하면 개발과 운영의 일시 상태가 초기화되고 사용자는 새 방 세대로 재입장한다.
- 기존 API 배포는 실시간 컨테이너를 재시작하지 않는다. DB에서 권한 재확인이 유효 기한보다 오래 실패하면 접속이 종료된다.
- 저장 배치·권한은 주기 조회로 갱신한다. 현재는 DB 커밋 순간 모든 클라이언트에 반영되는 트랜잭션이 아니다. 클라이언트의 저장 성공과 realtime의 새 revision 적용은 구분한다.
- 오래된 layoutRevision 명령은 거절한다. 최신 배치를 로딩할 때까지 공유 조작을 대기시킨다. 착석·물건·생산 작업 정리는 새 배치 적용과 같은 방 처리 흐름을 사용한다.
- 구버전 저장 배치를 프론트가 자동 이관하는 경우 원본과 서버 판정이 어긋나지 않게, realtime이 지원하는 버전으로 모임장이 저장한 뒤 연결한다. 기존 조회·편집은 유지한다.
- 큐·연결·방 정원은 상한이 있다. 느린 사용자 때문에 모든 방 상태 처리가 멈추지 않도록 소켓 전송은 별도 실행 흐름에 둔다.
- 예제 메모리·CPU 값은 실행 제한의 시작값이며 수용 인원 근거가 아니다. 실제 장면과 동시 방 수를 정해 지연·CPU·메모리·네트워크를 측정해야 한다.

## 확인할 시나리오

독립 사용자 A/B와 늦은 C의 이동·착석·손 물건, 같은 좌석/물건 경쟁, 중복 명령, 가구 이동·삭제 중 진행 작업, 이전 연결 close, 권한 상실, DB 장애, realtime 재시작을 확인한다. 로컬 프로토콜 검증은 실제 계정·운영 WSS·다른 네트워크 검증을 대신하지 않는다.

`bootJar` 빌드 후 Docker를 실행하고 저장소 루트에서 Node 24로 `node infra/realtime/verify-protocol.mjs`를 실행한다. 검증 스크립트는 임시 PostgreSQL 17의 두 DB에 기반 스키마와 아지트·아바타 마이그레이션을 적용하고, 읽기 전용 계정 두 개로 실제 Spring WebSocket 서버 하나를 연결한다. 같은 모임과 회원 ID로 개발과 운영에 동시에 접속해 배치·좌석·접속 권한·아바타가 각각의 DB와 방에 반영되는지 확인한다. `JAVA_HOME`은 JDK 21 경로로 지정한다. 결과와 로그는 출력된 임시 디렉터리에 남는다.

프론트 production build 후 `--browser`를 추가하면 설치된 Playwright Chromium의 별도 브라우저 세션 두 개로 입장·인사·이동과 카메라 꺼내기·촬영 미리보기·활동 작성 화면 첨부를 확인한다. 게시 버튼은 누르지 않는다. 미리보기 서버는 loopback의 빈 포트를 할당받으므로 기존 5193 서버를 건드리지 않는다. 계정·모임 HTTP 응답은 fixture이고 멀티플레이 WebSocket은 실제 서버다.

실행 결과와 운영 전 확인할 항목은 [M1·M2 검증 기록](VERIFICATION.md)에 남겼다.

계약은 [실시간 v1](../../contracts/realtime/v1/README.md)을 따른다. 선택 이유와 변경 이력은 [공통 아키텍처 문서](../../docs/clubhouse-realtime-architecture.md), 서버 경계는 [인프라 ADR 0007](../docs/adr/0007-clubhouse-realtime-service.md), 공용 배포·기존 설정 재사용은 [인프라 ADR 0008](../docs/adr/0008-shared-realtime-deployment.md)에 있다. [인프라 ADR 0009](../docs/adr/0009-projector-livekit-direction.md)의 화면 공유는 아직 이 배포에 포함하지 않는다.
