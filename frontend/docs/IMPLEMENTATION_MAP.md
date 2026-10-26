# 자리하나 프론트엔드 구현 매핑

이 문서는 2026-08-31 기준 실제 백엔드 Controller/DTO와 Figma 파일
`4FGyuqPPK0Vuv4FipZBTgF`를 대조한 구현 계약이다. 일반 화면은 `최종 디자인 2`
(`438:2657`), 모임 생성·정보 수정·모임장 관리는 `최종 디자인`(`354:1479`) 초안을
시각 기준으로 삼는다. 데이터·권한·상태 전이는 백엔드 코드를 최종 권위로 삼는다.

## 기술 선택과 실행 경계

현재 프론트엔드 기술 스택과 선택 이유는 [프론트엔드 ADR 목록](adr/README.md)의
[프론트엔드 ADR 0001](adr/0001-frontend-toolchain.md)에서 관리한다. 이 문서는 현재 코드와 백엔드
계약, Figma 매핑을 관리하며 실행 가이드를 소유하지 않는다.

시각 토큰은 `src/shared/styles/tokens.css`에 집중한다. 이번 hardening에서 contrast-aware
`--color-text-brand`/`--color-text-muted`, `--border-thin`/`--border-strong`,
`--touch-target`/`--touch-target-lg`, `--header-height`, `--breakpoint-md`/`--breakpoint-lg`를
추가했다. 이 값은 AppShell과 page CSS가 동일한 border, touch area, header, responsive 기준을
공유하게 한다.

## 디렉터리 구조

```text
frontend/
├── src/
│   ├── app/             # provider, router, guard, AppShell
│   ├── entities/        # API 응답 schema와 cursor 정책
│   ├── features/        # 도메인 API, query/mutation hook, validation
│   ├── pages/           # 공개·계정·그룹 편집·리더 관리 화면
│   └── shared/          # API client, config, Figma assets, tokens, UI primitive
├── docs/                # 구현 계약·Figma 매핑·기술 의사결정
├── public/              # HTML/manifest
└── tests/               # Jest setup 및 테스트 지원
```

## Figma 인벤토리

| 용도                | Figma node                                                    | 사용 범위                                                  |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| 그룹 탐색           | `438:2659`                                                    | 탐색 hero, 검색, 필터, 그룹 카드, 더 보기                  |
| 그룹 상세/참여 신청 | `438:2779`                                                    | 상세 정보 계층, 탭, 모집 CTA와 신청 패널                   |
| 마이페이지          | `438:2904`                                                    | 프로필, 내 모임, 내 신청 요약                              |
| 그룹 수정           | `394:2460`, `445:23`                                          | mint editor hero, Markdown 소개, 일정 입력                 |
| 그룹 생성           | `462:1337`                                                    | 생성 단계, editor hero, Markdown 소개                      |
| 모집 관리           | `445:144`                                                     | 현황, 모집 생성·마감, 공개 상태 rail                       |
| 신청 관리           | `399:1435`                                                    | 신청자 목록과 실제 참여자/모집 rail                        |
| 참여자 관리         | `445:252`                                                     | 참여자 검색/표와 리더 위임                                 |
| 공통 컴포넌트       | `25:54`, `25:67`, `25:68`, `25:72`, `25:78`, `25:81`, `25:84` | Button, Badge, Header, Card, InfoRow, FormField, PersonRow |

### Common shell reconciliation

`최종 디자인 2`의 header reference는 단일 규칙이 아니다. 일부 frame은 viewport 상단을 가득 채운
검은 bar를, 일부 frame은 white canvas 안에 inset된 검은 frame을 보여 준다. 이 차이는 route별
header 구현으로 확대하지 않았다.

- `AppShell`은 앱 route에 공통 navigation/auth state와 skip link/main landmark를 적용한다.
  `/land`는 로그인 여부와 관계없이 랜딩 자체의 header/main/footer를 사용한다. `/`는 인증 확인을 기다린 뒤 로그인 사용자를 `/home`, 그 외 상태를 `/land`로 replace 이동하며 검색 조건과 해시를 유지한다.
- 공통 main은 밝은 surface와 `--app-body-radius`(태블릿·데스크톱 16px, 모바일 14px)를 사용해 검은 header/footer와 맞닿는 네 모서리를 통일한다.
  바깥 shell은 검은 배경이며 `overflow: clip`은 본문 경계만 자르고 문서 스크롤과 sticky 배치를 유지한다.
- 360–767px에서는 full-bleed header + drawer를 사용해 44px 이상 touch target을 확보한다.
- 768px 이상에서도 검은 header 배경은 viewport 전체 폭을 채우고, 내부 navigation만 1360px shell에
  맞춰 중앙 정렬한다.
- 관리 화면의 group context tabs, public group detail의 content tabs, account navigation은
  header를 복제하지 않고 route 내부의 local context로 구분한다.

## Route × API × 권한 × 화면 상태

