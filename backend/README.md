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
- `backend/db/migrations/`: 데이터베이스 마이그레이션이다.

## 문서 사용

- 작업 규칙과 AI 문서 로딩은 이 디렉터리의 `AGENTS.md`를 확인한다.
- 공통 브랜치·PR·커밋 정책은 [저장소 컨벤션](../docs/repository-conventions.md)을 확인한다.
- ADR 영역 구분·교차 참조 규칙은 [저장소 컨벤션](../docs/repository-conventions.md)을 확인한다.
- 설계 의도는 `docs/context/`, 구속력 있는 구현 규칙은 `docs/conventions/`에서 확인한다.

## 컨벤션 변경 위치

- 확정 규칙은 해당 소유 모듈에서 수정한다.
- 문서 라우팅은 `backend/AGENTS.md`에서 수정한다.
- 컨벤션 모듈 소유권은 `docs/team-convention.md`에서 수정한다.
- 백엔드 필수 로딩, 우선순위와 작업 흐름은 `backend/AGENTS.md`에서 수정한다.
- 보류 제안은 `docs/proposals/convention-review.md`에 기록하며, 수락 전에는 구현에 적용하지
  않는다.

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

운영 환경에서는 `infra/docker-compose.yml`이 `SPRING_PROFILES_ACTIVE=prod`, DB 접속값,
인증·OAuth 설정을 GitHub Actions Secrets와 Variables에서 주입한다. 운영 프로필은 스키마를 자동
변경하지 않고 `ddl-auto: validate`로 검증만 수행한다.

회원 유형과 이름 중복 정책을 배포할 때는 운영 DB에서
`db/migrations/2026-09-01-member-type-and-name-policy.sql`을 실행한다. 이 마이그레이션은
기존 `course = 'COACH'` 회원을 `member_type = 'COACH'`로 옮기고, `member_type`에 따른
`course`·`generation` 조합 및 회원 이름 중복 규칙을 적용한다.

운영 프로필은 `ddl-auto: validate`이므로 애플리케이션이 이 변경을 자동으로 적용하지 않는다.
기존 데이터에 새 정책과 충돌하는 이름이 있으면 마이그레이션 전에 해당 데이터를 정리해야 한다.

피드백 기능을 운영에 배포하기 전에 운영 DB에서
`db/migrations/2026-09-26-feedback.sql`을 실행해야 한다. 피드백은 가입을 완료한
로그인 회원만 작성할 수 있으며, 이 DDL은 회원 ID가 필수인 `feedback` 테이블을 생성한다.
작성 내용과 인증 회원 ID가 함께 저장된다. 운영 프로필은
`ddl-auto: validate`이므로 이 DDL을 적용하지 않으면 애플리케이션이 기동하지 않는다.

그룹 달력의 반복 회차별 예외 수정을 배포하기 전에 운영 DB에서
`db/migrations/2026-10-12-group-recurring-occurrence-overrides.sql`을 실행해야 한다.
기존 일정 데이터는 nullable 연결 컬럼으로 보존되며, `ddl-auto: validate` 환경에서는
마이그레이션을 적용하지 않으면 애플리케이션이 기동하지 않는다.

달력 전체의 운영 스키마 확장, 기존 그룹 이력 백필, 기능 공개 순서는
[모임 달력 운영 데이터 이관·배포 가이드](docs/operations/group-calendar-rollout.md)를 따른다.
운영 배포 전에 `2026-10-07-group-calendar-expand.sql`과 반복 회차 예외 SQL을 적용하고,
호환 백엔드 배포 뒤 `2026-10-07-group-calendar-backfill-batch.sql`을 검토·실행해야 한다.

초대 기능을 배포하기 전에는 [통합 초대 DDL](db/migrations/2026-10-11-invitation.sql)을 적용한다.
기존 신청 출처·낙관적 잠금 버전, 초대·수락 테이블, 초대 상태·공유 링크 보정과 알림 사건 확장을
하나의 트랜잭션으로 처리한다. 기존 알림 테이블이 먼저 준비되어 있어야 한다.
공유 토큰 암호화 키 설정과 적용 순서·검증·복구 제한은 [초대 운영 가이드](docs/operations/invitations.md)를 따른다.

