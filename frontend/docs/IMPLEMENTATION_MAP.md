# 자리하나 프론트엔드 구현 매핑

## 오목 관전

- 회원 전용 `/games/gomoku/rooms/:roomId/watch`는 명시적 관전 입장 API를 호출한 뒤 기존 판/SSE/채팅을 재사용한다. 기존 본인 방은 참가자로 돌아가며 다른 방 참가 중에도 관전한다.
- `useGomokuObservation`은 회원/방별 탭 저장소에 requestId와 participationId를 보존한다. Web Locks로 복제된 탭의 키 충돌을 분리하며 새로고침은 기존 입장 기준을 복구한다. 명시적 퇴장은 성공 후 저장소를 비우고 이동하며 실패 시 화면과 입장을 유지한다.
- "관전 나가기"가 성공하면 `BroadcastChannel`로 같은 브라우저의 회원/방이 같은 관전 탭에 알린다. 알림을 받은 탭은 자기 입장을 종료한 뒤 대기실로 이동한다. 화면 상단의 "대기실"은 누른 탭의 입장만 종료한다. [프론트엔드 ADR 0005](adr/0005-gomoku-observation-tab-leave.md)
- 관전 상세/SSE와 최초/후속 채팅 조회에 participationId를 전달한다. 클라이언트뿐 아니라 서버에서도 참가자 명령을 거절한다. 보드 좌표 선택/준비/시작/기권/초대/착수 버튼을 제공하지 않는다.
- 차례는 흑돌/백돌, 결과는 승자/무승부로 표시한다. 결과와 재대결은 같은 입장과 대화로 유지하며 CLOSED는 마지막 상태를 보여주고 전송/재연결을 중단한다.
- 채팅의 senderRole을 기준으로 "[관전자] 이름"을 표시한다. 기존 원문 마스킹과 고정 action을 유지한다. 서버의 입장 순번 이후만 조회하며 실제 퇴장 후 재입장은 새 대화부터 시작한다.
- 서버의 45초 접속 lease와 5초 목록 갱신에 따라 인원수가 반영된다. 같은 회원의 여러 연결을 중복 제거하고 참가자는 제외한다. API 상세는 [관전 계약](../../backend/docs/context/api/endpoints/gomoku-observation.md)을 따른다.


## 오목 게임방 채팅

- `features/gomoku/chatApi.js`는 전용 API와 문자열 순번 계약을 소유한다. 모임 채팅 목록/읽음 캐시와 합치지 않는다.
- `useGomokuRoom.js`는 기존 연결에서 chat_changed를 수신한다. 판 revision과 채팅 순번을 분리하고 채팅 오류가 착수 요청 상태를 잠그지 않게 한다.
- `useGomokuChat.js`는 참가 회차, 확정 메시지, 전송 중/실패 메시지와 복구 커서를 관리한다. 최초 최신 50건과 모든 이후 복구 페이지를 조회하고 SSE/reconnect/online/화면 활성 복귀를 복구 계기로 사용한다. 과거 조회는 별도 커서다.
- POST 응답과 복구 결과를 병합하고 저장 확인이 오면 실패 표시를 제거한다. 재시도에 원문과 UUID를 유지하며 계정/화면 이탈에 요청과 캐시를 정리한다. 종료 시 이미 받은 대화만 남기고 입력을 막는다.
- `GomokuChat.jsx`는 기존 대국 카드의 가운데 위치를 보존한 오른쪽 패널과 80rem 미만 공통 Modal을 제공한다. 모바일이 닫혀도 수신하고 새 메시지를 표시한다. Enter/Shift+Enter와 IME, Escape/포커스 복귀, 스크롤 보존을 지원한다.
- API가 GOMOKU_CHAT_DISABLED를 반환하면 채팅을 숨긴다. 실서버 계약은 [게임방 채팅](../../backend/docs/context/api/endpoints/gomoku-chat.md), 기본 비활성/활성화는 [운영 가이드](../../backend/docs/operations/gomoku-chat.md)를 따른다.
- 같은 분에 연속된 말풍선은 묶음 안의 간격을 줄인다. 과거 조회는 기존 말풍선의 상대 위치를 기준으로 스크롤을 보정하고 최근 이동/전송 시 이전 기준을 해제한다. SSE 수신과 과거 페이지 응답이 겹치는 경우를 브라우저 테스트로 검증한다.


## 모임 채팅 구현

- 헤더 채팅 아이콘은 모든 방의 `unreadCount` 합계를 표시하며 100개 이상은 `99+`로 줄인다. `ChatSessionProvider`가 로그인 세션당 웹소켓 하나를 유지하며 헤더와 모달은 같은 방 캐시를 사용한다. 인증 상태 변경 시 라우터와 페이지는 유지하고 채팅 세션만 교체한다. 모달이 닫혀 있어도 메시지·읽음 이벤트를 즉시 반영하고, 방 열기·이동·닫기는 연결을 다시 만들지 않는다. 30초 동기화와 재연결·화면 복귀 동기화는 누락 복구용이다. 현재 최신 대화를 보고 있는 방은 읽음 응답 대기 중에도 합계에서 제외한다. 로그아웃·계정 전환 시 연결과 세션 캐시를 정리한다.
- 헤더의 자리 만들기 다음에 채팅 아이콘을 배치하며 알림 버튼과 크기·색을 공유한다. 채팅 목록은 목록 API의 `representativeImageUrl`을 공통 `GroupImage`로 표시한다. 종료된 방은 회색 썸네일과 종료 배지로 구분한다.
- 방 이동은 `ChatLink`의 router View Transition과 `chat-panel` snapshot으로 전환한다. 채팅이 열리면 배경 모임 상세의 named snapshot을 제외해 상세 진입 애니메이션이 겹치지 않게 한다. 모바일 목록/방도 같은 snapshot을 사용하고 reduced-motion에서는 애니메이션을 생략한다. 미선택 영역에는 실제 모임 사진과 선택 안내만 제공하며 재조회는 오류가 있을 때 표시한다.
- 목록은 마이페이지 카드처럼 왼쪽 대표이미지가 카드 높이를 채우고 본문을 세로 중앙에 배치한다. 기존 채팅 정보는 유지한다. 선택과 호버는 그림자로 표시하고 활동 중 방의 흰 배경과 종료된 방의 회색 배경을 유지한다. 글자 크기는 사이트 공통 토큰을 사용한다. 데스크톱 모달의 바깥 여백을 유지하며 대화 본문은 최대 너비 제한 없이 좌우 space-3으로 채운다.

