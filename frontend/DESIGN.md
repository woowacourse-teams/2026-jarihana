# 자리하나 UI 디자인 시스템

## 0. Research log

- 일반 화면 시각 기준: Figma `자리하나 디자인 (복사)` 파일의 `최종 디자인 2` 페이지
  (`438:2657`). 모임 생성·정보 수정·모임장 관리의 기준은 사용자가 지정한 `최종 디자인`
  (`354:1479`)의 초안 frame이다.
- 기능 기준: 현재 `backend/`의 Controller, DTO, Security, domain service, acceptance test.
- 생성/관리 초안은 실제 backend API가 지원하는 동작만 남기고 제품 화면으로 구현했다.
- 자산: Figma export 원본을 `src/shared/assets/figma/`에 저장했다. 화면 screenshot 자체를 UI로
  사용하지 않는다. 교체 가능한 브랜드 이미지는 `src/shared/assets/brand/`에 둔다.
- 글꼴: Figma의 Noto Sans KR를 Google Fonts CSS로 불러오고, 로딩 실패/전에는
  `Apple SD Gothic Neo`, `Malgun Gothic`, sans-serif fallback을 둔다.
- breakpoint는 Figma에 desktop만 명시되어 있어 360/768/1440 검증 요구와 콘텐츠 우선순위로
  보수적으로 도출했다.
- `최종 디자인 2` 내부의 header reference는 어떤 frame에서는 viewport 상단 full-bleed,
  다른 frame에서는 inset된 검은 frame으로 표현되어 서로 완전히 일치하지 않는다. 앱은 frame마다
  header를 바꾸지 않고 공통 AppShell로 통일했다. 모든 viewport에서 검은 배경은 full-bleed로
  렌더하고, 내부 wordmark·navigation·auth action만 shell 상한과 page gutter에 맞춘다. 탐색/마이/관리
  화면의 맥락이 바뀌어도 navigation 위치와 인증 동작이 흔들리지 않게 하려는 결정이다.
- 정확한 Figma reference가 있으므로 별도 생성형 이미지·무관한 디자인 탐색은 사용하지 않았다.

## 1. Product atmosphere

자리하나는 “처음 앉을 자리를 가볍게 내어 주는 커뮤니티”다. 검은 navigation frame이 서비스의
신뢰감과 기준점을 만들고, 넓은 흰색/옅은 회색 surface와 mint accent가 친근한 초대의 분위기를
만든다. 둥근 카드, 절제된 선, 작은 3D/line illustration은 따뜻하지만 장난스럽지 않게 사용한다.

핵심 시각 문장: **검은 프레임 안에서 민트색으로 한 자리를 권하는, 정돈되고 열린 커뮤니티**.

## 2. Foundations

### Semantic colors

| Token                  | Value            | Usage                                      |
| ---------------------- | ---------------- | ------------------------------------------ |
| `--color-brand`        | `#2ac1bc`        | 주요 CTA, 선택 상태, 브랜드 포인트         |
| `--color-brand-strong` | `#21aaa5`        | hover/pressed, 강조 텍스트                 |
| `--color-brand-display`| `#1d9893`        | 밝은 canvas 위 큰 display text용 민트       |
| `--color-brand-ink`    | `#08736f`        | 밝은 mint 위에서도 읽히는 브랜드 text      |
| `--color-brand-soft`   | `#dff8f3`        | hero와 선택 배경                           |
| `--color-ink`          | `#1d1d1f`        | 본문과 제목                                |
| `--color-muted`        | `#7a7a7a`        | 보조 정보                                  |
| `--color-muted-ink`    | `#666666`        | 작은 text의 대비 보강                      |
| `--color-line`         | `#e0e0e0`        | 구분선과 field border                      |
| `--color-line-strong`  | `#d8dade`        | 계정 카드처럼 선명한 surface 경계          |
| `--color-surface`      | `#ffffff`        | 카드와 입력 surface                        |
| `--color-surface-sunken`| `#f4f5f7`       | 카드 안쪽의 낮은 깊이 surface               |
| `--color-section-soft` | `#fcfcfc`        | 탐색 결과 section을 hero와 분리하는 surface |
| `--color-canvas`       | `#ffffff`        | 앱 배경                                    |
| `--color-nav`          | `#000000`        | global header                              |
| `--color-danger`       | `#c7352a`        | 오류/파괴 액션, AA 대비용 파생 token       |
| `--color-danger-soft`  | `#fff0ee`        | 오류 배경                                  |
| `--color-success`      | `#247a45`        | 성공 상태, AA 대비용 파생 token            |
| `--color-success-soft` | `#eaf8ef`        | 성공 배경                                  |
| `--color-warning`      | `#8a5b00`        | 경고/대기 상태, AA 대비용 파생 token       |
| `--color-warning-soft` | `#fff6df`        | 경고 배경                                  |
| `--color-activity-study-ink` | `#24457f` | 스터디 유형 chip text                     |
| `--color-activity-study-soft` | `#e7eefc` | 스터디 유형 chip surface                  |
| `--color-activity-club-ink` | `#453a95`  | 동아리 유형 chip text                     |
| `--color-activity-club-soft` | `#ece9fb` | 동아리 유형 chip surface                  |
| `--color-activity-session-ink` | `#7a5405` | 세션 유형 chip text                     |
| `--color-activity-session-soft` | `#fdf0da` | 세션 유형 chip surface                  |
| `--color-cohort-1..5`  | categorical ramp | 멤버 기수 분포의 비텍스트 구간·아바타 배경 |

