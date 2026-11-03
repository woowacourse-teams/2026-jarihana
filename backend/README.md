# 자리하나 백엔드

자리하나는 우아한테크코스 내부에 흩어진 동아리와 스터디 정보를 한곳에서 탐색할 수
있도록 만드는 서비스다. 이 디렉터리는 Spring Boot 백엔드 애플리케이션을
관리한다.

## 저장소 구조

```text
2026-jarihana/
├── docs/
│   ├── repository-conventions.md # 저장소 공통 컨벤션 인덱스
│   └── repository-conventions/   # 카테고리별 세부 컨벤션
├── backend/              # 현재 디렉터리
│   ├── AGENTS.md
│   ├── README.md
│   ├── db/migrations/
│   └── docs/              # 팀 컨벤션과 설계 맥락
└── frontend/             # 프론트엔드 애플리케이션
```

백엔드의 Gradle 명령과 Docker Compose 명령은 이 디렉터리에서 실행한다.

이 문서 묶음은 프로젝트 안내, 개발 규칙, 설계 맥락과 실행 절차를 책임별로
분리해 관리한다.

## 문서 구성

```text
2026-jarihana/
├── docs/
│   ├── repository-conventions.md
│   └── repository-conventions/
├── backend/
│   ├── AGENTS.md
│   ├── README.md
│   ├── db/
│   │   └── migrations/
│   └── docs/
│       ├── adr/
│       ├── context/
│       │   ├── api/
│       │   └── domain/
│       ├── conventions/
│       ├── proposals/
│       ├── retrospectives/
│       └── team-convention.md
└── frontend/
```

- `backend/AGENTS.md`: 백엔드 AI 작업 규칙과 문서 라우팅을 소유한다.
- `backend/docs/team-convention.md`: 구속력 있는 컨벤션 모듈의 소유권과 권한을 설명한다.
- `backend/docs/conventions/`: 8개 구속력 있는 모듈이며, 각 파일이 자기 분야의 확정 규칙을 소유한다.
- `backend/docs/context/`: 도메인과 API 설계 의도를 사람이 검토하는 문서 모음이다.
- `backend/docs/proposals/`: 사용자가 명시적으로 재검토할 때만 읽는 비구속 제안 문서다.
- `backend/src/main/resources/db/migration/`: Flyway가 실행하는 스키마 마이그레이션이다.
- `backend/db/migrations/`: V1 이전 수동 SQL 기록과 기존 데이터 백필이다.

## 문서 사용

- 작업 규칙과 AI 문서 로딩은 이 디렉터리의 `AGENTS.md`를 확인한다.
- 공통 브랜치,PR, 커밋 정책은 [저장소 컨벤션](../docs/repository-conventions.md)을 확인한다.
- ADR 영역 구분, 교차 참조 규칙은 [저장소 컨벤션](../docs/repository-conventions.md)을 확인한다.
- 설계 의도는 `docs/context/`, 구속력 있는 구현 규칙은 `docs/conventions/`에서 확인한다.

## 컨벤션 변경 위치

- 확정 규칙은 해당 소유 모듈에서 수정한다.
- 문서 라우팅은 `backend/AGENTS.md`에서 수정한다.
- 컨벤션 모듈 소유권은 `docs/team-convention.md`에서 수정한다.
- 백엔드 필수 로딩, 우선순위와 작업 흐름은 `backend/AGENTS.md`에서 수정한다.
- 보류 제안은 `docs/proposals/convention-review.md`에 기록하며, 수락 전에는 구현에 적용하지
  않는다.

## 백엔드 테스트

```bash
./gradlew test --no-daemon
```

CI와 로컬에서 같은 전체 테스트 명령을 사용한다. `build.gradle`의 test task는
`spring.test.context.cache.maxSize=8`을 테스트 JVM에 전달한다. 서로 다른 설정의
Spring 컨텍스트가 누적되어 전체 테스트 후반에 heap이 부족해지는 것을 방지한다.
캐시 안에서는 컨텍스트를 재사용하며, 한도를 넘으면 오래 사용하지 않은 컨텍스트와
그 자원을 닫는다. `@DirtiesContext`로 테스트마다 초기화하지 않는다.
이 값은 운영 앱의 설정이나 JVM 메모리를 바꾸지 않는다.
설정 근거는 [Spring TestContext 캐시 문서](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html)를 따른다.

## 애플리케이션 로그

로컬 콘솔, dev/prod ECS JSON, 현재 Docker `local` → Alloy → Loki 경로와 legacy CloudWatch 조회 방법은
[애플리케이션 로깅 운영 가이드](docs/operations/application-logging.md)를 확인한다.

## 로컬 PostgreSQL 실행

`backend/.env.example`은 로컬 실행용 템플릿이며, 복사한 `backend/.env`에 개인별 값을 입력한다.

Docker Compose와 Spring Profile을 사용해 로컬 PostgreSQL을 실행한다.

