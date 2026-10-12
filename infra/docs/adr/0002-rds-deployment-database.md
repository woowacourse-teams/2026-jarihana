# ADR 0002. dev·prod DB는 RDS PostgreSQL을 사용한다

- 상태: 채택 — 2026-10-12 최신 develop 통합에서 prod RDS 기준으로 재개정
- 날짜: 2026-10-05
- 범위: dev RDS, prod RDS, 앱 호스트와 DB 경계. 로컬 개발·자동화 테스트 제외
- 대체 관계: [백엔드 ADR 0009](../../../backend/docs/adr/0009-aws-deployment-topology.md)의 dev/prod 호스트 공유 결정을 대체한다. prod Compose PostgreSQL 유지 결정은 최신 develop 기준과 실제 운영 DB 확인으로 대체한다.
- 관련 문서: [실행 가이드](../observability/OPERATIONS.md#db-연결-준비), [모니터링 아키텍처](../observability/ARCHITECTURE.md), [백엔드 README](../../../backend/README.md#배포-환경-설정)

## 배경

공유 개발 환경은 운영과 분리된 EC2와 runner를 사용한다. dev와 prod 모두 앱 컨테이너의 생명주기와
DB 생명주기를 분리하기 위해 RDS PostgreSQL을 사용한다. 한때 prod Compose PostgreSQL과
`postgres-data` volume을 유지하는 방향으로 문서화했지만, 최신 develop의 prod Compose는 이미
RDS 접속값을 사용하고 사용자가 실제 운영 DB도 RDS의 `jarihana_prod`라고 확인했다.

## 결정

dev와 prod 배포 workflow는 `RDS_URL`, `DB_USERNAME`, `DB_PASSWORD`를 받아 각각
`jdbc:postgresql://<RDS_URL>:5432/jarihana_dev?sslmode=require`,
`jdbc:postgresql://<RDS_URL>:5432/jarihana_prod?sslmode=require`로 접속한다.
`RDS_CA_BUNDLE_PATH` 또는 CA 파일 마운트는 배포 계약이 아니다. RDS endpoint, 보안 그룹,
데이터베이스, 사용자, 스키마와 권한은 배포 전에 별도로 준비한다.

prod는 서버에서 Docker 이미지를 빌드하지 않는다. develop 배포가 GHCR에 올린 backend tree tag
이미지를 `jarihana-prod` runner가 받아 `jarihana-prod` Compose 프로젝트의 backend·Alloy를 교체한다.
배포 후 `infra/scripts/verify-backend.sh prod`를 실행하고 실패하면 직전 성공 태그로 되돌린다.

Alloy의 DB 직접 검사는 `POSTGRES_MONITOR_DSN`으로 RDS에 접속한다. 장기 운영에서는 앱 DB 계정과
분리한 `pg_monitor` 전용 계정을 권장한다. 현재 저장소에는 DSN 전달 경로만 있으며, 사용자가 전달한
앱 계정 기반 DSN의 실제 접속과 `pg_monitor` 권한은 아직 검증하지 않았다. dev 예시는
`postgresql://postgres_monitor:<encoded-password>@<rds-endpoint>:5432/jarihana_dev?sslmode=require&connect_timeout=3`,
prod 예시는
`postgresql://postgres_monitor:<encoded-password>@<rds-endpoint>:5432/jarihana_prod?sslmode=require&connect_timeout=3`이다.
관리자 계정을 모니터링 DSN에 넣지 않는다.

스키마 정책은 기존 `ddl-auto: validate`를 유지한다. 로컬 개발과 테스트 PostgreSQL은 기존 설정을 유지한다.

## 감수하는 점

dev와 prod 모두 RDS DNS·네트워크·보안 그룹과 DB 계정에 의존한다. 앱 EC2에서 DB를 같이
띄우지 않으므로 Compose healthcheck로 DB 준비 상태를 보장할 수 없다. 배포 뒤 앱 health,
Actuator database health, Alloy의 PostgreSQL exporter 수집을 별도로 확인한다.

EC2 unix exporter는 앱 호스트를 관측한다. Hikari 지표는 앱 연결 풀 상태이므로 DB의 CPU·
디스크·락·쿼리 상태를 대신하지 않는다. PostgreSQL exporter로 직접 연결 상태와 기본 통계를
수집하지만 DB 자원 전반의 대시보드와 전용 알림까지 구현한 것은 아니다.

## 검토한 대안

| 대안 | 이번 선택 |
| --- | --- |
| dev·prod 모두 RDS로 통일 | 선택. 최신 develop과 실제 운영 DB 확인이 이 방향이다 |
| prod Compose PostgreSQL 유지 | 최신 develop의 prod Compose와 실제 운영 DB가 RDS라서 폐기한다 |
| 앱 EC2의 PostgreSQL 컨테이너를 dev에도 유지 | 공유 개발 DB를 앱 컨테이너 생명주기에서 분리하려는 요구와 맞지 않는다 |
| RDS CA 파일을 필수 마운트로 둔다 | 현재 dev/prod 접속 계약은 `sslmode=require`이며 workflow·Compose에서 CA 파일을 요구하지 않는다 |
| 모니터링 DSN에 앱 관리자 계정을 재사용 | DB 관측 권한과 앱 쓰기 권한을 분리하지 못한다 |

## 전환과 완료 기준

dev·prod RDS 연결, 모니터링 전용 계정 권한과 스키마 준비 상태는 배포 전후에 각각 확인한다.
실제 API와 DB 작업, 로그·메트릭 수신까지 확인한다.

이번 변경에서는 실제 AWS RDS 생성, 데이터 이관, 계정 권한 검증을 수행하지 않았다.
저장소에서 남긴 CloudWatch legacy 도구도 실제 Agent 제거와 AWS 자원 정리를 대신하지 않는다.
알림 규칙·외부 감시·백업 복원 검증은 배포 전에 남은 작업이다.
