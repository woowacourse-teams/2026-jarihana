# Flyway baseline 도입과 배포 검증

## 현재 구현과 검증 범위

`src/main/resources/db/migration/V1__baseline.sql`은 현재 엔티티와
`db/migrations/`의 2026-10-12까지의 스키마 변경을 합친 출발점이다.
Spring Session JDBC 4.1.0의 PostgreSQL 테이블, 초대와 수락 테이블, 신청 출처 및
잠금 버전 컬럼, 기존 부분 인덱스와 검사 제약도 포함한다.
dev/prod에서 추출한 스키마 덤프가 아니므로 실제 DB와 같다고 가정하지 않는다.

빈 DB는 V1을 실행한다. 이력이 없는 기존 DB는 스키마 대조 후 버전 1을 baseline으로
등록하고 V2부터 실행한다. baseline 등록 자체는 기존 스키마를 고치거나 데이터를 이관하지 않는다.
이 동작은 [Flyway baseline 설정 문서](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-baseline-on-migrate-setting)를 따른다.

모든 프로필은 Flyway로 스키마를 준비한 뒤 Hibernate `validate`를 실행한다.
Spring Session의 별도 초기화는 `never`다. 테스트의 truncate 대상에
`flyway_schema_history`를 추가하지 않는다.

PR CI와 dev 이미지 빌드는 PostgreSQL 17 Testcontainers에서 전체 테스트를 실행한다.
dev 빌드의 테스트가 실패하면 새 이미지 빌드와 push를 진행하지 않는다.
prod는 dev에서 만든 같은 backend 트리의 이미지를 사용한다.
수동으로 기존 `image_tag`를 선택하는 경로는 이미지를 다시 테스트하지 않는다.

Hibernate `validate`는 모든 인덱스, 제약과 기본값을 검사하지 않는다.
Flyway 이력과 주요 부분 인덱스 및 제약은 `FlywayBaselineTest`에서도 검증하지만,
실제 dev/prod의 스키마 차이는 별도 비교가 필요하다.
임의의 미래 SQL, 데이터 충돌, DDL 권한과 잠금 문제로 인한 실패까지 보장하지 않는다.

2026-10-14 최신 develop 병합 후 `./gradlew test bootJar --no-daemon`의 전체 800개 테스트가 통과했다.
배포 JAR에 V1이 포함되는 것을 확인했고, 별도 PostgreSQL 17 컨테이너에서 dev와 prod
프로필의 실제 JAR 기동 및 health 응답도 확인했다. prod baseline 등록 후 버전 1의
`BASELINE` 성공 이력과 테스트 회원의 보존을 확인했다. 실제 RDS와 GitHub Actions 실행은
이 검증에 포함되지 않는다.

## 기존 DB 첫 도입 전에 확인할 것

1. SSM 또는 사내 네트워크로 dev/prod 스키마를 각각 추출한다.
2. 각 덤프를 격리된 PostgreSQL 17 DB에 복원한다.
3. 복원 DB에서 배포할 JAR의 해당 프로필로 baseline 등록과 Hibernate 검증을 실행한다.
4. 빈 DB에서 같은 JAR로 V1을 적용한 결과와 각 복원 DB의 테이블, 컬럼 타입과 길이,
   null 허용, 기본값, PK, FK, unique/check 제약, 인덱스 및 시퀀스를 비교한다.
   객체 이름이나 시퀀스 방식의 차이도 자동으로 무시하지 않고 원인과 영향을 기록한다.
5. dev와 prod의 차이 또는 미적용 SQL이 있으면 baseline 등록 전에 해소하고 재검증한다.
   기존 달력 이력 백필은 [달력 배포 가이드](group-calendar-rollout.md)에 따라 별도로 확인한다.
6. 실제 배포 DB 계정에 이력 테이블 생성과 이후 DDL 실행 권한이 있는지 확인한다.
   기존 객체가 다른 계정 소유라면 소유권과 실행 권한도 확인한다.
7. 검증 기록과 복구 가능한 백업을 확인한 뒤 dev, prod 순서로 도입한다.

## SSM 경유 스키마 추출

아래 명령은 Bash 기준이다. AWS CLI, Session Manager 플러그인과 PostgreSQL 17 클라이언트가
필요하다. SSM 대상은 RDS에 연결할 수 있는 현재 관리 노드 ID를 확인해 사용한다.
저장소에 기록된 과거 EC2 ID를 그대로 사용하지 않는다.

```bash
aws ssm start-session \
  --region ap-northeast-2 \
  --target "$SSM_TARGET" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters 'host=["jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com"],portNumber=["5432"],localPortNumber=["15432"]'
```

SSM 터널을 유지한 상태에서 다른 터미널에서 실행한다. 각 DB에 접근할 수 있는 계정을 사용하며,
암호는 `pg_dump` 프롬프트 또는 기존 비밀번호 파일로 전달한다. DB 암호나 데이터 덤프를 Git에 넣지 않는다.