| Route                                                               | 권한                   | API                                      | 공통 레이아웃/컴포넌트                                               | 반드시 표시할 상태                                                               |
| ------------------------------------------------------------------- | ---------------------- | ---------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/` (비로그인) | 공개 | 인증 상태 확인 | HomePage, 검색 조건과 해시를 보존해 `/land`로 replace 이동 | auth loading, anonymous, signup-required, unavailable |
| `/land` (로그인 여부 무관) | 공개 | 없음 | LandingPage, 질문·의자 모션, 서비스 소개·이용 가이드 | reduced motion |
| `/` (로그인) | 회원 | 인증 상태 확인 | 검색 조건과 해시를 보존해 `/home`으로 replace 이동 | auth loading, authenticated |
| `/home` | 공개 | `GET /api/groups` | AppShell, ExploreHero, TodaySessionsHero, RecruitingSection, ArchiveSection | loading, empty, success, network |
| `/groups` | 공개 | `GET /api/groups` | AppShell, GroupBrowsePage, SearchField, FilterBar, GroupCard, CursorList | initial/background loading, empty, success, 400, network |
| `/groups/explore` | 공개 | 없음 | 검색 조건과 해시를 보존해 `/groups`로 replace 이동 | 기존 링크 호환 |
| `/activities`                                                       | 공개 (댓글과 반응은 회원) | `GET /api/activity-posts`, 활동 기록 작성, 수정, 숨김 API, 댓글 조회, 작성, 숨김과 하트 반응 API | AppShell, ActivityPostBoard, PolaroidCard, ActivityPostDetail(Modal), ActivityReactionBar, infinite cursor list | loading, empty, error, public/mine filter, image upload and public-visibility notice, 상세의 댓글 loading, empty, error, 더 보기, 비로그인 로그인 안내 후 `?post=` 복귀, 알림의 `?mine=true&post=` 진입과 최대 5페이지 이어 찾기, 사진 크게 보기 |
| `/groups/:groupId`                                                  | 그룹 정보와 달력 제목·날짜·시각은 공개, 일정 상세는 그룹원 | 그룹 상세, 모집·참여자·활동 기록, `/api/groups/{groupId}/calendar`와 그룹원 일정 상세 API | DetailLayout, Tabs(소개·캘린더·활동 기록), GroupCalendarTab, InfoRow, RecruitmentCard, PersonRow, ActivityPostBoard | loading, empty section, calendar range/error, leader calendar actions, 403, 404, 409 conflict, network |
| `/groups/:groupId/recruitments/:recruitmentId`                      | 조회 공개, 신청은 회원 | 모집 상세, 신청 생성/철회                | DetailLayout, RecruitmentPanel, Modal, Toast                         | closed/ended, validation, 401, 403, 404, 409, mutation pending/success/failure   |
| `/oauth/callback`                                                   | 공개                   | `GET /api/members/me`                    | CenteredStateLayout                                                  | callback loading, invalid callback, signup required, authenticated, 401, network |
| `/invitations/:invitationId` | 상세는 지정 대상 또는 발급자 회원 | 초대 ID 상세·수락 | PageContainer·Card·상태 컴포넌트 | 로그인/가입 필요, 대상 불일치, 만료/취소/종료, 수락 중/결과/재시도 |
| `/invitations/link/:token` | 공개 조회·회원 수락 | 공개 초대 미리보기·token 수락 | PageContainer·Card·상태 컴포넌트 | 공개 소개, 인증 복귀, 잘못된 주소, 만료/취소/종료, 중복 합류 |
| `/signup`                                                           | 가입 세션              | 내 정보 조회, 회원 생성                  | FormLayout, FormField, Select                                        | field/server validation, missing session, 409, pending/success/failure           |
| `/my`                                                               | 회원                   | 내 정보, 내 그룹, 내 신청                | MyPageLayout, ProfileCard, SummaryCard                               | bootstrap loading, partial empty, 401, network                                   |
| `/my/groups`                                                        | 회원                   | `GET /api/groups?relation=JOINED`        | ListLayout, GroupCard, CursorList                                    | loading, empty, cursor, 401, network                                             |
| `/my/registrations`                                                 | 회원                   | 내 신청 목록, 신청 철회                  | ListLayout, StatusBadge, ConfirmDialog                               | loading, empty, cursor, 401/403/404/409, mutation states                         |
| `/groups/new`                                                       | 회원                   | 이미지 업로드·그룹 생성                  | FormLayout, ImagePicker, schedule fields                             | image validation/upload, conditional schedule validation, 첫 오류로 smooth scroll·포커스(모션 감소 시 즉시 이동), 일정 오류는 본문 일정 설정 버튼으로 이동·직접 선택 시 모달 열기, 소개 탭 오류 입력 표시, 401/409, mutation states |
| `/groups/:groupId/manage`                                           | 해당 그룹 리더         | 그룹/참여자/모집 조회, 이미지 업로드, 그룹 수정/종료/삭제 | ManageLayout, ManageNav, ImagePicker, Stats, ConfirmDialog | image preservation/replace, loading, 403, 404, lifecycle conflict, mutation states |
| `/groups/:groupId/manage/members`                                   | 해당 그룹 리더         | 참여자 목록, 리더 위임                     | ManageLayout, PersonRow, ConfirmDialog                               | loading, empty, 403/404/409/422, mutation states                                 |
| `/groups/:groupId/manage/recruitments`                              | 해당 그룹 리더         | 모집 목록/생성/마감                      | ManageLayout, RecruitmentCard, Modal                                 | loading, empty, validation, 403/404/409, mutation states                         |
| `/groups/:groupId/manage/recruitments/history`                      | 해당 그룹 리더         | 모집 공고 이력 조회                      | ManageLayout, RecruitmentHistoryTable, StatusBadge                   | loading, empty, filter, sort, 403/404, network                                  |
| `/groups/:groupId/manage/recruitments/:recruitmentId/registrations` | 해당 그룹 리더         | 신청자 목록, 승인/미승인                   | ManageLayout, ApplicantRow, DecisionDialog, CursorList               | loading, empty, filter, cursor, 403/404/409, mutation states                     |
| `*`                                                                 | 공개                   | 없음                                     | CenteredStateLayout, NotFoundState                                   | 404와 안전한 복귀 링크                                                           |

### Visual pattern mapping

로컬 개발 서버(`NODE_ENV=development`)에서는 홈 히어로 오른쪽 위의 `개발 · 시간대` 선택기로
확장형 `jarihana-hero-{day,sunset,night}-responsive.png`의
자동·낮·노을·밤 배경을 미리 볼 수 있다. 함께 표시되는 `히어로 이미지 버전` 선택기는
기본 `현재 버전`, 실험용 `보정 세트 (낮·노을·밤)`, 밤 성운 비교용 `성운 강조 (밤 전용)`,
얼굴 참조를 반영한 `얼굴 보정 (낮·노을·밤)` 세트를 비교한다. 실험용 세트는
`jarihana-hero-{day,sunset,night}-classic.png`, `jarihana-hero-night-nebula.png`,
`jarihana-hero-{day,sunset,night}-refined.png` 파일이 있을 때 개발 모드에서만 CSS 변수로
덮어쓴다. 성운 강조는 낮·노을에서 원본 구도 보정 세트를 공유하고, 밤에서만 성운 강조 이미지를 쓴다.
`ExploreHero.jsx`의 로컬 상태로 테마와 이미지 세트만 전환하며,
실제 시각·헤드라인·오늘 일정은 바꾸지 않는다. 자동 선택 시 현재 시간의 테마를 사용한다.
새로고침하면 자동으로 초기화하고 production 빌드에는 제어 UI와 수동 테마 적용을 제외한다.

| 화면군         | Figma에서 유지한 정보 계층                      | 구현상 통일/반응형 결정                                                                                                  |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 공개 탐색      | 오늘 SESSION hero → 같이해요 → 스터디·동아리 탐색 | 홈 첫 hero는 모든 화면에서 header 바로 아래에 상단·좌우 여백 없이 전체 폭으로 표시한다. 이후 section은 공통 shell 1440px, desktop/tablet gutter 24px, mobile 16px을 유지한다. 탐색 카드는 desktop 4열, tablet 3열, mobile 1열 activity row. SESSION은 한 행으로 시작하고 더 보기로 펼친다. hero 카드와 TODAY’S PLAN은 같은 선택 상태를 공유 |
| 사진 활동 기록 | 그룹 이름과 활동 날짜가 있는 폴라로이드 카드 | 전체 탐색과 그룹 상세 탭에서 같은 보드를 재사용; 이미지 비율을 유지하고 카드 높이를 측정해 가장 짧은 열에 배치하는 Masonry, 동률은 왼쪽 우선, 모바일 1열, 최신순 DOM 순서 보존. 카드에 하트 반응 수와 댓글 수를 보이고, 카드를 누르면 가운데 상세 다이얼로그(모바일 전체 화면)를 연다. 종료된 모임 기록은 배지 대신 바랜 사진 카드로 표현 |
| 그룹 상세/모집 | profile banner, 모임 정보(방식·일정·장소·참여자), content tabs, 참여 CTA | desktop content + sticky recruitment rail, 1024px 미만 rail을 본문 뒤로 이동                                             |
| 계정           | profile illustration, activity count, 요약 카드 | desktop profile/content split, tablet/mobile은 순서 보존 single column; `?role=LEADER` deep link로 운영 모임 filter 유지 |
| 그룹 생성/수정 | 단계 tab, mint editor hero, Markdown 소개       | 대표 이미지 picker와 업로드 상태, type별 일정 form, 1024px 미만 hero stack, mobile day/time grid 축소             |
| 리더 관리      | 관리 맥락, 현황, 참여자/모집/신청 작업          | 모집은 실제 create/close, 참여자는 실제 leader transfer만 제공; desktop rail과 mobile stacked layout                   |

모든 cursor 목록은 첫 요청에서 cursor를 생략하고 다음 요청은 응답의 `nextCursor`만 사용한다.
그룹 탐색은 카드 밀도 때문에 `size=12`를 명시하고, 나머지는 backend default `size=20`을
사용한다. 허용 범위는 1–100이다. 같은 cursor 재요청과 중복 item 병합을 막는다.

## 실제 API 계약 요약

### 초대 기능 설계 계약

> 상태: 초대 수신 페이지·API/schema·수락·인증 복귀·알림 클릭을 구현했다.
> 모임 상세의 링크 복사·다수 회원 초대·발급/취소 관리도 구현했다. 별도 받은 초대 목록은 제공하지 않고 알림함→초대장 경로를 유지한다.
> [초대 API 계약](../../backend/docs/context/api/endpoints/invitations.md)과
> [초대 정책](../../backend/docs/context/domain/business-policies.md#초대-발급과-합류)을 따른다.
> 현재 화면·API·분석 계약은 아래 구현과 관련 문서를 따른다. 채택한 기술 결정은 해당 영역 ADR에 기록한다.

| Route 또는 진입점 | 권한 | API | 화면 상태 |
| --- | --- | --- | --- |
| `/invitations/:invitationId` | 지정 대상 회원; 비회원은 로그인 안내 | ID 상세·수락 | 로딩·가입 필요·대상 불일치·만료·취소·종료·이미 참여 중·수락 중/성공/실패 |
| `/invitations/link/:token` | 조회 공개, 수락은 가입 완료 회원 | 공개 링크 조회·수락(token) | 모임·발급자·만료·인증 필요·중복·네트워크 오류 |
| 모임 상세 히어로의 초대 링크 복사 | ACTIVE 모임의 현재 모임장·모임원 | LINK 생성·유효 링크 재사용 | 준비 중·복사 완료·직접 복사·권한/네트워크 오류 |
| 참여자 목록 제목 오른쪽 + 초대 | ACTIVE 모임의 현재 모임장·모임원 | 기본 회원 후보 목록·선택적 이름 검색·DIRECT 개별 생성 | 후보 Avatar(누락·null·로딩 실패 시 이름 첫 글자 대체)·검색 버튼 없는 전체 너비 입력·250ms debounce·Enter 제출·다수 선택·검색 유지·부분 실패·실패 대상 재시도·페이지·빈 결과 |
| 회원 초대 모달의 보낸 초대 | 현재 모임장·모임원 | MINE(DIRECT만)/MANAGED_LINKS(LINK만) 목록·상세·취소 | 본인 지정 초대와 모임 공유 이력 분리·canRevoke별 취소·모든 구성원 링크 복사 |
| `/notifications/open/:id` | 본인 알림의 회원 | 본인 알림·초대 상세·읽음 | 로그인 복귀·잘못된 계정·없는 대상·현재 상태 안내 |

- MEMBER는 서비스 가입 완료 권한이다. 생성·공유 링크 조회·재복사는 현재 모임 소속을 따로 검사한다. 신청 승인 등 모임장 전용 관리 route는 일반 모임원에게 열지 않는다.
- `내가 보낸 초대`는 각 DIRECT의 targetMember.crewName을 수신자로 표시한다. 발신자는 표시하지 않는다. 백엔드가 아직 수신자 필드를 제공하지 않으면 목록을 유지하고 `수신자 정보 없음`으로 안내한다. LINK의 targetMember는 null이며 기존 발급자 안내를 유지한다.
- 기존 storeReturnTarget→OAuthCallbackPage→SignupPage→SignupGuard를 재사용하고 가입 전 초대 복귀 정보를 소모하지 않는다.
- 회원가입·알림 클릭·읽음만으로 합류하지 않는다. 초대 화면에서 명시적으로 수락한다.
- 초대 작성에는 개인 메시지 입력을 두지 않는다. 지정 초대장의 `거절`은 확인 창에서 모임장에게 알림이 가지 않으며 재수락할 수 없음을 안내한다. `PATCH /api/invitations/{invitationId}/decline` 성공(204) 후 초대를 다시 조회하며 REJECTED 상태에서는 `거절한 초대장입니다.`를 표시하고 수락 버튼을 숨긴다. 알림을 삭제하지 않으며 알림함 재진입에도 같은 상태를 표시한다. 공유 링크에는 지정 초대 거절 버튼을 두지 않는다.
- 거절 관련 고정 action은 `invitation_decline`, `invitation_decline_confirm`, `invitation_decline_cancel`, `invitation_decline_close`를 사용한다.
- 신규 JOINED와 ALREADY_JOINED를 구분해 먼저 결과를 안내하고 `모임으로 이동` 링크를 제공한다. 후자는 합류 성과를 기록하지 않는다.
- 초대 분석은 새 발급·공유 링크 재사용·조회·복사 시도/완료·수락 시도·JOINED/ALREADY_JOINED·취소를 분리한다. 로그인한 회원은 DB 사용자 ID로 연결하고 처리 성공 이벤트는 분석 사용자를 요청 시작 시점에 묶어 계정 변경 후 늦은 응답을 버린다. 이름·검색어·대상 회원·원본 토큰·공유 주소는 전송하지 않는다. 공유 초대 페이지는 조회·수락의 명시적 이벤트만 허용하고 자동 수집·녹화는 차단한다. [프론트엔드 ADR 0003](adr/0003-invitation-events-and-user-identity.md), [분석 문서](analytics.md), [개인정보 후속 이슈 #384](https://github.com/woowacourse-teams/2026-jarihana/issues/384)를 따른다.
- 성공 후 모임·내 모임·내 신청 캐시를 갱신하고 받은 초대·알림 캐시는 계정/세션 변경에 맞춰 분리한다.
- 모임이 물리 삭제되면 초대 상세·공유 미리보기·수락의 404를 기존 유효하지 않은 초대 안내로 처리한다. 남은 알림 클릭은 알림함으로 돌아갈 수 있는 오류 안내를 제공하며 자동 합류하지 않는다. 후속 채팅·캘린더의 소속 확인은 서버의 GroupMember를 기준으로 하고 초대나 알림의 존재로 대체하지 않는다.
- 알림 schema는 INVITATION_RECEIVED의 target에 groupId·invitationId를 요구하고 모집·신청 ID를 요구하지 않는다.
  기존 신청 사건의 target과 `payloadVersion=1`은 유지한다. `public/sw.js`는 같은 버전에서
  초대 사건의 본문만 추가한다. 내용 조회 실패·알 수 없는 사건에도 검증된 알림 ID를 유지해 `/notifications/open/:id`에서 인증·소유권·목적지를 확인한다. 이전 SW는 알 수 없는 사건에 기본 안내와 `/` 복귀를 사용할 수 있다.
- 원본 token 경로·API path·오류·세션 녹화의 분석 전송을 차단한다. 반환 경로를 외부 URL로 변환하지 않는다.
- 발급 동작마다 requestId를 만들고 통신 재시도에는 같은 값을 사용한다. 서버가 반환한 내부 sharePath만 복사하며 외부 URL을 입력받지 않는다.
- 다수 지정 초대는 회원마다 requestId를 보관해 순차 발급한다. 성공한 대상은 선택에서 제외하고 실패한 대상은 유지한다. 실패 재시도는 같은 requestId를 사용하며 성공 대상을 다시 발급하지 않는다. 화면을 조회하거나 회원을 선택하는 것만으로 발급하지 않는다.
- 받은 초대 전용 목록·마이페이지 탭은 추가하지 않는다. 기존 수신 목록 API와 서버 초대·수락 기록은 유지한다. 알림함에서 초대장을 열어 수락·거절하고 알림을 삭제할 수 있다.
- 모임당 현재 유효 공유 링크는 하나다. 구성원 모두 같은 링크를 사용한다. 상세의 `초대 링크 복사`는 유효 링크가 있으면 재사용하고 없으면 발급한 뒤 복사한다. LINK 응답이 reused=true이면 기존 발급자·만료일을 유지한 링크 재사용으로 안내한다. 공유 링크 관리 목록에는 과거 링크도 상태와 함께 표시한다. 재복사·재사용은 만료를 연장하지 않는다.
- 공유 링크 목록(scope=MANAGED_LINKS)과 상세·재복사는 모든 현재 모임장과 모임원이 이용할 수 있다. 다른 사람이 발급한 링크도 복사하여 전달할 수 있다. 취소 버튼은 서버의 canRevoke가 true인 발급자 또는 현재 모임장에게만 제공한다. 동일 요청 재시도에도 같은 sharePath를 받으며 재복사는 새 발급이나 만료 시각 연장이 아니다. 만료·취소 상태를 함께 표시한다.
- 모집 화면의 approvedCount는 모집으로 가입한 인원, capacity-approvedCount는 남은 모집 자리를 뜻한다. 화면은 기존 '승인'·'정원' 문구를 사용한다. 초대 합류 인원을 더하거나 신청 목록의 승인 건수로 대신 계산하지 않는다. memberCount는 모임장·초대 합류자를 포함한 실제 구성원 수다. 신청 목록의 '승인' 상태는 초대로 승인된 기존 신청도 포함한다.
- 없는 초대·모임은 '유효하지 않은 초대'로 안내한다. DIRECT의 비회원 접근은 로그인 후 대상 계정을 확인한다.
- 알림 클릭은 /notifications/open/:id → 본인 알림 조회 → 초대 대상 권한 확인 → 읽음 → /invitations/:invitationId 순서다.
  다른 계정·없는 초대에는 읽음 없이 안내한다. 본인의 취소·만료 초대는 상태 확인 후 읽음 처리하고 안내한다.
  발급자 이탈·모임 종료도 클릭 시 현재 상태를 기준으로 합류를 차단하며 클릭 자체로 수락하지 않는다.
- 분석 성공 이벤트는 신규 JOINED에만 기록한다. 실패·기존 소속 안내는 신규 합류 성과를 만들지 않는다.
- UI에 적용한 주요 고정 action은 invitation_create, invitation_member_select, invitation_link_copy,
  invitation_accept, invitation_revoke다. 기존 알림 클릭은 notification_open을 유지한다.
- 저장소 JS/JSX·공통 API client·Jest·기존 UI/토큰을 사용한다. 새 장기 구조 선택이 없으면 기존 프론트 ADR을 재사용한다.
- 실행 코드: `entities/invitation`은 응답을 검증하고 `features/invitation`은 조회·수락을 공통 client로 호출한다.
  조회는 no-store, 명시적 수락 요청만 POST한다. 수락 성공 후 모임·구성원·신청·초대 캐시를 갱신한다.
  초대 조회 캐시는 회원 ID·세션 버전으로 구분하고 이전 계정의 조회를 취소·제거한다.
  화면도 세션별로 분리해 이전 계정의 뒤늦은 수락 결과를 표시하지 않는다.
- 회원가입 성공 후 고정 `/my` 대신 저장한 안전한 복귀 경로로 이동한다. 가입 실패와 가입 대기 중에는
  경로를 소모하지 않는다. 기존 OAuthCallbackPage와 SignupGuard의 가입 세션 처리도 유지한다.
- 공유 토큰 경로의 자동 수집·녹화는 차단한다. 유효한 공유 초대 페이지에서는 정제한
  invitation_viewed·invitation_accept_attempted·invitation_joined·invitation_already_joined만 허용한다.
  OAuth 경로의 전체 수집 차단은 유지한다. URL·API 경로 정제에서 토큰 위치는 `:redacted`로 바꾸고
  초대 상세는 `data-ph-private`로 보호한다. 서버 로그와 프록시/CDN의 검증 범위는
  [초대 운영 가이드](../../backend/docs/operations/invitations.md#로그와-민감정보-확인)를 따른다.
- 브라우저 계약 검증은 `tests/e2e/invitations.spec.js`, API·화면·계정 회귀는
  `tests/api/invitation.test.js`, `tests/pages/invitations/invitation-page.test.jsx`에 둔다.
  실제 DB·API·PC Chrome의 외부 푸시 수신과 사용자 OS 클릭은 `tests/integration/notifications.spec.js`로 별도 확인했다.
  실제 GitHub 제공자 로그인·Safari/iOS 설치 앱·공유/운영 배포는 미검증이다.


### 웹푸시·알림함 구현

새 모임 등록(`GROUP_CREATED`)은 알림함과 푸시 클릭 모두 `/groups/:groupId`로 이동한다. 이 사건의 target은 `kind: GROUP_DETAIL`, `groupId`만 가지며 모집·신청 식별자는 없다. 생성 당시 활성 푸시 구독 회원 중 생성자를 제외하고 알림함에 한 건씩 남긴다. SW 표시 제목은 `자리하나?`, 본문은 `새로운 모임이 등록되었어요.`다.

내 활동 기록의 새 댓글(`ACTIVITY_POST_COMMENTED`)과 좋아요(`ACTIVITY_POST_REACTED`)는 target이 `kind: ACTIVITY_POST`, `groupId`, `activityPostId`이며, 알림함과 푸시 클릭 모두 `/activities?mine=true&post=:activityPostId`로 이동해 내가 쓴 기록 피드에서 해당 기록 상세를 연다. 기록이 불러온 페이지에 없으면 피드가 최대 5페이지까지 다음 페이지를 이어 찾고, 그래도 없으면 `post` 값만 지운다. 좋아요 알림 본문은 서버가 만든 `가온 외 2명이 좋아요를 눌렀어요.` 형식을 그대로 표시한다. SW는 댓글에 `내 활동 기록에 새 댓글이 달렸어요.`를, 좋아요에는 푸시 내용 조회의 `reactionSummary`로 `가온님이 좋아요를 눌렀어요.`, `가온 외 2명이 좋아요를 눌렀어요.`, 20명 초과 시 `회원님의 댓글이 무수한 관심을 받고 있어요.`를 표시한다. 요약이 없으면 `내 활동 기록에 좋아요가 도착했어요.`를 쓴다. 계약은 [알림 API의 활동 기록 알림 절](../../backend/docs/context/api/endpoints/notifications.md#활동-기록-알림-응답-확장-계약)을 따른다.

알림함은 헤더의 종 버튼이 여는 Drawer로 제공하며 독립된 `/notifications` 페이지는 없다.
[백엔드 ADR 0015](../../backend/docs/adr/0015-web-push-and-notification-inbox.md)와
[알림 API](../../backend/docs/context/api/endpoints/notifications.md)를 함께 따른다.

- 로그인 회원의 프로필 옆 종 접근을 desktop·mobile 모두 제공한다. 열기만으로 읽음 처리하지 않는다.
- 목록/안 읽은 수는 회원 ID·인증 세션 버전별 query key. 계정·세션 변경 시 이전 조회를 취소하고 캐시를 제거한다. 안 읽은 수는 30초마다/창 복귀 때 갱신하며 목록은 열기·새로고침·변경 성공 후 갱신한다. read/read-all 성공 후 invalidate하며 읽은 행은 유지한다.
- 전체 읽음은 서버 전체 대상 처리다. 요청 중 새로 도착한 알림까지 무조건 읽음으로 칠하지 않는다.
- DELETE204 뒤에만 해당 행을 240ms 슬라이드 후 제거한다. 실패 행 유지, reduced-motion 이동 생략, 키보드 focus 보존.
- 신규 진입 `/notifications/open/:id`는 기존 AuthGuard/returnTarget 흐름으로 인증 복귀하고,
  GET `/notifications/{id}`로 본인·target을 확인한 뒤 PATCH read와 내부 경로 이동을 수행한다.
- 알림함과 푸시 클릭은 `/notifications/open/:id`를 공유한다. 새 신청은 `/groups/:groupId/manage/registrations`, 새 참여는 `/groups/:groupId/manage/members`, 승인은 `/my?focusGroup=:groupId`, 모든 미승인은 `/my?registrationStatus=REJECTED&focusRegistration=:registrationId`로 이동한다. 관리 화면은 현재 모임장 여부를 확인한다. 관리 대상 조회 403/404는 읽음 처리 없이 안내한다. 승인·미승인은 읽음 처리 후 목록 캐시를 갱신하고 마이페이지로 이동한다. 해당 유형/미승인 탭을 선택하고 다음 페이지도 조회하여 정확한 카드에 스크롤·키보드 focus·3초 강조를 적용한다. 대상이 없으면 안내하며 reduced-motion에서는 즉시 스크롤한다. 이전 백엔드의 승인 알림 `GROUP_DETAIL` 응답도 프론트 API 경계에서 `MY_GROUPS`로 변환해 같은 카드 강조 경로를 사용한다. 알림함 본문에는 현재 모임 이름과 사건 내용을 표시한다.
- 이 브라우저 push setting은 명시적 동작에 따른 권한 요청/등록/해제. iPhone·iPad의 일반 브라우저는 홈 화면 설치 안내를 표시한다. 설치 이벤트를 제공하는 브라우저는 설치 버튼을 표시한다.
- 홈(`/`)에 진입하면 모바일에서 PWA 설치·알림 설정 가이드를 모달로 자동 표시한다. 기기 탭 안에서 브라우저를 선택하며, iOS는 Chrome·Safari, Android는 Chrome·삼성 브라우저를 제공한다. iOS는 실제 화면 이미지로 구성된 5단계 안내를 제공하고 Safari는 첫 공유 화면만 전용 이미지로 사용한 뒤 나머지 단계를 공유한다. Android Chrome은 Chrome 메뉴의 `설치 및 바로가기 만들기`와 설치 선택 화면을 전용 이미지로 안내한다. 2단계에서 `설치` 또는 `홈 화면에 추가`를 고른 뒤 삼성 브라우저와 같은 설치 후속 경로와 공통 푸시 설정 단계를 이어서 사용한다. 삼성 브라우저는 `현재 페이지 추가` 뒤 `웹 앱으로 설치` 경로와 `홈 화면 추가` 경로 중 하나를 따라가며, Play Protect 확인과 푸시 설정 화면은 해당 단계 이미지를 사용하고 목록 버튼·종·푸시 설정 화면은 iOS 이미지를 재사용한다. Samsung Browser로 접속하면 Android 삼성 브라우저 탭을 기본 선택한다. `7일간 보지 않기`는 만료 시각을 브라우저 localStorage에 저장한다. 로그인한 계정에 `GET /api/push-subscriptions` 기준 `enabled=true`인 활성 구독이 있으면 자동 표시하지 않으며, 계정·구독 확인이 실패한 경우에도 팝업을 보류한다. 닫기만 한 경우 홈에 다시 진입하면 다시 표시할 수 있다. 푸터와 알림함의 `설치 안내 보기`에서 수동으로 다시 열 수 있다. 이미지는 서비스 도메인의 공개 정적 경로 `/images/push-guide/`에서 제공하며, 원본 객체는 `s3://techcourse-project-2026/jarihana-dev/images/push-guide/`의 브라우저별 하위 경로에 둔다.
- SW의 IndexedDB에 현재 브라우저의 회원 ID·구독 id·generation·armed·revision을 보관한다. endpoint·암호화 키·알림 본문·로그인 토큰은 보관하지 않는다. 서버는 회원 소유권·활성 상태·generation을 확인한다.
- SW는 푸시의 구독 id·generation을 조회 전과 응답 후에 다시 확인한다. private 응답 no-store·일반 안내 fallback.
- logout 전 local disarm 완료 확인 후 `{pushSubscriptionId,generation}`을 전송한다. 계정 전환·logout 뒤 이전 응답의 표시·캐시 반영을 막는다.
- 새 동작에 고정 action 지정: notification_inbox_open, notification_open, notification_read_all,
  notification_delete, push_permission_request, push_enable, push_disable, pwa_install_prompt,
  pwa_guide_reopen, pwa_guide_dismiss, pwa_guide_platform_ios, pwa_guide_platform_android,
  pwa_guide_browser_ios_chrome, pwa_guide_browser_ios_safari,
  pwa_guide_browser_android_chrome, pwa_guide_browser_android_samsung,
  pwa_guide_chrome_path_install, pwa_guide_chrome_path_home_screen,
  pwa_guide_samsung_path_web_app, pwa_guide_samsung_path_home_screen,
  pwa_guide_previous, pwa_guide_next, pwa_guide_complete, pwa_guide_hide_seven_days_toggle.
