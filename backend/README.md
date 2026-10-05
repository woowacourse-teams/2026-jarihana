# 자리하나 백엔드

자리하나는 우아한테크코스 내부에 흩어진 동아리와 스터디 정보를 한곳에서 탐색할 수
있도록 만드는 서비스입니다. 이 디렉터리는 Spring Boot 백엔드 애플리케이션을
관리합니다.

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

백엔드의 Gradle 명령과 Docker Compose 명령은 이 디렉터리에서 실행합니다.

이 문서 묶음은 프로젝트 안내, 개발 규칙, 설계 맥락과 실행 절차를 책임별로
분리해 관리합니다.

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

- `backend/AGENTS.md`: 백엔드 AI 작업 규칙과 문서 라우팅을 소유합니다.
- `backend/docs/team-convention.md`: 구속력 있는 컨벤션 모듈의 소유권과 권한을 설명합니다.
- `backend/docs/conventions/`: 8개 구속력 있는 모듈이며, 각 파일이 자기 분야의 확정 규칙을 소유합니다.
- `backend/docs/context/`: 도메인과 API 설계 의도를 사람이 검토하는 문서 모음입니다.
- `backend/docs/proposals/`: 사용자가 명시적으로 재검토할 때만 읽는 비구속 제안 문서입니다.
- `backend/db/migrations/`: 데이터베이스 마이그레이션입니다.

## 문서 사용

- 작업 규칙과 AI 문서 로딩은 이 디렉터리의 `AGENTS.md`를 확인합니다.
- 공통 브랜치·PR·커밋 정책은 [저장소 컨벤션](../docs/repository-conventions.md)을 확인합니다.
- ADR 영역 구분·교차 참조 규칙은 [저장소 컨벤션](../docs/repository-conventions.md)을 확인합니다.
- 설계 의도는 `docs/context/`, 구속력 있는 구현 규칙은 `docs/conventions/`에서 확인합니다.

## 컨벤션 변경 위치

- 확정 규칙은 해당 소유 모듈에서 수정합니다.
- 문서 라우팅은 `backend/AGENTS.md`에서 수정합니다.
- 컨벤션 모듈 소유권은 `docs/team-convention.md`에서 수정합니다.
- 백엔드 필수 로딩, 우선순위와 작업 흐름은 `backend/AGENTS.md`에서 수정합니다.
- 보류 제안은 `docs/proposals/convention-review.md`에 기록하며, 수락 전에는 구현에 적용하지
  않습니다.

## 애플리케이션 로그

로컬 콘솔, dev/prod ECS JSON, CloudWatch 사전 준비와 조회 방법은
[애플리케이션 로깅 운영 가이드](docs/operations/application-logging.md)를 확인합니다.

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
운영 배포 환경 변수는 GitHub Actions Secrets와 Variables에서 `infra/docker-compose.yml`로 주입합니다.

PostgreSQL 컨테이너 상태는 다음 명령으로 확인할 수 있습니다.

```bash
docker compose -f docker-compose-local.yaml ps
```

컨테이너를 종료해도 데이터는 named volume에 유지됩니다. 데이터까지 초기화할 때만
`docker compose -f docker-compose-local.yaml down -v`를 사용합니다.

운영 환경에서는 `infra/docker-compose.yml`이 `SPRING_PROFILES_ACTIVE=prod`, DB 접속값,
인증·OAuth 설정을 GitHub Actions Secrets와 Variables에서 주입합니다. 운영 프로필은 스키마를 자동
변경하지 않고 `ddl-auto: validate`로 검증만 수행합니다.

회원 유형과 이름 중복 정책을 배포할 때는 운영 DB에서
`db/migrations/2026-09-01-member-type-and-name-policy.sql`을 실행합니다. 이 마이그레이션은
기존 `course = 'COACH'` 회원을 `member_type = 'COACH'`로 옮기고, `member_type`에 따른
`course`·`generation` 조합 및 회원 이름 중복 규칙을 적용합니다.

운영 프로필은 `ddl-auto: validate`이므로 애플리케이션이 이 변경을 자동으로 적용하지 않습니다.
기존 데이터에 새 정책과 충돌하는 이름이 있으면 마이그레이션 전에 해당 데이터를 정리해야 합니다.