### 운영 RDS 접속

운영 배포는 앱 EC2의 Compose PostgreSQL이 아니라 RDS의 `jarihana_prod` 데이터베이스에
연결한다. 로컬 DB 도구에서 운영 DB를 확인해야 할 때는 AWS 보안 그룹, VPN 또는 bastion 정책에
맞는 승인된 접속 경로를 사용한다. RDS endpoint, 사용자, 비밀번호는 GitHub Actions의 `prod`
Environment에 저장하며 저장소에 커밋하지 않는다.

### 공유 개발 환경

`develop`의 백엔드 변경은 `backend-dev-deploy.yml`에서 개발 전용 EC2의 Compose로
배포한다. 개발 DB·인증값·포트는 운영과 분리하고 Spring `dev` 프로필을 사용한다.
개발 API는 호스트 `8080`에서 컨테이너 `8080`으로 전달하고, 관리 포트는
호스트 `127.0.0.1:8081`에서 컨테이너 `8081`로만 전달한다. `8081`은 외부에 공개하지 않는다.
CloudFront 개발 API Origin도 EC2의 8080번 포트를 바라보도록 확인해야 한다.
`application-dev.yaml`은 `ddl-auto: validate`, `show-sql: false`와 관리용 메트릭을 설정하며,
DB 접속값과 인증·OAuth·S3 설정은 개발 Compose의 환경 변수로 주입한다.
[개발 Compose](../infra/docker-compose.dev.yml)는 DB 스키마를 자동으로 초기화하지 않는다.
`ddl-auto: validate`를 사용하므로 Spring Session 테이블을 포함한 개발 DB 스키마를 첫 배포 전에
별도로 준비해야 한다. 이후 스키마 변경은 `db/migrations/`의 SQL을 검토해 적용한다.
개발 `IMAGE_S3_KEY_PREFIX`는 `jarihana-dev/images`를 사용한다.

### 배포 환경 설정

`main` 브랜치에 반영된 커밋에 백엔드·운영 Compose·workflow 변경이 포함되면 `backend-prod-deploy.yml`이
자동으로 실행된다. 필요할 때는 GitHub Actions에서 수동으로도 실행할 수 있다.
prod workflow는 서버에서 Docker 이미지를 새로 빌드하지 않고, develop 배포가 GHCR에 올린 backend
tree tag 이미지를 `jarihana-prod` runner에서 받아 교체한다. 배포 후 `infra/scripts/verify-backend.sh prod`를
실행하고, 실패하면 서버에 기록된 직전 성공 태그로 롤백한다.

`Settings > Environments`의 `dev`, `prod`에 아래 Secrets와 Variables를 각각 등록한다.
dev·prod 모두 RDS 접속값을 사용한다. OAuth 설정은
`OAUTH_GITHUB_*` 이름으로 저장한 뒤 배포 워크플로에서 애플리케이션 환경 변수
`GITHUB_OAUTH_*`로 매핑한다.

| 애플리케이션·Compose 환경 변수 | GitHub 설정 이름 | 저장 위치 |
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

## 웹푸시·알림함

설정·DB 적용·로컬 테스트·배포·장애 확인은 [웹푸시 운영 가이드](docs/operations/web-push.md)를 확인한다.

dev/prod GitHub Environment의 Variables에 `INVITATION_TOKEN_ACTIVE_KEY_ID`(기본 primary), Secrets에 `INVITATION_TOKEN_KEY_PRIMARY`와 필요한 `INVITATION_TOKEN_KEY_PREVIOUS`를 설정하면 backend 배포 workflow와 Compose가 서버로 전달한다. 키는 32바이트를 Base64로 인코딩한 값이며 환경마다 분리한다. 실제 Secrets 등록·DB 적용·배포는 코드 변경과 별도로 수행한다.