`--color-text-brand`와 `--color-text-muted`는 각각 `brand-ink`, `muted-ink`를 가리키는
semantic text alias다. 밝은 brand fill은 CTA surface로, `brand-display`와 더 어두운 alias는
light canvas 위 text 용도로 분리해 대비와 의미를 함께 유지한다.

상태색은 Figma의 밝은 accent를 그대로 본문색으로 쓰지 않고 WCAG 2.2 AA 대비를 확보한 파생
색을 사용한다. raw hex는 `tokens.css` 외부에서 사용하지 않는다.

### Typography

- Family: `Noto Sans KR`, `Apple SD Gothic Neo`, `Malgun Gothic`, sans-serif.
- Hero: 56/1.22, 800. 모바일 40/1.22.
- Hero body: desktop 20px, mobile 18px, 1.65 line-height.
- Display: 40/1.2, 800. 모바일 30/1.25.
- H1: 32/1.3, 700. 모바일 26/1.35.
- H2: 24/1.4, 700. 모바일 21/1.4.
- H3: 18/1.45, 700.
- Discovery card title: `--groups-card-title-size` 20/1.45, 700; mobile은 `--text-label`
  크기인 14px와 1.45 line-height를 사용한다.
- Footer Contact us heading: `--text-footer-contact` 22/1.4, 700.
- Body large: 17/1.65, 400.
- Body: 15/1.65, 400.
- Label: Figma 기준 14/20, 500.
- Caption: 13/1.5, 400.
- Brand: `--text-brand` 22px/800. Header wordmark에만 쓰며 본문 scale을 대체하지 않는다.
- Letter spacing: 전역 기본값과 브랜드 `--tracking-brand`는 0이다. 마이페이지 제목, eyebrow,
  활동 제목에도 별도의 음수/과한 양수 자간을 적용하지 않고 글꼴의 기본 간격을 유지한다.
- `--font-size-caption`, `--font-size-label`, `--font-size-h3`는 기존 page CSS가 동일한
  type scale을 참조하도록 둔 compatibility alias다.

### Spacing and geometry

- Spacing: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Signup character image: the visual size is capped at `--signup-type-image-size` (`15rem`),
  with a `--signup-type-image-base-size` (`7.5rem`) layout box rendered at fixed `scale(2)`.
- Radius: small `8`, medium `14`, large `20`, pill `999`.
- Footer Contact us block: `--footer-contact-max-width` `22rem` max width on desktop/tablet.
- Container: 구현 token `--container-shell`은 `1440px`(`90rem`)이다. `/`의 content rail을
  기준으로 모든 route의 페이지 shell과 section 외곽선을 통일한다. gutter는 360–767px에서
  16px, 768–1023px에서 24px, 1024px 이상에서 32px(`--groups-page-rail-gutter`)를 사용한다.
  account, management, group editor, group detail도 같은 shell을 공유하고, 좁은 form 읽기 폭은
  shell 안쪽 content에만 적용한다.
- Border: `--border-thin`(1px)과 `--border-strong`(2px)을 사용한다. 기본 surface 경계는
  thin, 탐색 입력의 강조 하단선 같은 의도적 emphasis만 strong을 사용한다.
- Touch: `--touch-target`은 44px, `--touch-target-lg`는 48px이다. button, navigation,
  filter, form control은 이 최소 높이를 공유한다.
- Header: `--header-height` 72px, active line 3px, loading auth placeholder 108px로
  geometry를 token화한다.
