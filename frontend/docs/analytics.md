# PostHog 행동 분석

자리하나 프론트엔드에서 방문·클릭·요청·처리 결과를 PostHog로 전송한다.
분석과 녹화 조회는 PostHog 관리자 화면에서 수행한다. 자리하나의 서비스 화면이나
DB 테이블·스키마는 추가하지 않는다.

## 활성화 설정

Webpack 빌드 시 아래 환경변수를 주입한다. 값이 번들에 반영되므로 변경 후 다시 빌드해야 한다.

| 환경변수                    | 값                                     | 의미                                 |
| --------------------------- | -------------------------------------- | ------------------------------------ |
| `APP_ANALYTICS_ENABLED`     | 문자열 `true`                          | 수집 활성화                          |
| `APP_POSTHOG_PROJECT_TOKEN` | 해당 프로젝트의 `phc_`로 시작하는 토큰 | 이벤트 수집용 공개 프로젝트 토큰     |
| `APP_POSTHOG_HOST`          | 프로젝트 지역에 맞는 HTTPS 수집 주소   | PostHog 관리자 화면 주소와 구분      |
| `APP_DEPLOY_ENV`            | `production` 또는 `staging`            | 이벤트의 `environment`와 활성화 조건 |

설정이 없거나 유효하지 않으면 수집하지 않는다. `APP_DEPLOY_ENV`의 기본값은
`development`이며 일반 로컬 실행과 `NODE_ENV=test`에서는 비활성화한다.
로컬 주소 자체를 차단하는 설정은 아니므로 로컬 개발 환경에 운영용 변수 세트를 넣지 않는다.

운영·검증은 별도 PostHog 프로젝트 토큰을 사용한다. 수집용 프로젝트 토큰은 브라우저에
노출되는 값이다. 개인 API 키나 관리자 권한 키를 이 환경변수에 넣지 않는다.

현재 GitHub Actions 배포는 저장소 Variables의 `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`,
`ANALYTICS_ENABLED`를 위 빌드 변수에 매핑한다. `APP_DEPLOY_ENV`는 `production`이다.
`ANALYTICS_ENABLED`가 없으면 `false`로 빌드한다.

## 코드 연결

- `src/shared/analytics/index.js`: 하나의 분석 클라이언트를 공유하고, 활성화 시
  `posthog-js`를 동적으로 불러온다. `@posthog/react` Provider는 사용하지 않는다.
- `src/app/AnalyticsBridge.jsx`: 라우트·인증 상태를 분석 클라이언트에 연결한다.
- `src/shared/analytics/config.js`, `privacy.js`: 수집 설정과 전송 속성 정제를 담당한다.
- `src/shared/api/client.js`: 공통 API 요청의 각 시도와 결과를 기록한다.
- `src/features/image-upload/api.js`: 스토리지 직접 업로드 결과를 따로 기록한다.
- 각 도메인의 mutation hook: API 성공 후 query invalidation 전에 성공 이벤트를 기록한다.

SDK 로딩·전송 실패가 로그인·신청 등 서비스 작업을 실패시키지 않도록 수집 함수를 격리한다.
인증 상태를 확인하는 동안과 OAuth 경로에서는 자동 수집·녹화를 멈춘다.

## 수집 내용

| 대상      | 기록                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| 방문      | 라우트별 페이지뷰와 페이지 이탈                                              |
| 상호작용  | Autocapture의 클릭·변경·제출, 클릭 위치 등 히트맵 정보                       |
| 세션 녹화 | 마스킹된 화면 변화·스크롤·클릭 흐름                                          |
| 오류·성능 | 처리되지 않은 오류·Promise 거부, Web Vitals                                  |
| API       | `api_request_completed`: 경로, 메서드, 상태 코드, 소요 시간, 결과, 시도 번호 |
| 업로드    | 실제 서명 URL 대신 `storage_upload`라는 고정 대상의 결과                     |

API 경로는 `/api/groups/:id`처럼 정규화하고 query·fragment를 제외한다.
`logical_request_id`는 원래 요청과 재시도의 연결에, `request_id`는 개별 시도 구분에 쓴다.
인증 갱신 요청은 `is_auth_refresh`로 구분한다. 주기적 조회도 API 요청에 포함되므로
API 횟수를 사용자의 클릭 횟수로 해석하지 않는다.

