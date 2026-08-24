# 자리하나 UI 디자인 시스템

## 0. Research log

- 일반 화면 시각 기준: Figma `자리하나 디자인 (복사)` 파일의 `최종 디자인 2` 페이지
  (`438:2657`). 모임 생성·정보 수정·모임장 관리의 기준은 사용자가 지정한 `최종 디자인`
  (`354:1479`)의 초안 frame이다.
- 기능 기준: 현재 `backend/`의 Controller, DTO, Security, domain service, acceptance test.
- 생성/관리 초안은 실제 backend API가 지원하는 동작만 남기고 제품 화면으로 구현했다.
- 자산: Figma export 원본을 `src/shared/assets/figma/`에 저장했다. 화면 screenshot 자체를 UI로
  사용하지 않는다.
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
| `--color-brand-ink`    | `#08736f`        | 밝은 mint 위에서도 읽히는 브랜드 text      |
| `--color-brand-soft`   | `#dff8f3`        | hero와 선택 배경                           |
| `--color-ink`          | `#1d1d1f`        | 본문과 제목                                |
| `--color-muted`        | `#7a7a7a`        | 보조 정보                                  |
| `--color-muted-ink`    | `#666666`        | 작은 text의 대비 보강                      |
| `--color-line`         | `#e0e0e0`        | 구분선과 field border                      |
| `--color-surface`      | `#ffffff`        | 카드와 입력 surface                        |
| `--color-canvas`       | `#f5f5f7`        | 앱 배경                                    |
| `--color-nav`          | `#000000`        | global header                              |
| `--color-danger`       | `#c7352a`        | 오류/파괴 액션, AA 대비용 파생 token       |
| `--color-danger-soft`  | `#fff0ee`        | 오류 배경                                  |
| `--color-success`      | `#247a45`        | 성공 상태, AA 대비용 파생 token            |
| `--color-success-soft` | `#eaf8ef`        | 성공 배경                                  |
| `--color-warning`      | `#8a5b00`        | 경고/대기 상태, AA 대비용 파생 token       |
| `--color-warning-soft` | `#fff6df`        | 경고 배경                                  |
| `--color-cohort-1..5`  | categorical ramp | 멤버 기수 분포의 비텍스트 구간·아바타 배경 |

`--color-text-brand`와 `--color-text-muted`는 각각 `brand-ink`, `muted-ink`를 가리키는
semantic text alias다. 밝은 brand fill은 CTA surface로, 더 어두운 alias는 text로 분리해
대비와 의미를 함께 유지한다.

상태색은 Figma의 밝은 accent를 그대로 본문색으로 쓰지 않고 WCAG 2.2 AA 대비를 확보한 파생
색을 사용한다. raw hex는 `tokens.css` 외부에서 사용하지 않는다.

### Typography

- Family: `Noto Sans KR`, `Apple SD Gothic Neo`, `Malgun Gothic`, sans-serif.
- Hero: 48/1.18, 800. 모바일 34/1.22.
- Display: 40/1.2, 800. 모바일 30/1.25.
- H1: 32/1.3, 700. 모바일 26/1.35.
- H2: 24/1.4, 700. 모바일 21/1.4.
- H3: 18/1.45, 700.
- Body large: 17/1.65, 400.
- Body: 15/1.65, 400.
- Label: Figma 기준 14/20, 500.
- Caption: 13/1.5, 400.
- Brand: `--text-brand` 22px/800. Header wordmark에만 쓰며 본문 scale을 대체하지 않는다.
- `--font-size-caption`, `--font-size-label`, `--font-size-h3`는 기존 page CSS가 동일한
  type scale을 참조하도록 둔 compatibility alias다.

### Spacing and geometry

- Spacing: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Radius: small `8`, medium `14`, large `20`, pill `999`.
- Container: 구현 token `--container-shell`은 `1360px`이다. `PageContainer`는 360px에서는
  `20px`, 768px 이상에서는 `32px` gutter를 사용한다. form 화면은 각 페이지가 별도로
  좁은 읽기 폭을 둔다. group detail은 대표 이미지와 모집 rail을 함께 보여 주는 넓은 화면에서만
  `1600px` 상한을 사용해 기본 shell보다 여유 있게 펼치되 viewport 끝까지 늘어나지는 않는다.
  detail hero는 desktop에서 이 전체 폭을 차지하며 최소 높이 `440px`, 내부 padding `32px`로
  모임 정보와 가장자리 사이의 여백을 확보한다.
- Border: `--border-thin`(1px)과 `--border-strong`(2px)을 사용한다. 기본 surface 경계는
  thin, 탐색 입력의 강조 하단선 같은 의도적 emphasis만 strong을 사용한다.
- Touch: `--touch-target`은 44px, `--touch-target-lg`는 48px이다. button, navigation,
  filter, form control은 이 최소 높이를 공유한다.
- Header: `--header-height` 72px, active line 3px, loading auth placeholder 108px로
  geometry를 token화한다.
