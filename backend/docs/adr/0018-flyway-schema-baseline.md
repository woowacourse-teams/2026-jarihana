# ADR 0018. Flyway로 스키마를 초기화하고 변경 이력을 관리한다

- 상태: 제안, 코드 구현 완료. 기존 dev/prod DB 대조와 첫 도입 검증은 대기 중이다.
- 날짜: 2026-10-14
- 관련 결정: [백엔드 ADR 0012](0012-database-schema-management.md),
  [백엔드 ADR 0013](0013-testcontainers-test-database.md)
- 운영 절차: [Flyway baseline 도입과 배포 검증](../operations/flyway-baseline.md)

## 배경

현재 수동 SQL은 전체 스키마의 출발점이 없고 적용 이력을 기록하지 않는다.
로컬의 Hibernate update와 테스트의 create-drop은 운영에 필요한 SQL 누락을 감춘다.
실제 dev/prod 스키마에는 접속하지 못했으므로 저장소 SQL과 일치한다고 판단할 수 없다.

## 결정안과 구현

- Spring Boot 4.1.0 Flyway starter와 PostgreSQL 모듈을 사용한다.
- `src/main/resources/db/migration/V1__baseline.sql`로 빈 PostgreSQL 17에 현재 스키마와
  Spring Session 테이블을 생성한다. 현재 엔티티 및 기존 SQL이 출처이며 실제 DB 덤프가 아니다.
- 모든 환경에서 Flyway 실행 후 Hibernate validate를 수행하고 Spring Session의 별도 초기화를 끈다.
- 기존 DB는 실제 스키마 비교 후에만 버전 1을 baseline으로 등록한다.
  자동 baseline은 기본적으로 끄고 첫 도입 환경에서만 일시적으로 허용한다.
- PR CI와 dev 이미지 빌드에서 같은 마이그레이션으로 전체 테스트를 실행한다.
- 기존 날짜별 SQL은 기록과 데이터 백필을 위해 보존하며 새 스키마 변경은 V2 이후로 관리한다.

## 검토한 대안

| 대안 | 판단 |
| --- | --- |
| 수동 SQL 유지 | 적용 이력과 빈 DB 재현, 마이그레이션 누락 검증을 해결하지 못한다 |
| Hibernate update 유지 | 운영용 SQL 누락을 로컬과 테스트에서 발견하지 못한다 |
| Liquibase | 이번 범위에서는 SQL 버전 파일로 충분하며 추가 changelog 체계의 실익이 적다 |
| 모든 DB를 자동 baseline | 오래되거나 다른 DB도 최신 상태로 인정할 수 있어 기본값으로 사용하지 않는다 |

## 이점과 비용

빈 DB 초기화와 엔티티 매핑 검증을 배포 전에 실행하고, 적용 이력 및 체크섬을 DB에 남긴다.
이미지 빌드에 PostgreSQL 테스트 실행 시간이 추가된다. 기존 로컬 DB도 최신 스키마와 대조하거나
사용자가 재생성해야 하며, 이후 엔티티 변경에는 마이그레이션 작성이 필요하다.
Hibernate가 검사하지 않는 인덱스와 제약은 SQL 비교 또는 별도 테스트로 확인한다.

## 후속 작업

- dev/prod 스키마를 추출하고 V1 결과와 비교한 뒤 차이를 해소한다.
- 운영 DB 계정의 DDL 권한과 복구 가능한 백업을 확인한다.
- 격리된 복원 DB에서 해당 프로필의 실제 JAR 기동을 검증한다.
- 첫 도입 성공 후 자동 baseline 설정을 끄고 채택 상태 및 백엔드 ADR 0012의 후속 작업을 갱신한다.
- 실제 운영 스키마, 데이터와 이후 변경을 확인하기 전에는 배포 실패가 없다고 보장하지 않는다.