- 탐색 랜딩(`/`)과 호환 진입점(`/groups`)의 hero는 header 아래
  `calc(100dvh - --header-height)` 높이로 첫 화면을 채우고, 하단의 `자리 둘러보기` 화살표 CTA가
  검색·필터가 가려지지 않도록 discovery section의 `자리 둘러보기` 제목으로 부드럽게 이동시킨다. `/groups`는 기존 링크와 북마크를 보존하는 동일
  랜딩 경로로 유지한다.
- Hero의 desktop 열은 `minmax(26rem, .75fr) minmax(0, 1.25fr)`와 32px gap으로 나눈다.
  문구는 내용 너비로 첫 번째 열의 오른쪽에 정렬해 이미지 내부 흰 여백을 고려한 바깥 좌우
  균형을 맞춘다. tablet/mobile에서는 문구의 가운데 정렬을 유지하고 이미지만 화면 양 끝까지
  넓히고 텍스트와 목록의 기존 gutter는 유지한다. 이미지는 원본 비율과 `contain`을 유지해
  확대 후에도 상하좌우를 자르지 않는다.
- 탐색 페이지의 hero와 discovery는 desktop에서 `--space-16` 외부 간격과 `--space-10` 내부 상단
  여백으로 넉넉하게 분리하고, discovery에는 `--color-section-soft`를 적용해 별도 정보 영역임을
  드러낸다. 결과 제목과
  모임 수/정렬 메타는 같은 baseline에서 바로 이어지며, 검색·필터와 카드 grid는 동일 rail을
  유지한다.
- 탐색 랜딩의 full-bleed 배경은 `main`의 가로 경계에서만 잘라 세로 스크롤바가 있는
  환경에서도 페이지에 가로 스크롤이 생기지 않게 한다. 세로 스크롤과 제목 기준 이동은 유지한다.
- Shadow: 카드 hover와 modal만 `0 12px 34px rgb(29 29 31 / 10%)`; 일반 정보 그룹은 border/tonal
  surface로 깊이를 표현한다.
- Z layers: header `20`, sticky `25`, overlay `40`, dialog `50`, toast `60`.

### Responsive breakpoints

- token metadata: `--breakpoint-md` 48rem(768px), `--breakpoint-lg` 64rem(1024px).
- `360–767`: full-bleed header, 16px page gutter, 탐색 모임은 마이페이지 activity row를 따른
  왼쪽 썸네일의 1-column 목록, mobile drawer를 사용한다. 그룹 detail rail과 운영 side rail은
  본문 아래로 이동하고, management table은 labelled card rows로 바뀐다.
- `768–1023`: full-bleed header 배경과 24px content gutter. 탐색 card는 3 columns, account는 좁은
  profile/content split, group editor hero는 single column으로 전환한다.
- `1024–1439`: 32px content gutter와 4-column 탐색 카드, group detail/registration의 side rail,
  group editor 2-column hero, management grid/table을 사용한다. 고정 폭 action은 충분한
  공간이 없으면 줄바꿈한다.
- `1440+`: 1440px shell 상한을 중앙 정렬하고 탐색 카드 4 columns를 유지한다.
- 탐색 카드 간격은 축소 전 값으로 유지한다. 가로 간격은 desktop/tablet 24px, mobile 12px이며,
  세로 간격은 desktop 40px, tablet 24px, mobile 12px이다. tablet/desktop 카드는 사진이 위에 있는
  기존 grid와 정확한 `8 / 5` 비율을 유지한다. 모바일 행은 9rem 왼쪽 썸네일과 나머지 본문 열을
  사용하며, 이미지는 고정 aspect ratio 없이 행 높이를 `object-fit: cover`로 채운다. 제목은 한 줄,
  소개는 두 줄에서 말줄임하고, 모임 종류·활동 일정·잔여 모집 인원과 모집 중인 경우의 상태 badge를
  함께 표시한다.

## 3. Layout system

- `AppShell`: 전체 background는 white canvas다. 검은 GlobalHeader 배경은 모든 viewport에서
  top full-bleed로 렌더하고, header 내부 콘텐츠만 `--container-shell`과 `--page-gutter`에 맞춰
  중앙 정렬한다. skip link, main landmark, mobile drawer와 동일한 auth action을 모든 route에
  제공한다. 공통 footer는 검은 full-bleed surface 안에 브랜드 소개·자리 유래·Contact us 안내·외부
  GitHub 링크를 두고, 모바일에서는 안내와 외부 링크를 콘텐츠 아래로 쌓는다. route lazy loading 또는
  guard 확인 중에는 footer를 노출하지 않아 loading surface가 콘텐츠보다 먼저 보이지 않게 한다.
