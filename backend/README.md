# 자리하나 백엔드

자리하나는 우아한테크코스 내부에 흩어진 동아리와 스터디 정보를 한곳에서 탐색할 수
있도록 만드는 서비스입니다. 이 디렉터리는 Spring Boot 백엔드 애플리케이션을
관리합니다.

## 저장소 구조

```text
2026-jarihana/
├── backend/     # 현재 디렉터리
│   ├── AGENTS.md
│   ├── README.md
│   └── docs/     # 팀 컨벤션과 설계 맥락
└── frontend/    # 프론트엔드 애플리케이션
```

백엔드의 Gradle 명령과 Docker Compose 명령은 이 디렉터리에서 실행합니다.

이 문서 묶음은 팀이 합의한 개발 규칙과 AI·자동화 도구가 따라야 할 실행 지침을
책임별로 분리해 관리합니다.

## 문서 구성

```text
2026-jarihana/
├── backend/
│   ├── AGENTS.md
│   ├── README.md
│   └── docs/
│       ├── team-convention.md
│       ├── review/
│       │   └── convention-review.md
│       └── conventions/
│           ├── workflow.md
│           ├── api.md
│           ├── architecture.md
│           ├── testing.md
│           ├── code.md
│           ├── persistence.md
│           ├── time.md
│           ├── security.md
│           └── project-operations.md
└── frontend/
```

- `backend/AGENTS.md`: 백엔드 AI 로더, 지침 우선순위와 작업 흐름을 소유합니다.
- `backend/docs/team-convention.md`: 구속력 있는 컨벤션 세트의 인덱스이자 선택 로딩
  라우터입니다.
- `backend/docs/conventions/`: 정확히 9개 구속력 있는 모듈이며, 각 파일이 자기 분야의
  확정 규칙을 소유합니다.
- `backend/docs/review/convention-review.md`: 사용자가 명시적으로 재검토할 때만 읽는 비구속 보류
  문서입니다.

## 적용 방법

1. 백엔드 작업은 이 디렉터리의 `AGENTS.md`를 먼저 읽습니다.
2. 팀 컨벤션과 설계 맥락은 `backend/docs/`에서 관리합니다.
3. AI·자동화 도구는 항상 `docs/team-convention.md` 전체를 먼저 읽고, 인덱스의
   라우팅 표에서 작업 분야에 필요한 모듈만 추가로 읽습니다. 범위가 불명확하거나
   복합적이면 9개 모듈 전체를 읽습니다.
4. 실제 프로젝트에 맞게 실행 가능한 저장소 파일로 확인한 값만 보완합니다. 확인하지
   않은 애플리케이션 명령, 버전, 환경 변수와 endpoint는 추측하지 않습니다.

## 컨벤션 변경 위치

- 확정 규칙은 해당 소유 모듈에서 수정합니다.
- 파일 소유권이나 라우팅은 `docs/team-convention.md`에서 수정합니다.
- 백엔드 필수 로딩, 우선순위와 작업 흐름은 `backend/AGENTS.md`에서 수정합니다.
- 보류 제안은 `docs/review/convention-review.md`에 기록하며, 수락 전에는 구현에 적용하지
  않습니다.

## 문서 우선순위

충돌이 생기면 다음 순서로 판단합니다.

1. 현재 사용자의 명시적 요청
2. `backend/AGENTS.md`
3. `docs/team-convention.md`와 선택 로딩한 구속력 있는 모듈
4. 현재 저장소의 실행 가능한 코드, 테스트, 설정 파일에서 확인한 증거

충돌이 있으면 작업 범위를 조용히 넓히지 말고 사용자에게 보고합니다.

## 로컬 PostgreSQL 실행

IntelliJ 환경이라면 [IntelliJ 로컬 실행 가이드](./docs/guide/intellij-local-run.md) 문서를 확인하십시오.
`backend/.env.example`은 로컬 실행용 템플릿이며, 복사한 `backend/.env`에 개인별 값을 입력합니다.

Docker Compose와 Spring Profile을 사용해 로컬 PostgreSQL을 실행합니다.

```bash
docker compose -f docker-compose-local.yaml up -d
./gradlew bootRun --args='--spring.profiles.active=local'
```

로컬 PostgreSQL의 데이터베이스, 사용자, 비밀번호는 `jarihana`로 고정되어 있고
호스트 포트는 `5432`입니다.
운영 배포 환경 변수는 GitHub Actions Secrets에서 `infra/docker-compose.yml`로 주입합니다.