- 헤더와 현재 구성원의 상세 화면 사이드바 링크에서 현재 페이지 위의 채팅 모달을 연다. 좁은 화면에서는 기존 모집 정보 액션 영역에 채팅 링크를 표시한다. 탭 행과 마이페이지 모임 카드에는 별도 채팅 링크를 두지 않는다. URL의 `chat=inbox|모임ID`로 선택 상태를 공유하며 배경 페이지의 검색 조건과 스크롤을 유지한다.
- 데스크톱은 중앙 모달, 모바일은 전체 화면 모달이다. 닫기·Esc·배경 클릭으로 닫는다. 대화 상단의 모임명·참여자 영역은 `/groups/:id` 상세 링크이며 이동 시 채팅을 닫는다. 별도 모임 정보 창은 제공하지 않는다. 입력은 기본 한 줄에서 내용에 따라 높이를 늘리고 접근성 레이블을 숨긴다. 기존 `/chat`, `/chat/:roomId` 링크는 `/home` 위의 모달로 연결한다.
- `entities/chat`는 ID·sequence를 10진 문자열로 검증한다. `features/chat`는 공통 API client/React Query와 STOMP 7.5.0을 사용한다.
- HTTP/이벤트 계약: [채팅 구현 계약](../../docs/chat-implementation-contract.md). 메시지는 원문을 유지하며 실패 재시도에도 같은 UUID를 사용한다.
- 최초 snapshot 이후 연속 이벤트만 복구 커서를 전진시킨다. 순번 누락·RESYNC·재연결·온라인/활성 복귀·활성 화면 30초 주기에 모든 catch-up 페이지를 조회한다.
- 목록 페이지는 모임 생성 시각·ID 기준으로 끝까지 조회하고 화면에서 최근 활동순으로 정렬한다. 메시지 수신으로 조회 커서가 움직이지 않는다.
- 전송 실패는 해당 말풍선에 표시한다. HTTP 응답·소켓·REST 복구 중 저장 확인이 도착하면 그 메시지의 실패 표시와 재전송 버튼을 제거한다.
- 연속 메시지와 읽음 이벤트는 캐시를 직접 갱신한다. 매 메시지마다 전체 목록을 다시 조회하지 않는다. 늦은 목록 응답은 최신 메시지·읽음·종료 상태를 되돌리지 않는다.
- 재연결 전에 `/members/me`를 통해 기존 single-flight HTTP 갱신을 수행한다. 인증 사용자가 바뀌면 인증을 다시 불러오며 로그아웃/계정 전환 때 소켓·요청·채팅 캐시를 정리한다.
- 과거 이력 추가 조회, 전송 실패 재시도, 연결 복구, 종료된 방과 접근 불가 상태를 표시한다. 실제 브라우저/두 서버 검증은 단위 테스트 결과와 구분한다.

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

- 공통 헤더의 주요 메뉴는 `자리`, `토론하나?`, `게임하나?`다. 홈은 로고로 이동한다. `자리`는 hover/click/키보드로 열리는 세로 disclosure이며 `뭐있나?`는 `/groups`, `뭐했나?`는 `/activities`, `뭐할래?`는 `/board`로 이동한다. 모바일 drawer에서는 같은 목록을 클릭으로 펼친다. 설명에도 `자리` 용어를 사용하며 기존 라우트, 권한과 링크 action 식별자는 유지한다.
- 자리 하위 항목의 장식은 돋보기/사진/말풍선이 있는 입체 의자 이미지다. `app/headerChairAssets.js`에서 `APP_DEPLOY_ENV=production`이면 prod, 나머지는 dev S3의 `images/header-chairs/` URL을 직접 참조한다. 이미지 파일은 저장소에 두지 않으며 투명 PNG를 36px로 표시하고 이름과 설명, 링크 동작은 유지한다.

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
| `/activities`                                                       | 공개 (댓글과 반응은 회원) | `GET /api/activity-posts`, 활동 기록 작성, 수정, 숨김 API, 댓글 조회, 작성, 숨김과 하트 반응, 반응한 회원 커서 조회(30명씩) API | AppShell, ActivityPostBoard, PolaroidCard, ActivityPostDetail(Modal), ActivityReactionBar, infinite cursor list | loading, empty, error, public/mine filter, image upload and public-visibility notice, 상세의 댓글 loading, empty, error, 더 보기, 비로그인 로그인 안내 후 `?post=` 복귀, 알림의 `?mine=true&post=` 진입과 최대 5페이지 이어 찾기, 사진 크게 보기 |
| `/groups/:groupId`                                                  | 그룹 정보, 공지 목록, 달력 제목·날짜·시각은 공개; 일정 상세는 그룹원 | 그룹 상세, 모집·참여자·활동 기록, 공지 목록, `/api/groups/{groupId}/calendar`와 그룹원 일정 상세 API | DetailLayout, Tabs(소개·캘린더·활동 기록·참여자·공지), GroupCalendarTab, GroupAnnouncementTab, InfoRow, RecruitmentCard, PersonRow, ActivityPostBoard | loading, empty section, cursor, leader announcement creation, calendar range/error, 403, 404, 409 conflict, network |
| `/groups/:groupId/announcements/:announcementId`                   | 공개 범위에 따라 전체 공개 또는 현재 모임원 | 공지 상세 조회·수정·숨김 | PageContainer, AnnouncementDetailPage, plain text article, AnnouncementFormDialog, ConfirmDialog | loading, 404 for missing/private notice, retryable network error, list return, manager actions |
| `/board` | 공개 (함께하고 싶어요는 회원) | `GET /api/proposals`, `PUT/DELETE /api/proposals/{proposalId}/interest` | AppShell, ProposalBoardPage, 분야 필터, 제안 카드, infinite cursor list | loading, empty(전체, 분야별), error와 다시 불러오기, 분야를 `?category=`로 유지, 카드의 함께하고 싶어요 낙관적 토글과 실패 시 서버 값 복원, 비로그인 로그인 안내 후 `/board` 복귀 |
| `/board/new` | 회원 | `POST /api/proposals` | ProposalCreatePage, 분야 칩, TextField, Textarea, 분위기 선택지 0~3개를 칩으로 입력(Enter나 쉼표 뒤 띄어쓰기로 더하기, 빈 입력에서 Backspace로 마지막 칩 지우기, 한글 조합 중 Enter는 조합이 끝난 뒤 더하기) | 필드 검증과 첫 오류 포커스, 서버 오류, 작성 중, 성공 시 상세로 replace 이동 |
| `/board/:proposalId` | 공개 (응답과 코멘트는 회원) | 제안 상세, 응답 저장과 취소, 코멘트 조회, 작성, 숨김과 제안 숨김 | 새 페이지 상세, 조건 칩 응답 패널(1024px 이상 sticky 오른쪽 rail, 미만은 본문 바로 아래), 모인 조건 요약 칩(가장 많이 고른 선택지, 마우스를 올리거나 누르면 선택지별 인원 드롭다운), 코멘트 | loading, 404(지운 제안), error, 비로그인 안내, 마음만 보낸 응답의 조건 더하기, 응답 고치기와 취소, 목록에서 왔으면 뒤로 가기로 분야와 스크롤 복원 |
| `/sparring` | 공개 (주제 생성은 회원) | 토론 목록·검색, 마감일과 대표 이미지가 있는 주제 생성 | 소개 히어로, 진행 토론 가로 목록, 마감 토론 결과, 단계별 생성 모달 | loading, empty, error, 로그인 안내, 이미지 업로드 실패 |
| `/sparring/:topicId` | 공개 (투표와 의견은 회원) | 토론 상세, 투표, 의견, SSE 최신 30개 초기화·추가 글 본문 수신 | 3D 캡슐 경기장, 캐릭터 말풍선 입력과 지난 대화 재생 | loading, 연결 상태, 인증 안내, 저장 실패, 마감 |
| `/groups/:groupId/recruitments/:recruitmentId`                      | 조회 공개, 신청은 회원 | 모집 상세, 신청 생성/철회                | DetailLayout, RecruitmentPanel, Modal, Toast                         | closed/ended, validation, 401, 403, 404, 409, mutation pending/success/failure   |
| `/oauth/callback`                                                   | 공개                   | `GET /api/members/me`                    | CenteredStateLayout                                                  | callback loading, invalid callback, signup required, authenticated, 401, network |
| `/invitations/:invitationId` | 상세는 지정 대상 또는 발급자 회원 | 초대 ID 상세·수락 | PageContainer·Card·상태 컴포넌트 | 로그인/가입 필요, 대상 불일치, 만료/취소/종료, 수락 중/결과/재시도 |
| `/invitations/link/:token` | 공개 조회·회원 수락 | 공개 초대 미리보기·token 수락 | PageContainer·Card·상태 컴포넌트 | 공개 소개, 인증 복귀, 잘못된 주소, 만료/취소/종료, 중복 합류 |
| `/signup`                                                           | 가입 세션              | 내 정보 조회, 회원 생성                  | 첫 화면 유형 카드(부트캠프, 회사), 단계별 질문, FormField, Select, Checkbox | 단계별 validation, 우아한테크코스 크루 인증 진입, server validation, missing session, 409, pending/success/failure |
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

