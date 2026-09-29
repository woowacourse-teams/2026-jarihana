# 개발 환경 배포

운영 EC2와 self-hosted runner 하나를 공유한다. 개발 백엔드와 PostgreSQL은
[독립 Compose 파일](docker-compose.dev.yml)의 `name: jarihana-dev`로 분리한다.
개발 프론트는 별도 CloudFront 배포판을 사용한다. 개발 S3 자원은
`s3://techcourse-project-2026/jarihana-dev/` 아래에 둔다.

이 문서는 저장소 설정과 최초 설치 절차다. 실제 AWS 자원·GitHub Environment 설정과
운영 서버에서의 배포 성공을 의미하지 않는다.

## Workflow

| 파일 | 브랜치 | push 대상 | 배포 |
| --- | --- | --- | --- |
| `ci.yml` | develop/main 대상 PR | 기존 CI 조건 | 테스트·정적 검사 |
| `backend-dev-deploy.yml` | develop | `backend/**`, dev Compose, 자기 workflow | 개발 백엔드 |
| `frontend-dev-deploy.yml` | develop | `frontend/**`, 자기 workflow | 개발 프론트 |
| `backend-prod-deploy.yml` | main | `backend/**`, 운영 Compose, 자기 workflow | 운영 백엔드 |
| `frontend-prod-deploy.yml` | main | `frontend/**`, 자기 workflow | 운영 프론트 |

네 배포 workflow는 각각 수동 실행할 수 있다. 개발 workflow는 `develop`, 운영은 `main`만
허용한다. 변경 감지용 job, 상위 workflow와 workflow 간 의존성은 두지 않는다.
백엔드·프론트가 함께 바뀌면 각각 실행되며 순서와 동반 성공은 보장하지 않는다.
순서가 필요한 API 변경은 하위 호환되는 백엔드를 먼저 별도 병합·배포한 뒤 프론트를 병합한다.

배포 job은 `[self-hosted, Linux, ARM64]` runner를 사용한다. 이 조건에 매칭되는 runner가
배포 대상 EC2의 한 서비스인지 확인한다. 추가 runner가 있다면 네 workflow에 같은 전용 라벨을
추가한다. 테스트는 기존 PR CI에서 GitHub-hosted runner로 실행한다.
workflow별 concurrency와 `cancel-in-progress: false`로 진행 중인 같은 컴포넌트의 배포를
자동 취소하지 않는다. 단일 runner가 운영 우선순위나 모든 커밋의 FIFO 실행을 보장하지는 않는다.

## 환경 경계

| 항목 | 운영 | 개발 |
| --- | --- | --- |
| Compose | `docker-compose.yml`, 현재 project 유지 | `docker-compose.dev.yml`, `jarihana-dev` |
| 백엔드 이미지 | `jarihana-backend:<SHA>` | `jarihana-backend-dev:<SHA>` |
| 백엔드 호스트 포트 | 8080 | 8081 |
| DB 관리 포트 | 127.0.0.1:5432 | 127.0.0.1:5433 |
| DB·사용자 | jarihana | jarihana_dev |
| DB volume | 현재 운영 volume 유지 | jarihana-dev_postgres-data |
| 프론트 S3 prefix | jarihana/frontend | jarihana-dev/frontend |
| 이미지 S3 prefix | 현재 운영 설정 유지 | jarihana-dev/images |

개발 백엔드의 DB 주소는 `jdbc:postgresql://postgres:5432/jarihana_dev`다. 컨테이너 사이에서는
호스트 관리 포트 5433을 사용하지 않는다. 개발 Compose에는 고정 `container_name`, 외부 network,
전역 volume 이름을 두지 않는다. 명령에 `-p`를 붙이거나 `COMPOSE_PROJECT_NAME`을 설정하지 않는다.

개발 환경에서도 Spring `prod` 프로필을 재사용한다. `ddl-auto: validate`와 secure cookie를
유지하고 환경별 DB·인증·주소만 구분한다. 새로운 Spring 프로필은 추가하지 않는다.

## 최초 설정

1. 운영 컨테이너의 Compose label·volume mount와 8081·5433의
   미사용 여부를 확인한다. 운영 DB volume이나 project 이름은 변경하지 않는다.
2. GitHub Environment `dev`, `prod`를 만들고 배포 브랜치를 각각 `develop`, `main`으로 제한한다.
   PR 필수 CI를 유지한다. 운영 workflow는 기존 운영 secrets·variables를 사용한다.
3. dev 전용 GitHub OAuth 앱, JWT 키, DB 비밀번호를 준비한다. 개발 프론트와 백엔드의 OAuth
   콜백을 동일한 dev HTTPS `/api/oauth/github/callback`으로 설정한다.
4. 아래 GitHub 설정과 dev CloudFront를 준비한 뒤 `backend-dev-deploy.yml`을 develop에서
   수동 실행한다. 기본 브랜치에 workflow가 있어야 수동 실행 메뉴를 사용할 수 있다.
5. 백엔드 확인 후 `frontend-dev-deploy.yml`을 수동 실행하고 공개 HTTPS 동작을 확인한다.
   push 자동 배포도 활성화되어 있으므로 dev workflow를 develop에 반영하기 전에 환경값을 준비한다.

### GitHub Environment `dev`

Secrets:

