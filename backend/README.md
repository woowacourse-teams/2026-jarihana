# 자리하나 백엔드

자리하나는 우아한테크코스 내부에 흩어진 동아리와 스터디 정보를 한곳에서 탐색할 수
있도록 만드는 서비스입니다. 이 디렉터리는 Spring Boot 백엔드 애플리케이션을
관리합니다.

## 저장소 구조

```text
2026-jarihana/
├── docs/
│   └── workflow.md       # 저장소 공통 브랜치·PR·커밋 및 ADR 영역·참조 정책
├── backend/              # 현재 디렉터리
│   ├── AGENTS.md
│   ├── README.md
│   ├── db/migrations/
│   └── docs/              # 팀 컨벤션과 설계 맥락
└── frontend/             # 프론트엔드 애플리케이션
```

백엔드의 Gradle 명령과 Docker Compose 명령은 이 디렉터리에서 실행합니다.

이 문서 묶음은 프로젝트 안내, 개발 규칙, 설계 맥락과 실행 절차를 책임별로
분리해 관리합니다.

## 문서 구성

```text
2026-jarihana/
├── docs/
│   └── workflow.md
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

- `backend/AGENTS.md`: 백엔드 AI 작업 규칙과 문서 라우팅을 소유합니다.
- `backend/docs/team-convention.md`: 구속력 있는 컨벤션 모듈의 소유권과 권한을 설명합니다.
- `backend/docs/conventions/`: 8개 구속력 있는 모듈이며, 각 파일이 자기 분야의 확정 규칙을 소유합니다.
- `backend/docs/context/`: 도메인과 API 설계 의도를 사람이 검토하는 문서 모음입니다.
- `backend/docs/proposals/`: 사용자가 명시적으로 재검토할 때만 읽는 비구속 제안 문서입니다.
- `backend/db/migrations/`: 데이터베이스 마이그레이션입니다.

## 문서 사용

- 작업 규칙과 AI 문서 로딩은 이 디렉터리의 `AGENTS.md`를 확인합니다.
- 공통 브랜치·PR·커밋 정책은 [워크플로 컨벤션](../docs/workflow.md)을 확인합니다.
- ADR 영역 구분·교차 참조 규칙은 [워크플로 컨벤션](../docs/workflow.md)을 확인합니다.
- 설계 의도는 `docs/context/`, 구속력 있는 구현 규칙은 `docs/conventions/`에서 확인합니다.

## 컨벤션 변경 위치

- 확정 규칙은 해당 소유 모듈에서 수정합니다.
- 문서 라우팅은 `backend/AGENTS.md`에서 수정합니다.
- 컨벤션 모듈 소유권은 `docs/team-convention.md`에서 수정합니다.
- 백엔드 필수 로딩, 우선순위와 작업 흐름은 `backend/AGENTS.md`에서 수정합니다.
- 보류 제안은 `docs/proposals/convention-review.md`에 기록하며, 수락 전에는 구현에 적용하지
  않습니다.

## 로컬 PostgreSQL 실행

`backend/.env.example`은 로컬 실행용 템플릿이며, 복사한 `backend/.env`에 개인별 값을 입력합니다.

Docker Compose와 Spring Profile을 사용해 로컬 PostgreSQL을 실행합니다.

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
호스트 포트는 `5432`입니다.
운영 배포 환경 변수는 GitHub Actions Secrets에서 `infra/docker-compose.yml`로 주입합니다.

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
`db/migrations/2026-09-01-member-type-and-name-policy.sql`을 실행합니다. 이 마이그레이션은
기존 `course = 'COACH'` 회원을 `member_type = 'COACH'`로 옮기고, `member_type`에 따른
`course`·`generation` 조합 및 회원 이름 중복 규칙을 적용합니다.

운영 프로필은 `ddl-auto: validate`이므로 애플리케이션이 이 변경을 자동으로 적용하지 않습니다.
기존 데이터에 새 정책과 충돌하는 이름이 있으면 마이그레이션 전에 해당 데이터를 정리해야 합니다.

### 운영 DB SSH 터널 접속

운영 Compose는 PostgreSQL 포트를 서버의 `127.0.0.1:5432`에 바인딩합니다.
운영 서버에 SSH 접속할 수 있고 SSH 포트 포워딩이 허용된 환경에서, 개인 키 경로와
SSH 계정·서버 주소를 실제 값으로 바꿔 로컬 터미널에서 실행합니다.

```bash
ssh -i /path/to/key.pem \
  -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:15432:127.0.0.1:5432 \
  SSH_USER@SERVER_IP
```

터널을 유지한 상태에서 DB 도구의 Host는 `127.0.0.1`, Port는 `15432`, Database와
User는 `jarihana`, Password는 운영 DB 비밀번호로 설정합니다. 이 명령으로 터널을
실행했다면 DB 도구의 SSH 터널 기능은 별도로 켜지 않습니다. 종료할 때는 터미널에서
`Ctrl+C`를 누릅니다. 로컬 PostgreSQL의 `5432` 포트와 구분하기 위해 `15432`를 사용합니다.

최초 포트 매핑 반영 시 PostgreSQL 컨테이너가 재생성되어 기존 DB 연결이 잠시 끊길 수
있습니다. 기존 `postgres-data` 볼륨은 유지하며, 적용을 위해 볼륨을 삭제하지 않습니다.

### 운영 배포 시크릿

`main` 브랜치에 반영된 커밋에 `backend/**` 변경이 포함되면 백엔드 배포 워크플로가
자동으로 실행됩니다. 인프라 배포 워크플로는 `main`의 `infra/docker-compose.yml`
변경 시 PostgreSQL만 배포합니다.
두 워크플로 모두 GitHub Actions에서 수동으로도 실행할 수 있습니다.

인프라 워크플로도 기존 운영 Compose를 사용하므로, Compose 전체의 환경 변수 해석에
필요한 아래 시크릿을 전달합니다. 백엔드 이미지 빌드나 백엔드 컨테이너 배포는 수행하지 않습니다.

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