```bash
docker compose -f docker-compose-local.yaml up -d
cp -n .env.example .env
# .env에 GitHub OAuth 등 필수 값을 입력한 뒤 현재 셸에 반영한다.
set -a
source .env
set +a
./gradlew bootRun --args='--spring.profiles.active=local'
```

`bootRun`은 서버가 종료되지 않는 동안 실행 상태로 유지된다. 로그에
`Started JarihanaApplication`이 출력되면 정상적으로 요청을 받을 준비가 된 것이다.
`DB_URL`과 OAuth 값이 현재 셸에 없으면 기동에 실패할 수 있다.

로컬 PostgreSQL의 데이터베이스, 사용자, 비밀번호는 `jarihana`로 고정되어 있고
호스트 포트는 `5432`다.
운영 배포 환경 변수는 GitHub Actions Secrets와 Variables에서 `infra/docker-compose.yml`로 주입한다.

PostgreSQL 컨테이너 상태는 다음 명령으로 확인할 수 있다.

```bash
docker compose -f docker-compose-local.yaml ps
```

컨테이너를 종료해도 데이터는 named volume에 유지된다. 데이터까지 초기화할 때만
`docker compose -f docker-compose-local.yaml down -v`를 사용한다.

### Flyway 스키마 관리

모든 프로필은 Flyway 마이그레이션을 실행한 뒤 Hibernate `ddl-auto: validate`로
엔티티 매핑을 검증한다. Spring Session 테이블도 V1이 만들며 별도 초기화는 끈다.
빈 DB에는 `src/main/resources/db/migration/V1__baseline.sql`부터 적용한다.

기존 DB는 실제 스키마와 V1 결과를 비교한 뒤에만 버전 1을 baseline으로 등록한다.
이력이 없는 기존 DB의 자동 등록은 기본적으로 꺼져 있으므로 최초 도입 준비 없이
배포하면 기동이 실패한다. 첫 배포에서만 환경별 `FLYWAY_BASELINE_ON_MIGRATE=true`를
설정하고 등록 확인 후 끈다. 새 변경은 V2 이후로 추가하며 기존 파일을 수정하지 않는다.

V1은 2026-10-14 dev/prod RDS의 스키마 덤프를 정리해 작성했다. 두 환경의 스키마와
V1의 테이블, 컬럼, 제약, 인덱스 및 시퀀스를 대조했고, 격리 복원 DB에서 기동을 검증했다.
SSM 접속, 스키마 대조, 복원 DB 검증 및 최초 도입 절차는
[Flyway baseline 운영 가이드](docs/operations/flyway-baseline.md)를 따른다.
기존 로컬 DB도 스키마 대조가 필요하며, 데이터 재생성이 가능한 경우에만 사용자가
로컬 볼륨을 초기화한다. 자동 baseline으로 오래된 로컬 스키마를 최신으로 인정하지 않는다.

`db/migrations/`의 회원 정책, 피드백, 활동 기록, 알림, 달력과 초대 DDL은 V1에 반영했다.
기존 DB에 해당 SQL이 적용되어 있는지는 첫 도입 전에 확인해야 한다.
달력의 기존 데이터 백필과 기능 공개는
[모임 달력 운영 데이터 이관 및 배포 가이드](docs/operations/group-calendar-rollout.md)를 계속 따른다.

초대의 신청 출처, 낙관적 잠금 버전, 초대와 수락 테이블 및 알림 사건 확장은 V1에 포함된다.
기존 DB에서는 [통합 초대 DDL](db/migrations/2026-10-11-invitation.sql)의 적용 상태와
초대 상태 및 공유 링크 보정 결과를 baseline 등록 전에 확인한다.
공유 토큰 암호화 키 설정과 적용 순서, 검증, 복구 제한은 [초대 운영 가이드](docs/operations/invitations.md)를 따른다.

### 운영 RDS 접속

운영 배포는 앱 EC2의 Compose PostgreSQL이 아니라 RDS의 `jarihana_prod` 데이터베이스에
연결한다. 로컬 DB 도구에서 운영 DB를 확인해야 할 때는 AWS 보안 그룹, VPN 또는 bastion 정책에
맞는 승인된 접속 경로를 사용한다. RDS endpoint, 사용자, 비밀번호는 GitHub Actions의 `prod`
Environment에 저장하며 저장소에 커밋하지 않는다.

### 공유 개발 환경