- UI 상태: loading/empty/error/retry, page error, mutation pending, 마지막 행 삭제, 새 소식·계정 변경.

### 현재 구현된 API 계약

- 피드백 모달은 가입을 완료한 로그인 회원만 제출할 수 있다. 비로그인 사용자가 헤더나 푸터에서 피드백을 선택하면 로그인 안내 모달에서 `로그인하러 가기` 또는 `취소`를 선택한다. 로그인을 진행하면 현재 경로를 복귀 대상으로 저장하고, 인증 완료 후 피드백 모달을 자동으로 연다. `POST /api/feedbacks`에는 `content`만 보내며, 서버는 인증 회원 ID를 `member_id`로 저장한다.

- API base path는 `/api`이고 모든 요청은 cookie credentials를 포함한다.
- JSON 응답은 `{ success, data, error }` envelope다. `204`는 본문을 읽지 않는다.
- 인증 토큰은 `accessToken`, `refreshToken` HttpOnly cookie다. 브라우저 저장소와
  `Authorization` header를 사용하지 않는다.
- mutation은 `XSRF-TOKEN` cookie를 `X-XSRF-TOKEN` header로 전달한다.
- `401 + UNAUTHENTICATED`에서만 refresh하고, 동시 refresh는 하나로 합치며 원 요청은
  최대 한 번만 재시도한다. `403`은 refresh하지 않는다.