이벤트에는 라우트 레지스트리의 `route_name`과 해당 화면의 `group_id`, `recruitment_id`를
붙인다. 화면이 바뀌면 이전 ID는 제거한다. 주요 CTA는
`data-ph-capture-attribute-action`으로 동작 이름을 남기고, 일반 클릭은 텍스트 없이
DOM 태그와 요소 순서로 구분한다.

### 처리 성공 이벤트

| 이벤트                   | 허용하는 도메인 속성                          |
| ------------------------ | --------------------------------------------- |
| `signup_completed`       | `member_id`                                   |
| `group_created`          | `group_id`, `status`                          |
| `recruitment_created`    | `group_id`, `recruitment_id`, `status`        |
| `recruitment_closed`     | `group_id`, `recruitment_id`, `status`        |
| `registration_submitted` | `recruitment_id`, `registration_id`, `status` |
| `registration_withdrawn` | `recruitment_id`, `registration_id`           |
| `registration_decided`   | `recruitment_id`, `registration_id`, `status` |

버튼 클릭이나 캐시 갱신 성공이 아닌 도메인 API 성공을 기준으로 기록한다.
신청 철회는 응답 본문이 없는 `204`이므로 요청에 사용한 신청 ID를 기록한다.
가입 완료는 회원 생성 응답의 ID로 먼저 사용자를 식별한 뒤 전송한다.

## 사용자와 재방문

익명 방문은 PostHog의 분석용 식별자를 사용한다. 로그인한 회원은 내부 `member.id`로
연결하며, 로그인 상태로 재방문하거나 다른 기기에서 로그인하면 같은 회원으로 식별한다.
로그아웃·계정 변경 시 식별자를 초기화해 이전 회원의 행동과 섞이지 않게 한다.
분석용 쿠키와 localStorage는 로그인 인증 쿠키·토큰과 별개다.

쿠키·저장소 삭제, 분석 차단, 로그아웃 후 익명 방문은 기존 회원과의 연결에 제한이 있다.
이미 PostHog 수집을 거부한 브라우저의 opt-out 상태는 유지한다.

## 전송 제한과 마스킹

- 자동 이벤트와 녹화의 텍스트·입력값·요소 속성을 마스킹한다.
- 녹화에서 이미지·picture·영상·canvas·iframe·숨김/파일 입력과
  `[data-ph-private]` 요소를 차단한다. 원래 화면의 글이나 이미지를 그대로 읽는 녹화가 아니다.
  class·style 속성도 마스킹하므로 원본 화면의 스타일 재현에는 제한이 있다.
- 인증 쿠키·토큰·OAuth 코드·이름·이메일·신청 메시지·거절 사유 원문은 전송하지 않는다.
- API 요청/응답 본문과 헤더, 콘솔 로그, 서명된 업로드 URL은 전송하지 않는다.
- OAuth 화면은 수집에서 제외하고 URL query·fragment와 식별 불가능한 경로 부분을 제거한다.
- 예외 메시지는 마스킹하고, 스택의 파일 URL도 정제한다. 서버 내부 처리·DB 변경을
  수집하는 서버 로그 기능은 이 구현에 포함되지 않는다.

## 명시적인 수집 공백

- 최초 인증 상태를 확정하기 위한 bootstrap API 요청은 기록하지 않는다.
  이전 로그인 정보가 남아 있는 브라우저에서 잘못된 회원에게 연결하지 않기 위한 제한이다.
- 요청 진행 중 로그아웃·계정 변경으로 식별자가 달라지면 늦게 도착한 응답 이벤트를 버린다.
- 초기 인증 확인·SDK 준비 전의 클릭과 요청은 소급해 복원하지 않는다.
- 브라우저 차단, 네트워크 실패, 탭 종료 등으로 누락될 수 있다. 모든 사용자의 모든 행동을
  100% 남기는 감사 로그로 사용하지 않는다.

## PostHog 프로젝트 준비