`develop`의 백엔드 변경은 `backend-dev-deploy.yml`에서 개발 전용 EC2의 Compose로
배포한다. 개발 DB, 인증값, 포트는 운영과 분리하고 Spring `dev` 프로필을 사용한다.
개발 API는 호스트 `8080`에서 컨테이너 `8080`으로 전달하고, 관리 포트는
호스트 `127.0.0.1:8081`에서 컨테이너 `8081`로만 전달한다. `8081`은 외부에 공개하지 않는다.
CloudFront 개발 API Origin도 EC2의 8080번 포트를 바라보도록 확인해야 한다.
`application-dev.yaml`은 `ddl-auto: validate`, `show-sql: false`와 관리용 메트릭을 설정하며,
DB 접속값과 인증,OAuth,S3 설정은 개발 Compose의 환경 변수로 주입한다.
[개발 Compose](../infra/docker-compose.dev.yml)는 DB 스키마를 자동으로 초기화하지 않는다.
빈 개발 DB는 Flyway V1으로 Spring Session을 포함한 스키마를 준비한다. 기존 개발 DB의
첫 도입은 [Flyway baseline 운영 가이드](docs/operations/flyway-baseline.md)에 따라 대조와
baseline 등록을 먼저 준비한다. 이후 변경은 버전 마이그레이션으로 자동 적용한다.
개발 `IMAGE_S3_KEY_PREFIX`는 `jarihana-dev/images`를 사용한다.

### 배포 환경 설정

`main` 브랜치에 반영된 커밋에 백엔드, 운영 Compose,workflow 변경이 포함되면 `backend-prod-deploy.yml`이
자동으로 실행된다. 필요할 때는 GitHub Actions에서 수동으로도 실행할 수 있다.
prod workflow는 서버에서 Docker 이미지를 새로 빌드하지 않고, develop 배포가 GHCR에 올린 backend
tree tag 이미지를 `jarihana-prod` runner에서 받아 교체한다. 배포 후 `infra/scripts/verify-backend.sh prod`를
실행하고, 실패하면 서버에 기록된 직전 성공 태그로 롤백한다.

`Settings > Environments`의 `dev`, `prod`에 아래 Secrets와 Variables를 각각 등록한다.
dev, prod 모두 RDS 접속값을 사용한다. OAuth 설정은
`OAUTH_GITHUB_*` 이름으로 저장한 뒤 배포 워크플로에서 애플리케이션 환경 변수
`GITHUB_OAUTH_*`로 매핑한다.

| 애플리케이션,Compose 환경 변수 | GitHub 설정 이름 | 저장 위치 |
| --- | --- | --- |
| `RDS_URL` | `RDS_URL` | dev/prod Variables |
| `DB_USERNAME` | `DB_USERNAME` | dev/prod Variables |
| `DB_PASSWORD` | `DB_PASSWORD` | dev/prod Secrets |
| `POSTGRES_MONITOR_DSN` | `POSTGRES_MONITOR_DSN` | dev/prod Secrets |
| `FRONTEND_ORIGIN` | `FRONTEND_ORIGIN` | Variables |
| `ACCESS_TOKEN_SECRET` | `ACCESS_TOKEN_SECRET` | Secrets |
| `GITHUB_OAUTH_CLIENT_ID` | `OAUTH_GITHUB_CLIENT_ID` | Variables |
| `GITHUB_OAUTH_CLIENT_SECRET` | `OAUTH_GITHUB_CLIENT_SECRET` | Secrets |
| `GITHUB_OAUTH_REDIRECT_URI` | `OAUTH_GITHUB_REDIRECT_URI` | Variables |
| `IMAGE_S3_BUCKET` | `IMAGE_S3_BUCKET` | Variables |
| `IMAGE_S3_REGION` | `IMAGE_S3_REGION` | Variables |
| `IMAGE_S3_KEY_PREFIX` | `IMAGE_S3_KEY_PREFIX` | Variables |
| `IMAGE_S3_PUBLIC_BASE_URL` | `IMAGE_S3_PUBLIC_BASE_URL` | Variables |

실제 값은 저장소에 커밋하지 않는다. `backend/.env.example`은 로컬 실행용 키 목록과
예시만 제공하며 운영값의 저장소가 아니다. S3 자격 증명은 애플리케이션에서 별도로
주입하지 않고 AWS SDK 기본 자격 증명 체인을 사용하므로, 운영 EC2에서는 연결된 IAM Role이
필요하다.

## 웹푸시, 알림함

설정, DB 적용, 로컬 테스트, 배포, 장애 확인은 [웹푸시 운영 가이드](docs/operations/web-push.md)를 확인한다.

## 배포 worker 제어 API

Blue-Green 배포가 worker를 pause·drain·activate·release하는 내부 API 계약은
[worker 제어 API 운영 문서](../infra/blue-green-deploy/docs/architecture.md#worker-제어-api)를 확인한다.
운영 배포의 앱 전용 runner가 해당 호스트의 loopback 관리 API를 호출한다.

dev/prod GitHub Environment의 Variables에 `INVITATION_TOKEN_ACTIVE_KEY_ID`(기본 primary), Secrets에 `INVITATION_TOKEN_KEY_PRIMARY`와 필요한 `INVITATION_TOKEN_KEY_PREVIOUS`를 설정하면 backend 배포 workflow와 Compose가 서버로 전달한다. 키는 32바이트를 Base64로 인코딩한 값이며 환경마다 분리한다. 실제 Secrets 등록, DB 적용, 배포는 코드 변경과 별도로 수행한다.