- 가입 결정 payload는 UI의 승인/미승인을 백엔드 값 `APPROVED`/`REJECTED`로 보낸다.
- 그룹: `CLUB | STUDY | SESSION`, 상태: `ACTIVE | ENDED`.
- 그룹 모임 방식: `ONLINE | OFFLINE | FLEXIBLE`. `FLEXIBLE`은 고정된 온라인·오프라인 방식 없이 유동적으로 정하는 경우다. `type`은 그룹 종류이고 `meetingType`은 진행 방식이므로 서로 다른 값이다.
- 그룹 상세 응답의 `location`은 nullable 문자열이며 최대 255자다. 오프라인 장소뿐 아니라 온라인 접속 정보도 저장할 수 있다.
- 모집 방식: `AUTO | APPROVAL`, 조회 상태: `SCHEDULED | OPEN | ALWAYS_OPEN | CLOSED`.
- 신청 상태: `PENDING | APPROVED | REJECTED`.
- `CLUB`/`STUDY`는 반복 일정, `SESSION`은 단일 세션 일정을 입력한다.
- 그룹 상세의 `캘린더` 탭은 `소개`와 `활동 기록` 사이에 둔다. `CLUB`·`STUDY`의 정기 일정과 날짜별 정기 모임 회차·개별 일정, 독립된 `SESSION` 그룹의 단일 일정을 표시한다. 날짜별 정기 모임 상태는 기본적으로 날짜 기준 자동 표시하고, 모임장이 `예정` 또는 `개최 완료`로 직접 지정할 수 있다. 새 모임 부속 세션과 RSVP는 이번 범위에 포함하지 않는다.
- 공개 달력 응답에는 제목·날짜·시각만 포함한다. 개별 일정의 설명·장소와 정기·세션 일정의 당시 장소는 그룹원 전용 상세 API로 조회한다.
- 기존 정기·세션 일정 표시 설정과 일정의 등록·수정·삭제는 모임장 전용이다. 개별 일정 등록 모달에서 `개별 일정`이 기본 선택되며, `CLUB`·`STUDY`에서는 하루짜리 `정기 모임` 회차를 선택할 수 있다. 달력에는 일정 제목을 공개한다.
- 이미지 업로드는 `POST /api/image-uploads`로 Presigned URL을 발급한 뒤 스토리지에
  직접 전송하고, 응답의 `imageKey`를 그룹 생성·수정 요청의 `representativeImageKey`로
  전달한다. 업로드와 업로더 전용 프리뷰는 30분 동안 유효하다. 그룹에 저장하면 서버가 이미지를
  `groups/{groupId}/...` 최종 경로로 이동한다.
