# ADR 0013. 자동화 테스트의 PostgreSQL을 Testcontainers로 실행한다

- 상태: 채택
- 날짜: 2026-09-14
- 관련 문서: [ADR 0012](0012-database-schema-management.md), [ADR 0011](0011-postgresql-rdbms-selection.md),
  [로컬 PostgreSQL 구성](../../docker-compose-local.yaml),
  [테스트 데이터 초기화 스크립트](../../src/test/resources/sql/truncate.sql),
  [CI 워크플로](../../../.github/workflows/ci.yml)
- 결정 근거: [Discussion #220](https://github.com/woowacourse-teams/2026-jarihana/discussions/220)의 팀 투표
- 이 문서는 [ADR 0012](0012-database-schema-management.md)가 2026-09-02 개정에서 기록한 "자동화 테스트의
  PostgreSQL은 로컬 Docker Compose 구성을 재사용하고 Testcontainers는 사용하지 않는다"는 결정을 대체한다.

## 배경

[ADR 0012](0012-database-schema-management.md)의 결정 6에 따라 자동화 테스트의 DBMS를 H2에서
PostgreSQL로 옮기기로 했다(2026-08-27 팀 결정). 남은 문제는 테스트용 PostgreSQL을 **누가, 언제
실행하는가**였다.

처음에는 로컬 개발용 Docker Compose 구성을 테스트에도 재사용하기로 했다(ADR 0012의 2026-09-02 개정).
테스트 코드는 컨테이너를 관리하지 않고, 개발자와 CI가
[`docker-compose-local.yaml`](../../docker-compose-local.yaml)로 컨테이너를 미리 실행해 두는 방식이다.
그런데 이 방식에는 두 가지 문제가 있었다.

- **테스트가 개발 데이터를 지운다.** `docker-compose-local.yaml`은 `jarihana` 데이터베이스 하나만 만들고
  볼륨으로 유지한다. 테스트가 이 데이터베이스를 쓰면
  [`truncate.sql`](../../src/test/resources/sql/truncate.sql)이 테스트할 때마다 개발 데이터를 비운다.
  이를 막으려면 `jarihana_test` 같은 테스트 전용 데이터베이스를 따로 만들어야 한다.
- **`./gradlew test`만으로는 테스트가 돌지 않는다.** 개발자가 테스트 전에 컨테이너를 직접 실행해야 하고,
  이를 잊으면 테스트가 실패한다. CI에도 컨테이너를 띄우는 단계를 따로 넣어야 한다.

팀은 2026-09-14 [Discussion #220](https://github.com/woowacourse-teams/2026-jarihana/discussions/220)에서
Docker Compose로 테스트 컨테이너를 만드는 방식과 Testcontainers를 쓰는 방식을 투표로 비교했다.

| 선택지 | 득표 |
| --- | --- |
| Testcontainers 의존성 사용 | 3 |
| docker compose로 테스트 컨테이너 만들기 | 0 |
| 기타 | 0 |

## 결정

자동화 테스트의 PostgreSQL은 Testcontainers로 실행한다.

테스트가 시작될 때 컨테이너를 만들고 끝나면 정리한다. 개발자는 Docker만 켜 두면 `./gradlew test` 하나로
테스트를 실행할 수 있다. 로컬 개발 DB는 지금처럼 `docker-compose-local.yaml`로 실행하며 테스트와 공유하지
않는다.

## 도입 이유

1. **테스트가 개발 데이터를 건드리지 않는다.** 테스트 DB는 테스트를 실행할 때마다 새로 만들어지고 끝나면
   사라진다. 개발 DB를 지키려고 테스트 전용 데이터베이스를 따로 만들고 관리할 필요가 없다.
2. **테스트 전에 준비할 것이 없다.** 컨테이너를 미리 띄우는 절차가 사라진다. 컨테이너를 꺼 둔 개발자나
   저장소를 처음 받은 사람도 같은 명령으로 바로 테스트를 실행한다.
3. **로컬과 CI가 같은 방식으로 테스트한다.** 테스트가 컨테이너를 직접 띄우므로 CI에 컨테이너 실행 단계를
   따로 두지 않는다. 로컬은 Compose, CI는 다른 수단을 쓰는 식으로 환경마다 구성이 갈라지지 않는다.
4. **느려지는 비용은 감수할 수 있다.** Testcontainers는 테스트를 실행할 때마다 컨테이너를 띄우므로
   테스트가 느려진다. 그러나 현재 백엔드 테스트는 길어야 1~2분 걸리므로, 컨테이너 기동 시간이 더해져도
   개발 흐름을 해치지 않는다고 판단했다.

## 검토한 대안

| 대안 | 장점 | 단점 |
| --- | --- | --- |
| A. Docker Compose로 테스트 컨테이너 구성 (Discussion #220의 다른 선택지) | 로컬 개발 DB와 같은 Compose 파일로 관리한다. 테스트 코드가 Docker를 다루지 않는다 | 개발 데이터를 지키려면 테스트 전용 데이터베이스나 서비스를 따로 구성해야 한다. 테스트 전에 컨테이너를 직접 실행해야 하고 CI에도 실행 단계가 필요하다 |
| B. CI는 GitHub Actions `services:`, 로컬은 Compose | CI 설정이 짧다 | 로컬에서 컨테이너를 미리 실행해야 하는 문제가 그대로 남는다. 로컬과 CI의 테스트 DB 구성이 달라져 [ADR 0007](0007-api-prefix-backend-context-path.md)이 경로 계층에서 없앤 "환경마다 다른 구성"이 테스트 계층에 다시 생긴다 |
| C. Testcontainers (**채택**) | 테스트가 컨테이너를 직접 관리해 로컬과 CI에서 준비 없이 같은 방식으로 실행된다. 테스트 DB가 개발 데이터와 분리된다 | 테스트 시간이 늘고 Docker가 필요하다 |

## 감수하는 비용

- **Docker가 필요하다.** Docker가 실행 중이 아니면 Spring 컨텍스트를 올리는 테스트가 실패한다. Windows와
  macOS에서는 Docker Desktop을 먼저 켜야 한다. CI의 GitHub 호스팅 러너(`ubuntu-latest`)에는 Docker가
  있으므로 [`ci.yml`](../../../.github/workflows/ci.yml)은 바꾸지 않는다.
- **테스트 시간이 늘어난다.** 인메모리 H2 대신 PostgreSQL 컨테이너를 띄우기 때문이다. 이미지를 처음
  받는 환경에서는 내려받는 시간도 더해진다.

## 후속 작업

- ADR 0012 본문에 남은 Docker Compose 재사용 전제(결정 6 뒤의 실행 방식 문단, 제약과 후속 작업)를 이
  결정에 맞게 정리한다. 이 결정으로 ADR 0012 후속 작업 중 테스트용 데이터베이스 분리와 CI 컨테이너 실행
  단계 추가는 필요 없어진다.
- 테스트가 늘어 실행 시간이 도입 당시 전제(1~2분)를 크게 넘어서면 컨테이너 기동 비용을 줄이는 방법을
  찾거나 이 결정을 다시 검토한다.