이 절차는 외부 프로젝트 연결 시 수행할 작업이다. 저장소 코드만으로 프로젝트 생성,
녹화 활성화, 실제 수신, 운영 적용까지 완료되지는 않는다.

1. 운영·검증용 PostHog 프로젝트를 준비하고 저장 지역을 선택한다.
2. 프로젝트 설정에서 수집용 토큰과 host를 확인해 빌드 환경에 넣는다.
   Cloud 수집 주소는 US의 `https://us.i.posthog.com`, EU의
   `https://eu.i.posthog.com`을 사용하되 해당 프로젝트가 안내하는 값을 따른다.
   [JavaScript SDK 설치 문서](https://posthog.com/docs/libraries/js)
3. 프로젝트의 Session Replay 설정에서 녹화를 활성화하고 대상 도메인·녹화 조건을 확인한다.
   클라이언트는 `sampleRate: 1`로 설정하지만 프로젝트의 녹화 조건과 수집 제한도 적용되므로
   실제 녹화가 들어오는지 확인한다.
   [녹화 조건 문서](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record)
4. 비용 한도·사용량 알림·데이터 보존 기간은 운영 팀이 필요에 맞게 정한다.
   고정된 무료 한도나 보존 기간을 이 문서에서 가정하지 않는다.
5. 운영 응답의 CSP를 확인한다. SDK를 npm으로 설치해도 녹화 모듈을 추가로 불러오므로
   `script-src`, 수집 요청의 `connect-src`, 녹화 worker의 `worker-src`를 점검한다.
   기존 정책에 필요한 허용 항목을 반영하고 실제 차단 여부를 확인한다.
   [PostHog CSP 문서](https://posthog.com/docs/advanced/content-security-policy)

## 수신 확인과 이후 분석

검증 프로젝트에서 다음 시나리오를 수행한 뒤 PostHog Live events와 Session Replay에서
확인한다. 이는 운영 연결 확인 절차이며, 이 문서 자체가 수행 증거는 아니다.

1. 익명으로 탐색한 뒤 로그인하고 새로고침하여 이벤트의 회원 식별자가 이어지는지 확인한다.
2. 모임 생성·모집 생성·신청·승인/거절·철회를 실행하고 성공 이벤트가 한 번씩 들어오는지 확인한다.
3. 실패 요청에는 API 실패 이벤트만 있고 성공 이벤트는 없는지 확인한다.
4. 이벤트 속성과 녹화를 열어 입력 원문·개인정보·인증 정보·서명 URL이 없는지 확인한다.
5. 로그아웃 후 다른 계정으로 로그인하여 사용자 식별과 녹화가 분리되는지 확인한다.
6. PostHog 수집 요청이 차단된 상태에서도 서비스의 핵심 작업이 정상인지 확인한다.

저장소 검증은 관련 Jest 테스트, lint, production build로 수행한다.
에이전트 기반 브라우저 QA나 실제 PostHog 계정 확인을 수행했다고 간주하지 않는다.

도입 시 Node 24 production build를 기준 `ae8d2da`와 비교한 결과:

| 파일                 |       도입 전 |       도입 후 |
| -------------------- | ------------: | ------------: |
| 초기 main JS         | 896,061 bytes | 906,140 bytes |
| 초기 main JS gzip    | 251,508 bytes | 255,579 bytes |
| 별도 PostHog JS gzip |          없음 |  97,516 bytes |

PostHog 청크는 수집이 활성화되고 인증 확인이 끝난 후 동적으로 로드된다.
녹화 모듈의 추가 다운로드·실제 전송량·브라우저 상호작용 비용은 이 정적 빌드 비교에
포함되지 않는다. 기존 이미지/초기 번들과 추가 SDK 청크에는 Webpack 크기 경고가 남아 있다.

데이터가 쌓인 뒤 PostHog에서 방문·재방문, 탐색→신청 전환, API 실패율 등의
Insight와 Dashboard를 구성한다. 이 대시보드는 자리하나의 새 서비스 페이지가 아니다.
나중에 정의한 분석은 당시 수집한 필드에 한해서만 과거 데이터에 적용할 수 있다.