- 조회 응답의 사용자 업로드 이미지는 서비스 도메인의 `/api/images/groups/...` 주소를 사용한다.
  백엔드가 활성 참조를 확인한 뒤 같은 도메인의 최대 5분짜리 `/images/groups/...` CloudFront 서명
  URL로 이동시킨다. 숨김·미연결 이미지는 새 URL을 발급하지 않는다.
- 그룹 생성의 `representativeImageKey`는 nullable이며 `null`이면 기본 이미지를 사용한다.
  그룹 수정은 `name`, `introduction`, `description`, `meetingType`, `location`,
  `representativeImageKey` 전체를 보내야 하며, nullable 필드를 비우려면 명시적으로 `null`을
  보낸다. 업로드 기록이 없거나 만료된 키는 거부된다.
- 그룹 이름 50자, 소개 100자, 설명 10000자, 신청 메시지와 결정 사유 1000자 제한을
  클라이언트와 서버 양쪽에서 검증한다.

### 그룹 상세 응답 스키마

`fetchGroup`은 `groupDetailSchema`로 백엔드 응답을 검증한다. 따라서 상세 응답에 새 필드를
추가할 때는 서버의 `GroupDetailResponse`뿐 아니라 `src/entities/group/index.js`의 스키마도
함께 갱신해야 한다. Zod 객체 스키마에 정의되지 않은 응답 필드는 파싱 과정에서 제거될 수
있으므로, 스키마에 필드를 추가하지 않으면 화면 컴포넌트가 API 값을 받을 수 없다.