피드백 기능을 운영에 배포하기 전에 운영 DB에서
`db/migrations/2026-09-26-feedback.sql`을 실행해야 합니다. 피드백은 가입을 완료한
로그인 회원만 작성할 수 있으며, 이 DDL은 회원 ID가 필수인 `feedback` 테이블을 생성합니다.
작성 내용과 인증 회원 ID가 함께 저장됩니다. 운영 프로필은
`ddl-auto: validate`이므로 이 DDL을 적용하지 않으면 애플리케이션이 기동하지 않습니다.

웹푸시·알림함 데이터 모델을 공유 개발·운영에 배포하기 전에는
`db/migrations/2026-10-03-notification.sql`을 먼저 적용해야 합니다.
기존 `member` 테이블을 참조하는 `notifications`, `push_subscriptions`,
`notification_deliveries`와 조회 인덱스·DB 제약을 추가합니다.
기존 데이터는 수정하지 않으며 알림 테이블과 인덱스를 추가합니다. 이미 적용한 환경에서도
갱신된 SQL을 다시 적용해 구독 목록·구독별 미완료 작업 취소 인덱스를 추가할 수 있습니다.
스키마 적용 후 백엔드를 배포합니다. 알림함·구독·푸시 내용 API, 현재 브라우저 로그아웃 연결 해제,
외부 웹푸시 전송 워커를 구현했습니다. 알림함 화면·Service Worker와 실기기 연결은 후속 범위입니다.
전송 대기의 유효기간은 `jarihana.notification.delivery-ttl`로 설정하며 기본값은 24시간입니다.

### 웹푸시 설정과 운영 확인

기본값은 `PUSH_ENABLED=false`입니다. 활성화하려면 동일한 VAPID 키 쌍과 연락처를 환경 변수로 전달합니다.
공개키는 브라우저 구독에 사용하는 P-256 비압축 공개키 65바이트의 Base64URL 문자열이고,
비밀키는 P-256 개인 스칼라 32바이트의 Base64URL 문자열입니다. 패딩 없는 문자열을 권장합니다.
키 쌍이 일치하지 않거나 연락처가 잘못되면 기동을 거절합니다.

| 환경 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `PUSH_ENABLED` | `false` | 공개 설정·새 구독 등록·전송 활성화 |
| `PUSH_WORKER_ENABLED` | `true` | 활성화된 환경에서 자동 워커 실행 여부 |
| `PUSH_VAPID_PUBLIC_KEY` | 빈 값 | 브라우저에 제공할 공개키 |
| `PUSH_VAPID_PRIVATE_KEY` | 빈 값 | 서버 서명용 비밀키. 저장소·로그에 남기지 않음 |
| `PUSH_VAPID_SUBJECT` | 빈 값 | `mailto:담당자주소` 또는 HTTPS 연락처 |
| `PUSH_ALLOWED_HOSTS` | `fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com` | 정확한 제공자 호스트 목록 |
| `PUSH_BATCH_SIZE` | `50` | 한 실행에서 처리할 최대 작업 수, 1~100 |
| `PUSH_POLL_DELAY` | `1000` | 실행이 끝난 뒤 다음 실행까지 기다리는 밀리초 |
| `PUSH_LEASE_DURATION` | `PT1M` | 워커 선점 유효기간 |
| `PUSH_REQUEST_TIMEOUT` | `PT10S` | 외부 HTTP 요청의 전체 제한시간 |
| `PUSH_CONNECT_TIMEOUT` | `PT5S` | DNS·TCP·TLS 연결 제한시간 |
| `PUSH_RETRY_DELAY` | `PT5S` | 재시도 간격의 시작값 |

DNS는 최대 두 건만 동시에 조회하고 기다리는 요청을 쌓지 않습니다. 공개 주소를 검사한 뒤 해당 주소에
연결하며, 원래 호스트의 TLS 인증서 검증을 유지합니다. redirect와 HTTP 클라이언트 자체 재시도는 끕니다.
선점 시간은 HTTP 제한시간과 연결 제한시간 두 번의 합보다 커야 하며, 네트워크 제한시간은 최소 1ms입니다.
비밀키·구독 endpoint·암호화 키·원격 응답 본문은 운영 로그에 남기지 않습니다.

`jarihana.push.requests` 카운터는 외부 요청 결과를 `ACCEPTED`, `RETRY`, `GONE`, `FAILED`로 구분합니다.
외부 수락은 실제 기기 표시·사용자 읽음과 다릅니다. `push.request.failed` 로그에는 전송 작업 ID와
제한된 오류 코드만, `push.worker.failed`에는 예외 타입만 남깁니다. 재시도·만료 선점이 쌓이는지는
다음 조회로 확인할 수 있습니다. 개인 수신 주소·키를 조회하는 쿼리는 운영 확인에 필요하지 않습니다.

