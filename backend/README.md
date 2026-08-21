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

PostgreSQL 컨테이너 상태는 다음 명령으로 확인할 수 있습니다.

```bash
docker compose -f docker-compose-local.yaml ps
```

컨테이너를 종료해도 데이터는 named volume에 유지됩니다. 데이터까지 초기화할 때만
`docker compose -f docker-compose-local.yaml down -v`를 사용합니다.

운영 환경에서는 `infra/docker-compose.yml`이 `SPRING_PROFILES_ACTIVE=prod`, DB 접속값,
인증·OAuth 설정을 GitHub Actions Secrets와 함께 주입합니다. 운영 프로필은 스키마를 자동
변경하지 않고 `ddl-auto: validate`로 검증만 수행합니다.

### 운영 배포 시크릿

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

실제 값은 저장소에 커밋하지 않습니다. `backend/.env.example`은 로컬 실행용 키 목록과
예시만 제공하며 운영값의 저장소가 아닙니다.
