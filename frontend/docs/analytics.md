# PostHog 행동 분석

## 헤더 자리 메뉴

상위 `자리` disclosure 버튼은 `group_navigation_toggle`을 사용한다. 하위 `뭐있나?`, `뭐했나?`,
`뭐할래?` 링크는 각각 기존 `group_browse`, `browse_activity_posts`, `browse_proposals`를 유지한다.
데스크톱과 모바일은 같은 식별자를 공유한다. 로고의 홈 이동은 `group_home`, 자리 만들기는 `group_create`다.
hover 개폐는 별도 성공 이벤트로 수집하지 않는다.

## 채팅 동작

채팅 영역 전체를 `data-ph-private`로 마스킹한다. 메시지 본문·작성자 이름·인증 쿠키·헤더는 분석에 보내지 않는다.
고정 action은 `chat_inbox_open`, `group_chat_open`, `chat_room_open`, `chat_room_search`,
`chat_list_back`, `chat_sidebar_resize`, `chat_history_load`, `chat_scroll_latest`, `chat_message_input`,
`chat_message_submit`, `chat_message_send`, `chat_message_retry`,
`chat_group_open`, `chat_refresh`, `chat_list_retry`, `chat_dismiss`다. 클릭과 전송 완료를 혼동하지 않으며 별도 전송 성공 이벤트는 추가하지 않는다.

자리하나 프론트엔드에서 방문·클릭·요청·처리 결과를 PostHog로 전송한다.
분석과 녹화 조회는 PostHog 관리자 화면에서 수행한다. 자리하나의 서비스 화면이나
DB 테이블·스키마는 추가하지 않는다.

## 모임 공지 UI의 고정 식별자

| 동작 | action |
| --- | --- |
| 공지 탭 열기·목록에서 공지 열기·상세에서 모임 열기 | `group_announcement_tab_open`, `group_announcement_open`, `group_announcement_group_open` |
| 공지 작성 모달 열기·닫기·취소 | `group_announcement_create_open`, `group_announcement_create_dismiss`, `group_announcement_create_cancel` |
| 공지 수정 모달 열기·닫기·취소·저장 | `group_announcement_edit_open`, `group_announcement_edit_dismiss`, `group_announcement_edit_cancel`, `group_announcement_edit_submit` |
| 공지 숨김 확인 열기·닫기·취소·확정 | `group_announcement_delete_open`, `group_announcement_delete_dismiss`, `group_announcement_delete_cancel`, `group_announcement_delete_confirm` |
| 제목·본문 입력과 공개 범위 변경 | `group_announcement_title_change`, `group_announcement_content_change`, `group_announcement_scope_change` |
| 수정 중 제목·본문 입력과 공개 범위 변경 | `group_announcement_edit_title_change`, `group_announcement_edit_content_change`, `group_announcement_edit_scope_change` |
| 공지 등록·목록 다시 시도·더 보기·상세 다시 시도·목록 복귀 | `group_announcement_create_submit`, `group_announcement_list_retry`, `group_announcement_load_more`, `group_announcement_detail_retry`, `group_announcement_list_return` |

입력 폼과 공지 본문은 `data-ph-private`로 가리고, action 식별자에는 제목·본문·모임원 이름·공지 ID를 넣지 않는다. 공지 작성 성공 전용 PostHog 이벤트는 정의하지 않았으며, 자동 수집으로 API 성공을 추정하지 않는다.

## 초대 UI의 고정 식별자

모임 상세의 초대 흐름은 다음 action으로 구분한다. 회원 이름·검색어·선택 대상 ID·초대 토큰·공유 주소를 action에 포함하지 않는다.

| 동작 | action |
| --- | --- |
| 참여자 영역에서 초대 모달 열기 | `invitation_create` |
| 공유 링크 복사·직접 주소 선택 | `invitation_link_copy`, `invitation_link_copy_select` |
| 회원 검색·Enter 검색 제출·선택·선택 제거 | `invitation_search`, `invitation_search_submit`, `invitation_member_select`, `invitation_chip_remove` |
| 선택 회원에게 발급 요청 | `invitation_send` |
| 보낸 초대 관리·조회 범위 변경 | `invitation_management_open`, `invitation_management_scope_change` |
| 취소 확인 창 열기·취소 실행 | `invitation_revoke_open`, `invitation_revoke` |

검색·선택 회원·보낸 초대·공유 주소가 표시되는 모달 내용은 `data-ph-private`로 마스킹한다.
회원 검색 버튼은 제거하고, `invitation_search_submit`은 검색 폼의 Enter 제출에 유지한다.
위 action은 사용자 조작 식별자이며 발급 성공·복사 성공을 보장하는 이벤트는 아니다.
초대 전용 성공 이벤트와 전환 연결은 아래 계약을 따른다. 공유 초대 페이지에서도 명시적 초대 이벤트만 수집한다. 실제 PostHog 수신은 별도 검증이 필요하다.

## 회원가입 UI의 고정 식별자