```sql
SELECT status, count(*) FROM notification_deliveries GROUP BY status;
SELECT count(*) FROM notification_deliveries
WHERE status IN ('PENDING', 'RETRY') AND next_attempt_at <= localtimestamp;
SELECT count(*) FROM notification_deliveries
WHERE status = 'IN_FLIGHT' AND locked_until <= localtimestamp;
```

실제 제공자 인증·브라우저 수신·클릭·운영 배포는 이후 통합 검증에서 확인합니다.

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

### 공유 개발 환경

`develop`의 백엔드 변경은 `backend-dev-deploy.yml`에서 같은 EC2의 개발 전용 Compose로
배포합니다. 개발 DB·인증값·포트는 운영과 분리하고 Spring `dev` 프로필을 사용합니다.
개발 API는 호스트 `80`에서 컨테이너 `8080`으로 전달하고, CloudWatch Agent용 관리 포트는
호스트 `127.0.0.1:81`에서 컨테이너 `8081`로만 전달합니다. `81`은 외부에 공개하지 않습니다.
CloudFront 개발 API Origin도 EC2의 80번 포트를 바라보도록 확인해야 합니다.
`application-dev.yaml`은 `ddl-auto: validate`, `show-sql: false`와 관리용 메트릭을 설정하며,
DB 접속값과 인증·OAuth·S3 설정은 개발 Compose의 환경 변수로 주입합니다.
[개발 Compose](../infra/docker-compose.dev.yml)는 DB 스키마를 자동으로 초기화하지 않습니다.
`ddl-auto: validate`를 사용하므로 Spring Session 테이블을 포함한 개발 DB 스키마를 첫 배포 전에
별도로 준비해야 합니다. 이후 스키마 변경은 `db/migrations/`의 SQL을 검토해 적용합니다.
개발 `IMAGE_S3_KEY_PREFIX`는 `jarihana-dev/images`를 사용합니다.

### 배포 환경 설정

`main` 브랜치에 반영된 커밋에 백엔드·운영 Compose·workflow 변경이 포함되면 `backend-prod-deploy.yml`이
자동으로 실행됩니다. 필요할 때는 GitHub Actions에서 수동으로도 실행할 수 있습니다.

`Settings > Environments`의 `dev`, `prod`에 아래 Secrets와 Variables를 각각 등록합니다.
개발과 운영은 같은 설정 이름을 사용하며, 값은 환경별로 구분합니다. OAuth 설정은
`OAUTH_GITHUB_*` 이름으로 저장한 뒤 배포 워크플로에서 애플리케이션 환경 변수
`GITHUB_OAUTH_*`로 매핑합니다.

| 애플리케이션·Compose 환경 변수 | GitHub 설정 이름 | 저장 위치 |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `POSTGRES_PASSWORD` | Secrets |
| `FRONTEND_ORIGIN` | `FRONTEND_ORIGIN` | Variables |
| `ACCESS_TOKEN_SECRET` | `ACCESS_TOKEN_SECRET` | Secrets |
| `GITHUB_OAUTH_CLIENT_ID` | `OAUTH_GITHUB_CLIENT_ID` | Variables |
| `GITHUB_OAUTH_CLIENT_SECRET` | `OAUTH_GITHUB_CLIENT_SECRET` | Secrets |
| `GITHUB_OAUTH_REDIRECT_URI` | `OAUTH_GITHUB_REDIRECT_URI` | Variables |
| `IMAGE_S3_BUCKET` | `IMAGE_S3_BUCKET` | Variables |
| `IMAGE_S3_REGION` | `IMAGE_S3_REGION` | Variables |
| `IMAGE_S3_KEY_PREFIX` | `IMAGE_S3_KEY_PREFIX` | Variables |
| `IMAGE_S3_PUBLIC_BASE_URL` | `IMAGE_S3_PUBLIC_BASE_URL` | Variables |

실제 값은 저장소에 커밋하지 않습니다. `backend/.env.example`은 로컬 실행용 키 목록과
예시만 제공하며 운영값의 저장소가 아닙니다. S3 자격 증명은 애플리케이션에서 별도로
주입하지 않고 AWS SDK 기본 자격 증명 체인을 사용하므로, 운영 EC2에서는 연결된 IAM Role이
필요합니다.