| 이름 | 값 |
| --- | --- |
| `POSTGRES_PASSWORD` | 개발 DB 전용 비밀번호 |
| `ACCESS_TOKEN_SECRET` | 개발 JWT 전용 비밀값, 현재 JWT 요구 길이 충족 |
| `OAUTH_GITHUB_CLIENT_SECRET` | 개발 GitHub OAuth 앱 secret |
| `FRONTEND_ORIGIN` | 개발 HTTPS origin, 경로 없이 지정 |
| `OAUTH_GITHUB_CLIENT_ID` | 개발 GitHub OAuth 앱 client ID |
| `OAUTH_GITHUB_REDIRECT_URI` | 개발 HTTPS `/api/oauth/github/callback` |
| `IMAGE_S3_BUCKET` | `techcourse-project-2026` |
| `IMAGE_S3_REGION` | `ap-northeast-2` |
| `IMAGE_S3_KEY_PREFIX` | `jarihana-dev/images` |
| `IMAGE_S3_PUBLIC_BASE_URL` | 개발 이미지 공개 URL, 예: dev origin의 `/images` |

시크릿은 `Settings > Environments > dev > Environment secrets`에 위 이름으로 등록한다. workflow의
`environment: dev`가 환경을 선택하므로 이름에 환경 접두사를 붙이지 않는다.
동일한 이름이 저장소와 Environment에 있으면 Environment 값이 우선한다.
Environment에 값이 없으면 저장소 공용 값이 사용될 수 있으므로, 위 개발 값을 모두 등록한다.
기존 접두사 이름으로 등록했다면 새 이름으로 다시 등록해야 한다.

프론트의 dev 분석 수집은 비활성화한다. SSH 환경값 예시의 `GITHUB_OAUTH_*`는
컨테이너에 전달하는 이름이며, GitHub Secret은 운영과 동일하게 `OAUTH_GITHUB_*`를 사용한다.

### CloudFront·AWS

- 개발 전용 배포판의 기본 Origin은 버킷 `techcourse-project-2026`, Origin path
  `/jarihana-dev/frontend`를 사용한다. SPA deep link와 대표 JS 파일을 확인한다.
- `/api/*`는 같은 EC2의 HTTP 8081로 전달한다. 캐시를 끄고 쿠키·인증/CSRF 헤더·query 및 필요한
  HTTP method를 전달한다. 보안 그룹에서 해당 경로가 허용되는지 확인한다.
- `/images/*`와 S3 `jarihana-dev/images` 경로를 맞춘다. 예를 들어 S3 Origin path가
  `/jarihana-dev`이면 `/images/<key>` 요청이 `jarihana-dev/images/<key>`를 조회한다.
- 공유 미리보기 함수를 연결한다면 [기존 함수 안내](cloudfront/README.md)를 참고하되 dev 배포판의
  `jarihana-backend` Origin이 반드시 EC2:8081을 가리키게 한다. 운영 배포판을 수정하지 않는다.
- runner에 dev frontend prefix의 S3 조회/쓰기/삭제 권한이 필요하다.
  앱에는 dev images prefix 접근 권한이 필요하다. 같은 호스트 역할을 공유하므로
  Compose project와 GitHub Environment만으로 Docker·AWS 권한까지 격리되지는 않는다.

## DB 초기화와 이후 변경

빈 PostgreSQL volume의 첫 기동에서 [bootstrap.sql](../backend/db/dev/bootstrap.sql)이 적용된다.
Spring Session 테이블도 포함한다. TCP healthcheck가 초기화용 임시 서버가 아닌 최종 서버를 기다린
뒤 백엔드를 시작하고, Spring의 schema validation으로 엔티티 호환성을 확인한다.

bootstrap은 빈 DB 전용이다. 이미 데이터가 있는 volume에 SQL 파일을 수정해도 자동 재실행되지
않는다. 이후 변경은 `backend/db/migrations/`의 SQL을 검토해 개발 DB에 먼저 적용하고 파일명·체크섬을
기록한다. bootstrap에 이미 포함된 기존 migration을 처음부터 중복 실행하지 않는다.
운영 데이터는 복사하지 않는다. 일반 재배포에서 `down -v`나 호스트 전체 prune을 실행하지 않는다.

SSH에서 Compose를 조회할 때는 [환경값 예시](dev.env.example)를 `/opt/jarihana/dev.env`처럼
checkout 밖에 복사하고 실제 값으로 채운 뒤 권한을 `600`으로 제한한다. 저장소 루트에서 실행한다.

```bash
unset COMPOSE_PROJECT_NAME
docker compose --env-file /opt/jarihana/dev.env -f infra/docker-compose.dev.yml ps
docker compose --env-file /opt/jarihana/dev.env -f infra/docker-compose.dev.yml logs --tail 100 backend
```

## 배포 확인

개발과 운영은 같은 순서로 배포한다. 백엔드는 Docker 확인, 이미지 빌드, Compose 배포,
컨테이너 상태 확인을 수행한다. 프론트는 AWS 확인, 의존성 설치, lint·typecheck,
환경값 확인, 빌드 후 `aws s3 sync --delete`로 배포한다. 테스트는 기존 PR CI에서 실행한다.

- 백엔드는 개발 Compose project와 service label로 컨테이너를 찾고 `running` 상태를 확인한다.
  HTTP 응답 대기나 자동 롤백은 수행하지 않는다.
- 프론트는 `jarihana-dev/frontend`에 동기화한다. 릴리스 별도 보관, HTML 분리 업로드,
  CloudFront 캐시 무효화는 수행하지 않는다.
- 배포 후 공개 dev HTTPS에서 화면·API·로그인·이미지 업로드를 확인한다.
  컨테이너 `running` 상태만으로 애플리케이션의 정상 응답까지 확인되는 것은 아니다.