가입 화면은 닉네임 한 단계만 묻는다. 우아한테크코스 크루 여부와 기수, 과정은 서버가 GitHub 계정을 크루 명단과 대조해 정하므로 화면에서 고르는 동작이 없다. 닉네임 같은 입력값은 action에 넣지 않는다.

| 동작 | action |
| --- | --- |
| 닉네임 입력 | `signup_name_input` |
| 가입 완료하기, 확인, 확인 창 닫기와 취소 | `signup_submit`, `signup_confirm`, `signup_confirmation_dismiss` |

가입 성공은 기존처럼 회원 생성 응답 뒤 `signup_completed`로 따로 기록한다. 이전 단계형 가입 화면의 `signup_member_type_select`, `signup_step_back`, `signup_step_next`, `signup_bootcamp_*`, `signup_crew_verification_start`, `signup_field_select`, `signup_job_select`, `signup_career_select`, `signup_course_select`, `signup_generation_select`, `signup_company_*`는 더 이상 수집되지 않는다. 이전 기간 데이터를 볼 때만 쓴다.

## 자유게시판 모임 제안

자유게시판의 조작은 다음 action으로 구분한다. 제안 제목, 내용, 코멘트, 분위기 선택지 문구를 action에 넣지 않는다.
제안, 응답, 코멘트 처리 성공 이벤트는 아직 보내지 않으며, 성공 여부는 `api_request_completed`로만 확인한다.

| 동작 | action |
| --- | --- |
| 헤더 게시판 메뉴, 분야 필터, 제안 열기, 더 보기, 다시 불러오기 | `browse_proposals`, `proposal_category_filter`, `proposal_open`, `proposal_list_load_more`, `proposal_list_retry` |
| 목록의 함께하고 싶어요 켜고 끄기 | `proposal_interest_toggle` |
| 상세의 조건 칩, 모인 조건 요약 칩 열기, 응답 보내기, 고치기, 고치기 취소, 응답 취소 | `proposal_condition_select`, `proposal_condition_summary_open`, `proposal_interest_submit`, `proposal_interest_edit`, `proposal_interest_edit_cancel`, `proposal_interest_cancel` |
| 비로그인 로그인 안내 | `proposal_login_to_interest`, `proposal_login_to_comment` |
| 코멘트 입력, 남기기, 지우기, 더 보기, 다시 불러오기 | `proposal_comment_form`, `proposal_comment_input`, `proposal_comment_submit`, `proposal_comment_delete`, `proposal_comment_load_more`, `proposal_comment_retry` |
| 상세의 목록으로, 다시 불러오기, 제안 지우기와 확인 창 | `proposal_back_to_board`, `proposal_detail_retry`, `proposal_delete`, `proposal_delete_confirm`, `proposal_delete_cancel`, `proposal_delete_close` |
| 제안 작성 시작, 분야, 제목, 내용, 분위기 선택지 입력, 더하기, 지우기, 올리기, 취소 | `proposal_create_start`, `proposal_create_form`, `proposal_create_category`, `proposal_create_title`, `proposal_create_content`, `proposal_create_mood_option`, `proposal_create_mood_add`, `proposal_create_mood_remove`, `proposal_create_submit`, `proposal_create_cancel` |

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
- `src/shared/analytics/config.js`, `privacy.js`, `promotion.js`: 수집 설정, 전송 속성 정제,
  홍보 링크 유입과 같은 세션의 전환 귀속을 분리해 관리한다.
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

`/`는 인증 상태에 따른 이동 전용 경로이므로 페이지뷰를 기록하지 않는다. 실제 도착한 `/land` 또는 `/home`에서 한 번 기록한다.

일반 화면의 이벤트에는 라우트 레지스트리의 `route_name`과 해당 화면의 `group_id`, `recruitment_id`를
붙인다. 그룹 상세·모집 상세의 `$pageview`에는 현재 URL에 유효한 `promotion_id`가 있을 때만
이를 붙인다. 신청 이벤트에는 같은 PostHog 세션에서 처음 확인한 홍보 식별자를
`attribution_promotion_id`로 따로 붙인다. 따라서 일반 상세 방문을 홍보 링크 유입으로
오인하지 않으면서 로그인·회원가입 경유 신청은 연결할 수 있다. 주요 CTA는
`data-ph-capture-attribute-action`으로 동작 이름을 남기고, 일반 클릭은 텍스트 없이
DOM 태그와 요소 순서로 구분한다.

모달과 드로어의 닫기 버튼에도 화면 목적을 구분하는 고정 `*_dismiss` action을 지정한다.
공통 `dialog_close` 하나로 합치지 않아 어떤 모달이나 드로어가 닫혔는지 구분할 수 있게 한다.

### 처리 성공 이벤트

