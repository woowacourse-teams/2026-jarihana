# 자리하나 프론트엔드 구현 매핑

이 문서는 2026-08-31 기준 실제 백엔드 Controller/DTO와 Figma 파일
`4FGyuqPPK0Vuv4FipZBTgF`를 대조한 구현 계약이다. 일반 화면은 `최종 디자인 2`
(`438:2657`), 모임 생성·정보 수정·모임장 관리는 `최종 디자인`(`354:1479`) 초안을
시각 기준으로 삼는다. 데이터·권한·상태 전이는 백엔드 코드를 최종 권위로 삼는다.

## 기술 선택과 실행 경계

이 앱은 사용자의 후속 지시에 따라 **JavaScript/JSX + React + Webpack/Babel + Jest**로
구성했다. TypeScript, Vite, Vitest는 사용하지 않는다. Node는 24.x로 고정하며 실행 방법,
공개 OAuth 환경 변수, backend proxy와 운영 topology는 [frontend README](../README.md)를
최종 runbook으로 사용한다.

시각 토큰은 `src/shared/styles/tokens.css`에 집중한다. 이번 hardening에서 contrast-aware
`--color-text-brand`/`--color-text-muted`, `--border-thin`/`--border-strong`,
`--touch-target`/`--touch-target-lg`, `--header-height`, `--breakpoint-md`/`--breakpoint-lg`를
추가했다. 이 값은 AppShell과 page CSS가 동일한 border, touch area, header, responsive 기준을
공유하게 한다.

## Figma 인벤토리

| 용도                | Figma node                                                    | 사용 범위                                                  |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| 그룹 탐색           | `438:2659`                                                    | 탐색 hero, 검색, 필터, 그룹 카드, 더 보기                  |
| 그룹 상세/가입 신청 | `438:2779`                                                    | 상세 정보 계층, 탭, 모집 CTA와 신청 패널                   |
| 마이페이지          | `438:2904`                                                    | 프로필, 내 모임, 내 신청 요약                              |
| 그룹 수정           | `394:2460`, `445:23`                                          | mint editor hero, Markdown 소개, 일정 입력                 |
| 그룹 생성           | `462:1337`                                                    | 생성 단계, editor hero, Markdown 소개                      |
| 모집 관리           | `445:144`                                                     | 현황, 모집 생성·마감, 공개 상태 rail                       |
| 신청 관리           | `399:1435`                                                    | 신청자 목록과 실제 멤버/모집 rail                          |
| 멤버 관리           | `445:252`                                                     | 멤버 검색/표와 리더 위임                                   |
| 공통 컴포넌트       | `25:54`, `25:67`, `25:68`, `25:72`, `25:78`, `25:81`, `25:84` | Button, Badge, Header, Card, InfoRow, FormField, PersonRow |

### Common shell reconciliation

`최종 디자인 2`의 header reference는 단일 규칙이 아니다. 일부 frame은 viewport 상단을 가득 채운
검은 bar를, 일부 frame은 white canvas 안에 inset된 검은 frame을 보여 준다. 이 차이는 route별
header 구현으로 확대하지 않았다.

- `AppShell`은 하나의 navigation/auth state와 skip link/main landmark를 모든 route에 적용한다.
- 360–767px에서는 full-bleed header + drawer를 사용해 44px 이상 touch target을 확보한다.
- 768px 이상에서도 검은 header 배경은 viewport 전체 폭을 채우고, 내부 navigation만 1360px shell에
  맞춰 중앙 정렬한다.
- 관리 화면의 group context tabs, public group detail의 content tabs, account navigation은
  header를 복제하지 않고 route 내부의 local context로 구분한다.

## Route × API × 권한 × 화면 상태