- `meetingType`: `ONLINE`, `OFFLINE`, `FLEXIBLE` 중 하나인 필수 값
- `location`: 최대 255자의 nullable 문자열
- `currentMemberRegistrationId`: 현재 모집에 대한 본인 신청 ID, 신청이 없으면 `null`
- 목록 응답은 현재 모임 방식·장소를 제공하지 않으므로 `groupListItemSchema`에는 포함하지 않는다.

### 내 신청 목록 응답 스키마

`fetchMyRegistrations`의 각 항목은 신청 정보와 함께 신청 대상 그룹을 `group`으로 반환한다.
대표 이미지는 신청서의 이미지가 아니라 그룹의 이미지이므로 `group.representativeImageUrl`에
포함한다. 백엔드는 저장 키를 공개 URL로 변환해 전달하고, 프론트엔드 스키마는 상대 경로를
루트 기준 경로로 정규화한다. 업로드 이미지가 없는 그룹의 API 응답은 기존과 동일하게
`images/default-group.png`이며, 프론트엔드에서는 이를 기본 이미지로 인식해
`/assets/default-group.png`를 표시한다.

```json
{
  "id": 88,
  "group": {
    "id": 12,
    "name": "알고리즘 스터디",
    "representativeImageUrl": "https://jarihana.com/api/images/groups/12/algorithm.webp"
  },
  "recruitmentId": 45,
  "status": "PENDING",
  "canWithdraw": true
}
```