`local` 프로필은 프론트엔드의 명시적인 개발 로그인 선택에 한해 loopback 요청을 회원 ID 1로
인증합니다. 실제 서비스·도메인 권한과 CSRF 검사는 그대로 적용됩니다. 다른 로컬 회원을 사용하려면
`--jarihana.auth.local-development.member-id=<id>`로 바꾸며, non-local 프로필에서는 이 필터가
설정값과 무관하게 설치되지 않습니다.

PostgreSQL 컨테이너 상태는 다음 명령으로 확인할 수 있습니다.

```bash
docker compose -f docker-compose-local.yaml ps
```

컨테이너를 종료해도 데이터는 named volume에 유지됩니다. 데이터까지 초기화할 때만
`docker compose -f docker-compose-local.yaml down -v`를 사용합니다.

운영 환경에서는 `infra/docker-compose.yml`이 `SPRING_PROFILES_ACTIVE=prod`, DB 접속값,
인증·OAuth 설정을 GitHub Actions Secrets와 함께 주입합니다. 운영 프로필은 스키마를 자동
변경하지 않고 `ddl-auto: validate`로 검증만 수행합니다.

회원 유형과 이름 중복 정책을 배포할 때는 운영 DB에서
`docs/migrations/2026-09-01-member-type-and-name-policy.sql`을 실행합니다. 이 마이그레이션은
기존 `course = 'COACH'` 회원을 `member_type = 'COACH'`로 옮기고, `member_type`에 따른
`course`·`generation` 조합 및 회원 이름 중복 규칙을 적용합니다.

운영 프로필은 `ddl-auto: validate`이므로 애플리케이션이 이 변경을 자동으로 적용하지 않습니다.
기존 데이터에 새 정책과 충돌하는 이름이 있으면 마이그레이션 전에 해당 데이터를 정리해야 합니다.

### 운영 배포 시크릿

`main` 브랜치에 반영된 커밋에 `backend/**` 변경이 포함되면 백엔드 배포 워크플로가
자동으로 실행됩니다. 필요할 때는 GitHub Actions에서 수동으로도 실행할 수 있습니다.

저장소의 `Settings > Secrets and variables > Actions`에 다음 이름으로 시크릿을 등록합니다.
GitHub은 `GITHUB_`로 시작하는 시크릿 이름을 허용하지 않으므로, OAuth 시크릿은
`OAUTH_GITHUB_*` 이름으로 저장한 뒤 배포 워크플로에서 애플리케이션 환경 변수
`GITHUB_OAUTH_*`로 매핑합니다.

| 애플리케이션·Compose 환경 변수 | GitHub Actions 시크릿 |
| --- | --- |
| `POSTGRES_PASSWORD` | `POSTGRES_PASSWORD` |
| `FRONTEND_ORIGIN` | `FRONTEND_ORIGIN` |
| `ACCESS_TOKEN_SECRET` | `ACCESS_TOKEN_SECRET` |
| `GITHUB_OAUTH_CLIENT_ID` | `OAUTH_GITHUB_CLIENT_ID` |
| `GITHUB_OAUTH_CLIENT_SECRET` | `OAUTH_GITHUB_CLIENT_SECRET` |
| `GITHUB_OAUTH_REDIRECT_URI` | `OAUTH_GITHUB_REDIRECT_URI` |
| `IMAGE_S3_BUCKET` | `IMAGE_S3_BUCKET` |
| `IMAGE_S3_REGION` | `IMAGE_S3_REGION` |
| `IMAGE_S3_KEY_PREFIX` | `IMAGE_S3_KEY_PREFIX` (`jarihana/images`) |
| `IMAGE_S3_PUBLIC_BASE_URL` | `IMAGE_S3_PUBLIC_BASE_URL` (`https://d1znkkaqfyz08f.cloudfront.net/images`) |

실제 값은 저장소에 커밋하지 않습니다. `backend/.env.example`은 로컬 실행용 키 목록과
예시만 제공하며 운영값의 저장소가 아닙니다. S3 자격 증명은 애플리케이션에서 별도로
주입하지 않고 AWS SDK 기본 자격 증명 체인을 사용하므로, 운영 EC2에서는 연결된 IAM Role이
필요합니다.
