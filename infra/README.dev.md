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
추가한다. 개발 백엔드의 테스트 job과 PR CI는 GitHub-hosted runner에서 실행한다.
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

1. 운영 컨테이너의 Compose label·volume mount, EC2 CPU·메모리·디스크 사용량과 8081·5433의
   미사용 여부를 확인한다. 운영 DB volume이나 project 이름은 변경하지 않는다.
2. 두 백엔드·DB와 Docker/npm 빌드가 함께 돌아갈 여유를 확인하고 아래 CPU·메모리 상한을 정한다.
   Compose는 네 자원 상한이 없으면 실패한다. 컨테이너 상한은 호스트에서 실행하는 빌드 부하를
   제한하지 않으므로 첫 배포 동안 운영 API 응답·OOM·디스크를 별도로 관찰한다.
3. GitHub Environment `dev`, `prod`를 만들고 배포 브랜치를 각각 `develop`, `main`으로 제한한다.
   PR 필수 CI를 유지한다. 운영 workflow는 기존 운영 secrets·variables를 사용한다.
4. dev 전용 GitHub OAuth 앱, JWT 키, DB 비밀번호를 준비한다. 개발 프론트와 백엔드의 OAuth
   콜백을 동일한 dev HTTPS `/api/oauth/github/callback`으로 설정한다.
5. 아래 GitHub 설정과 dev CloudFront를 준비한 뒤 `backend-dev-deploy.yml`을 develop에서
   수동 실행한다. 기본 브랜치에 workflow가 있어야 수동 실행 메뉴를 사용할 수 있다.
6. 백엔드 확인 후 `frontend-dev-deploy.yml`을 수동 실행하고 공개 HTTPS 동작을 확인한다.
   push 자동 배포도 활성화되어 있으므로 dev workflow를 develop에 반영하기 전에 환경값을 준비한다.

### GitHub Environment `dev`

Secrets:

| 이름 | 값 |
| --- | --- |
| `POSTGRES_PASSWORD` | 개발 DB 전용 비밀번호 |
| `ACCESS_TOKEN_SECRET` | 개발 JWT 전용 비밀값, 현재 JWT 요구 길이 충족 |
| `OAUTH_GITHUB_CLIENT_SECRET` | 개발 GitHub OAuth 앱 secret |

Variables:

| 이름 | 값 |
| --- | --- |
| `FRONTEND_ORIGIN` | 개발 HTTPS origin, 경로 없이 지정 |
| `OAUTH_GITHUB_CLIENT_ID` | 개발 GitHub OAuth 앱 client ID |
| `OAUTH_GITHUB_REDIRECT_URI` | 개발 HTTPS `/api/oauth/github/callback` |
| `IMAGE_S3_BUCKET` | `techcourse-project-2026` |
| `IMAGE_S3_PUBLIC_BASE_URL` | 개발 이미지 공개 URL, 예: dev origin의 `/images` |
| `CLOUDFRONT_DISTRIBUTION_ID` | 개발 전용 배포판 ID, 운영 ID 사용 금지 |
| `BACKEND_MEMORY_LIMIT` | 측정 후 결정한 Docker 메모리 상한, 예시 문법 `768m` |
| `BACKEND_CPUS` | 측정 후 결정한 CPU 상한, 예시 문법 `1.0` |
| `POSTGRES_MEMORY_LIMIT` | 측정 후 결정한 DB 메모리 상한, 예시 문법 `256m` |
| `POSTGRES_CPUS` | 측정 후 결정한 CPU 상한, 예시 문법 `0.5` |

시크릿과 변수는 `Settings > Environments > dev`에 위 이름으로 등록한다. workflow의
`environment: dev`가 환경을 선택하므로 이름에 환경 접두사를 붙이지 않는다.
동일한 이름이 저장소와 Environment에 있으면 Environment 값이 우선한다.
Environment에 값이 없으면 저장소 공용 값이 사용될 수 있으므로, 위 개발 값을 모두 등록한다.
기존 접두사 이름으로 등록했다면 새 이름으로 다시 등록해야 한다.