내 신청의 철회 버튼은 서버가 반환한 `canWithdraw`가 `true`일 때만 표시한다. 모집이 마감되면 `PENDING` 신청도 철회할 수 없다.

| 도메인         | endpoint                                                                                                                                                                           | 화면에서 수행하는 일                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 그룹           | `GET/POST /api/groups`, `GET/PUT/PATCH/DELETE /api/groups/{groupId}`                                                                                                               | 탐색·상세·생성·수정·종료·삭제                                                  |
| 일정           | `PUT/DELETE /api/groups/{groupId}/recurring-schedule`, `PUT /api/groups/{groupId}/session-schedule`                                                                                | 모임 유형에 맞는 일정 저장/삭제                                                |
| 그룹 달력      | `GET /api/groups/{groupId}/calendar`, `GET /api/groups/{groupId}/calendar/schedule-details`, `GET/POST/PUT/DELETE /api/groups/{groupId}/events`, 정기 규칙·표시 설정 API              | 월간 달력 조회, 그룹원 상세, 모임장 일정·표시 범위 관리                         |
| 참여자         | `GET /api/groups/{groupId}/members`, `PUT /api/groups/{groupId}/leader`                                                                                                            | 참여자 목록과 리더 위임                                                        |
| 모집           | `GET/POST /api/groups/{groupId}/recruitments`, `GET/PUT/PATCH /api/groups/{groupId}/recruitments/{recruitmentId}`                                                                  | 모집 이력·상세·생성·수정·마감                                                  |
| 신청           | `GET/POST /api/recruitments/{recruitmentId}/registrations`, `PATCH/DELETE /api/recruitments/{recruitmentId}/registrations/{registrationId}`, `GET /api/registrations?applicant=me` | 신청 생성·철회·승인/미승인·내 신청                                               |
| 이미지         | `POST /api/image-uploads`, `GET /api/images/{imageKey}`                                                                                                                            | Presigned URL 발급 후 업로드, 업로더 프리뷰, 활성 이미지의 서명 전달 URL 조회 |
| 인증/회원      | `GET /api/members/me`, `POST /api/members`, `POST /api/auth/refresh`, `POST /api/auth/logout`                                                                                      | bootstrap·가입·refresh·logout                                                  |
| OAuth callback | `GET /api/oauth/github/callback`                                                                                                                                                   | GitHub에서 받은 code/state를 backend가 처리하고 frontend callback으로 redirect |

## Guard 결정

- 앱 시작 시 `/api/members/me`를 조회하고 `UNAUTHENTICATED`이면 refresh를 한 번 시도한다.
- `signupCompleted=false`는 `/signup`으로, 완료 회원은 원래 목적지로 보낸다.
- 가입 완료 후 일반 가입 흐름의 `/my` 이동은 유지한다. 초대장과 `/notifications/open/:id`로 들어온 가입만 저장된 초대·알림 경로로 복귀하며 자동 수락하지 않는다.
- 리더 여부는 JWT가 아니라 현재 member id와 그룹 leader member id를 비교한다.
- 클라이언트 guard는 UX를 위한 것이며 서버의 401/403이 최종 권위다.
- OAuth callback의 `signupRequired` query는 힌트일 뿐이며 `/members/me` 결과로 재검증한다.

## Figma/API 불일치

| Figma 또는 초안 표현                  | 실제 계약                                     | 구현 결정                                                                        |
| ------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| 대표 이미지 업로드                    | presigned URL 발급 후 스토리지 직접 업로드      | `POST /api/image-uploads` → presigned `PUT` → `representativeImageKey` 연결       |
| 참여자 “내보내기”                     | 참여자 제거 endpoint 없음                   | 액션 제거. 리더 위임만 제공                                                    |
| 프로필/아바타 수정                    | member update endpoint 없음                   | 정보 조회만 제공                                                                 |
| 그룹 즉시 가입                        | 직접 가입 endpoint 없음                       | recruitment registration 흐름으로만 가입                                         |
| 신청 결정 `APPROVE/REJECT` 표기       | 실제 request enum은 `APPROVED/REJECTED`       | 표시 문구는 승인/미승인, payload는 실제 enum 사용                                  |
| 생성/세부 관리의 최종2 frame 부재     | API에는 기능 존재                             | 보조 frame의 흐름을 최종2 token/AppShell로 재설계                                |
| desktop 중심 frame                    | 360/768 frame 없음                            | 정보 우선순위를 유지한 보수적 responsive 규칙을 DESIGN.md에 기록                 |
| final2 header의 full-bleed/inset 혼재 | frame마다 header placement가 다름             | route마다 재현하지 않고 desktop inset/rounded, mobile full-bleed AppShell로 통일 |

## Production 원칙

- production runtime에 mock/fallback 성공 데이터를 넣지 않는다.
- Playwright와 단위 테스트의 network fixture만 허용한다.
- `/api`는 Webpack dev server에서 `http://localhost:8080`으로 proxy한다.
- `/api/images/groups/*`는 사용자 업로드 이미지의 접근 판정 경로이고 `/images/groups/*`는
  CloudFront 서명 URL로만 접근하는 실제 전달 경로다. 기본 그룹 이미지와 회원가입 그림 등 서비스 정적
  이미지는 프론트 배포에 포함하고 `/assets`로 제공한다.
- 기본 그룹 이미지와 회원가입 그림의 원본은 `src/shared/assets/illustrations`에서 관리한다.
  기본 그룹 이미지는 백엔드 공유 미리보기에서도 참조하므로 Webpack에서
  `assets/default-group.png`라는 고정 이름으로 복사하고, import하는 회원가입 그림에는
  콘텐츠 해시를 붙인다.
- 운영은 same-origin reverse proxy 또는 cookie가 유효한 same-site 배포를 전제로 한다.
- GitHub client secret은 어떤 프론트엔드 설정이나 bundle에도 포함하지 않는다.
- 실제 OAuth 완료는 GitHub OAuth 앱의 public client ID, backend client secret, callback URL,
  테스트 가능한 GitHub 계정이 모두 있을 때만 수동으로 검증할 수 있다. 이 저장소에는 그
  자격 증명과 계정이 없다.

### 메인 같이해요 발견성 (#273)