- Shadow: 카드 hover와 modal만 `0 12px 34px rgb(29 29 31 / 10%)`; 일반 정보 그룹은 border/tonal
  surface로 깊이를 표현한다.
- Z layers: header `20`, sticky `25`, overlay `40`, dialog `50`, toast `60`.

### Responsive breakpoints

- token metadata: `--breakpoint-md` 48rem(768px), `--breakpoint-lg` 64rem(1024px).
- `360–767`: full-bleed header, 20px page gutter, single column, mobile drawer. 그룹
  detail rail과 운영 side rail은 본문 아래로 이동하고, management table은 labelled card rows로
  바뀐다.
- `768–1023`: full-bleed header 배경과 32px content gutter. 탐색 card는 2 columns, account는 좁은
  profile/content split, group editor hero는 single column으로 전환한다.
- `1024–1439`: desktop shell과 3-column 탐색 카드, group detail/registration의 side rail,
  group editor 2-column hero, management grid/table을 사용한다. 고정 폭 action은 충분한
  공간이 없으면 줄바꿈한다.
- `1440+`: Figma desktop 비율과 1360px shell 상한을 중앙 정렬한다.

## 3. Layout system

- `AppShell`: 전체 background는 white canvas다. 검은 GlobalHeader 배경은 모든 viewport에서
  top full-bleed로 렌더하고, header 내부 콘텐츠만 `--container-shell`과 `--page-gutter`에 맞춰
  중앙 정렬한다. skip link, main landmark, mobile drawer와 동일한 auth action을 모든 route에
  제공한다. 현재 공통 footer는 없다.
- Header composition: desktop은 `1fr / auto / 1fr` grid로 wordmark, centered navigation,
  우측 auth action을 고정한다. anonymous도 탐색·모임 만들기·모임 관리 진입점을 보고, guard가
  인증이 필요한 destination을 처리한다. anonymous가 보호 메뉴를 누르면 해당 경로를 로그인 후
  복귀 대상으로 저장하고, 현재 화면에서 로그인 필요 toast를 즉시 제공한다. authenticated 상태에만
  `마이` link와 logout action을 더한다.
- Header active state는 pathname의 정확한 목적지 하나에만 연결한다. `/groups/new`에서 상위
  `/groups` 탐색 링크를 동시에 활성화하거나, `/my/groups`에서 `/my`를 동시에 활성화하지 않는다.
- `PageContainer`: 모든 route의 좌우 gutter와 최대 폭을 통일한다.
- `ListLayout`: PageHeader → search/filter → result meta → cards → cursor action. 한 화면 안의 hero,
  tool row, result heading, card grid는 `PageContainer`의 동일한 좌우 rail을 공유한다. 탐색 hero의
  display copy는 `크루와` / `함께할 자리를` / `찾아보세요` 세 줄을 모든 viewport에서 유지하되,
  접근성 이름은 한 문장으로 제공한다.
- `DetailLayout`: group detail은 전체 폭 `1600px` 안에서 full-span hero 다음에 본문 + sticky
  support rail을 배치한다. hero의 왼쪽은 모임 소개·모임 정보, 오른쪽 rail 폭은 운영자 프로필이
  차지한다. 운영자 영역은 대표 이미지를 그대로 노출하지 않고 강한 blur와 nav/brand gradient로
  색감만 이어 받으며 얇은 separator로 정보 경계를 만든다. hero 아래 support rail에는 모집 정보만
  둔다. rail이 숨는 tablet/mobile에서는 운영자 프로필을 hero 안의 compact chip으로 바꾸고 모집
  정보만 floating modal로 제공한다. detail tabs는 content section을 바꾸지만 URL route는 detail에
  남긴다.
- `FormLayout`: group editor는 `1100px` content target 안에 mint hero, white form panels,
  step title/illustration과 하단 action bar를 둔다. 1024px 미만에서는 hero의 text/visual을
  세로로 쌓고, mobile day picker는 2 columns로 줄인다.
- `MyPageLayout`: profile column + activity panel의 desktop split, 3개 count link, 2-column
  summary cards를 사용한다. tablet/mobile에서는 각 grid를 정보 순서대로 한 column으로 접는다.
- `ManageLayout`: group name context header와 horizontal route-backed tabs(`모임 수정`,
  `모집 관리`, 조건부 `신청 관리`, `멤버 관리`)를 모든 leader page가 공유한다. 멤버는 table,
  모집은 summary + condition form + public-state rail, 신청은 applicant panel + operations rail로
  표현하고 mobile에서는 모두 single column으로 재배치한다.
- Page title은 route당 하나의 `h1`, section은 순차 `h2`, card title은 `h3`를 사용한다.

## 4. Component visual grammar

- Buttons: primary mint/black text, secondary white/line, tertiary text, danger red. 모든 variant는
  default/hover/active/focus/disabled/pending 상태를 갖는다.
- Fields: label, optional description, control, inline error를 같은 field group으로 묶는다. 검색은 input과
  submit icon을 하나의 thin-border/small-radius control surface로 묶는다.
