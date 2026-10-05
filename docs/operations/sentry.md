# Sentry 운영 설정

Sentry는 프런트엔드에서 처리되지 않은 예외와 React 렌더링 오류, 백엔드에서 예상하지 못한
`INTERNAL_ERROR` 예외와 스택 트레이스를 모아 장애 원인을 찾는 데 사용한다.
기존 애플리케이션 로그와 메트릭은 계속 CloudWatch와 Prometheus로 관리한다. 이 설정은
Sentry의 Error Monitoring만 사용하며 Logging, Tracing, Session Replay, Profiling은 켜지 않는다.

## Sentry 프로젝트

애플리케이션 부분별로 Sentry 프로젝트를 하나씩 둔다.

| 앱 | Sentry 플랫폼 | 프로젝트 slug | 배포 환경 이름 |
| --- | --- | --- | --- |
| React 프런트엔드 | React | `jarihana-frontend` | `development`, `production` |
| Spring Boot 백엔드 | Spring Boot | `jarihana-backend` | `development`, `production` |

각 프로젝트의 DSN은 Sentry의 프로젝트 설정에서 확인한다. 프런트엔드 DSN은 브라우저에
포함되는 공개 수집 주소이며 인증 토큰이 아니다. 소스맵 업로드용 `SENTRY_AUTH_TOKEN`은
브라우저 번들에 넣지 않는다.

## GitHub Actions 변수와 비밀

개발과 운영 배포 작업은 각각 GitHub Environment `dev`, `prod`를 사용한다. 프런트엔드와
백엔드는 환경별로 별도 Sentry 프로젝트를 만들지 않고 각각 하나의 프로젝트를 공유하므로,
같은 DSN을 Repository variables에 한 번 등록하면 두 배포 작업에서 모두 사용할 수 있다.
워크플로는 `${{ vars.SENTRY_FRONTEND_DSN }}`과 `${{ vars.SENTRY_BACKEND_DSN }}`을 참조한다.
DSN은 브라우저에 포함되는 공개 수집 주소라 Variable로 저장한다.

| 이름 | 위치 | 값 |
| --- | --- | --- |
| `SENTRY_FRONTEND_DSN` | Repository variable | `jarihana-frontend` 프로젝트 DSN |
| `SENTRY_BACKEND_DSN` | Repository variable | `jarihana-backend` 프로젝트 DSN |
| `SENTRY_AUTH_TOKEN` | `dev`, `prod` Environment secret | 소스맵 업로드 권한이 있는 Sentry 인증 토큰 |

`SENTRY_AUTH_TOKEN`에는 `project:releases`와 `org:read` 범위를 부여한다. 릴리스 파일 업로드에는
`project:releases`가 필요하고, Sentry CLI를 사용하는 릴리스 작업에는 `org:read`도 필요하다.
현재 Webpack 설정은 조직 slug `jarihana`와 프런트엔드 프로젝트 slug `jarihana-frontend`에
소스맵을 올린다.

토큰이 아직 없으면 프런트엔드 빌드는 계속되지만 Sentry에 소스맵을 올리지 않는다. 배포 전
`clean:sourcemaps`가 생성된 `.map` 파일을 `dist`에서 제거하므로 이 경우 이벤트는 기록되어도
압축된 스택 프레임이 원본 코드 위치로 풀리지 않는다. 인증 토큰을 설정하면 다음 프런트엔드
배포부터 소스맵을 Sentry에 올리고 공개 배포물에서는 제거한다.

## 이벤트에서 제외하는 정보

프런트엔드와 백엔드 SDK 모두 기본 개인 정보 수집을 끈다. Sentry 이벤트에서 요청 본문,
쿠키, 헤더, 쿼리 문자열, 사용자 정보를 지운다. 알려진 API 경로는 남기되 경로 ID를 가리고,
알 수 없는 경로는 `/api/:redacted`로 축약한다. 프런트엔드에서는 DOM과 콘솔 breadcrumb를
버리고 정제한 네트워크·페이지 이동 breadcrumb만 남긴다.

예외 타입, 메시지와 스택 트레이스는 디버깅을 위해 수집한다. 백엔드는 사용자에게서 기대되는
업무·검증 오류는 보내지 않고, 예상하지 못한 서버 오류만 보낸다. 예외 메시지에 사용자 입력,
인증 정보 또는 개인정보를 넣지 않는다. Sentry SDK 설정만으로 애플리케이션이 직접 만든
예외 메시지의 내용을 판별해 제거할 수는 없다.

로컬 백엔드 실행에서 이벤트도 받고 싶으면 `backend/.env`에 `SENTRY_BACKEND_DSN`을 설정한다.
비워 두면 Sentry 전송은 꺼진다.

## 소스맵과 저장소 연동

프런트엔드의 production 빌드는 `hidden-source-map`을 생성한다. 인증 토큰이 있을 때
Webpack 플러그인이 현재 배포 SHA와 환경 이름으로 Sentry에 소스맵을 올린다. 그 뒤 정리
스크립트가 남은 맵 파일을 지우고 S3에 공개하는 파일 목록에는 포함하지 않는다.

GitHub 저장소 연동은 Sentry 화면에서 별도로 설정한다. 연동하면 커밋 attribution과 코드
문맥을 더할 수 있지만, 런타임 오류 전송과 소스맵 기반 스택 복원에는 DSN과 소스맵 업로드
토큰이 필요하다.