| 이벤트                   | 허용하는 도메인 속성                          |
| ------------------------ | --------------------------------------------- |
| `login_completed`        | `provider` (`github`)                          |
| `signup_completed`       | `member_id`                                   |
| `group_created`          | `group_id`, `group_type`, `status`            |
| `recruitment_created`    | `group_id`, `recruitment_id`, `status`        |
| `recruitment_updated`    | `group_id`, `recruitment_id`, `status`        |
| `recruitment_closed`     | `group_id`, `recruitment_id`, `status`        |
| `registration_started`   | `group_id`, `recruitment_id`, `attribution_promotion_id` |
| `registration_submitted` | `group_id`, `recruitment_id`, `registration_id`, `status`, `attribution_promotion_id` |
| `registration_withdrawn` | `recruitment_id`, `registration_id`           |
| `registration_decided`   | `recruitment_id`, `registration_id`, `status` |
| `feedback_submitted`    | 없음 |
| `activity_comment_created` | `group_id`, `activity_post_id`, `viewer_relation` |
| `activity_comment_deleted` | `group_id`, `activity_post_id`, `viewer_relation` |
| `activity_reaction_added` | `group_id`, `activity_post_id`, `viewer_relation`, `target_type`, `emoji` |
| `activity_reaction_removed` | `group_id`, `activity_post_id`, `viewer_relation`, `target_type`, `emoji` |
| `invitation_viewed` | `group_id`, `invitation_id`, `invitation_type`, `status` |
| `invitation_issue_attempted` | `group_id`, `invitation_type` |
| `invitation_created` | `group_id`, `invitation_id`, `invitation_type` |
| `invitation_link_reused` | `group_id`, `invitation_id`, `invitation_type` |
| `invitation_copy_attempted` | `group_id`, `invitation_id`(기존 링크 조회 시), `invitation_type` |
| `invitation_link_copied` | `group_id`, `invitation_id`, `invitation_type` |
| `invitation_accept_attempted` | `invitation_id`, `invitation_type` |
| `invitation_joined` | `group_id`, `invitation_id`, `invitation_type` |
| `invitation_already_joined` | `group_id`, `invitation_id`, `invitation_type` |
| `invitation_revoked` | `group_id`, `invitation_id`, `invitation_type` |

초대 ID는 토큰과 별개인 양의 정수이며 초대 유형은 DIRECT·LINK만 허용한다.
대상 회원 ID·이름·검색어·발급 requestId·공유 주소·원본 토큰을 초대 이벤트에 넣지 않는다.
초대 조회는 같은 화면·계정·초대의 재조회에서 중복 기록하지 않는다. 실제 발급 응답의
`reused=false`만 `invitation_created`로 기록하고 LINK 재사용은 별도 이벤트로 구분한다.
클립보드 쓰기가 완료된 경우만 `invitation_link_copied`다. 직접 주소 선택이나 복사 버튼 클릭은
복사 성공·상대에게 전달 완료를 뜻하지 않는다. 수락 응답의 `JOINED`만 합류 전환이며,
`ALREADY_JOINED`는 별도 결과다. 거절·취소·만료 페이지 조회도 합류 성공으로 집계하지 않는다.

초대의 비동기 처리 이벤트는 요청 시작 시 분석 사용자를 묶어 두고 계정이 바뀐 뒤의
결과를 버린다. SDK 비활성화·수집 차단·전송 오류가 발급·복사·수락·취소 결과를 바꾸지 않는다.
공유 초대 페이지에서는 `invitation_viewed`, `invitation_accept_attempted`, `invitation_joined`,
`invitation_already_joined`만 허용한다. 자동 클릭·페이지뷰·녹화·히트맵·API 요청·오류·
`$identify` 이벤트는 차단한다. 전송 payload를 다시 구성해 양의 정수인 초대/모임 ID·LINK 유형·
초대 상태와 `distinct_id`, `$is_identified`, `$process_person_profile`만 남긴다.
SDK의 공개 프로젝트 수집용 `token`과 재전송 중복 제거용 이벤트 UUID·시각은 유지한다.
여기서 SDK `token`은 `phc_` 프로젝트 키이며 원본 초대 토큰이 아니다. 원본 URL·프로필 속성·
기기/세션 정보·다른 화면의 등록 속성은 공유 페이지 payload에 포함하지 않는다.