- Select: native keyboard/assistive-tech 동작을 유지하면서 오른쪽 chevron, 넉넉한 우측 padding,
  pointer cursor를 제공해 일반 input과 시각적으로 구분한다.
- Cards: 14–20px radius, `--border-thin` line, 20–24px padding. 클릭 가능한 카드 전체에
  focus-visible을 둔다. 상태 badge는 이미지 위에 걸치지 않고 카드 본문 첫 metadata row 안에 둔다.
  GroupCard 이미지는 backend의 `representativeImageUrl`을 그대로 사용하며, 서버 기본 이미지 경로도
  별도 일러스트로 치환하지 않는다.
- Account activity/group cards: 상세 목적지가 하나인 카드는 제목만이 아니라 카드 전체가 하나의
  semantic link다. 내부 mutation button이 있는 신청 카드는 중첩 interactive element를 피하기 위해
  제목 링크와 action을 분리한다.
- MarkdownContent: raw HTML을 실행하지 않고 제목, 굵게, 목록, 인용, 안전한 http(s)/내부 링크만
  React element로 렌더한다. 작성 화면 미리보기와 공개 모임 소개가 같은 renderer를 공유한다.
- GroupMemberInsights: 실제 group member cursor data로 멤버 요약, 기수별 categorical rail, 기수별
  인원 chip을 구성한다. rail segment는 hover와 keyboard focus에서 `N기 · M명` preview를 제공한다.
  생성 전 화면은 아직 groupId가 없으므로 멤버를 꾸며내지 않고 생성 후 확인 가능 상태를 표시한다.
- Badges: 상태색의 soft surface + 고대비 text, pill shape.
- Tabs: route 또는 상태와 연결된 semantic tablist. 선택 underline 하나가 새 tab 위치로 이동하고
  panel은 짧게 fade/translate되어 공간 연속성을 전달한다. 모바일은 가로 scroll하되 page 자체
  overflow는 막는다.
- Modal/Dialog: 중앙 dialog 또는 오른쪽 drawer를 사용한다. focus trap, Escape, focus restore를
  공통 동작으로 제공한다.
- Toast: 성공/오류를 `aria-live`, 최대 3개 stack으로 알리고 focus/hover 중에는 자동 닫힘을
  일시 정지한다.
- Skeleton: 실제 content geometry를 닮고 background refetch에서는 기존 content를 지우지 않는다.
- Empty/Error/Forbidden/NotFound: 상태명, 다음 행동 하나, 필요 시 재시도 링크를 제공한다.

## 5. Primitive inventory and states

구현 대상 공통 primitive:

`Button`, `IconButton`, `TextField`, `Textarea`, `Select`, `Checkbox`, `Radio`, `SearchField`,
`FilterBar`, `Card`, `GroupCard`, `RecruitmentCard`, `StatusBadge`, `Avatar`, `Tabs`, `Modal`,
`ConfirmDialog`, `Drawer`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `ForbiddenState`,
`NotFoundState`, `CursorList`.

개발용 `/__showcase` route에서 light canvas 위 모든 variant, keyboard focus, error, disabled, pending,
long Korean copy, empty/skeleton을 검수한다. production navigation에는 노출하지 않는다.

## 6. Interaction and motion

- Fast `120ms`, base `180ms`, deliberate `240ms`; easing `cubic-bezier(.2,.8,.2,1)`.
- Button은 색/1px translate 변화만, 카드 hover는 2px 이내 상승한다. tabs의 단일 underline은
  `180ms` transform으로 새 위치에 이동하고 panel은 opacity + 8px translate로 진입한다.
- Header와 route/content tabs의 underline은 현재 목적지/패널 하나에만 표시한다. Select chevron은
  열 수 있는 control임을 상시 알리며, 기수 rail preview는 hover와 focus에서 같은 정보를 제공한다.
- Dialog는 opacity + 8px scale/translate, drawer는 transform을 사용한다.
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
| 이미지 업로드 UI 제거                          | backend에 실제 endpoint/DTO 없음                   | accepted            |
| 프로필 수정·멤버 제거 액션 제거                | backend에 실제 mutation 없음                       | accepted            |
| production runtime fallback 성공 데이터 금지   | API에 없는 기능·데이터를 성공처럼 보이지 않게 함   | accepted            |
| 생성 전 멤버 탭의 안내 상태                    | groupId가 생기기 전 실제 멤버 API를 호출할 수 없음 | accepted            |
| OAuth 실사용 검증은 자격 증명/테스트 계정 필요 | secret과 실제 계정은 저장소에 넣지 않음            | external dependency |

Figma reference screenshot은 root의 `.omo/evidence/figma/`에 보관한다. 해당 screenshot은
비교 근거이며 UI를 이미지로 복제하는 구현물은 아니다. 미해결 시각/접근성 부채는 구현·QA
과정에서 이 표에 추가하고, 근거 없이 “none”으로 닫지 않는다.