- Header composition: desktop은 `auto / 1fr / auto` grid로 wordmark와 주요 navigation을 왼쪽
  클러스터로 묶고, 우측 auth action을 고정한다. anonymous도 탐색·모임 만들기·모임 관리 진입점을 보고, guard가
  인증이 필요한 destination을 처리한다. anonymous가 보호 메뉴를 누르면 해당 경로를 로그인 후
  복귀 대상으로 저장하고, 현재 화면에서 로그인 필요 toast를 즉시 제공한다. authenticated 상태에만
  `마이` link와 logout action을 더한다.
- Header active state는 pathname의 정확한 목적지 하나에만 연결한다. `/groups/new`에서 상위
  `/groups` 탐색 링크를 동시에 활성화하거나, `/my/groups`에서 `/my`를 동시에 활성화하지 않는다.
- `PageContainer`: 모든 route의 좌우 gutter와 최대 폭을 통일한다.
- `ListLayout`: PageHeader → search/filter → result meta → cards → cursor action. 한 화면 안의 hero,
   tool row, result heading, card grid는 `PageContainer`의 동일한 좌우 rail을 공유하며,
   카드 grid의 좌우 변을 기준으로 정렬한다. 탐색 discovery는 hero와 분리된 soft surface 안에
   배치하며, result meta는 `자리 둘러보기` 제목 바로 오른쪽에 둔다. 검색과 필터는 하나의
   control panel로 묶고, `모임 유형`, `모임 상태`, `모집 상태`라는 추상화된 native select
   세 개로 노출한다.
   
   탐색 hero의 display copy는 `크루와` / `함께할 자리를` / `찾아보세요` 세 줄을 모든
   viewport에서 유지하되, 접근성 이름은 한 문장으로 제공한다. 랜딩에는 하단 스크롤 CTA를
   둔다.
- 탐색 hero는 `src/shared/assets/brand/jarihana-signature.png`를 교체 가능한 signature art로
  사용한다. 표시 영역은 원본의 `1672 / 941` 비율을 따르고, 중앙 정렬과 `contain`으로
  상하좌우를 자르지 않는다.
  헤더 mark는 `src/shared/assets/brand/jarihana-favicon.png`를 교체 지점으로 사용한다.
- `DetailLayout`: group detail은 desktop에서 본문 + sticky support rail 구조를 사용하며
  전체 폭은 공통 `--container-shell`을 따른다. support rail은 운영자 프로필 카드 다음에 모집 정보 카드를
  배치한다. tablet 이하에서는 순차 single column으로 전환한다.
  mobile(`47.9375rem` 이하)에서는 헤더와 상세 hero 사이 간격을 두지 않는다.
  상세 페이지의 좌우 바깥 여백은 없애고, hero·탭 본문 안쪽 여백은 유지한다.
  모바일 상세 hero는 둥근 모서리 없이 화면 가장자리와 맞닿게 배치한다.
  모바일에서는 `목록으로` 버튼과 그 버튼용 상단 빈 공간을 없앤다. 운영자에게 보이는 수정 버튼은
  유지하고, 모임 유형과 제목의 오른쪽에 버튼 공간을 확보해 겹치지 않게 한다.
- rail이 숨는 tablet/mobile에서는 운영자 프로필을 hero 안의 프레임 없는 byline으로 옮긴다.
  민트 ring의 compact avatar와 `운영자 · N기 크루` caption, 이름을 한 덩어리로 묶되 별도의
  card·chip·배경은 만들지 않고 hero 자체 overlay 위에 직접 배치한다.
- 모집 정보만 floating modal로 제공하며, detail tabs는 content section을 바꾸지만
  URL route는 detail에 남긴다.
- desktop 모집 rail은 내용의 자연 높이를 유지하고 내부 스크롤을 만들지 않는다. rail의 실제
  높이를 `ResizeObserver`로 측정해 `--group-rail-height`에 반영한다. sticky 상단 위치는
  `--space-5`와 `100dvh - rail 높이 - --space-4 - safe area` 중 작은 값으로 정한다.
  카드가 창보다 높아도 페이지 스크롤로 신청 action까지 도달할 수 있으며, 모집 일정 펼치기나
  글꼴·화면 크기 변경에도 위치를 다시 맞춘다. 스크롤과 함께 사라지는 header 높이는 차감하지 않는다.
  가로 `89.9375rem` 이하에서는 기존 `자리 확인` 버튼과 모집 정보 모달을 사용한다.
  세로 viewport 높이나 DPI, devicePixelRatio는 전환 조건으로 사용하지 않는다.