| Route                                                               | 권한                   | API                                      | 공통 레이아웃/컴포넌트                                               | 반드시 표시할 상태                                                               |
| ------------------------------------------------------------------- | ---------------------- | ---------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/`, `/groups`                                                      | 공개                   | `GET /api/groups`                        | AppShell, ExploreHero, SearchField, FilterBar, GroupCard, CursorList | initial/background loading, empty, success, 400, network                         |
| `/groups/:groupId`                                                  | 공개                   | 그룹 상세(모임 방식·장소 포함), 모집 목록, 멤버 목록 | DetailLayout, Tabs, InfoRow, RecruitmentCard, PersonRow              | loading, empty section, 403, 404, network                                        |
| `/groups/:groupId/recruitments/:recruitmentId`                      | 조회 공개, 신청은 회원 | 모집 상세, 신청 생성/철회                | DetailLayout, RecruitmentPanel, Modal, Toast                         | closed/ended, validation, 401, 403, 404, 409, mutation pending/success/failure   |
| `/oauth/callback`                                                   | 공개                   | `GET /api/members/me`                    | CenteredStateLayout                                                  | callback loading, invalid callback, signup required, authenticated, 401, network |
| `/signup`                                                           | 가입 세션              | 내 정보 조회, 회원 생성                  | FormLayout, FormField, Select                                        | field/server validation, missing session, 409, pending/success/failure           |
| `/my`                                                               | 회원                   | 내 정보, 내 그룹, 내 신청                | MyPageLayout, ProfileCard, SummaryCard                               | bootstrap loading, partial empty, 401, network                                   |
| `/my/groups`                                                        | 회원                   | `GET /api/groups?relation=JOINED`        | ListLayout, GroupCard, CursorList                                    | loading, empty, cursor, 401, network                                             |
| `/my/registrations`                                                 | 회원                   | 내 신청 목록, 신청 철회                  | ListLayout, StatusBadge, ConfirmDialog                               | loading, empty, cursor, 401/403/404/409, mutation states                         |
| `/groups/new`                                                       | 회원                   | 이미지 업로드·그룹 생성                  | FormLayout, ImagePicker, schedule fields                             | image validation/upload, conditional schedule validation, 401/409, mutation states |
| `/groups/:groupId/manage`                                           | 해당 그룹 리더         | 그룹/멤버/모집 조회, 이미지 업로드, 그룹 수정/종료/삭제 | ManageLayout, ManageNav, ImagePicker, Stats, ConfirmDialog | image preservation/replace, loading, 403, 404, lifecycle conflict, mutation states |
| `/groups/:groupId/manage/members`                                   | 해당 그룹 리더         | 멤버 목록, 리더 위임                     | ManageLayout, PersonRow, ConfirmDialog                               | loading, empty, 403/404/409/422, mutation states                                 |
| `/groups/:groupId/manage/recruitments`                              | 해당 그룹 리더         | 모집 목록/생성/마감                      | ManageLayout, RecruitmentCard, Modal                                 | loading, empty, validation, 403/404/409, mutation states                         |
| `/groups/:groupId/manage/recruitments/:recruitmentId/registrations` | 해당 그룹 리더         | 신청자 목록, 승인/거절                   | ManageLayout, ApplicantRow, DecisionDialog, CursorList               | loading, empty, filter, cursor, 403/404/409, mutation states                     |
| `*`                                                                 | 공개                   | 없음                                     | CenteredStateLayout, NotFoundState                                   | 404와 안전한 복귀 링크                                                           |

### Visual pattern mapping

| 화면군         | Figma에서 유지한 정보 계층                      | 구현상 통일/반응형 결정                                                                                                  |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 공개 탐색      | mint hero, 검색·필터, 카드 우선순위             | 1440px 3-column, 768px 2-column, mobile 1-column; search는 strong bottom border와 48px touch target                      |
| 그룹 상세/모집 | profile banner, 모임 정보(방식·일정·장소·멤버), content tabs, 참여 CTA | desktop content + sticky recruitment rail, 1024px 미만 rail을 본문 뒤로 이동                                             |
| 계정           | profile illustration, activity count, 요약 카드 | desktop profile/content split, tablet/mobile은 순서 보존 single column; `?role=LEADER` deep link로 운영 모임 filter 유지 |
| 그룹 생성/수정 | 단계 tab, mint editor hero, Markdown 소개       | 대표 이미지 picker와 업로드 상태, type별 일정 form, 1024px 미만 hero stack, mobile day/time grid 축소             |
| 리더 관리      | 관리 맥락, 현황, 멤버/모집/신청 작업            | 모집은 실제 create/close, 멤버는 실제 leader transfer만 제공; desktop rail과 mobile stacked layout                       |

모든 cursor 목록은 첫 요청에서 cursor를 생략하고 다음 요청은 응답의 `nextCursor`만 사용한다.
그룹 탐색은 카드 밀도 때문에 `size=12`를 명시하고, 나머지는 backend default `size=20`을
사용한다. 허용 범위는 1–100이다. 같은 cursor 재요청과 중복 item 병합을 막는다.

## 실제 API 계약 요약

- API base path는 `/api`이고 모든 요청은 cookie credentials를 포함한다.
- JSON 응답은 `{ success, data, error }` envelope다. `204`는 본문을 읽지 않는다.
- 인증 토큰은 `accessToken`, `refreshToken` HttpOnly cookie다. 브라우저 저장소와
  `Authorization` header를 사용하지 않는다.
- mutation은 `XSRF-TOKEN` cookie를 `X-XSRF-TOKEN` header로 전달한다.
- `401 + UNAUTHENTICATED`에서만 refresh하고, 동시 refresh는 하나로 합치며 원 요청은
  최대 한 번만 재시도한다. `403`은 refresh하지 않는다.
- 가입 결정 payload는 UI의 승인/거절을 백엔드 값 `APPROVED`/`REJECTED`로 보낸다.
- 그룹: `CLUB | STUDY | SESSION`, 상태: `ACTIVE | ENDED`.
- 그룹 모임 방식: `ONLINE | OFFLINE | FLEXIBLE`. `FLEXIBLE`은 고정된 온라인·오프라인 방식 없이 유동적으로 정하는 경우다. `type`은 그룹 종류이고 `meetingType`은 진행 방식이므로 서로 다른 값이다.
- 그룹 상세 응답의 `location`은 nullable 문자열이며 최대 255자다. 오프라인 장소뿐 아니라 온라인 접속 정보도 저장할 수 있다.
- 모집 방식: `AUTO | APPROVAL`, 조회 상태: `SCHEDULED | OPEN | ALWAYS_OPEN | CLOSED`.
- 신청 상태: `PENDING | APPROVED | REJECTED`.
- `CLUB`/`STUDY`는 반복 일정, `SESSION`은 단일 세션 일정을 입력한다.
- 이미지 업로드는 `POST /api/image-uploads`로 Presigned URL을 발급한 뒤 스토리지에
  직접 전송하고, 응답의 `imageKey`를 그룹 생성·수정 요청의 `representativeImageKey`로
  전달한다. 업로드 URL은 제한 시간 동안만 유효하다.
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
- 목록 응답은 현재 모임 방식·장소를 제공하지 않으므로 `groupListItemSchema`에는 포함하지 않는다.

### 내 신청 목록 응답 스키마

`fetchMyRegistrations`의 각 항목은 신청 정보와 함께 신청 대상 그룹을 `group`으로 반환한다.
대표 이미지는 신청서의 이미지가 아니라 그룹의 이미지이므로 `group.representativeImageUrl`에
포함한다. 백엔드는 저장 키를 공개 URL로 변환해 전달하고, 프론트엔드 스키마는 상대 경로를
`/images/...` 형식으로 정규화한다. 이미지가 없는 그룹은 `images/default-group.png`를 사용한다.

```json
{
  "id": 88,
  "group": {
    "id": 12,
    "name": "알고리즘 스터디",
    "representativeImageUrl": "https://cdn.example.test/images/groups/algorithm.webp"
  },
  "recruitmentId": 45,
  "status": "PENDING"
}
```

| 도메인         | endpoint                                                                                                                                                                           | 화면에서 수행하는 일                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 그룹           | `GET/POST /api/groups`, `GET/PUT/PATCH/DELETE /api/groups/{groupId}`                                                                                                               | 탐색·상세·생성·수정·종료·삭제                                                  |
| 일정           | `PUT/DELETE /api/groups/{groupId}/recurring-schedule`, `PUT /api/groups/{groupId}/session-schedule`                                                                                | 모임 유형에 맞는 일정 저장/삭제                                                |
| 멤버           | `GET /api/groups/{groupId}/members`, `PUT /api/groups/{groupId}/leader`                                                                                                            | 멤버 목록과 리더 위임                                                          |
| 모집           | `GET/POST /api/groups/{groupId}/recruitments`, `GET/PATCH /api/groups/{groupId}/recruitments/{recruitmentId}`                                                                      | 모집 이력·상세·생성·마감                                                       |
| 신청           | `GET/POST /api/recruitments/{recruitmentId}/registrations`, `PATCH/DELETE /api/recruitments/{recruitmentId}/registrations/{registrationId}`, `GET /api/registrations?applicant=me` | 신청 생성·철회·승인/거절·내 신청                                               |
| 이미지         | `POST /api/image-uploads`                                                                                                                                                           | Presigned URL 발급 후 이미지 업로드. 그룹 생성·수정 시 `representativeImageKey` 전달 |
| 인증/회원      | `GET /api/members/me`, `POST /api/members`, `POST /api/auth/refresh`, `POST /api/auth/logout`                                                                                      | bootstrap·가입·refresh·logout                                                  |
| OAuth callback | `GET /api/oauth/github/callback`                                                                                                                                                   | GitHub에서 받은 code/state를 backend가 처리하고 frontend callback으로 redirect |

## Guard 결정

- 앱 시작 시 `/api/members/me`를 조회하고 `UNAUTHENTICATED`이면 refresh를 한 번 시도한다.
- `signupCompleted=false`는 `/signup`으로, 완료 회원은 원래 목적지로 보낸다.
- 리더 여부는 JWT가 아니라 현재 member id와 그룹 leader member id를 비교한다.
- 클라이언트 guard는 UX를 위한 것이며 서버의 401/403이 최종 권위다.
- OAuth callback의 `signupRequired` query는 힌트일 뿐이며 `/members/me` 결과로 재검증한다.

## Figma/API 불일치

| Figma 또는 초안 표현                  | 실제 계약                                     | 구현 결정                                                                        |
| ------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| 대표 이미지 업로드                    | presigned URL 발급 후 스토리지 직접 업로드      | `POST /api/image-uploads` → presigned `PUT` → `representativeImageKey` 연결       |
| 멤버 “내보내기”                       | 멤버 제거 endpoint 없음                       | 액션 제거. 리더 위임만 제공                                                      |
| 프로필/아바타 수정                    | member update endpoint 없음                   | 정보 조회만 제공                                                                 |
| 그룹 즉시 가입                        | 직접 가입 endpoint 없음                       | recruitment registration 흐름으로만 가입                                         |
| 신청 결정 `APPROVE/REJECT` 표기       | 실제 request enum은 `APPROVED/REJECTED`       | 표시 문구는 승인/거절, payload는 실제 enum 사용                                  |
| 생성/세부 관리의 최종2 frame 부재     | API에는 기능 존재                             | 보조 frame의 흐름을 최종2 token/AppShell로 재설계                                |
| desktop 중심 frame                    | 360/768 frame 없음                            | 정보 우선순위를 유지한 보수적 responsive 규칙을 DESIGN.md에 기록                 |
| final2 header의 full-bleed/inset 혼재 | frame마다 header placement가 다름             | route마다 재현하지 않고 desktop inset/rounded, mobile full-bleed AppShell로 통일 |

## Production 원칙

- production runtime에 mock/fallback 성공 데이터를 넣지 않는다.
- Playwright와 단위 테스트의 network fixture만 허용한다.
- `/api`는 Webpack dev server에서 `http://localhost:8080`으로 proxy한다.
- `/images`는 운영에서 이미지 CDN 경로로, 개발에서는 기본 이미지 정적 경로로 제공한다.
- 운영은 same-origin reverse proxy 또는 cookie가 유효한 same-site 배포를 전제로 한다.
- GitHub client secret은 어떤 프론트엔드 설정이나 bundle에도 포함하지 않는다.
- 실제 OAuth 완료는 GitHub OAuth 앱의 public client ID, backend client secret, callback URL,
  테스트 가능한 GitHub 계정이 모두 있을 때만 수동으로 검증할 수 있다. 이 저장소에는 그
  자격 증명과 계정이 없다.