### 자유게시판 모임 제안 (2차 시안 A안)

- 목록은 1차 1번 카드 목록을 따르고, 글은 모달 대신 `/board/:proposalId` 새 페이지로 연다. 상세는 1차 3번 조건 맞추기를 따른다.
- 응답 조건은 시간 4개와 진행 방식 2개가 모든 제안에 같고, 분위기 선택지만 제안자가 작성 때 0~3개 정한다. 조건은 모두 비워도 된다.
- 목록의 함께하고 싶어요는 조건 없는 응답을 보내고, 상세에서 조건을 더하거나 고친다. 같은 회원의 응답은 하나다.
- 상세의 모인 조건은 조건마다 가장 많이 고른 선택지 하나(동률이면 함께)만 칩으로 보인다. 칩의 아래 화살표와 손가락 커서로 더 볼 수 있음을 알리고, 마우스는 올리면 열리고 누르면 고정되며 터치는 누를 때 열고 닫는다. Esc와 바깥 누르기로 닫는다.
- 응답은 모임 신청이 아니다. 화면 문구로 이를 알리고 그룹 소속이나 모집 신청을 만들지 않는다.
- 서버 계약: [자유게시판 모임 제안 API](../../backend/docs/context/api/endpoints/proposals.md). `entities/proposal`이 응답을 검증하고 `features/proposal`이 공통 API client와 React Query로 호출한다.
- 이번 범위 밖: 제안 수정, 관심 많은 순 정렬, 알림, 분석 성공 이벤트. 클릭 식별자는 [분석 문서](analytics.md#자유게시판-모임-제안)를 따른다.

## 실제 API 계약 요약

### 모임 공지 기능

공지 탭은 공개 모임 상세에 표시한다. 로그인 여부와 현재 모임원 여부에 따라 백엔드가 반환한 목록만 보여 준다. 비회원은 전체 공개 공지만 확인하고, 비구성원은 전체 공개와 본인이 작성한 모임원 공개 공지를 확인하며, 현재 모임원은 두 공개 범위를 모두 확인한다. 목록과 상세 응답은 viewer membership에 따라 달라져 서버에서 `Cache-Control: no-store`를 사용한다.

- 방장은 ACTIVE 모임에서 공지 탭의 `공지 추가`를 눌러 모달을 연다. 제목과 일반 텍스트 본문을 입력하고 `MEMBERS` 또는 `PUBLIC` 공개 범위를 선택한다. 종료된 모임에는 작성 UI를 숨기고 서버도 등록을 거부한다.
- 현재 모임장 또는 공지 작성자는 ACTIVE 모임에서 상세 페이지의 수정·삭제를 사용할 수 있다. 수정은 제목·본문·범위를 모두 갱신하고 알림을 다시 보내지 않는다. 삭제 확인 후에는 `deletedAt`으로 숨기며 알림 이력은 보존한다.
- 목록은 `GET /api/groups/{groupId}/announcements?size=20&cursor=...`로 최신순 cursor 조회를 한다. 다음 페이지 오류는 기존 목록을 유지하고 다시 불러올 수 있다.
- 공지 상세는 `/groups/:groupId/announcements/:announcementId`의 공개 URL이다. 본문은 Markdown을 해석하지 않고 개행을 보존한다. 목록으로 돌아갈 때 `/groups/:groupId?tab=announcements`를 연다. MEMBERS 공지는 다른 비구성원이 상세 URL을 알아도 API 404를 받아 본문을 표시하지 않는다. 작성자는 탈퇴 후에도 본인이 작성한 공지를 확인하고 관리할 수 있다.
- 로그인 상태에서 공지 목록·상세를 요청하기 직전에는 `GET /api/members/me`로 세션을 확인한다. 공개 공지 API는 만료된 Access Token을 401로 드러내지 않으므로, 기존 API client의 401 재발급·재시도 흐름을 먼저 거쳐 MEMBERS 범위가 올바르게 조회되도록 한다. 인증 bootstrap이 끝날 때까지 공지 조회를 시작하지 않는다.
- 등록 성공 시 현재 목록을 다시 조회하고 공지 탭에 머문다. 수정 성공 시 상세와 목록을 다시 조회한다. 삭제 성공 시 공지 목록으로 돌아간다. 알림함/푸시 알림은 작성자를 뺀 현재 모임원에게만 생성되며, 알림 클릭은 본인 알림 확인·읽음 처리 후 공지 상세 URL로 이동한다. 모임이 종료된 뒤에도 기존 공지는 계속 읽을 수 있다.
- 작성 요청·응답과 목록·상세 schema는 [백엔드 공지 API 계약](../../backend/docs/context/api/endpoints/announcements.md)을 따른다. UI 입력과 공지 텍스트는 세션 녹화에서 `data-ph-private`로 가린다.

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
| `/notifications/open/:id` | 본인 알림의 회원 | 본인 알림·초대/공지 대상 조회·읽음 | 로그인 복귀·잘못된 계정·없는 대상·현재 상태 안내 |
| 모임 공지 작성 | 현재 모임장, ACTIVE 모임 | `POST /api/groups/{groupId}/announcements` | 제목·일반 텍스트 본문·MEMBERS/PUBLIC 범위, pending·validation·409·403 |
| 모임 공지 수정·숨김 | 현재 모임장 또는 해당 공지 작성자, ACTIVE 모임 | `PUT`/`DELETE /api/groups/{groupId}/announcements/{announcementId}` | 수정 성공 후 재조회, 삭제 확인·목록 복귀, 403·404·409 |
| 모임 공지 목록 | 공개; 비구성원은 PUBLIC 및 본인 작성 MEMBERS 공지 | `GET /api/groups/{groupId}/announcements?size=20&cursor=` | 최신순 목록, cursor, 로딩·빈 결과·재시도 |

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
- 회원가입 첫 화면은 부트캠프와 회사 두 장 카드다. 이후 한 화면에 질문 하나씩 묻는다. 부트캠프는 캠프, 수강 상태, 분야, 닉네임을, 회사는 직무, 연차, 닉네임과 선택 회사명을 묻는다. 부트캠프 목록에서 우아한테크코스를 고르면 '우테코 크루 인증' 버튼을 거쳐 기존 크루 입력(크루 이름, 과정, 기수)으로 이어진다. 크루 인증 방법이 정해지기 전까지 이 버튼은 크루 입력으로 바로 넘어간다. 코치 선택지는 없다.
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

알림 API의 목록·상세·안 읽은 수·전체 읽음과 SW 푸시 내용 조회는 `clientVersion=2`를 전송한다.
공지 알림(`GROUP_ANNOUNCEMENT_CREATED`)은 target에 `kind: GROUP_ANNOUNCEMENT`, `groupId`, `announcementId`를 가진다. 알림함 본문은 `새 공지`와 모임 이름, 푸시 본문은 `모임에 새 공지가 등록되었어요.`다. 작성자를 제외한 현재 모임원에게 알림을 저장한다. 선행 호환 버전(#490)은 공지 알림을 해석해 모임 상세로 보내며, 공지 기능 버전(#459)은 `/notifications/open/:id`에서 본인 알림과 현재 공지 공개 범위를 확인한 뒤 읽음 처리하고 `/groups/:groupId/announcements/:announcementId`로 이동한다.

기존 계약에는 백엔드가 공지 알림을 제외해 목록·커서·카운트를 유지하고 전체 읽음도 공지를 건드리지 않는다. 상세와 푸시 내용도 기존 클라이언트에는 노출하지 않는다. 클라이언트 계약은 인증·구독 소유권·공개 범위 검사를 대신하지 않는다.

구독 등록의 `clientVersion`은 별도로 실제 활성 SW에 GET_STATE 메시지를 보내 확인한다.
새 SW는 응답에 2를 포함하고 구버전 SW의 필드 누락은 1로 전송한다. 설치·대기 중 SW는 기준으로 삼지 않는다.
서버는 2인 구독에만 공지 푸시를 보내며, 기존 구독은 기본 1이므로 사이트를 다시 열지 않은 구버전 SW에도 공지를 보내지 않는다.


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
- `GROUP_ANNOUNCEMENT_CREATED` 알림은 작성자를 제외한 현재 모임원에게 저장한다. 알림함·푸시 클릭은 `/notifications/open/:id`에서 본인 알림과 공지 상세 권한을 확인하고, 공개 범위 통과 후 읽음 처리한 뒤 `/groups/:groupId/announcements/:announcementId`로 이동한다. 탈퇴한 회원이나 비회원에게 다른 작성자의 MEMBERS 공지 본문은 노출되지 않는다. SW는 payload에 들어 있는 URL을 사용하지 않고 공통 알림 확인 경로로 연다.
- 알림함과 푸시 클릭은 `/notifications/open/:id`를 공유한다. 새 신청은 `/groups/:groupId/manage/registrations`, 새 참여는 `/groups/:groupId/manage/members`, 승인은 `/my?focusGroup=:groupId`, 모든 미승인은 `/my?registrationStatus=REJECTED&focusRegistration=:registrationId`로 이동한다. 관리 화면은 현재 모임장 여부를 확인한다. 관리 대상 조회 403/404는 읽음 처리 없이 안내한다. 승인·미승인은 읽음 처리 후 목록 캐시를 갱신하고 마이페이지로 이동한다. 해당 유형/미승인 탭을 선택하고 다음 페이지도 조회하여 정확한 카드에 스크롤·키보드 focus·3초 강조를 적용한다. 대상이 없으면 안내하며 reduced-motion에서는 즉시 스크롤한다. 이전 백엔드의 승인 알림 `GROUP_DETAIL` 응답도 프론트 API 경계에서 `MY_GROUPS`로 변환해 같은 카드 강조 경로를 사용한다. 알림함 본문에는 현재 모임 이름과 사건 내용을 표시한다.
- 이 브라우저 push setting은 명시적 동작에 따른 권한 요청/등록/해제. iPhone·iPad의 일반 브라우저는 홈 화면 설치 안내를 표시한다. 설치 이벤트를 제공하는 브라우저는 설치 버튼을 표시한다.
- 홈(`/`)에 진입하면 모바일에서 PWA 설치·알림 설정 가이드를 모달로 자동 표시한다. 기기 탭 안에서 브라우저를 선택하며, iOS는 Chrome·Safari, Android는 Chrome·삼성 브라우저를 제공한다. iOS는 실제 화면 이미지로 구성된 5단계 안내를 제공하고 Safari는 첫 공유 화면만 전용 이미지로 사용한 뒤 나머지 단계를 공유한다. Android Chrome은 Chrome 메뉴의 `설치 및 바로가기 만들기`와 설치 선택 화면을 전용 이미지로 안내한다. 2단계에서 `설치` 또는 `홈 화면에 추가`를 고른 뒤 삼성 브라우저와 같은 설치 후속 경로와 공통 푸시 설정 단계를 이어서 사용한다. 삼성 브라우저는 `현재 페이지 추가` 뒤 `웹 앱으로 설치` 경로와 `홈 화면 추가` 경로 중 하나를 따라가며, Play Protect 확인과 푸시 설정 화면은 해당 단계 이미지를 사용하고 목록 버튼·종·푸시 설정 화면은 iOS 이미지를 재사용한다. Samsung Browser로 접속하면 Android 삼성 브라우저 탭을 기본 선택한다. `7일간 보지 않기`는 만료 시각을 브라우저 localStorage에 저장한다. 로그인한 계정에 `GET /api/push-subscriptions` 기준 `enabled=true`인 활성 구독이 있으면 자동 표시하지 않으며, 계정·구독 확인이 실패한 경우에도 팝업을 보류한다. 닫기만 한 경우 홈에 다시 진입하면 다시 표시할 수 있다. 푸터와 알림함의 `설치 안내 보기`에서 수동으로 다시 열 수 있다. 이미지는 공개 S3 URL `https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/jarihana-dev/images/push-guide/`의 브라우저별 하위 경로에서 직접 불러온다. 서비스 도메인의 `/images/push-guide/`는 403을 반환하므로 사용하지 않는다. 원본 객체는 `s3://techcourse-project-2026/jarihana-dev/images/push-guide/`에 둔다.
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

- 피드백 모달은 가입을 완료한 로그인 회원만 제출할 수 있다. 비로그인 사용자가 우측 하단 헤드셋 버튼으로 피드백을 선택하면 로그인 안내 모달에서 `로그인하러 가기` 또는 `취소`를 선택한다. 로그인을 진행하면 현재 경로를 복귀 대상으로 저장하고, 인증 완료 후 피드백 모달을 자동으로 연다. `POST /api/feedbacks`에는 `content`만 보내며, 서버는 인증 회원 ID를 `member_id`로 저장한다.

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

## 스파링 서비스 통합 (2026-10-29)

- `physics.js`는 축에 정렬된 탱크 벽과 캡슐이 닿을 수 없는 경우만 정밀 충돌 계산 전에 제외한다. 가능한 접촉과 회전한 벽은 기존 Cannon 계산에 전달하며, 240개 캡슐·120Hz 물리 계산·접촉 처리 순서·마찰·발사·충격파 값은 유지한다. `history-conversation.js`는 말풍선 크기를 재사용하고 글·시간 표시·선택·인원·화면 너비·폰트·실제 요소 크기 변경 시 다시 측정한다. 주변 UI 위치는 쓰기 전에 모아서 읽고 겹침 허용 모드에서는 사용하지 않는 장애물 측정을 생략한다. 머리 위치 추적·겹침 회피·집게 회피는 매 프레임 유지하며, 이 최적화는 리플레이 큐와 애니메이션 시계를 바꾸지 않는다.
- `/sparring`: 공개 서버 목록/검색/필터/이전 페이지, 로그인 후 주제 등록 모달
- `/sparring/:topicId`: 공개 투표 현황·캡슐 경기장·영구 의견. 회원 편 선택 후 POST 의견/받아치기
- `src/features/sparring/api.js`: 공통 API client + Zod 응답 검증
- `useArenaBridge.js`: 인증/HTTP/SSE, 최초·재연결 시 최근 30개 캐시 갱신, 추가 메시지 전체 수신, ID 중복 제거, 출처/스키마 검증. 과거 재생 페이지·편별 커서와 버퍼는 최근 캐시와 별도로 보존한다.
- iframe의 검증된 `history` 메시지는 마지막으로 받은 페이지 번호를 확인한 뒤 최대 30개를 전달한다. 민트·코랄을 `side`별로 30개씩 최신순 조회하고 민트→코랄 순서로 번갈아 합친다. 한 편을 다 보면 남은 편을 이어가며 두 편 모두 끝난 뒤에만 다음 순환을 시작한다. 최초 SSE 최대 ID를 `throughId` 상한으로 고정하고, 다음 순환부터 그때까지 확인한 최대 ID(본인 글 저장 확인 포함)로 갱신해 순회 중 들어온 글이 과거 목록에 끼어들지 않게 한다. 최초 최근 목록도 과거 재생에 포함한다.
- 요청 중복을 막고 숨긴 탭에서는 추가 조회를 멈춘다. 실패는 1~30초 간격으로 같은 편·커서를 재시도하며 이미 받은 편의 버퍼와 조립 중인 재생 순서를 보존한다. 응답의 편·상한·내림차순 또는 커서 진행이 잘못되면 조회를 중단한다.
- `replay-queue.js`는 접속 후 새 글 2:지난 글 1로 재생하고 새 글 대기열이 비면 모든 차례를 지난 글에 준다. 과거 버퍼가 2개 남으면 다음 묶음을 미리 받으며, 새 글·SSE 재연결은 과거 재생 위치를 바꾸지 않는다. 일반 글과 받아치기가 같은 새 글 차례를 사용한다. 현재·선택한 과거 말풍선은 최근 30개 캐시에서 빠져도 조회·받아치기할 수 있다.
- `SparringEntry.jsx`: HTTP 주제 응답부터 VS 입장 화면에 실제 편명을 표시한다. 임시 편 선택 → 시작 시 저장 → SSE/첫 3D 프레임 준비 → 패널 열림 순서다. 첫 입장에서 시작 버튼 클릭 즉시 `SparringEntryGuide.jsx`의 `입장 중…` 모달로 받아치기·끌어치기를 최소 3초간 안내하며 저장과 SSE/첫 3D 프레임 준비를 병행한다. 준비가 늦으면 안내를 유지하고 저장 실패·로그인 이동 시 닫으며 재시도 때 3초를 다시 센다. 안내를 완료한 브라우저의 재입장에서는 모달과 3초 대기 없이 저장과 준비가 끝나면 기존 패널 열림으로 입장한다. 구경하기·마감 결과 보기는 안내 대기를 추가하지 않는다. 시작 버튼의 공통 `ui-spinner`·`aria-busy`도 유지한다. 기존 편 복원·재투표 생략, 비로그인 복귀, 마감 결과 보기와 투표 없는 구경하기를 지원한다. 입장 투표는 `useArenaBridge.selectSide`를 통해 iframe 투표·의견과 같은 저장 큐를 사용한다.
- 숨겨져 있던 전체·내 대화 목록과 이전 대화 더 보기 UI 및 전용 조회 명령은 제거했다. 최근 대화 재생과 선택한 메시지 받아치기는 유지한다.
- `public/sparring-arena`: 기존 물리 연출을 보존한 같은 출처 iframe. 인증 토큰을 전달하지 않는다
- 마당의 커스텀 잡기·호버·던지기 안내는 제거했다. 조작 안내는 `SparringEntryGuide.jsx`와 `sparring-entry-guide.css`의 입장 모달에 모으며, 실제 집기·던지기와 받아치기 cue는 유지한다. 안내 완료 여부는 `jarihana.sparring.entry-guide-seen`에 저장한다. 오류·로그인 이동·입장 전 이탈은 완료로 기록하지 않는다. 터치 환경에서는 끌어치기 안내를 숨긴다.
- `history-conversation.css`의 밀집 상태는 말풍선 미리보기만 줄이며 `받아치기?` 문구를 숨기지 않는다. `history-conversation.js`는 패싸움 입장 기준을 앞쪽으로 0.8, 뒤쪽 이동·착지 경계를 1.4 옮겨 미끄럼틀 출구를 비우며 카메라와 앞쪽 경계는 유지한다.
- 잡은 인물을 휙 움직이며 놓으면 최근 120ms 안의 마우스 방향·속도로 0.42~0.60초 동안 포물선을 그린 뒤 마당 안에 착지한다. 정지 후 놓기·천천히 놓기·키보드 놓기는 기존 0.34초 낙하를 유지한다. 순간 속도와 착지점을 제한하며, 비행 뒤 0.20초 철푸덕·먼지·0.60초 일어나기를 마치면 원래 활동으로 돌아간다. 캐릭터와 말풍선 어느 쪽으로 집어도 같은 동작이며 취소·모션 감소에서는 던지지 않는다.
- 말풍선은 클릭·Enter/Space로 받아치기를 유지하고, 누른 채 6px 이상 드래그하면 해당 캐릭터를 집는다. 말풍선에 마우스를 올리거나 드래그 전 누른 상태만으로 인물을 정지시키지 않는다. 드래그를 마친 클릭은 받아치기로 전달하지 않는다. 잡힌 인물의 발버둥 팔다리와 떨림 주기는 기존보다 2배 빠르며, 의자 대기·던지기·비행·충격과 발버둥 시작 보간·착지 시간은 유지한다.
- `character-grab.js`는 마당 캐릭터의 포인터 캡처·키보드 집기를 처리한다. `history-conversation.js`는 기존 인물·말풍선을 재사용하며 잡힌 인물의 전투 이동을 제외하고 `held-reactions.js`의 `struggling` 공중 달리기 반응을 재생한다. 맨손 인물은 잡히면 바로 발버둥 친다. 의자 인물은 집기 시작 후 0.7초 대기하고 0.45초 동안 준비해 한 번 던지며, 이어지는 0.85초 비행이 끝날 때까지 발버둥 없이 `chair-throw`로 표시한다. `chairFlight.target=camera`에 `scene.js`가 현재 카메라를 전달하고, `chair-characters.js`는 놓인 손 위치와 카메라 목표를 저장해 기존 의자 메시를 독립적으로 날린다. 의자가 화면 중앙으로 커지며 다가왔다가 사라지면 0.18초에 걸쳐 양손 발버둥을 부드럽게 시작한다. 원근 구도에서는 실제 깊이를 이동하고 정사영 구도에서는 배율도 늘려 같은 가림 효과를 낸다. 비행 94% 시점의 충돌부터 `cameraShake`가 0.28초 동안 감쇠하는 픽셀 변위를 전달한다. `scene.js`는 전경과 마당이 공유하는 렌더 카메라의 view offset에만 적용해 기본 구도·집기 좌표를 유지한다. 신호 종료·집기 해제 시 복구하며 일시정지·모션 감소에서는 적용하지 않는다. 포인터 이동 속도·방향 반전으로 흔들기 강도를 올리고 시간 기반 감쇠·보간으로 가라앉힌다. 강도에 따라 교차하는 팔·무릎과 몸의 반응, 올라간 눈썹·커진 눈·둥근 입 표정을 바꾼다. `airRun`은 공중에 들린 인물의 고관절과 무릎에만 적용한다. 의자 소유와 작성자는 유지한다. 놓으면 0.34초 가속 낙하·구르기, 0.20초 엎어진 충격 자세, 0.60초 일어서기를 거쳐 기존 격투나 착석 동작으로 복귀한다. 접지 시 재사용하는 DOM 먼지 여섯 개를 0.52초 동안 표시하며 별도 타이머 대신 기존 애니메이션 시계를 따른다. 약 1.14초의 착지 과정이 끝날 때까지 인물 교체와 새 집기를 막는다. 모션 감소에서는 정지 자세를 사용하고, 모션 감소·집기 취소 시 착지 연출을 생략한다. 새 입장은 대기시키고 잡힌 인물의 말풍선은 `data-grabbed`로 불투명하게 표시한다. `scene.js`는 집은 인물의 화면 좌표를 카메라와 평행한 평면으로 역투영해 말풍선 위의 전용 캔버스에 화면 높이 기준 약 160~200px를 목표로 확대해서 그리며, 놓을 때만 바닥 평면으로 투영한다. 호버에서 집기로 넘어갈 때 현재 표시 프레임을 시작점으로 위치·크기·방향을 0.22초 동안 보간하고, `walking-characters.js`의 `hangBlend`로 관절과 머리 고정점을 함께 전환한다. 전용 렌더러는 첫 집기·포커스 때 생성하고 인물이 없으면 렌더링하지 않는다. `pose.focused`로 선택한 한 인물도 같은 렌더러로 올려 발판·일반 캐릭터에 가리지 않게 하며 집기→호버→키보드 포커스 순으로 선택한다. 일반 포커스 캔버스는 대화 표시층 안에서 입력 영역·발판·다른 말풍선보다 앞, 해당 인물의 말풍선보다 뒤에 두고 집기 중에는 기존 body 전경으로 이동한다. `data-focused`는 해당 캐릭터의 입력 영역 우선순위와 자기 말풍선의 표시 우선순위·배경 불투명도를 올린다. 현재 캐릭터·자기 말풍선 안의 포인터는 다른 요소가 가로채도 유지하고, 실제 포인터 이탈 때 해제한다. `history-conversation.js`가 집게의 실제 DOM 사각형을 `blocking` 장애물로 전달하고 `speech-layout.js`는 일반 겹침 비용보다 집게 회피를 우선한다. 말풍선 겹침 허용 중에도 이 장애물은 유지한다. `walking-characters.js`는 움직이는 머리를 고정한 몸 전체의 흔들림을 처리한다. 놓은 위치는 서버에 저장하지 않으며 인물 교체·모드 전환 시 초기화한다. 고정 action은 `sparring_character_grab`이다. 포인터 호버 시 해당 인물의 프레임을 정지하고 전투 이동 대상에서 제외하며 `scene.js`가 제공하는 실제 카메라 방향으로만 회전시킨다. 포인터 이탈·집기·화면 숨김·모드 변경·창 포커스 이탈 시 정지를 해제한다. `history-conversation.css`와 `character-claw-*.svg`는 집게 커서·팀색 발밑 강조를 제공한다.
- iframe 내부 스크롤/키보드 고정 작성을 쓰지 않고 부모 문서의 일반 스크롤을 사용한다
- `history-brawl.js`는 의자·맨손 각 14가지 동작에 준비·타격·회수 곡선을 적용한다. 복싱 가드·원투, 레슬링, 태클, 의자 찌르기·던지기를 포함하며 마당 인물은 `brawlAttackTiming`의 동작별 공격·타격 시간을 따른다. `chair-characters.js`는 `chairFlight` 시작 위치를 저장해 의자를 손과 독립적으로 날리고, 슬롯 숨김·동작 변경 시 비행 상태를 지운다. 기존 인스턴스 의자를 재사용하고 집기 반응의 `chairHand`가 지정되면 한 손에 손잡이를 고정한다. `walking-characters.js`는 `anger`·`surprise`·`mouthOpen`에 따라 눈썹·눈·입을 바꾸고 다음 인물의 기본 표정을 복원한다. 프레임마다 새 메시를 만들지 않는다. `brawl-transition.js`는 관절과 방향만 시간 기반으로 보간하고 실제 이동·충돌·집기 좌표는 그대로 유지한다. 모션 감소·첫 등장에서는 즉시 자세를 적용한다.
- 원래 예시 목록·localStorage 데모는 서비스 데이터를 대신하지 않는다
- 임시 패싸움은 `history-conversation.js`의 편당 상한을 4명에서 8명으로 확장하고, 도착한 인물에 `history-brawl.js`의 상대 접근·타격·밀려남·재접근 이동과 싸움 자세를 적용한다. 실제 인물을 작은 무리로 나누고 마당 좌우·앞뒤에 분산하며, 각 인물은 처음 배정된 의자·맨손 종류를 유지하고 그 안에서 동작만 바꾼다. 패싸움의 월드 위치 이동 속도만 기존의 70%로 낮추며 공격 자세·주기, 회전, 대화 재생과 캡슐 입장 시간에는 적용하지 않는다. 같은 작성자의 다음 글·집기·패싸움 재진입도 종류를 바꾸지 않는다. 마당의 활성 인물은 양쪽 최대 8명씩 총 16명이다. 인물은 기존 재생 큐에서 선택된 실제 글이 미끄럼틀 캡슐 개봉을 거쳐야 입장한다. 같은 작성자·편의 글은 기존 인물을 재사용하고, 상한에 도달하면 같은 편의 가장 오래된 인물이 교체된다. 별도 작성자 명단·말풍선·재생 큐를 사용하지 않는다.
- `SparringDetailPage.jsx`의 오른쪽 상단 톱니바퀴는 `ArenaSettings.jsx`의 마당 설정 모달을 연다. 구도·패싸움 연출·받아치기 연출·팀별 최대 인원·말풍선 겹침 허용을 한곳에서 변경한다. 토론 생성 모달의 민트 배경·굵은 테두리·입체 그림자와 공통 `Modal`의 초점 순환·Escape·배경 클릭·닫은 뒤 초점 복귀를 재사용한다. 구도 변경은 기존 `view` 메시지만 전달하며 패싸움 상태를 유지한다. 모든 선택은 브라우저에 저장해 새로고침 후에도 복원한다. 저장소 접근이 막혀도 조작은 가능하다. 저장값이 없으면 아담한 구도·팀당 5명·모든 연출과 말풍선 겹침 허용이 기본이다. 기존에 명시적으로 저장한 선택은 유지하고 과거 자동 인원 값 `null`은 5명으로 해석한다. 패싸움은 카메라 위치·각도·확대율을 덮어쓰지 않으며 iframe이나 리플레이 큐를 다시 만들지 않는다.
- 마당에 도착한 활성 인물마다 말풍선 하나를 표시한다. 기본 설정은 편당 5개씩 최대 10개이며 팀별 상한을 늘리면 최대 16개다. 9개 이상이면 한 줄 미리보기와 작은 말풍선을 사용하고, 주제·투표 버튼·입력창과 다른 말풍선을 피해 위아래 빈 공간에 배치한다. 마당 설정의 `말풍선 겹침 허용`을 켜면 충돌 회피를 생략하고 각 인물 머리 곁에 둔다. 기본은 켜짐이며 선택은 브라우저에 저장한다. 패싸움에서도 최근·과거 선택과 편별 순서, 1.8초 읽기, 말풍선 받아치기, 새 받아치기의 충돌/VS·캡슐 연출을 동일하게 유지한다. 패싸움을 꺼도 지정한 팀별 인원 상한과 실제 재생 위치는 유지한다. 가상 대화 fixture와 별도 미리보기는 실제 서버 데이터를 대체하지 않는다.
- 마당 설정의 `팀별 최대 인원`은 민트·코랄 각각 1~8명을 설정한다. 기본은 양 팀 각각 5명이며, 직접 선택한 값은 모드 변경·새로고침 후에도 유지한다. 줄일 때 오래된 활성 인물부터 기존 1.4초 퇴장 모션으로 빠지고 늘릴 때는 다음 실제 캡슐 입장으로만 채운다. 같은 작성자 재사용·과거 순회·1.8초 읽기와 현재 카메라는 유지한다. 캐릭터에게 고정 체류 시간은 없으며, 같은 편이 정원일 때 다른 작성자가 들어오면 가장 오래된 인물을 교체한다.
- 주제 생성·투표·의견 저장은 실제 서버 응답 이후 표시하고 실패 시 입력을 보존한다

[API 계약](../../backend/docs/context/api/endpoints/sparrings.md)

## 게임방과 오목

- 초대 링크 입력창 오른쪽에는 같은 테두리 안에 공통 IconButton과 Lucide Copy를 배치한다. 접근성 이름 "복사"와 기존 `gomoku_invitation_copy` action, 성공 후 자동 닫기를 유지한다. 입력창의 label과 버튼은 별도 DOM 요소로 연결해 아이콘 클릭이 입력창 선택 동작과 겹치지 않게 한다.
- `InvitationLink.jsx`는 방 상단에서 초대 링크를 펼치고 접는 패널이다. 최초 발급 후 자동으로 열며 이때 복사하지 않는다. 패널의 "복사"가 현재 주소를 클립보드에 쓰고 성공 후 닫으며 트리거로 포커스를 돌려준다. 실패하면 직접 복사 안내와 패널을 유지한다. 상단 "초대링크" 버튼으로 닫기, Escape, 바깥 클릭도 지원하며 패널 안에는 별도 접기 버튼을 두지 않는다. 다시 열 때 주소를 유지하며 "새 링크 만들기"만 재발급하고 복사하지 않는다. 패널은 heading에 절대 배치해 `.gomoku-board-slot`의 할당 높이와 판 크기를 바꾸지 않는다. 기존 `gomoku_invitation_copy`, `gomoku_invitation_link_select`와 주소의 분석/녹화 제외를 유지하고 토글은 `gomoku_invitation_toggle`, 재발급은 `gomoku_invitation_create`로 구분한다.

- `/games`: 공개 카탈로그. 시안의 큰 일러스트/본문/전체 너비 CTA를 가진 두 열 카드이며 모바일은 한 열이다. `GameArtwork`는 `artworkAssets.js`의 dev/prod S3 URL로 장식 일러스트를 표시하며 로드 실패 시 게임 아이콘으로 대체한다. 오목의 "게임 시작"은 `/games/gomoku`, 리듬게임의 "준비 중"은 비활성 상태다.
- `/games/gomoku`: 공개 대기방 목록과 생성 모달. 생성 모달은 공개 범위/대국 규칙별 네모 체크 표시 단일 선택을 제공하며 기본값은 PUBLIC/RENJU다. 페이지의 단일 제목은 "대기실"이며 검색창과 생성 버튼은 같은 행에 표시한다. 이름 검색은 입력 즉시 서버 keyword 검색과 커서 페이지를 함께 적용한다. 한글 조합 완료 시 요청하며 입력 삭제 시 전체 목록으로 돌아간다. Enter/돋보기 제출도 지원한다. 검색 변경 시 첫 페이지로 초기화하며 빈 검색 결과에는 전체 보기 버튼을 표시한다. 목록은 활성 창에서 5초마다 갱신한다. 본인의 방은 `/rooms/me`로 확인하고 참여하기 전에 최신 참여 여부를 다시 조회한다. 선택한 방이 현재 참여 중인 방이면 참여 요청 없이 바로 이동하며, 다른 방에 참여 중일 때만 안내한다. 참여 요청 충돌 후 같은 방에 참여한 것으로 확인되면 그 방으로 이동한다. 생성/참여/초대 참여/퇴장 성공 시 참여 방 캐시를 직접 갱신하고 목록을 무효화한다. 갱신 전 진행 중인 참여 방 조회를 취소해 오래된 응답이 덮어쓰지 못하게 한다.
- `/games/gomoku/rooms/:roomId`: 회원 참여자 전용이다. 서버가 참여 권한을 판단한다. 준비, 두 사람 준비 후 방장의 명시적 시작, 선택/확정 착수와 빈 교차점 더블클릭 즉시 착수, 60초 타이머, 기권/퇴장 확인, 재대결을 지원한다. "대기실" 링크는 퇴장 요청이나 참여 캐시 삭제 없이 목록으로 이동하며 돌아가기 링크로 같은 방에 재진입한다. 별도의 빨간색 "나가기" 버튼이 확인창을 열고 확인 후 퇴장과 캐시 갱신을 마친 뒤 이동한다. 종료된 방에는 나가기 버튼을 표시하지 않는다. 단일 대국 카드에 참가자, 상태/타이머, 판, 현재 상태의 주요 버튼을 표시한다. 규칙 비교 안내는 방 만들기의 Info 툴팁에서 제공한다. FINISHED에서는 흐린 판 중앙에 WIN/LOSE/DRAW 결과와 재대결 준비 버튼을 표시하며 CLOSED에서는 CLOSED 안내와 대기실 이동 버튼을 표시한다. PLAYING으로 바뀌면 종료 결과를 제거한다. WAITING에서도 흐린 판 중앙에 준비 버튼을 표시한다. 준비 전은 빨간색, 준비 완료는 초록색이며 두 사람 모두 준비하면 방장에게 시작 버튼을 표시한다. 재대결도 준비 후 방장이 시작한다. ready 계약과 고정 action을 유지하고 시작은 별도 POST start 명령이다.
- `/games/gomoku/invite/:token`: 공개 제한 미리보기, 명시적 회원 참여. 로그인과 신규 가입 후 같은 경로로 돌아오며 자동 참여하지 않는다.
- `features/gomoku/api.js`: `/api/games/gomoku` 도메인 client와 Zod 응답 계약. 준비와 시작 요청은 현재 `gameNumber+1`, 착수는 `gameNumber`, `expectedPly`, 좌표와 UUID를 전송한다. 동일 수 재시도는 같은 UUID를 사용한다. `moveRequestId.js`는 randomUUID가 없는 브라우저에서 기존 초대 코드와 같은 UUID v4 대체 생성을 사용한다.
- `useGomokuRoom.js`: `getMe`로 쿠키 인증 갱신 경로를 거친 후 최신 REST snapshot과 SSE를 연결한다. `snapshot` 이벤트의 revision이 증가할 때만 적용한다. 정상 snapshot을 받은 연결이 종료되면 인증 확인부터 즉시 재연결하고 첫 복구 동안 조작을 유지한다. 복구 실패 시 조작을 잠그며 1초 상한부터 최대 30초까지 증가하는 지수 백오프에 50~100% 지터를 섞는다. 새 SSE의 첫 snapshot은 10초 안에 받아야 한다. SSE/일시적 HTTP 실패가 3회 연속 누적되면 안내하고 유효한 SSE snapshot 수신 시 안내와 횟수를 초기화한다. REST 조회 성공만으로 실패 횟수를 초기화하지 않는다. 403/404는 즉시 안내하고 재시도하지 않는다. unmount와 인증 변경은 연결/타이머를 정리한다.
- disconnected/pending 동안 준비, 착수, 기권과 초대 발급을 잠근다. 퇴장은 pending 동안 잠그며 SSE 연결이 끊겨도 HTTP 요청으로 시도할 수 있다. 명령 응답 성공 즉시 성공을 반환하고 선택 좌표/확인창/초대 URL을 처리한다. 후속 snapshot 조회는 백그라운드로 분리하고 실패 시 명령은 재전송하지 않고 조회만 백오프로 재시도한다. SSE snapshot 수신이나 방/인증 변경은 조회 재시도를 취소한다. 명령 자체가 실패했을 때만 선택 좌표를 보존한다. 서버 타이머를 클라이언트 시각에 보정해 표시하며 승패는 서버만 결정한다.
- 참가자 이미지는 snapshot의 `hostAvatarUrl`, `guestAvatarUrl`을 공통 Avatar로 표시한다. URL 누락/오류는 이름 첫 글자로 대체하며 빈 자리 아이콘은 유지한다. 시작 후 프로필 우측 하단에 흑백 돌 배지를 표시한다.
- 대기실 상단은 복귀 링크/제목과 오목 일러스트, 다음 행은 검색/생성으로 배치한다. 각 방은 기존 응답의 `hostAvatarUrl`과 공통 Avatar를 사용하고 이름 첫 글자 대체 표시를 지원한다. 목록의 인원/규칙, 내 방 안내와 참여 제한 동작은 유지한다. 준비 화면은 별도 배경 없는 참가자 영역/준비 배지를, 진행 화면은 시간 pill과 입체 목재 판/장식 화점을 사용한다. 오목판은 계속 실제 225개 교차점 버튼이며 그림으로 대체하지 않는다.
- 대국 참가자 사이 구분선은 "VS"로 대체한다. `.gomoku-board-slot`이 헤더/참가자/상태/착수 버튼을 제외한 영역을 크기 컨테이너로 제공하며 판은 `min(100cqw, 100cqh, var(--gomoku-board-max-size))` 정사각형이며 페이지 전용 최대 크기는 36rem이다. 상단과 타이머/버튼 주변 여백을 줄여 판에 공간을 더 할당한다. 일반 화면에서 스크롤 없이 판과 44px 착수 버튼이 함께 보이도록 대국 페이지 높이를 동적 뷰포트에 맞추고 하단 피드백 버튼 공간을 확보한다. 아주 낮은 화면에서는 최소 높이와 문서 스크롤로 접근한다.
- `Stone.jsx`: BLACK/WHITE와 외형 registry를 분리하며 unknown 외형은 classic으로 대체한다. 외형은 내부 렌더러로만 확장해 흑백 바깥 고리를 보존한다. 캐릭터 선택과 소유 API는 포함하지 않는다.
- 금수와 명령 오류는 닫을 수 있는 화면 상단 알림으로 표시하며 대국판의 크기와 선택, 포커스를 유지한다. 현재 차례인 프로필만 민트 배경과 얇은 테두리로 표시한다. "내 차례" 또는 "상대 차례" 문구는 하단 테두리 중앙에 걸치며 문구 부분에서만 선을 끊는다. 별도 차례 안내 문장은 제거하고 투명 배경 줄에 타이머만 가운데 정렬한다. 비활성 프로필은 투명 배경이며 진행 중인 비활성 선수의 "대기" 문구는 표시하지 않는다.
- 방 종료 snapshot은 SSE를 닫고 자동 재연결을 중단한다. 상대가 들어오기 전에는 준비 버튼을 비활성화한다. 렌주 금수 거절은 쌍3, 쌍4, 장목 안내와 함께 선택 좌표를 보존한다.
- 방 만들기의 `RuleInfoTooltip.jsx`는 "대국 규칙" 제목 옆 Info 버튼 하나에서 기본 규칙/제한 없음의 승리 조건과 금수 유무를 함께 안내한다. `GomokuTooltip.jsx`의 위치 보정, hover/focus/터치와 Escape 닫기를 재사용한다. 정보 버튼은 radio label 밖에 있어 설명을 확인해도 선택이나 생성 요청을 바꾸지 않는다. 대국 화면의 별도 규칙 버튼과 모달은 제거했으며 선택한 규칙 배지만 유지한다.

- `features/gomoku/RulesContent.jsx`와 `RuleExampleTooltip.jsx`는 기존 규칙 설명/3-3/4-4 그림 툴팁 컴포넌트로 유지하지만 현재 화면에서는 사용하지 않는다. 예시는 실제 서버의 쌍3/쌍4 테스트와 같은 배치이며 이미지 파일은 저장소에 두지 않는다. `ruleExampleImages.js`는 `APP_DEPLOY_ENV=production`일 때 `jarihana/images/gomoku-rules`, 나머지는 `jarihana-dev/images/gomoku-rules`의 공개 S3 PNG 주소를 사용한다.

### 오목 전적과 랭킹

- 대기실의 기존 GameArtwork 이미지를 유지한다. `?tab=history|ranking`과 기본 대기방을 공통 Tabs로 전환하고 다른 검색 파라미터/뒤로가기를 보존한다. "친구와 함께하는 오목" 문구는 추가하지 않는다.
- `GomokuHistory.jsx`는 본인 요약과 완료 대국의 무한 커서 조회를 연결한다. 승률은 서버 집계값을 소수 첫째 자리로 표시하며 0판이면 "-"다. 최신순 목록과 더 보기, 다음 페이지 실패 재시도를 제공한다.
- `GomokuRanking.jsx`는 회원 전용 누적 승수 랭킹과 내 순위를 조회한다. 1등의 실제 GitHub 프로필을 기존 의자 asset 위에 배치하고 2/3등을 양옆에 표시한다. 없는 순위는 가짜 회원으로 채우지 않는다. 본인의 개별 전적만 조회할 수 있다.
- `useGomokuStatistics.js`는 회원 ID/세션별 캐시, 비활성 패널 unmount, gcTime 0, 요청 AbortSignal을 사용한다. 재진입/창 복귀 때 첫 페이지부터 갱신하며 대국 종료 snapshot을 확인하면 통계 캐시를 무효화한다. 비로그인 상태에서는 통계 API를 호출하지 않고 현재 탭을 로그인 복귀 대상으로 저장한다.
- 대기방의 검색/생성/현재 방 조회, 준비와 착수 흐름은 유지한다. 통계 화면은 loading, empty, initial error/retry, next-page error/retry와 프로필 이미지 실패 대체 표시를 지원한다.
- API 계약은 백엔드 [오목 대전기록 계약](../../backend/docs/context/api/endpoints/gomoku.md#대전기록-승률과-랭킹)을 따른다. Playwright는 API fixture 기반 화면/접근성 확인이며 실서버 두 계정 OAuth/운영 프록시 검증과 구분한다.

## 공개 오목방 목록과 참여 안내

- "참여 중인 자리" 안내는 대기실 검색 바 바로 아래에 표시한다. 참여 실패 안내는 3초 표시 후 240ms 동안 페이드아웃하며 안내 영역의 높이도 함께 접어 방 목록을 부드럽게 올린다. wrapper의 animationend에서 안내 내용과 alert 역할을 제거하며 자식의 애니메이션 이벤트는 무시한다. 빈 grid 컨테이너는 유지해 제거 시 인접 여백 합침으로 목록이 한 번 더 튀지 않도록 한다. 재시도 때 새 안내로 교체해 대기/애니메이션을 다시 시작하며 모션 감소 설정에서는 이동/페이드를 생략한다. 방 만들기 실패 메시지는 기존 표시를 유지한다.

- 새 화면의 목록 요청은 첫 페이지/검색/다음 페이지/자동 갱신 모두 `view=summary`를 명시한다. 백엔드는 기존 탭의 `view` 없는 요청에 대기방 전용 상세 응답을 유지한다. 두 계약 지원 백엔드를 먼저 배포하고 새 프론트엔드를 배포한다. 기존 요청이 충분히 줄었는지 확인한 뒤 별도 후속 PR로 기존 요청과 응답 처리를 제거한다. 배포 성공만으로 제거하지 않는다. 전환 절차와 후속 PR의 제거 기준은 [오목 API 계약](../../backend/docs/context/api/endpoints/gomoku.md#배포와-기존-계약-제거)을 따른다.

- 대기실 목록은 상대를 기다리는 공개 방과 게임 중인 공개 방을 함께 표시한다. 대기방은 "상대 대기 중", "1 / 2", "참여하기"로, 진행 중인 방은 "게임 중", "2 / 2"와 "관전하기" 버튼으로 구분한다. 요약 목록에는 "관전자 N명"을 표시한다. 본인이 참여 중인 게임은 "돌아가기"로 재진입하며 `gomoku_my_room_open`을 유지한다. 전체 목록이 비어 있으면 "아직 열린 방이 없어요"를 표시한다. 검색과 커서는 두 상태에 함께 적용하고 비공개/종료/만료 방은 제외한다. 목록은 `lobbyRoomSchema`로 요약 응답을 검증하며 참가자 전용 `roomSchema`의 대국판/타이머 필드를 요구하지 않는다.