로그인한 회원은 DB 사용자 ID를 `distinct_id`로 사용한다. 비회원은 기존 SDK 익명 식별자를 사용하며,
공유 페이지에서는 `$identify`를 보내지 않으므로 로그인 전후를 같은 사람으로 자동 병합하지 않는다.
초대 조회는 인증·SDK 준비를 기다린 뒤 기록하고 그 사이 계정·경로가 바뀌면 버린다.
수집 방식의 대안과 채택 이유는 [프론트엔드 ADR 0003](adr/0003-invitation-events-and-user-identity.md)에 기록했다.
개인정보 처리방침·위탁·국외 이전·보유/삭제 기준은 [후속 이슈 #384](https://github.com/woowacourse-teams/2026-jarihana/issues/384)에서 정비한다.
이 구현 자체를 개인정보 처리 근거 검토 완료로 보지 않는다.

PostHog에서는 생성 성공(`invitation_created`)과 수락 시도→합류(`invitation_joined`)를 분리해
분석한다. 새 발급·새 합류는 서버 감사 로그가 아닌 브라우저 수신 성공 기준이다. 서버에서
발급한 뒤 응답이 유실되고 재시도에서 reused=true를 받으면 새 발급 이벤트는 누락될 수 있다.
합류 응답이 유실되고 재수락에서 ALREADY_JOINED를 받으면 합류 전환도 누락될 수 있다.
브라우저/SDK 차단·준비 전 요청·탭 종료도 수집 공백이다. 기존 모임원의
서비스 도입 여부는 계정 존재 여부로 추정하지 않는다. 구현맵의 20%/30%는 검증 전 가설이다.

버튼 클릭이나 캐시 갱신 성공이 아닌 도메인 API 성공을 기준으로 기록한다.
`registration_started`는 모임 상세의 신청 패널을 실제로 열거나 모집 상세에서 신청 확인
흐름을 연 시점에 한 번 기록하며, 자동 클릭 수집만으로 대신하지 않는다. `registration_submitted`는
신청 API가 성공한 뒤에만 기록한다.
모임 생성의 `group_type`은 성공한 생성 요청의 `type`에서 가져오며,
`CLUB`(동아리), `STUDY`(스터디), `SESSION`(같이해요)을 구분한다.
요청의 이름·소개·설명 원문은 이벤트에 포함하지 않는다.
신청 철회는 응답 본문이 없는 `204`이므로 요청에 사용한 신청 ID를 기록한다.
가입 완료는 회원 생성 응답의 ID로 먼저 사용자를 식별한 뒤 전송한다.
피드백 제출 이벤트에는 입력 내용이나 작성자 ID를 포함하지 않는다.
활동 기록 댓글과 반응 이벤트의 `viewer_relation`은 기록 그룹 기준 `member`, `non_member`, `anonymous`이고,
`target_type`은 `post`(기록) 또는 `comment`(댓글), `emoji`는 소문자 이모지 코드이며 지금은 `heart`뿐이다.
댓글 원문은 보내지 않는다. 반응 이벤트는 반응 API가 성공한 뒤에 기록하며, 화면의 낙관적 갱신만으로 기록하지 않는다.
활동 기록 카드 클릭은 상세를 여는 `activity_post_detail_open`, 상세의 그룹 줄은
`activity_post_detail_group_open`, 사진 크게 보기는 `activity_post_photo_zoom` 식별자로 수집한다.
좋아요한 사람 목록을 여는 하트 옆 요약은 `activity_reactors_open`이다. 데스크톱 시안 D의 목록 닫기와
모바일 시안 A의 시트 닫기 버튼, 시트 바깥 영역은 기존 `activity_reactors_close`를 함께 사용한다.
모바일의 댓글과 좋아요 탭은 제거하여 `activity_post_comments_tab_open`과 `activity_post_likes_tab_open`은 더 이상 발생하지 않는다.

## 사용자와 재방문

로그인 시작 시 같은 탭의 sessionStorage에 10분 유효한 분석용 시도 표시를 남긴다.
OAuth 콜백에서 회원 인증을 재확인한 경우에만 완료 표시를 남기고, 복귀 화면에서
회원 식별과 분석 초기화가 끝난 뒤 `login_completed`를 한 번 기록한다.
일반 재방문·새로고침·페이지 이동·인증 갱신은 로그인 완료로 세지 않는다.
실패하거나 회원가입이 필요한 콜백은 표시를 지우며, 가입 완료는 기존
`signup_completed`로 별도 집계한다. OAuth code/state·토큰·원본 URL은 저장하거나 전송하지 않는다.

PostHog Funnel에서 첫 단계는 `$autocapture`의 `$event_type = click`과 고정
`action` 값(예: `registration_start`), 마지막 단계는 `login_completed`로 설정하면
해당 행동 이후 로그인한 사용자 수와 전환율을 확인할 수 있다. 페이지 방문은
`$pageview`와 `route_name`으로 첫 단계를 설정한다. 회원가입 전환은 마지막 단계를
`signup_completed`로 설정한다. 전환 시간 범위를 지정하고 사용자 기준으로 집계한다.
이벤트는 배포 후부터 쌓이며, 이 코드 변경 자체가 PostHog 대시보드를 생성하지는 않는다.

익명 방문은 PostHog의 분석용 식별자를 사용한다. 로그인한 회원은 내부 `member.id`로
연결하며, 로그인 상태로 재방문하거나 다른 기기에서 로그인하면 같은 회원으로 식별한다.
로그아웃·계정 변경 시 식별자를 초기화해 이전 회원의 행동과 섞이지 않게 한다.
분석용 쿠키와 localStorage는 로그인 인증 쿠키·토큰과 별개다. 홍보 식별자는 개인정보가
아닌 검증된 값만 `sessionStorage`에 모임 ID와 PostHog 세션 ID와 함께 보관한다. 따라서 같은
세션의 로그인·회원가입 경유 신청에만 연결하고, 다른 모임·계정·PostHog 새 세션에서는 제거한다.

쿠키·저장소 삭제, 분석 차단, 로그아웃 후 익명 방문은 기존 회원과의 연결에 제한이 있다.
이미 PostHog 수집을 거부한 브라우저의 opt-out 상태는 유지한다.

## 전송 제한과 마스킹

- 자동 이벤트와 녹화의 텍스트·입력값·요소 속성을 마스킹한다.
- 녹화에서 이미지·picture·영상·canvas·iframe·숨김/파일 입력과
  `[data-ph-private]` 요소를 차단한다. 원래 화면의 글이나 이미지를 그대로 읽는 녹화가 아니다.
  class·style 속성도 마스킹하므로 원본 화면의 스타일 재현에는 제한이 있다.
- 인증 쿠키·토큰·OAuth 코드·이름·이메일·신청 메시지·미승인 사유 원문은 전송하지 않는다.
- API 요청/응답 본문과 헤더, 콘솔 로그, 서명된 업로드 URL은 전송하지 않는다.
- OAuth 화면은 수집에서 제외하고 URL query·fragment와 식별 불가능한 경로 부분을 제거한다.
- 공유 초대의 `/invitations/link/:token`에서는 자동 수집·녹화를 중단하고 위 명시적 이벤트만 허용한다.
  공유 초대 URL과 `/api/invitations/links/:token`의 토큰 자리는 항상 `:redacted`로 정제한다.
  숫자로만 된 토큰도 분석용 ID로 남기지 않으며 초대 내용은 `data-ph-private`로 가린다.
- 예외 메시지는 마스킹하고, 스택의 파일 URL도 정제한다. 서버 내부 처리·DB 변경을
  수집하는 서버 로그 기능은 이 구현에 포함되지 않는다.

## 명시적인 수집 공백

- 최초 인증 상태를 확정하기 위한 bootstrap API 요청은 기록하지 않는다.
  이전 로그인 정보가 남아 있는 브라우저에서 잘못된 회원에게 연결하지 않기 위한 제한이다.
- 요청 진행 중 로그아웃·계정 변경으로 식별자가 달라지면 늦게 도착한 응답 이벤트를 버린다.
- 초기 인증 확인·SDK 준비 전의 클릭과 요청은 소급해 복원하지 않는다. 초대 조회 이벤트는 현재 인증 동기화 완료를 기다리며 계정·경로가 바뀌면 버린다.
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
2. 모임 생성·모집 생성·신청·승인/미승인·철회를 실행하고 성공 이벤트가 한 번씩 들어오는지 확인한다.
3. 실패 요청에는 API 실패 이벤트만 있고 성공 이벤트는 없는지 확인한다.
4. 이벤트 속성과 녹화를 열어 입력 원문·개인정보·인증 정보·서명 URL이 없는지 확인한다.
5. 로그아웃 후 다른 계정으로 로그인하여 사용자 식별과 녹화가 분리되는지 확인한다.
6. PostHog 수집 요청이 차단된 상태에서도 서비스의 핵심 작업이 정상인지 확인한다.
7. 지정 초대와 공유 초대를 조회·수락하여 회원 DB ID가 `distinct_id`로 연결되는지 확인한다.
   재수락의 `invitation_already_joined`를 신규 합류에 포함하지 않는다. 공유 초대 페이지에는
   위 네 가지 이벤트만 있고 자동 클릭·페이지뷰·녹화·API/오류·원본 URL·초대 토큰은 없는지 확인한다.

저장소 검증은 관련 Jest 테스트, lint, production build로 수행한다.
`npm run test:analytics:e2e`는 별도 production 빌드에서 분석을 켜고 가짜 수집 주소를 브라우저에서
가로채 실제 SDK의 압축/batch payload를 검증한다. 서버 API는 fixture를 사용하며 실제 PostHog
프로젝트에는 테스트 데이터를 보내지 않는다. 회원 ID·최소 필드·JOINED/ALREADY_JOINED 분리·
조회 중복 제외·공유 페이지 자동 이벤트/녹화 차단을 확인한다.
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

## 스파링

토론 생성은 한 화면에서 제출한다. 필수 입력의 `sparring_topic_edit`, 설명의
`sparring_description_edit`, 사진의 `sparring_image_choose/upload/remove/retry`, 마감의
`sparring_deadline_preset/open`, 제출·닫기의 `sparring_create_submit/dismiss`는 유지한다
(슬래시는 각 접미사를 가진 기존 식별자를 묶어 표기한 것이다). 설명·사진 영역을 펼치거나
접는 동작에는 `sparring_create_options_toggle`을 사용한다. 이전/다음 단계가 없어져
`sparring_create_previous/next`는 더 이상 발생하지 않는다. 입력 폼은 `data-ph-private`로
가리고, 선택 항목을 접거나 제출을 클릭한 사실을 생성 성공으로 해석하지 않는다.

마당 설정 톱니바퀴는 기존 `sparring_experiment_menu`를 재사용하고 모달 닫기는 `sparring_settings_dismiss`로 구분한다. 구도·패싸움·받아치기 연출·팀별 인원·말풍선 겹침 변경은 기존 `sparring_view_change`, `sparring_brawl_toggle`, `sparring_clash_camera_toggle`, `sparring_character_limit_change`, `sparring_speech_overlap_toggle`을 유지한다. 별도 아담한 구도 복원 버튼을 없애 `sparring_compact_restore`는 더 이상 발생하지 않는다.

SSE/물리 렌더러는 같은 출처 iframe이므로 내부 고정 action을 부모로 전달한다.
부모는 source/origin/고정 allowlist를 검증한 뒤 `sparring_interaction`에 action만 기록한다.
사용자 글·주제·이름·진영은 전달하지 않는다. 기존 마스킹/개인정보 허용 목록은 유지한다.
`sparring_created`, `sparring_vote_saved`, `sparring_post_saved`는 HTTP 저장 성공 이후 기록한다.
VS 입장 화면의 `sparring_entry_side_select`는 임시 편 선택, `sparring_entry_start`는 선택한 편으로 저장·입장 시도,
`sparring_entry_watch`는 투표 없는 구경하기를 뜻한다. 저장 성공은 기존 `sparring_vote_saved`로 구분하며
이미 저장한 편으로 입장할 때는 투표 요청·성공 이벤트를 다시 만들지 않는다.
재전송으로 같은 ID를 확인한 요청도 저장 성공이므로 마지막 이벤트는 고유 의견 수가 아닌
저장 요청 성공 횟수로 해석한다. API/SSE 주기 조회 역시 사용자 행동 횟수가 아니다.

## 게임방

게임방 탐색은 `games_open`, `gomoku_lobby_open`, `games_back`으로 구분한다. 대기실은
`gomoku_room_create_open`, `gomoku_visibility_select`, `gomoku_rule_select`,
`gomoku_room_create_submit`, `gomoku_create_dismiss`, `gomoku_my_room_open`,
`gomoku_lobby_retry`, `gomoku_room_join`, `gomoku_rooms_first`, `gomoku_rooms_next`,
`gomoku_rooms_search_form`, `gomoku_rooms_search_input`, `gomoku_rooms_search_submit`,
`gomoku_rooms_search_reset`을 사용한다. 검색어와 크루 이름은 action 값에 포함하지 않는다.
대국 오류 알림 닫기는 `gomoku_error_dismiss`를 사용한다. 알림 닫기는 선택 좌표나 착수 상태를 변경하지 않는다.
방 안 조작은 `gomoku_position_select`, `gomoku_move_confirm`, `gomoku_ready_toggle`, `gomoku_game_start`,
`gomoku_invitation_copy`, `gomoku_invitation_toggle`, `gomoku_invitation_create`, `gomoku_invitation_link_select`, `gomoku_resign_open`,
`gomoku_resign_confirm`, `gomoku_leave_open`, `gomoku_leave_confirm`,
`gomoku_confirmation_cancel`, `gomoku_confirmation_dismiss`다. 방 상단의 "대기실" 링크는 참여를 유지하며 `games_back`을 사용하고, 별도 "나가기" 버튼은 `gomoku_leave_open`으로 확인창을 연다. 초대 참여는
`gomoku_invitation_join`, 게임판의 리듬게임 시작은 `rhythm_game_open`이다.

리듬게임 첫 화면의 게임판 복귀는 `games_back`, 싱글 플레이 카드의 시작 버튼은 `rhythm_single_open`,
준비 중인 온라인 매칭 카드의 버튼은 `rhythm_online_open`이다. 싱글 플레이 화면의 첫 화면 복귀는 `rhythm_entry_back`,
따라 하기 카드는 `rhythm_lesson_open`, 혼자 연습은 `rhythm_practice_open`, 공식 도전은 `rhythm_ranked_open`이다.
예전 싱글 플레이 화면의 소리 미리 듣기(`rhythm_sound_demo_kung`, `rhythm_sound_demo_chak`, `rhythm_sound_demo_chi`)와
접힌 튜토리얼 펼치기(`rhythm_tutorial_toggle`)는 화면에서 빠져 더 이상 기록되지 않는다.
공식 도전 화면의 난이도 선택은 `rhythm_challenge_level_select`, 배속 선택은 `rhythm_challenge_speed_change`,
입력 지연 보정 슬라이더는 `rhythm_challenge_offset_change`이며 싱크 진단 창은 연습과 같은 `rhythm_sync_*` 식별자를 쓴다.
다음 단계는 `rhythm_challenge_next`, 도전 만들기는 `rhythm_challenge_start`, 판의 시작 버튼은 `rhythm_challenge_play`,
옵션으로 돌아가기는 `rhythm_challenge_options`, 다시 도전은 `rhythm_challenge_retry`이다. 판의 Canvas 포커스는
`rhythm_challenge_arena_focus`, 터치 방향 버튼은 `rhythm_challenge_input_left`, `rhythm_challenge_input_down`,
`rhythm_challenge_input_up`, `rhythm_challenge_input_right`이다. 옵션과 결과 옆 랭킹의 더 보기와 다시 불러오기는
`rhythm_ranking_more`, `rhythm_ranking_retry`이다. 공식 도전의 점수와 입력은 분석 이벤트로 보내지 않는다.
따라 하기와 연습 화면의 싱글 플레이 복귀는 `rhythm_single_back`이다. 따라 하기의 단계 선택은
`rhythm_lesson_step_kung`, `rhythm_lesson_step_chak`, `rhythm_lesson_step_chi`, 빠르기는
`rhythm_lesson_tempo_slow`, `rhythm_lesson_tempo_normal`, `rhythm_lesson_tempo_original`,
배속은 `rhythm_lesson_speed_change`, 듣기와 해보기는 `rhythm_lesson_listen`, `rhythm_lesson_try`,
다음 단계와 마치기는 `rhythm_lesson_next`, `rhythm_lesson_finish`, 건너뛰기는 `rhythm_lesson_skip`이다.
연습 화면의 세균 위 소리 글자 표시는 `rhythm_labels_toggle`, 다시 불러오기는 `rhythm_harpoon_reload`를 사용한다.
연습과 따라 하기 도구 막대의 설정 서랍 열기와 닫기는 `rhythm_settings_toggle`이다.
키 배치 바꾸기는 `rhythm_key_bind_left`, `rhythm_key_bind_down`, `rhythm_key_bind_up`, `rhythm_key_bind_right`,
`rhythm_key_bind_retry`, 기본 키로 되돌리기는 `rhythm_key_reset`이다. 어떤 키를 골랐는지는 수집하지 않는다.
게임 안의 조작은 `rhythm_` 접두사의 고정 action을 각 버튼과 입력에 지정한다.
게임은 같은 React 문서의 기존 자동 수집을 사용하며 별도 SDK를 추가하지 않는다.
키 입력, 보정 측정값과 점수에 대한 별도 분석 이벤트는 전송하지 않는다.
터치 방향 버튼은 `rhythm_input_left`, `rhythm_input_down`, `rhythm_input_up`, `rhythm_input_right`로
구분하며, 누를 때마다 click 자동 수집 이벤트가 하나씩 생긴다.

좌표, 회원 이름, 방 ID와 초대 토큰을 action에 포함하지 않는다. 초대 토큰을 담은
`/games/gomoku/invite/*`와 `/api/games/gomoku/invitations/*`는 분석과 녹화를 중단하는
private route다. 경로 정규화에서도 토큰은 `:redacted`로 치환한다. 복사 주소는
`ph-no-capture ph-no-record` 영역에 둔다. 버튼 클릭은 시도로 수집하며, 실제 대국 시작 건수는
서버가 시작을 확정한 `gomoku_game_started`로 집계한다.

오목 규칙 모달 열기/닫기는 `gomoku_rules_toggle`, `gomoku_rules_dismiss` 고정 action을 사용한다.

규칙 예시 버튼은 `gomoku_double_three_example_open`, `gomoku_double_four_example_open` 고정 action을 사용한다.

종료된 오목방 중앙의 대기실 이동 버튼은 `gomoku_closed_lobby_open`을 사용한다.

### 서버 대국 이벤트

서버가 대국 시작과 종료를 확정할 때 각각 `gomoku_game_started`와 `gomoku_game_finished`를
기록한다. 시작 건수는 `gomoku_game_started`가 있는 고유 `game_id` 수다. 두 이벤트는
같은 `game_id`를 사용하며, 재대결에는 새 ID를 사용한다.
종료 속성은 `end_reason`(FIVE, DRAW, RESIGN, TIMEOUT), `duration_ms`(밀리초),
`move_count`(총 착수 수)다. `RESIGN`에는 기권 버튼과 대국 중 방 나가기가 함께 포함된다.
시간 초과는 해당 턴의 마감 시각을 종료 시각으로 사용한다.
서버 이벤트는 대국 ID를 분석 식별자로 사용하고 회원 프로필을 만들지 않는다.

운영 백엔드는 `application-prod.yaml`의 공개 PostHog 프로젝트 토큰과 수집 주소를 사용한다.
운영 앱을 배포하면 수집이 시작된다. 수집을 끄거나 프로젝트를 바꾸려면 운영 앱 설정을
수정해 재배포한다. 운영 프로젝트 토큰이나 주소를 교체할 때는 프론트엔드 배포 변수도
함께 맞춘다.
대국 기록과 같은 트랜잭션에 저장된 이벤트는 커밋 이후 백그라운드에서 전송한다.
재시도는 이벤트 UUID와 발생 시각을 유지하며 PostHog가 중복을 제거한다.
활성화 전 시작 이벤트는 소급 전송하지 않는다. 시작 기록이 남아 있는 진행 중 대국은
활성화 후 종료 이벤트만 수집될 수 있으므로, 완주율은 시작 이벤트가 있는 `game_id`를
기준으로 집계한다.

활성화 배포 중 이전 슬롯과 새 슬롯의 시간 초과 작업이 함께 실행된다. 수집이 꺼진 이전
슬롯이 먼저 종료한 대국은 DB에 결과가 저장되고 PostHog의 `TIMEOUT` 종료 이벤트는 빠질 수
있다. 운영 기록에 수집을 켠 배포의 트래픽 전환 시각과 이전 슬롯 정지 시각을 남겨 초기
지표를 해석할 때 참고한다.

### 오목 통계 화면

대기실 탭은 `gomoku_lobby_tab_rooms`, `gomoku_lobby_tab_history`, `gomoku_lobby_tab_ranking`으로 구분한다. 통계 로그인은 `gomoku_statistics_login`, 빈 전적에서 대기방 이동은 `gomoku_history_browse`다. 조회 재시도는 `gomoku_history_retry`, `gomoku_ranking_retry`, 추가 페이지는 `gomoku_history_more`, `gomoku_ranking_more`, 추가 페이지 재시도는 `gomoku_history_more_retry`, `gomoku_ranking_more_retry`다. 회원 이름/ID, 순위/승률, 상대 정보나 검색어를 action 값에 넣지 않으며 기존 텍스트/응답 마스킹을 유지한다.

## 오목 게임방 채팅

채팅 패널과 입력은 data-ph-private로 마스킹한다. 메시지 원문, 이름과 UUID를 분석 이벤트에 보내지 않는다. 고정 action은 gomoku_chat_open, gomoku_chat_dismiss, gomoku_chat_history_load, gomoku_chat_scroll_latest, gomoku_chat_refresh, gomoku_chat_message_input, gomoku_chat_message_submit, gomoku_chat_message_send, gomoku_chat_message_retry다.

## 오목 관전

고정 action은 gomoku_observation_open, gomoku_observation_retry, gomoku_observation_leave, gomoku_observation_lobby_open이다. 관전 식별자와 메시지 내용은 분석에 보내지 않으며 기존 채팅 마스킹을 유지한다.

## 아바타 시제품

독립 시제품의 홈 이동, 스타일 선택, 동작 선택, 회전, 얼굴 이미지 받기, 받아치기 체험은 각각
`avatar_lab_home`, `avatar_lab_preset_select`, `avatar_lab_pose_change`, `avatar_lab_rotate`,
`avatar_lab_portrait_download`, `avatar_lab_clash`로 식별한다. 시제품은 분석 SDK를 초기화하지 않으며
체험 메시지·외형 선택값을 분석으로 보내지 않는다. 기존 토론 iframe의 interaction 메시지도 시제품 호스트에서 수집하지 않는다.

파츠 편집의 카테고리 이동은 `avatar_lab_category_change`, 추천 스타일 펼치기는 `avatar_lab_presets_toggle`,
되돌리기·다시 하기는 `avatar_lab_undo`, `avatar_lab_redo`, 초기화는 `avatar_lab_reset`이다.
파츠 선택은 `avatar_lab_face_change`, `avatar_lab_skin_change`, `avatar_lab_hair_change`,
`avatar_lab_hair_color_change`, `avatar_lab_eyes_change`, `avatar_lab_eyebrows_change`,
`avatar_lab_nose_change`, `avatar_lab_mouth_change`, `avatar_lab_glasses_change`, `avatar_lab_outfit_change`,
`avatar_lab_shoes_change`, `avatar_lab_shoe_color_change`, `avatar_lab_hat_change`, `avatar_lab_hat_color_change`,
`avatar_lab_bag_change`, `avatar_lab_bag_color_change`, `avatar_lab_handheld_change`다.
색상·파츠 값과 외형 데이터를 action에 넣지 않으며 기존 시제품의 미수집 정책을 유지한다.

회원 편집기의 iframe도 분석 SDK를 초기화하지 않는다. 따라서 iframe 내부의 파츠 선택·추천 조합·동작·회전 등
`avatar_lab_*` 속성은 현재 실제로 수집되지 않는다. 부모로 action이나 외형 값을 중계하지 않으며,
식별자는 향후 계측을 위한 고정 이름으로만 유지한다. 아래 회원 관리 action 중 부모 문서의 진입·저장·삭제 등만
기존 앱 분석 설정에 따라 수집한다.

## 회원 아바타 관리

마이페이지 진입은 `my_avatar_edit_open`, 재조회는 `avatar_load_retry`, 마이페이지 복귀는
`avatar_back_to_my`, 서버 저장은 `avatar_save`다. 삭제 열기·닫기·취소·확인은
`avatar_delete_open`, `avatar_delete_close`, `avatar_delete_cancel`, `avatar_delete_confirm`이다.
미저장 이탈 확인은 `avatar_leave_close`, `avatar_leave_cancel`, `avatar_leave_confirm`을 사용한다.
같은 파츠 편집기를 재사용하므로 내부의 기존 `avatar_lab_*` 식별자는 유지한다.
회원용 추천 조합은 항상 펼쳐 보여 주므로 `avatar_lab_presets_toggle`은 체험판에만 남는다.
회원 편집기의 전체 보기·얼굴 확대는 `avatar_lab_view_change`로 구분하며 파츠 값은 포함하지 않는다.
편집 iframe은 분석 SDK를 초기화하지 않으며 외형·선택값을 분석 메시지로 전달하지 않는다.
부모 미리보기는 `data-ph-private`로 가린다. 인증·CSRF와 API 통계는 기존 공통 client를 사용한다.