- 모집 정보 플로팅 버튼은 텍스트 없이 기존 `jarihana-favicon.png` 의자 로고만 담은 원형 버튼으로
  표시한다. 지름은 `맨 위로 이동` 버튼과 같은 `--touch-target-lg`(48px), 안쪽 여백은
  `--space-2`(8px)이며 secondary 표면을
  사용한다. 이미지 전체를 `object-fit: contain`으로 표시하고, 버튼의 접근성 이름은
  `모집 정보 보기`로 유지한다. 이미지에는 빈 alt와 `aria-hidden`을 적용한다.
  본문 끝에는 버튼 영역만큼 여백을 두고, `맨 위로 이동` 버튼은 이 원형 버튼 위에
  `--space-3`(12px) 간격으로 배치하고 오른쪽 끝을 맞춘다.
  모집 정보 일러스트는 desktop과 모달에서 같은 가운데 정렬 규칙을 사용한다. desktop rail에서는
  가용 가로 폭 안에 원본 비율로 맞추고 세로 viewport 높이에 따라 축소하지 않는다. 모달에서는
  가용 폭과 viewport 높이 안에 맞춘다. 이미지 자체보다 큰 최소 높이를 별도로 예약하지 않는다.
- desktop과 모바일 모집 정보 모달의 `가입 신청하기` 버튼은 흰 surface와 line 테두리를 사용하고,
  문구 왼쪽에 기존 의자 로고를 `--space-8`(32px) 크기의 장식 이미지로 표시한다.
  모집 마감·운영자·가입 완료 등의 상태별 버튼은 기존 표현을 유지한다.
- 모달의 모집 정보 스크롤바는 투명 track과 얇고 둥근 thumb를 사용하며 스크롤바 공간을 상시 예약하지
  않는다. 모달은 둥근 외곽 안쪽의 모집 정보 한 곳에서만 세로 스크롤하고 제목·닫기 버튼·신청
  action은 고정한다. 내부 flex/grid 요소는 가용 폭까지 줄어들며 가로 스크롤을 만들지 않는다.
- `FormLayout`: group editor는 `1100px` content target을 부모 shell 안에서 중앙 정렬하고, mint hero, white form panels,
  step title/illustration과 하단 action bar를 둔다. 1024px 미만에서는 hero의 text/visual을
  세로로 쌓고, mobile day picker는 2 columns로 줄인다. 모바일 설명 편집기의 `작성`·`미리보기`
  도구는 한 행의 2열로 유지한다.
- `MyPageLayout`: profile column + activity panel의 desktop split, 3개 count link, 2-column
  summary cards를 사용한다. tablet/mobile에서는 각 grid를 정보 순서대로 한 column으로 접는다.
  dashboard surface의 좌우 확장과 내부 여백은 page gutter 이하로 제한해 모바일 가로 넘침을 막는다.
- `ManageLayout`: group name context header와 horizontal route-backed tabs(`모임 수정`,
  `모집 관리`, 조건부 `신청 관리`, `멤버 관리`)를 모든 leader page가 공유한다. 멤버는 table,
  모집은 summary + condition form + public-state rail, 신청은 applicant panel + operations rail로
  표현하고 mobile에서는 모두 single column으로 재배치한다. 관리 컨텍스트의 제목 행에는
  그룹명 왼쪽에 `ArrowLeft` 아이콘-only semantic link를 두어 모임 상세로 돌아갈 수 있음을
  표현한다. 링크의 왼쪽 변은 아래 관리 탭의 시작점과 맞추고, 아이콘은 기존 `--touch-target`
  (44px) hit area 안에서 시작한다. 좁은 화면에서는 제목 아래로 자연스럽게 줄바꿈하되
  `aria-label="모임 상세로 돌아가기"`와 title로 목적지를 보완한다.
- 일반 route는 page title 하나의 `h1`, section은 순차 `h2`, card title은 `h3`를 사용한다.
  탐색 route의 hero와 `자리 둘러보기`는 현재 제품 요구에 따라 각각 `h1`으로 노출한다.

## 4. Component visual grammar

- Buttons: primary mint/black text, secondary white/line, tertiary text, danger red. 모든 variant는
  default/hover/active/focus/disabled/pending 상태를 갖는다. 목적지를 바꾸는 액션은 버튼처럼
  보이더라도 semantic link를 사용한다. 일반 목적지 링크는 visible label을 유지하고, 관리
  컨텍스트의 모임 상세 복귀만 관습적인 왼쪽 화살표와 `aria-label`을 함께 사용하는 icon-only
  예외로 둔다.