자원 값은 문법 예시이지 현재 EC2에 대한 권장값이 아니다. 프론트의 dev 분석 수집은 비활성화한다.

### CloudFront·AWS

- 개발 전용 배포판의 기본 Origin은 버킷 `techcourse-project-2026`, Origin path
  `/jarihana-dev/frontend`를 사용한다. SPA deep link와 대표 JS 파일을 확인한다.
- `/api/*`는 같은 EC2의 HTTP 8081로 전달한다. 캐시를 끄고 쿠키·인증/CSRF 헤더·query 및 필요한
  HTTP method를 전달한다. 보안 그룹에서 해당 경로가 허용되는지 확인한다.
- `/images/*`와 S3 `jarihana-dev/images` 경로를 맞춘다. 예를 들어 S3 Origin path가
  `/jarihana-dev`이면 `/images/<key>` 요청이 `jarihana-dev/images/<key>`를 조회한다.
- 공유 미리보기 함수를 연결한다면 [기존 함수 안내](cloudfront/README.md)를 참고하되 dev 배포판의
  `jarihana-backend` Origin이 반드시 EC2:8081을 가리키게 한다. 운영 배포판을 수정하지 않는다.
- runner에 dev frontend·releases prefix의 S3 조회/쓰기, dev CloudFront 무효화 생성/조회 권한이
  필요하다. 앱에는 dev images prefix 접근 권한이 필요하다. 같은 호스트 역할을 공유하므로
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

## 확인과 복구

- 백엔드 배포는 로컬 8081의 `/api/groups?size=1`에서 HTTP 성공과 `success: true`를 최대 180초
  기다린다. 실패하면 존재하는 직전 dev 이미지로 복구를 시도하고 배포 자체는 실패로 남긴다.
  첫 배포에는 복구할 이전 이미지가 없다. DB schema는 자동 원복하지 않는다.
- 프론트는 `jarihana-dev/releases/<SHA>/frontend`에 산출물을 보관한다. 자산을 먼저 업로드하고
  HTML을 마지막에 교체한 뒤 dev CloudFront 무효화 완료를 기다린다. 이전 해시 자산은 즉시 삭제하지 않는다.
- 공개 dev HTTPS에서 `/`, JS 자산, `/api/groups?size=1`, 로그인·콜백·로그아웃, 그룹 생성,
  이미지 업로드와 공유 미리보기를 확인한다. 로컬 readiness와 공개 URL 검증은 별도다.
- 수동 복구는 해당 컴포넌트 자동 배포와 겹치지 않는 동안 수행한다. 오래된 Actions 실행 재시도는
  현재 상태를 과거 코드로 덮을 수 있으므로, 확인한 성공 SHA·이미지·산출물을 사용한다.
- dev 데이터 보존과 운영 컨테이너 ID·이미지·volume mount가 그대로인지 재배포 전후 비교한다.
  성공 릴리스와 이미지는 최근 3개 이상을 보관하고, 확인 후 dev 자원만 정리한다.

프론트 복구 예시(확인한 성공 SHA를 지정하고 같은 runner에서 실행):

```bash
release_sha=replace-with-verified-successful-sha
release="s3://techcourse-project-2026/jarihana-dev/releases/${release_sha}/frontend"
destination=s3://techcourse-project-2026/jarihana-dev/frontend
aws s3 ls "${release}/index.html"
aws s3 sync "$release" "$destination" --exclude index.html
aws s3 cp "${release}/index.html" "${destination}/index.html" --cache-control no-cache
# CLOUDFRONT_DISTRIBUTION_ID는 위에서 확인한 개발 전용 ID
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths '/*'
```

업로드된 릴리스가 모두 성공 배포인 것은 아니다. Actions 성공 기록과 실제 공개 응답을 함께 확인한다.