```bash
PGSSLMODE=require pg_dump -h 127.0.0.1 -p 15432 -U "$DEV_DB_USERNAME" \
  -d jarihana_dev --schema-only --no-owner --no-privileges --file=dev-schema.sql
PGSSLMODE=require pg_dump -h 127.0.0.1 -p 15432 -U "$PROD_DB_USERNAME" \
  -d jarihana_prod --schema-only --no-owner --no-privileges --file=prod-schema.sql
```

원격 포트 포워딩 요구 사항과 Windows 명령 형태는
[AWS Session Manager 문서](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html#sessions-remote-port-forwarding)를 확인한다.
스키마 덤프는 기존 데이터의 값이나 중복을 검사하지 않으므로 이후 데이터 변경 SQL은
해당 데이터 조건을 별도로 검증한다.

## 복원 DB에서 실제 JAR 기동 확인

저장소 루트에서 테스트 전용 컨테이너를 만든다. 실제 RDS 연결 정보는 사용하지 않는다.

```bash
docker run -d --name jarihana-flyway-check \
  -p 127.0.0.1:15433:5432 \
  -e POSTGRES_DB=baseline_check \
  -e POSTGRES_USER=baseline_check \
  -e POSTGRES_PASSWORD=baseline_check postgres:17
docker exec jarihana-flyway-check pg_isready -U baseline_check -d baseline_check
# ready가 확인된 다음 실행한다. dev와 prod는 각각 새 컨테이너에서 검사한다.
docker exec -i jarihana-flyway-check psql -v ON_ERROR_STOP=1 \
  -U baseline_check -d baseline_check < dev-schema.sql
cd backend
./gradlew test bootJar
java -jar build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --spring.profiles.active=dev \
  --spring.datasource.url=jdbc:postgresql://127.0.0.1:15433/baseline_check \
  --spring.datasource.username=baseline_check \
  --spring.datasource.password=baseline_check \
  --spring.flyway.baseline-on-migrate=true \
  --jarihana.auth.jwt.secret=baseline-check-secret-key-for-hmac-sha256-0001 \
  --jarihana.oauth.github.client-id=baseline-check-client \
  --jarihana.oauth.github.client-secret=baseline-check-secret \
  --jarihana.push.worker-enabled=false \
  --sentry.dsn= \
  --server.port=18080 --management.server.port=18081
```

`Started JarihanaApplication`과 Flyway 성공 로그를 확인하고 다른 터미널에서 이력을 조회한다.
기동한 JAR를 Ctrl+C로 종료한 후 아래 테스트 컨테이너만 제거한다.

```bash
docker exec jarihana-flyway-check psql -U baseline_check -d baseline_check \
  -c 'SELECT version, type, success FROM flyway_schema_history ORDER BY installed_rank'
docker rm -f jarihana-flyway-check
```

같은 절차를 prod 덤프와 `--spring.profiles.active=prod`로 반복한다.
빈 DB 검사는 덤프 복원 단계를 생략하고 `baseline-on-migrate=false`로 실행한다.
빈 DB의 V1 이력은 `SQL`, 복원 DB의 V1 이력은 `BASELINE`이어야 한다.
전체 스키마 비교용 덤프에는 `--exclude-table=public.flyway_schema_history`를 사용한다.
기동 성공만으로 인덱스, 제약과 운영 데이터까지 같다고 판단하지 않는다.

## dev/prod 첫 배포와 이후 배포

`FLYWAY_BASELINE_ON_MIGRATE`는 기본값 `false`이며 workflow의 환경별 GitHub Variable에서
Compose와 애플리케이션으로 전달한다. 기존 DB의 첫 도입 시에만, 위 검증을 마친 환경의
`Settings > Environments > dev/prod > Variables`에 `true`를 설정한다.

기존 DB에 이력이 없는데 이 값을 설정하지 않으면 Flyway는 기동을 거부한다.
따라서 실제 스키마 대조와 최초 도입 설정 없이 이 변경을 배포하지 않는다.

첫 배포 뒤 `flyway_schema_history`의 버전 1, `BASELINE`, `success=true`와 API health를 확인하고
해당 환경의 Variable을 제거하거나 `false`로 바꾼다. 이후는 저장소의 새로운 버전만 자동 실행된다.
빈 DB의 첫 배포는 이 값을 켜지 않고 V1부터 실행한다.

`db/migrations/`는 V1 이전 수동 적용 기록과 기존 데이터 백필용이다.
이미 V1 상태인 DB에 과거 SQL을 재실행하지 않는다. 새 변경은
`src/main/resources/db/migration/V2__설명.sql`부터 추가하고 테스트 및 PR 리뷰에 포함한다.
적용된 파일은 수정하지 않고 새 버전으로 보완한다. Flyway가 트랜잭션을 관리하므로 SQL에
`BEGIN`과 `COMMIT`을 중복 작성하지 않는다.

애플리케이션 롤백은 이미 적용한 스키마를 되돌리지 않는다. 구버전과 호환되는 확장부터 적용하고,
삭제나 타입 변경은 별도 배포로 분리한다. 복구가 필요하면 새 마이그레이션 또는 검증된 DB 백업을 사용한다.