- Footer: 프로토타입의 `64px 24px` desktop / `48px 24px` mobile padding, 좌측 서비스 설명 박스와
  우측 Contact us 안내·코드 아이콘이 있는 저장소 링크를 사용한다. 서비스 설명 박스는 민트색 시작선과
  얇은 경계로 별도 정보 영역임을 드러내고, Contact us는 22px 흰색 heading과 14px muted body copy로
  링크가 없는 안내 문구를 클릭 가능한 요소로 오해되지 않게 한다. 문구는 `피드백이나 궁금한 점은
  이삭, 에덴, 파도, 요크에게 슬랙 DM 주세요!`로 유지한다. 저장소 링크의 accessible name과 visible
  label은 `레포지토리로 이동`으로 통일한다.
  데스크톱에서는 Contact us와 저장소 링크를 같은 왼쪽 기준선에 맞추고, 태블릿 이하에서는 저장소
  링크를 Contact us 아래로 쌓는다. 탐색 페이지에서는 카드 grid rail을 그대로 상속해 내부 좌우
  끝점을 맞춘다. 인스타그램은 노출하지 않고 저장소 링크 하나만 둔다.
- Fields: label, optional description, control, inline error를 같은 field group으로 묶는다. 탐색
  검색은 주변 박스 테두리를 제거하고 얇은 underline과 focus 시 brand line으로 입력 상태를
  표현한다.
- Select: native keyboard/assistive-tech 동작을 유지하면서 오른쪽 chevron, 넉넉한 우측 padding,
  pointer cursor를 제공한다. 탐색 필터는 검색과 같은 underline control surface를 사용하고,
  focus 시 하단선을 brand color로 강조한다.
  모바일에서도 세 가지 필터를 같은 행에 두며 간격은 `--space-2`(8px)이다. 검색 입력창은 별도
  전체 너비 행을 유지한다. 모바일 select는 `--text-caption`(13px), 좌우 padding 8px/24px와
  오른쪽 8px chevron을 사용해 긴 선택값도 잘리지 않게 한다. 최소 터치 높이는 유지한다.
- Cards: 14–20px radius, `--border-thin` line, 20–24px padding. tablet/desktop 탐색 카드는 사진이
  위에 있는 기존 구조와 정확한 `8 / 5` 비율을 유지한다. 모바일 탐색 카드는 마이페이지 activity row
  문법을 사용해 `9rem minmax(0, 1fr)` 두 열로 배치한다. 왼쪽 이미지는 행 전체 높이를 채우고,
  오른쪽 본문은 16px padding과 8px gap을 사용한다. 제목은 한 줄, 소개는 두 줄에서 말줄임표로
  마감하며, 태블릿/데스크톱 카드와 같은 활동 일정·잔여 모집 인원 메타를 하단에 표시한다. 모임 종류는
  모든 breakpoint에서 마이페이지와 같은 유형별 tag 색상을 사용한다. 모집 상태 badge는 `모집 중`일
  때만 표시하고 마감 상태는 생략한다.
  GroupCard 이미지는 backend의 `representativeImageUrl`을 그대로 사용하며, 탐색 이외의 기본
  GroupCard는 기존 surface와 하단 fade를 유지한다. 서버 기본 이미지 경로도 별도
  일러스트로 치환하지 않는다.
- Account activity/group cards: 상세 목적지가 하나인 카드는 제목만이 아니라 카드 전체가 하나의
  semantic link다. 내부 mutation button이 있는 신청 카드는 중첩 interactive element를 피하기 위해
  제목 링크와 action을 분리한다.
- MarkdownContent: raw HTML을 실행하지 않고 제목, 굵게, 목록, 인용, 안전한 http(s)/내부 링크만
  React element로 렌더한다. 작성 화면 미리보기와 공개 모임 소개가 같은 renderer를 공유한다.
- GroupMemberInsights: 실제 group member cursor data로 상세 멤버 탭과 같은 `멤버` heading, 공통
  `Avatar`를 사용한 멤버 요약, 기수별 categorical rail, 기수별 인원 chip을 구성한다. heading 옆에는
  상세 멤버 탭과 중복되는 현재 인원 배지를 두지 않는다. avatarUrl이 있으면 GitHub 프로필 이미지를
  표시하고, 실패하거나 없을 때만 crew name 이니셜로 대체한다. rail segment는 hover와 keyboard
  focus에서 `N기 · M명` preview를 제공한다. 생성 전 화면은 아직 groupId가 없으므로 멤버를 꾸며내지
  않고 생성 후 확인 가능 상태를 표시한다.
- Badges: 상태색의 soft surface + 고대비 text, pill shape.
- Tabs: route 또는 상태와 연결된 semantic tablist. 선택 underline 하나가 새 tab 위치로 이동하고
  panel은 짧게 fade/translate되어 공간 연속성을 전달한다. 모바일은 가로 scroll하되 page 자체
  overflow는 막는다.