- #273 원본에서는 `/`와 `/groups`가 동일한 `GroupsPage`였다. 비교안의 현재 경로는 아래 조회 분리 절을 따른다. 기존 랜딩 대신 `TodaySessionsHero`를 보여주고,
  `DiscoverySection`을 같이해요, 스터디·동아리 순서로 배치한다. 상단 탐색 바로가기는 생략한다.
- 오늘은 서비스 시간대 `Asia/Seoul` 기준이다. `type=SESSION`, `status=ACTIVE`, `sessionDate`로
  조회한 모든 커서 페이지를 병합한 뒤 시작 시각/ID 순으로 정렬한다. 모집 마감 여부는 오늘 일정에서
  제외하는 조건이 아니다. 날짜가 바뀌거나 탭으로 돌아오면 날짜를 갱신하며 목록은 60초마다 갱신한다.
- 오늘 목록의 캐시 키는 일반 무한 목록과 구분하고, 날짜를 포함한다. 페이지 오류나 잘못된 반복
  커서는 부분 목록을 전체 일정처럼 표시하지 않고 오류로 처리한다.
- 같이해요 목록은 `type=SESSION`, 스터디·동아리 전체 목록은 `excludedType=SESSION`으로 서버에서
  필터링한 뒤 페이징한다. 기존 `type=STUDY|CLUB` 필터도 유지한다. `sessionDate=YYYY-MM-DD`는
  백엔드 목록 API의 선택 조건이다. 배포 시 확장된 백엔드 조회 API가 먼저 준비되어야 한다.
- 각 탐색의 검색/상태/모집/더 보기는 독립적이다. URL의 `sessionKeyword`, `sessionStatus`,
  `sessionRecruiting`은 같이해요, 기존 `keyword`, `type`, `status`, `recruiting`은 스터디·동아리에
  적용한다. 기존 `type=SESSION` 링크는 같이해요 조건으로 해석한다.

- 같이해요 만들기는 `/groups/new?type=SESSION`으로 이동해 유형을 미리 선택한다. 비로그인 사용자도 같은 복귀 경로를 저장한다.

### 오늘의 같이해요 제목과 캠퍼스 조건

- `pages/groups/home/useSessionHeadline.js`: 서울 시간의 아침·점심·오후·저녁·밤 문구를 선택한다.
  판교 위치가 확인된 밤에는 캠퍼스 전용 문구를 우선한다.
- `pages/groups/home/pangyoCampus.js`: 판교 A동 중심과 100m 반경을 기준으로 브라우저 위치의 정확도까지 판별한다.
- `pages/groups/home/usePangyoCampus.js`: 사용자 버튼 클릭 시에만 위치를 요청한다.
  성공 판정은 5분 또는 탭 숨김 시 만료되고, 권한 거부·조회 실패 시 일반 문구를 유지한다.
  좌표를 저장하거나 API/분석 이벤트로 전송하지 않는다. 캠퍼스 IP 판별은 아직 제공하지 않는다.

### 격리된 메인 화면 비교안 (`feat/home-reference-comparison`)

이 브랜치의 `/`는 develop의 소개 문구·이미지를 재사용한 `ExploreHero`와
그 아래 `TodaySessionsHero`, 모집 카드, `ArchiveSection`을 배치한다. `RecruitingSection`이 히어로 내부 검색·유형
필터와 모집 결과의 URL 상태를 함께 관리한다. 앞의 #273 원본 탐색 구성은 참고 이력이며, 비교안의 실제
렌더링은 이 절을 따른다. 원본 작업 서버와 비교 서버는 별도 프로세스다.

- 모집 목록: `status=ACTIVE`, `recruiting=true`, `size=12`; 검색 `homeKeyword`와 유형
  `homeType`(`SESSION|STUDY|CLUB`)을 URL에 저장하고 실제 API의 `keyword`, `type`으로 전달한다.
- 모집 카드는 처음 4개를 보여 주고, 더 보기는 로드된 나머지를 먼저 펼친 다음 서버 cursor를 요청한다.
- 아카이브: 독립 쿼리 `status=ENDED`, `size=4`로 최대 4개를 미리 보여 준다. `전체 보기`는
  `/groups?status=ENDED`로 이동해 종료된 모임 전체를 검색·필터링·페이지 조회한다.
  모집 마감과 모임 종료를 구분한다.
- 소개 히어로 아래 오늘 같이해요는 기존 날짜·위치 동의·티켓·오늘의 일정 동작을 유지한다.
- 검색은 develop의 밑줄형 공통 스타일을 재사용한다. 검색·유형 선택 후 모집 결과로 이동한다.
- 실제 서버 연결과 검증 경계: [비교안 실행 안내](home-reference-comparison.md).

## 대표 화면 비교안의 조회 분리 (2026-09-27)

격리 브랜치 feat/home-reference-comparison에서 `/`는 소개 히어로, 오늘 같이해요,
최대 4개 모집 미리보기와 지난 모임 아카이브를 보여 준다. 모집 제목 오른쪽 전체 보기 링크는
`/groups`로 이동하며 homeType/homeKeyword를 type/keyword로 전달한다.
모집 중인 결과에서 이어 보도록 status=ACTIVE, recruiting=true를 유지한다.

별도 공개 조회 화면 `GroupBrowsePage`는 `/groups`에서 develop의 검색·유형/상태/모집 필터와
size=12 커서 목록을 재사용한다. `/groups/explore`는 검색 조건과 해시를 보존해 `/groups`로
replace 이동한다. 헤더의 홈과 브랜드 링크는 `/home`, 탐색 링크는 `/groups`로 이동하며
각 경로에서 해당 메뉴만 활성화한다. `/groups/:groupId`는 개별 모임 상세 경로로 유지한다.


### 홈·탐색 카드 → 상세 전환

- `app/AppRouter.jsx`는 QueryClient별 data router를 유지하며 `app/routeLoaders.js`가 탐색 첫 페이지와 상세 query를 미리 준비한다.
  탐색 loader와 화면은 `features/group/browseFilters.js`의 URL 정규화와 `infiniteGroupsQueryOptions`의 캐시 키를 공유한다.
  목록 캐시가 있으면 기존 커서 페이지를 바로 사용하며 검색·필터 변경은 loader 대기 없이 화면 query가 처리한다.
- `pages/groups/GroupTransition.jsx`의 `GroupDetailLink`는 출발 history key·카드 종류·모임 ID로 클릭한 카드 하나를 선택한다.
  포인터 진입·키보드 포커스·터치 시작 시 해당 모임 상세 query를 미리 가져온다.
  `group-transition.css`는 대표 이미지와 상세 hero를 native View Transition으로 연결한다.
- `GroupDetailPage`의 목록 링크와 `ScrollRestoration`이 필터·스크롤을 복원한다. 상세 내부 탭은 origin state를 유지한다.
  `TodaySessionsHero`는 history에 보관한 캐러셀 index로 초기 배치한다. 수정키 클릭은 기존 브라우저 동작을 유지한다.