- Modal/Dialog: 중앙 dialog 또는 오른쪽 drawer를 사용한다. focus trap, Escape, focus restore를
  공통 동작으로 제공한다.
- Toast: 성공/오류를 `aria-live`, 최대 3개 stack으로 알리고 2,000ms 후 자동 닫힘과 수동 닫기
  버튼을 제공한다.
- Skeleton: 실제 content geometry를 닮고 background refetch에서는 기존 content를 지우지 않는다.
- Empty/Error/Forbidden/NotFound: 상태명, 다음 행동 하나, 필요 시 재시도 링크를 제공한다.
  탐색의 `자리 없음!`은 숫자 마크 없이 시그니처 visual과 직접 자리 만들기 action을 제공한다.

## 5. Primitive inventory and states

구현 대상 공통 primitive:

`Button`, `IconButton`, `TextField`, `Textarea`, `Select`, `Checkbox`, `Radio`, `SearchField`,
`FilterBar`, `Card`, `GroupCard`, `RecruitmentCard`, `StatusBadge`, `Avatar`, `Tabs`, `Modal`,
`ConfirmDialog`, `Drawer`, `Toast`, `Footer`, `ScrollToTopButton`, `HeroScrollButton`, `Skeleton`,
`EmptyState`, `ErrorState`, `ForbiddenState`, `NotFoundState`, `CursorList`.

개발용 `/__showcase` route에서 light canvas 위 모든 variant, keyboard focus, error, disabled, pending,
long Korean copy, empty/skeleton을 검수한다. production navigation에는 노출하지 않는다.

`SignupTypeOption`은 `/signup`의 가입 유형 선택에만 사용하는 radio pattern이다. `button[role="radio"]`
안에 1:1 character image와 text label을 쌓아 폼 내부 2열 중 한 열을 채우고,
default/hover/active/focus/selected 상태를 제공한다.
이미지는 장식적 보조 정보로 `alt=""`와 `aria-hidden`을 사용하며, 선택 의미는 라벨과
`aria-checked`로 전달한다. 간격은 기존 `--space-*` 토큰을 사용하고, 이미지는
`--signup-type-image-base-size`를 기준으로 `scale(2)`를 고정해 hover/selected 상태에서도
크기를 바꾸지 않는다. 이미지 프레임이 확대된 이미지의 실제 영역을 차지하므로 라벨과
언더라인이 이미지 아래에 놓인다. hover는 옅은 민트 surface를 사용하지만 selected 상태는
브랜드 언더라인과 기본 text 색만 사용한다.
프로필 입력 상태에서도 코치는 선택한 캐릭터 이미지와 선택 영역을 오른쪽, `SignupProfilePanel`을
왼쪽에 두고, 크루는 캐릭터를 왼쪽, `SignupProfilePanel`을 오른쪽에 둔다. 캐릭터가
프로필 사진을 등지지 않도록 선택 전의 캐릭터 위치를 유지하고, 프로필 입력 패널만
캐릭터 반대편에서 펼쳐진다. 프로필 입력은
선택 영역의 언더라인과 수직 기준을 맞추도록 위로 정렬한다. 가입 완료와 유형 변경 액션은
전체 프로필 입력 영역의 중앙 아래에 배치한다. `유형 변경`으로 다시 두 유형을 선택할 수 있다.
폼 상단의 안내 문구는 선택 전 `안녕하세요. 크루인가요? 코치인가요?`를 보여주고,
선택 후에는 크루·코치 상태에 맞는 문구로 갱신한다. 상태 변경은 `aria-live="polite"`로
전달하며 문구는 검정색의 h2 크기로 폼 상단 중앙에 배치한다. 초기 선택 화면에서는
중복되는 `가입 유형 선택`·`프로필 입력` 헤더를 숨긴다. 문구는 `--space-8`만큼 위로
시각 이동하고, 모바일에서는 정사각형 고정과 2열을 해제해 선택 캐릭터·프로필 입력·액션이
세로로 이어지는 콘텐츠 기반 흐름을 사용한다. 모바일에서 유형을 선택한 뒤에는 선택 영역을
숨기고 프로필 입력과 액션만 남겨 정보 입력에 집중할 수 있게 한다.

## 6. Interaction and motion

- Fast `120ms`, base `180ms`, deliberate `240ms`, smooth `420ms`; easing `cubic-bezier(.2,.8,.2,1)`.
- Button은 색/1px translate 변화만, 카드 hover는 2px 이내 상승한다. tabs의 단일 underline은
  `180ms` transform으로 새 위치에 이동하고 panel은 opacity + 8px translate로 진입한다.
- Signup의 크루·코치 전환은 선택 전 캐릭터 위치를 유지한다. 캐릭터 반대편의 프로필 패널은
  `scaleX`와 `translateX`를 함께 사용해 중앙에서 바깥쪽으로 살짝 펼쳐지며, 양쪽 방향 모두
  `smooth` duration을 사용한다. `prefers-reduced-motion`에서는 이동을 제거한다.
  Header와 route/content tabs의 underline은 현재 목적지/패널 하나에만 표시한다. Select chevron은
  열 수 있는 control임을 상시 알리며, 기수 rail preview는 hover와 focus에서 같은 정보를 제공한다.
- Toast는 2,000ms 후 180ms 동안 opacity와 transform으로 부드럽게 퇴장한 뒤 제거되며, 사용자가
  직접 닫을 수 있는 닫기 버튼을 함께 제공한다.
- Dialog는 opacity + 8px scale/translate, drawer는 transform을 사용한다.
- `HeroScrollButton`은 카드 수나 화면 높이에 관계없이 목록의 `자리 둘러보기` 제목에 맞춰
  smooth scroll한다. 제목 위의 화면 여백은 `--space-4`(16px)이며, 제목 아래 검색·필터를
  먼저 보여준다. 카드가 없는 상태에서도 같은 기준을 유지한다.
  `ScrollToTopButton`은
  viewport 우측 하단에 fixed로 유지되어 페이지 최상단으로 smooth scroll한다. 두 동작 모두
  `prefers-reduced-motion: reduce`에서는 즉시 이동한다.
- loading은 레이아웃 이동 없이 skeleton 또는 버튼 내부 spinner로 표현한다.
- `prefers-reduced-motion: reduce`에서는 transition/animation을 사실상 제거하고 정보는 유지한다.
- destructive mutation은 확인 → pending lock → success toast/route update 순서로 진행한다.

## 7. Accessibility contract

- WCAG 2.2 AA, 핵심 route axe critical/serious 0건을 기준으로 한다.
- skip link, `header/nav/main/footer`, 하나의 `h1`, semantic list/table/form을 사용한다.
- 모든 input은 visible label과 description/error id를 연결한다.
- focus ring은 2px brand + 2px surface offset이며 색만으로 상태를 전달하지 않는다.
- dialog는 focus trap, initial focus, Escape close, opener focus restore를 제공한다.
- minimum touch target 44×44px, 이미지에는 의미 있는 alt 또는 장식용 빈 alt를 적용한다.
- API 오류는 focus 가능한 summary 또는 `role=alert`로 알리고 재시도 동작을 제공한다.

## 8. Fidelity decisions, constraints and accepted debt

| Decision                                       | Reason                                             | Status              |
| ---------------------------------------------- | -------------------------------------------------- | ------------------- |
| JavaScript/JSX + Webpack/Babel 사용            | 사용자가 TypeScript와 Vite를 명시적으로 제외       | accepted            |
| desktop-only Figma에서 responsive 규칙 파생    | 필수 360/768 검증을 충족하고 정보 우선순위 유지    | accepted            |
| Figma header의 frame 간 위치 불일치            | 화면별 복제 대신 common shell을 유지               | accepted            |
| 모든 viewport의 full-bleed header 배경         | 사용자 피드백과 공통 shell 정렬을 반영             | accepted            |
| header 내부 콘텐츠의 shell/gutter 정렬         | 본문 section 시작·끝 rail과 일관성 유지            | accepted            |
| 대표 이미지 picker/업로드                      | presigned 업로드 API와 그룹 image key 계약 반영      | implemented         |
| 프로필 수정·멤버 제거 액션 제거                | backend에 실제 mutation 없음                       | accepted            |
| production runtime fallback 성공 데이터 금지   | API에 없는 기능·데이터를 성공처럼 보이지 않게 함   | accepted            |
| 생성 전 멤버 탭의 안내 상태                    | groupId가 생기기 전 실제 멤버 API를 호출할 수 없음 | accepted            |
| OAuth 실사용 검증은 자격 증명/테스트 계정 필요 | secret과 실제 계정은 저장소에 넣지 않음            | external dependency |

Figma reference screenshot은 root의 `.omo/evidence/figma/`에 보관한다. 해당 screenshot은
비교 근거이며 UI를 이미지로 복제하는 구현물은 아니다. 미해결 시각/접근성 부채는 구현·QA
과정에서 이 표에 추가하고, 근거 없이 “none”으로 닫지 않는다.
