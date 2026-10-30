# 자리하나 UI 디자인 시스템

## 모임 채팅

- 헤더 채팅 아이콘의 오른쪽 위에 알림과 같은 danger/surface 색상과 badge 글자 크기의 미읽음 수를 표시한다. 0개는 숨기고 100개 이상은 `99+`로 표시하며 접근성 이름에는 실제 합계를 포함한다. 모바일과 데스크톱의 44px 클릭 영역은 유지한다.
- 상세 페이지 채팅 진입점은 오른쪽 사이드바의 마지막에 둔다. 사이드바가 숨겨지는 좁은 화면에서는 기존 모집 정보 버튼 아래에 표시한다. 모임 구성원에게 표시하며 탭 행과 마이페이지 카드에는 중복 채팅 버튼을 두지 않는다.

- 헤더 오른쪽 액션은 자리 만들기 → 채팅 → 알림 → 프로필 순서다. 채팅은 접근성 이름을 유지한 아이콘 버튼이며 알림과 동일한 흰색, 20px 아이콘, 44px 클릭 영역을 공유한다.
- 목록은 마이페이지 activity-row처럼 왼쪽 이미지가 카드 높이를 채우는 6.5rem / 본문 grid를 사용한다. 모바일은 이미지 열을 5rem으로 줄이고 본문은 세로 중앙에 정렬한다. 사진은 공통 GroupImage를 사용하며 제목·시간·마지막 메시지·미확인 수·유형·참여자·종료 상태는 유지한다. 호버는 shadow-card, 선택은 ink 20%·18%의 두 겹 그림자로 구분하며 테두리 색은 바꾸지 않는다. 체크 표시는 두지 않는다. 활동 중 방은 흰 배경, 종료된 방은 회색 배경·회색 사진·자물쇠와 종료 배지를 유지한다. 왼쪽 표시선은 두지 않고 키보드 포커스 테두리는 유지한다.
- 채팅 전용 글자 확대를 두지 않고 사이트 공통 글자 크기 토큰을 상속한다. 헤더의 채팅·알림 버튼 간 간격은 space-1로 좁히되 44px 클릭 영역을 유지한다.
- 사이드바의 설명 문구를 제거한다. 대화 미선택 화면은 실제 모임 사진 세 장과 ‘대화할 모임을 선택해 주세요’만 표시한다. 재조회 버튼은 오류 상태에서만 제공한다.
- 방 전환은 chat-panel 하나의 native View Transition으로 240ms crossfade하며 기존 사진·헤더·목록의 위치를 보존한다. 미지원 브라우저는 같은 duration의 content fade-in을 사용한다. 모바일에서는 목록과 방을 동일 영역으로 전환하며 reduced-motion에서는 즉시 전환한다. 모달 열기는 기존 공통 240ms 전환을 유지한다.
- 데스크톱 채팅 모달은 바깥 여백과 전용 최대 너비 72rem을 사용하고 모바일은 화면을 채운다. 목록 기본 너비 24rem을 유지하면서 대화 영역을 줄여 좌우 메시지 사이 거리를 좁힌다. 대화 본문은 가운데 최대 너비 제한 없이 스크롤 영역 전체 폭을 사용하고 좌우에는 space-3만 둔다. 채팅이 열려 있으면 배경 모임 상세의 named view-transition을 비활성화하여 상세 진입 모션이 채팅 전환에 섞이지 않게 한다.

- 승인된 채팅 시안의 밑줄 검색·입력, 24rem 기본 목록 너비, 240–440px 드래그·키보드 조절과 모바일 목록/방 전환을 유지한다.
- 채팅은 현재 화면 위 공통 Modal로 열린다. 데스크톱은 최대 56rem 높이와 바깥 여백을 둔다. 767px 이하는 화면 너비와 높이를 채운다. 목록과 대화만 각각 스크롤하고 배경은 잠근다. 전체 서비스 배율과 공통 색·글자 토큰을 공유한다.
- 현재 pathname·검색 조건·hash를 보존한 `chat=inbox|모임ID` query로 모달 상태를 표현한다. 방 이동은 이력 교체, 최초 열기는 이력 추가로 브라우저 뒤로 가기에서 닫을 수 있다. 기존 `/chat`, `/chat/:roomId` 직접 진입은 홈 위 모달로 연결한다.
- 공통 Modal의 닫기·Escape·포커스 복귀를 재사용한다. 모바일에서 숨겨진 목록은 Tab 순서에서 제외한다.
- 대화 상단은 모임명과 참여자 수를 왼쪽에 정렬하며 전체 영역을 모임 상세 링크로 사용한다. 별도 모임 정보 drawer는 두지 않는다. 입력창은 숨겨진 접근성 레이블과 한 줄 밑줄 입력을 사용하고, 줄바꿈할 때만 최대 9rem까지 늘어난다. 전송 버튼은 입력 밑줄과 하단을 맞춘다.
- StyleGallery 원격 참조는 DNS 연결 실패로 확인하지 못했다. 기존 공통 Modal과 split-pane의 스크롤 소유권을 따른다.
- 메시지는 plain text로 표시한다. 실패한 항목은 원문을 남기고 다시 보내기 버튼을 제공한다. 종료된 방은 입력창 없이 이력과 기존 요청 재확인만 제공한다.
- 이전 대화 추가 로딩은 기존 내용의 스크롤 위치를 보존한다. 최신 위치에서 벗어나면 새 메시지 수신으로 강제 이동하지 않고 최근 메시지 버튼을 제공한다.
- 미확인 수는 서버 읽음 커서와 실제 메시지 이벤트로 갱신한다. 현재 방의 최신 확정 메시지가 보이는 활성 창에서만 읽음 요청을 보낸다.

## 스파링 목록

- 목록의 주 동작은 소개 히어로의 ‘토론 만들기’다. 우선순위는 토론 제목, 사용자가 작성한 양쪽 생각, 실제 남은 시간과 투표 결과다. 검색창만 두고 목록 필터는 표시하지 않는다.
- 사용자에게 표시하는 기능 이름은 ‘토론해요’다. 메뉴와 목록 제목은 이 이름을 쓰고 안내 문장은 ‘토론’으로 표현한다. 기존 `/sparring` 경로와 API·분석 식별자는 유지한다.
- 소개 히어로는 사용자가 선택한 반투명 캡슐 볼풀 이미지를 전체 폭으로 유지한다. 데스크톱 최소 높이는 기존 300px, 제목은 clamp(1.8rem, 3vw, 2.5rem), 버튼은 공통 크기를 사용한다. 문구 뒤 surface 그라데이션으로 가독성을 확보하고 600px 이하에서는 문구와 이미지를 세로로 쌓는다.
- Layout: 토론 목록 -> reel + stack; scroll owner: document, 진행 중인 카드만 가로 스크롤. 기존 밑줄 검색창과 4열 이미지 카드를 사용하며 태블릿에서는 3열, 작은 화면에서는 2열, 450px 이하에서는 다음 카드 일부가 보이는 85% 폭으로 줄인다. 카드 위에 제목·마감, 하단에 투표 결과·집계를 표시한다.
- 진행·마감 카드 모두 업로드한 대표사진을 우선 사용하고 기본 이미지는 기존 의자 캐릭터를 사용한다. 어두운 그라데이션 위에 흰색 텍스트를 배치한다. 마감된 토론은 넓은 이미지 행에 제목·집계와 최종 결과를 함께 표시한다.
- 진행 중인 토론 카드 상단에 제목을 강조하고 그 아래 텍스트로 실제 마감까지 남은 시간을 표시한다. 24시간 이상은 남은 시간을 올림한 `D-N`, 그 미만은 시간·분 또는 분·초로 보여주며 초마다 갱신한다. 마감일이 없는 기존 토론은 `마감일 없음`으로 표시한다.
- 각 카드 전체를 상세 이동 링크로 사용하고 기본 카드 그림자로 배경과 구분한다. hover에서는 그림자를 강조하고 키보드 focus를 표시한다. 진행 중인 카드에는 양쪽 투표 비율과 우세한 편을 표시하고, 투표가 없으면 안내 문구를 표시한다.

## 토론 마감

- 토론 생성 모달의 설명 아래에 선택형 마감 일시 입력을 둔다. 기기의 현지 시간을 ISO 시각으로 전송하며, 미지정 토론은 마감 없이 유지한다. 과거 시각은 생성 전에 오류로 안내한다. 목록과 상세에 마감을 표시하고, 마감 후 투표와 새 한마디 입력을 비활성화한다.

## 스파링 입력창 편 선택

- 편 선택과 입력란은 하나의 흰색 입력 장치 몸체 안에 둔다. 상단에 양쪽 편명을 나란히 표시하며 경기장 위의 편명처럼 굵은 글씨와 민트·코랄 밑줄을 사용한다. 선택한 편은 체크와 굵은 밑줄로 구분한다. 몸체는 얇은 중립색 테두리와 16px 모서리, 입력란은 공통 sunken 색상과 12px 모서리를 사용하며 크림색·두꺼운 바닥 그림자·음각 광택은 두지 않는다. 좁은 화면에서도 두 버튼과 44px 클릭 영역을 유지하며 긴 편명은 줄바꿈한다. 글자 수는 입력란 오른쪽 아래에 표시한다.
- 상세 화면의 목록 이동은 공통 secondary 버튼과 화살표 아이콘을 사용한다. 연결 상태는 옅은 회색 배지로, 주제는 민트 배경 대화 아이콘·제목·설명 순서로 구성하며 둘의 최대 너비를 맞춘다. 캡슐·캐릭터의 입체감은 유지하고 경기장의 조명과 통·미끄럼틀은 흰색·중립 회색으로 맞춘다. 말풍선과 기록 영역은 14px 모서리와 얕은 그림자를 사용한다.
- 편 선택은 기존 투표와 연결하고 저장이 끝나면 보내기 캡슐과 연결 파이프에 해당 편의 색을 적용한다. 작성 중 편을 바꿔도 입력 내용과 포커스를 유지하며, 저장 중에는 전송을 잠시 막는다. 저장에 실패하면 기존 선택과 입력 내용을 유지하고 오류를 알린다.
- 편이 바뀌면 입력 장치와 연결 파이프가 짧게 빛난다. 모션 감소 설정에서는 빛나는 동작을 생략한다.

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
  렌더하고, 내부 wordmark·auth action만 shell 상한과 page gutter에 맞춘다. 탐색/마이/관리
  화면의 맥락이 바뀌어도 header 위치와 인증 동작이 흔들리지 않게 하려는 결정이다.
- 정확한 Figma reference가 있으므로 별도 생성형 이미지·무관한 디자인 탐색은 사용하지 않았다.

## 1. Product atmosphere

자리하나는 “처음 앉을 자리를 가볍게 내어 주는 커뮤니티”다. 검은 navigation frame이 서비스의
신뢰감과 기준점을 만들고, 넓은 흰색/옅은 회색 surface와 mint accent가 친근한 초대의 분위기를
만든다. 둥근 카드, 절제된 선, 작은 3D/line illustration은 따뜻하지만 장난스럽지 않게 사용한다.

핵심 시각 문장: **검은 프레임 안에서 민트색으로 한 자리를 권하는, 정돈되고 열린 커뮤니티**.

## 2. Foundations

### Semantic colors

| Token                           | Value            | Usage                                        |
| ------------------------------- | ---------------- | -------------------------------------------- |
| `--color-brand`                 | `#2ac1bc`        | 주요 CTA, 선택 상태, 브랜드 포인트           |
| `--color-brand-strong`          | `#21aaa5`        | hover/pressed, 강조 텍스트                   |
| `--color-brand-display`         | `#1d9893`        | 밝은 canvas 위 큰 display text용 민트        |
| `--color-brand-ink`             | `#08736f`        | 밝은 mint 위에서도 읽히는 브랜드 text        |
| `--color-brand-soft`            | `#dff8f3`        | hero와 선택 배경                             |
| `--color-ink`                   | `#1d1d1f`        | 본문과 제목                                  |
| `--color-muted`                 | `#7a7a7a`        | 보조 정보                                    |
| `--color-muted-ink`             | `#666666`        | 작은 text의 대비 보강                        |
| `--color-line`                  | `#e0e0e0`        | 구분선과 field border                        |
| `--color-line-strong`           | `#d8dade`        | 계정 카드처럼 선명한 surface 경계            |
| `--color-surface`               | `#ffffff`        | 카드와 입력 surface                          |
| `--color-surface-sunken`        | `#f4f5f7`        | 카드 안쪽의 낮은 깊이 surface                |
| `--color-section-soft`          | `#fcfcfc`        | 탐색 결과 section을 hero와 분리하는 surface  |
| `--color-canvas`                | `#ffffff`        | 앱 배경                                      |
| `--color-nav`                   | `#000000`        | header, footer, 문서 바깥 스크롤 배경         |
| `--color-danger`                | `#c7352a`        | 오류/파괴 액션, AA 대비용 파생 token         |
| `--color-danger-soft`           | `#fff0ee`        | 오류 배경                                    |
| `--color-success`               | `#247a45`        | 성공 상태, AA 대비용 파생 token              |
| `--color-success-soft`          | `#eaf8ef`        | 성공 배경                                    |
| `--color-warning`               | `#8a5b00`        | 경고/대기 상태, AA 대비용 파생 token         |
| `--color-warning-soft`          | `#fff6df`        | 경고 배경                                    |
| `--color-activity-study-ink`    | `#24457f`        | 스터디 유형 chip text                        |
| `--color-activity-study-soft`   | `#e7eefc`        | 스터디 유형 chip surface                     |
| `--color-activity-club-ink`     | `#453a95`        | 동아리 유형 chip text                        |
| `--color-activity-club-soft`    | `#ece9fb`        | 동아리 유형 chip surface                     |
| `--color-activity-session-ink`  | `#7a5405`        | 세션 유형 chip text                          |
| `--color-activity-session-soft` | `#fdf0da`        | 세션 유형 chip surface                       |
| `--color-cohort-1..5`           | categorical ramp | 참여자 기수 분포의 비텍스트 구간·아바타 배경 |

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
- Discovery card title: `--groups-card-title-size` 20/1.45, 700; tablet 18px, mobile 15px.
  12번 시안의 소개는 desktop/tablet 13px, mobile 12px이며, 일정·소요 시간·잔여 자리는
  `--discovery-card-meta-size` 12px, mobile `--discovery-card-small-size` 11px로 표시한다.
- Footer Contact us heading: `--text-footer-contact` 22/1.4, 700.
- Body large: 17/1.65, 400.
- Body: 15/1.65, 400.
- Label: Figma 기준 14/20, 500.
- Caption: 13/1.5, 400.
- Badge: `--text-badge` 12/1, 800. 작은 count badge에 사용한다. 탐색 카드의 보조 정보는
  같은 12px 크기를 일반 굵기로 재사용한다.
- Brand: `--text-brand` 1.4375rem/800 (태블릿 23px, 데스크톱 약 20px), 모바일은 `--text-brand-mobile` 18px/800.
  Header wordmark에만 쓰며 본문 scale을 대체하지 않는다.
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
- Container: 구현 token `--container-shell`은 기본 `90rem`, 1024px 이상에서는 `100rem`이다.
  기본 글꼴 설정에서 데스크톱 상한은 1400px이며 `/`의 content rail을 기준으로 모든 route의
  페이지 shell과 section 외곽선을 통일한다. gutter는 모바일 16px, 태블릿 24px,
  데스크톱 21px로 `--page-hero-gap`을 공유한다. 홈의 첫 hero는 예외로
  header 바로 아래부터 화면 좌우 전체를 채우며, 이후 section은 기존 shell과 gutter를 유지한다.
  desktop의 `--groups-page-rail-gutter`도 같은 token을 참조하며 header와 footer까지 좌우 기준선을 맞춘다.
  account, management, group editor, group detail도 같은 shell을 공유하고, 좁은 form 읽기 폭은
  shell 안쪽 content에만 적용한다.
- Border: `--border-thin`(1px)과 `--border-strong`(2px)을 사용한다. 기본 surface 경계는
  thin, 탐색 입력의 강조 하단선 같은 의도적 emphasis만 strong을 사용한다.
- Touch: `--touch-target`은 44px, `--touch-target-lg`는 48px이다. navigation, form control,
  원형 icon button은 이 최소 높이를 공유한다. 캡슐 버튼은 아래 button 전용 크기를 사용하고,
  모바일 또는 coarse pointer에서는 실제 버튼의 최소 높이를 44px(large 48px)로 확보한다.
- Header: `--header-height`는 모바일 3rem(48px), 태블릿·데스크톱 3.75rem(각각 60px·52.5px)이며, active line 3px, loading auth placeholder 108px로
  geometry를 token화한다. 모든 화면에서 `position: sticky`와 `top: 0`으로 상단에 유지하며,
  문서 흐름에 헤더 공간을 남겨 본문 시작을 가리지 않는다. 루트 scroll padding은
  `--header-height`를 사용해 앵커 이동과 키보드 포커스가 헤더 아래에 보이도록 한다.
- 문서의 `html`과 `body` 배경은 `--color-nav`로 맞춰 macOS의 탄성 스크롤에서
  헤더·푸터 바깥에 흰색이 드러나지 않게 한다. `.app-shell`도 같은 검은 배경을 사용하고,
  `#main-content`는 밝은 surface와 shell의 `--app-body-radius`로 아래 두 모서리를 둥글게 처리한다.
  이 값은 태블릿·데스크톱에서 16px, 모바일에서 `--radius-md`(14px)를 사용한다.
  헤더·푸터와 맞닿는 본문 경계는 같은 곡률을 공유한다.
  sticky 헤더 아래 양 끝에는 같은 곡률의 장식 모서리를 고정해 스크롤 중에도
  본문 경계가 둥글게 유지된다. 위쪽 곡선은 헤더 장식 한 겹으로만 처리해 본문 배경과
  히어로가 중복으로 잘리면서 흰 테두리가 비치는 현상을 방지한다.
  모서리 radial-gradient의 투명·검정 stop은 같은 radius에 두어 1px 반투명 구간이
  장식 사각형 끝에서 수평·수직 테두리처럼 보이지 않게 한다.
  장식은 포인터 입력을 가로채지 않으며 모바일 메뉴
  오버레이보다 아래 레이어에 둔다.
  모바일(767px 이하)에서는 헤더 아래 양 끝의 장식 모서리를 14px로 줄여 full-bleed hero와
  본문이 둥글게 이어지며, 스크롤 중에도 곡률을 유지한다. 푸터 쪽 아래 모서리도 같은 곡률을 유지한다.
  푸터 상단에는 수평 테두리를 두지 않아 본문의 아래 곡선이 검은 배경으로 바로 이어지게 한다.
  `overflow: clip`으로 full-bleed 배경도 이 경계를 따르게 하되 별도 스크롤 영역은 만들지 않는다.
  브라우저의 기본 스크롤과 본문 안 sticky 배치를 유지한다.
- 탐색 랜딩(`/`)과 호환 진입점(`/groups`)의 첫 화면은 기존 소개 hero 대신 오늘 예정된
  `SESSION`(`같이해요`) hero를 노출한다. 왼쪽은 실제 오늘 일정 카드 rail, 오른쪽은 같은 active index를
  쓰는 `TODAY'S PLAN` 다이얼로 구성한다. `/groups`는 기존 링크와 북마크를 보존하는 동일 랜딩 경로로
  유지한다.
- 오늘 같이해요 hero는 page shell 안에서 최소 외곽 여백을 사용한다. desktop에서는 카드가 약 3개 보이는
  horizontal rail과 plan panel을 `minmax(0, 1fr) minmax(18rem, .38fr)`에 가깝게 배치하고, 좌우 이동
  버튼은 카드 아래 순서 표시의 양쪽에 배치한다. 44px 클릭 영역 안의 원형 surface는
  `--space-8`(32px), chevron은 `--space-4`(16px)로 작게 표시하며 그림자는 사용하지 않는다.
  tablet/mobile에서는 카드 두 개가 온전히 보이도록 rail 너비를 나누고 카드 좌우·stub 여백을 12px로 맞춘다.
  오늘 영역은 상단 여백 24px, 구간 간격 16px로 시작한다. tablet/mobile에서는
  `오늘 같이해요` 제목·날짜·위치와 카드 rail 다음에 `오늘의 일정` 패널을 배치한다. 화면과 DOM 순서를 맞추고
  일정 패널은 하나만 렌더링한다. 화면 폭이 바뀌어도 carousel의 active index와 정지 상태를 유지한다.
  tablet/mobile 일정의 위에 24px padding과 얇은 구분선을 둔다.
  mobile은 카드 간격과 본문 좌우 여백을 각각 8px, 12px로 줄인다. 480px 미만에서는 제목 16px,
  메타/소개 12px, 잔여 자리 24px를 사용하고 stub의 상세 CTA를 인원 아래 전체 너비로 배치한다.
  mobile은 원형 surface를 28px로 줄이고 44px 클릭 영역은 유지한다.
  순서 표시는 카드 아래 이전·다음 버튼 사이에 배치한다. dot은 24px 클릭 영역,
  gap 0, 기본 4px 원/선택 12×4px pill을 사용한다. 작은 보조 컨트롤의 터치 영역 예외다.
- 오늘 일정 티켓은 로컬 12번 시안의 흰색 티켓 surface, 카드 상단을 채우는 이미지, 20px radius,
  절취선과 좌우 notch, 잔여 자리/상세 CTA 구조를 따른다. 얇은 외곽선은 유지하되 notch의 반원
  구간에서는 직선을 끊어 실제로 파인 윤곽을 만든다. notch는 원의 정확히 절반(50%)만 표시해
  연결부가 카드 외곽선 밖으로 돌출되지 않도록 한다. notch가 외곽선을 덮을 수 있도록 카드 전체를
  자르지 않고 이미지 상단과 stub 하단 모서리를 각각 자른다. active는 brand 외곽선,
  mint stub과 brand CTA로 표시한다. 상시 그림자는 두지 않으며 공통 focus ring은 유지한다.
  외곽선·절취선·notch는 화면 밀도를 줄여도 최소 1px 두께를 유지한다. 카드 rail은 `--space-1`만큼
  좌우 clipping 여유와 scroll padding을 두고, 음수 margin으로 본문과의 수직 정렬을 유지한다.
- 오늘 일정의 현재 모집 정보가 없으면 티켓 잔여 자리 영역은 큰 `마감`만 표시하고 중복 보조 문구는 생략한다.
  모집 정보가 있으면 남은 자리 수만 표시하고 모집 정원 보조 문구는 생략한다. 일정 목록은 `모집 마감`으로 표시한다.
- 오늘 일정 티켓의 hover와 키보드 focus는 같이해요의 amber 외곽선·제목·시간·CTA와
  연한 amber stub으로 구분한다. 정밀 포인터 hover에서는 4px 올라가며 reduced motion에서는
  이동을 생략한다. 반원 홈의 윤곽을 유지하기 위해 티켓에는 사각 그림자를 추가하지 않는다.
- 대표 이미지는 실제 `GroupImage`를 `object-fit: cover`로 표시한다. 사용자 요청에 따라 하단 조회
  카드처럼 이미지 영역의 padding 없이 상단과 좌우 끝까지 채우고 카드 radius에 맞춰 자른다.
  이미지 영역은 모든 화면 크기에서 하단 메인 카드와 같은 `--groups-card-art-ratio`(8:5)를 사용한다.
  고정 높이 없이 카드 너비에 맞춰 높이도 늘어나도록 한다. 모임 종류별 기본 일러스트는
  원본 여백을 줄이기 위해 `object-fit: contain`과 2.45배 확대를 적용하고 이미지 프레임에서 잘라낸다.
  모바일의 세로형 조회 카드는 2.15배로 조정해 인물·의자 전체가 남도록 한다. 직접 등록한 사진에는
  이 확대를 적용하지 않는다.
- 본문은 18px 좌우 여백, 시계 icon과 시간, 18px brand 제목, 13px 소개 순서다. 제목과 소개는
  모든 화면 크기에서 각각 한 줄로 표시하고 넘치는 텍스트는 말줄임한다. 소개 아래에는 pin icon,
  장소, 가운데 점, 소요 시간을 한 줄에 13px로 표시한다.
  타이머 icon은 생략하고 장소와 소요 시간이 모두 있을 때만 가운데 점을 표시한다. stub은 18px(mobile 16px)
  여백, 34px 잔여 자리 숫자, 14px `자세히` CTA다.
  18px/34px은 12번 시안의 티켓 geometry를 위한 component token이며 기존 palette/type token을 재사용한다.
- hero 제목은 `Asia/Seoul` 기준 아침(06–11), 점심(11–13), 오후(13–17), 저녁(17–19), 밤(19–06)에
  맞는 문구를 아침 5개·점심 6개·오후 7개·저녁 8개·밤 5개 중 방문 시 선택한다. 같은 시간대에서는 카드를 넘기거나 재렌더해도 유지하고,
  매 정각 또는 창 포커스·탭 복귀 시 현재 시간대에 맞춰 갱신한다. 제목에 별도 전환 애니메이션은 넣지 않는다.
  날짜 옆의 작은 `위치 확인` 버튼(기존 tertiary button·44px touch target·caption text)을 누를 때만
  브라우저 위치 권한을 요청한다. 판교 캠퍼스 A동 중심에서 100m 안에 위치 정확도 범위까지 포함될 때,
  밤(19–06)에 한해 `왜 아직 집 안 갔어요?`를 우선 표시한다. 거부·실패·오차가 큰 위치는 기존 문구를 유지한다.
  좌표는 판별할 때만 사용하고 저장·서버 전송·분석 이벤트에 포함하지 않는다. 판정은 5분 또는 탭 숨김 시 만료된다.
  모임의 `location`을 접속자 위치로 사용하지 않고, IP 판별은 추후 제공될 캠퍼스 IP 대역으로 별도 연결한다.
  캠퍼스 주소는 [공식 문의 안내](https://www.woowacourse.io/contact)의
  경기도 성남시 수정구 금토로80번길 40 A동 11층이다.
  중심 좌표(37.406397, 127.088898)는 같은 A동 3층 입주사인
  [레이어랩 지도 핀](https://www.google.com/maps/place/레이어랩/data=!4m5!3m4!1s0x357ca717cb56e3ab:0xf11ed585f2000a5c!16s%2Fg%2F11n549y7pc!19sChIJq-NWyxenfDURXAoA8oXVHvE!20s8Q99C34Q%2BHH2W9X5)
  기준이다. 건물 주변 여부만 추정할 수 있으며 11층 실내 재실 여부까지 판별하지 않는다.
  제목 위에는 날짜를 `9월 27일 일요일` 형식의
  `--color-brand-ink`, `--text-label`(14px), `--font-weight-bold`로 한 번만 표시한다.
  별도 eyebrow와 상단 탐색 바로가기는 두지 않는다.
  카드와 TODAY’S PLAN에는 날짜를 반복하지 않고 유형 badge도 생략한다.
- 일정 패널은 `오늘의 일정` 제목만 표시하며 영문 보조 문구는 두지 않는다.
  흰 바탕의 왼쪽 border rail 안에서 동작하는 수직 wheel이다. 제목 아래 남은 세로 공간을
  목록이 채우며, 첫 일정부터 마지막 일정까지 선택된 행을 항상 다이얼의 세로 중앙에 둔다.
  앞뒤 일정은 이 중심을 기준으로 원형으로 이어진다. 첫 일정 위에는 마지막 일정들이,
  마지막 일정 아래에는 첫 일정들이 표시된다. 다음·이전과 자동 전환은 경계를 넘어도 같은
  방향으로 한 칸씩 이동하며, dot은 가장 가까운 위치로 이동한다(같은 거리이면 다음 방향).
  중심 앞뒤 네 행을 반복 배치하고 화면 밖 행만 교체해 되감기 없이 계속 회전한다.
  반복된 행은 접근성 트리에서 숨기고 선택된 중앙 행만 읽는다.
  각 행은 8px 간격, 20px 곡률과 1px 회색 테두리를
  사용하고 active row만 mint surface와 brand 테두리로 강조한다. 중심에서 멀어질수록 행을
  22도씩 기울이고(최대 64도) 24px씩 뒤로 보내 원통형 wheel처럼 보이게 한다. 각 단계의
  불투명도는 22%씩 낮추되 최소 30%로 유지하고, blur는 0.35px씩 최대 1.2px까지 적용한다.
  중심 행은 선명하게 유지하며 상하 15% 영역(32–64px)을 흰색으로 부드럽게 흐린다.
  한 항목뿐이면 중앙에 하나만 둔다. reduced-motion에서는 위치·기울기·blur의 전환을 제거한다.
- 카드 rail과 `TODAY'S PLAN`은 하나의 carousel state를 공유한다. 자동 전환은 5초 간격이며,
  이전·다음·dot·모바일 swipe·트랙패드 가로 스크롤을 조작하면 마지막 조작으로부터 10초 후 첫 자동 이동을 재개한다.
  재생/일시정지 버튼은 두지 않는다. 트랙패드는 카드 rail을 자연스럽게 가로 스크롤하며 멈춘 위치에 맞춰 dot과 일정을 갱신한다.
  키보드 focus, tab 비활성화, `prefers-reduced-motion: reduce`에서는 자동 전환을 멈춘다.
  마우스 hover나 클릭 후 남은 focus는 10초 재개를 막지 않는다. 모든 이동 버튼은 키보드로 접근할 수 있다.
- 오늘 같이해요 hero는 production runtime에서 mock 데이터를 만들지 않는다. `date`는 서울 기준
  `YYYY-MM-DD`, `groups`는 오늘 예정된 ACTIVE SESSION 목록을 받으며, 표시 정보는 목록 API에 존재하는
  이름, 소개, 대표 이미지, 세션 시간, 장소, 모집 인원만 사용한다. 장소는 기존 저장된 location을
  목록 응답으로 전달하며 비어 있으면 생략한다. 긴 장소는 말줄임하고 소요 시간은 같은 줄에 단위와 함께 유지한다.
- 탐색 페이지의 discovery는 hero 아래에서 두 영역으로 분리한다. 먼저 같이해요 전용 탐색을 보여 발견성을
  높이고, 그 아래에 기존 스터디·동아리 탐색을 별도 heading, 설명, section surface로 구분한다. 각 영역의
  검색·필터·더 보기 상태는 독립적으로 유지한다. 같이해요는 처음에 한 행(desktop 4개,
  tablet 3개, mobile 1개)만 표시한다. 더 보기는 이미 불러온 나머지 카드를 먼저 펼치고,
  이후에는 기존 커서로 다음 페이지를 불러온다. 같이해요의 검색·필터가 바뀌면 다시 한 행으로
  시작하며, 스터디·동아리 필터 변경은 펼침 상태에 영향을 주지 않는다.
- 하단 discovery 카드는 기본 상태에서 테두리 없는 흰색 surface와 `--shadow-card`의 은은한 그림자를 사용한다.
  실제 대표 이미지는 8:5 비율로 상단과 좌우 끝까지 채우며 카드 바깥쪽 모서리만 14px radius로 자른다.
  본문 여백은 16px다. mobile 가로형에서는 사진의 왼쪽 모서리만 둥글게 하고 본문은 위·아래·오른쪽
  12px 여백을 둔다. 사진과 본문 사이에는 기존 12px 간격을 유지한다. 12px 유형
  label(4px radius, 세로 4px/가로 8px padding, line-height 1.5)은 본문 상단에 둔다.
  모집 중 상태는 민트 바탕·진한 민트 글자의 배지로 대표 이미지 왼쪽 위에 둔다.
  모집 중 배지와 상세 히어로의 유형 배지는 탐색 카드 유형 배지와 같은 `--space-1` 곡률을 사용한다.
  배지 위치는 위·왼쪽 12px, 글자 12px, padding 4px/8px이며 본문에는 중복 표시하지 않는다.
  제목은 모든 화면 크기에서 한 줄 말줄임표로 표시하고, 전체 제목은 링크의 접근성 이름에 유지한다.
  2줄 소개 다음에 calendar icon 일정, timer icon 소요 시간과 잔여 자리 순서로 읽힌다.
  본문은 세로 flex로 채우고 일정·하단 정보를 아래로 밀어 카드 끝에서 desktop/tablet 16px,
  mobile 12px 여백을 유지한다. 소개와 일정 사이에는 최소 16px(mobile 12px)을 둔다.
  11px와 6px은 discovery component token이고 나머지는 공통 palette/spacing token을 사용한다.
  `status=ENDED`인 카드는 대표 이미지에 아카이브와 같은 어두운 그라데이션(검정 86% → 28%)을
  겹치고 왼쪽 위에 검정 바탕·흰 글자의 `종료` 배지를 표시한다. 배지는 접근성 이름에도 포함한다.
  종료된 모임에는 모집 중·남은 자리 표시를 생략한다. 모집만 마감된 ACTIVE 모임에는 적용하지 않는다.
  소요 시간과 timer icon은 같이해요(SESSION) 카드에서만 표시하며 API 세션 일정의 종료-시작으로
  계산한다. 스터디·동아리 카드에서는 소요 시간과 timer icon을 생략한다. 장소와 소요 시간은
  하단 왼쪽에서 묶고 잔여 자리는 오른쪽에 둔다. 장소가 없으면 생략하며 카드별 상세 요청은 추가하지 않는다. 모집 정보가 없으면 잔여 자리도
  생략한다. capacity는 전체 구성원 정원이 아닌 현재 모집 정원이므로 memberCount와 나누지 않는다.
  전체 카드 Link에 기존 group_view action을 유지한다. hover와 키보드 focus에서는 제목·잔여 자리·
  focus ring을 유형 색(같이해요 amber, 스터디 blue, 동아리 purple)으로 강조한다. hover 그림자는
  `--shadow-float-size`의 기존 깊이(0 12px 34px)에 유형 강조색을 불투명도 18%로 섞는다. 정밀 포인터 hover에서 카드를 4px 올리고 180ms로 전환한다.
  hover에서는 유형 색 1px 테두리를 카드 가장자리에 표시해 크기 변화 없이 강조한다.
  키보드 focus에서는 기본 그림자와 유형 색의 바깥쪽 2px outline을 유지한다.
  touch에서는 hover 이동을 적용하지 않으며 reduced motion에서는 이동과 전환을 생략한다.
- Shadow: discovery 카드는 기본 `--shadow-card`를 사용하고 정밀 포인터 hover에서 유형 색 그림자로 강조한다.
  그 외 카드 hover와 modal은 `--shadow-float`(`0 12px 34px rgb(29 29 31 / 10%)`)를 사용하며
  일반 정보 그룹은 border/tonal surface로 깊이를 표현한다.
- Z layers: header `20`, sticky `25`, overlay `40`, dialog `50`, toast `60`.

### Desktop density

- 가로 1024px 이상에서는 루트 글꼴을 브라우저 기본 크기의 `87.5%`로 둔다. 기본 16px 환경에서
  `1rem`은 14px이 되어 글자·간격·카드가 함께 줄고, 같은 화면에 더 많은 내용이 보인다.
  데스크톱 `--container-shell`은 100rem(1400px)로 두어 좌우 공간을 더 사용한다.
  헤더 3.75rem은 52.5px이며 헤더·히어로 문구·본문·푸터는 넓어진 shell의 기준선을 공유한다.
- 모바일·태블릿은 기존 루트 크기를 유지한다. 원형 icon button과 입력 컨트롤은 PC에서도
  44px/48px을 보장하고, 캡슐 버튼은 별도 compact 크기를 사용한다. 브라우저의 글꼴 설정과 확대
  기능은 유지하며 DPI나 운영체제 설정을 감지해 보정하지 않는다.
- 홈 배경은 32:9 이미지의 세로 전체를 보여 주는 최소 높이를 유지한다. 모임 상세의 오른쪽 rail은
  줄어든 본문 크기에 맞춰 1260px부터 표시한다. 미디어 쿼리의 rem 기준은 루트 글꼴 재정의와 별개다.

### Responsive breakpoints

- token metadata: `--breakpoint-md` 48rem(768px), `--breakpoint-lg` 64rem(1024px).
- `360–767`: full-bleed header, 16px page gutter, 탐색 모임은 마이페이지 activity row를 따른
  왼쪽 썸네일의 1-column 목록, mobile drawer를 사용한다. 그룹 detail rail과 운영 side rail은
  본문 아래로 이동하고, management table은 labelled card rows로 바뀐다.
- `768–1023`: full-bleed header 배경과 24px content gutter. 탐색 card는 3 columns, account는 좁은
  profile/content split, group editor hero는 single column으로 전환한다.
- `1024–1439`: 21px content gutter와 4-column 탐색 카드, group detail/registration의 side rail,
  group editor 2-column hero, management grid/table을 사용한다. 고정 폭 action은 충분한
  공간이 없으면 줄바꿈한다.
- `1440+`: 1400px shell 상한을 중앙 정렬하고 탐색 카드 4 columns를 유지한다.
- 하단 discovery는 desktop 4열/가로 24px·세로 40px, tablet 3열/24px, mobile 1열/24px이다.
  mobile 카드는 104px 왼쪽 이미지와 본문 사이 12px 간격을 두며 이미지는 행 높이를 채우고
  최소 148px 높이를 유지한다. 이 두 geometry는 discovery component token으로 둔다.
  제목과 소개는 각각 최대 2줄이며 일정은 줄바꿈할 수 있다. 소개의 최소 2줄 높이는 mobile에서 해제한다.

## 3. Layout system

- `AppShell`: 전체 background는 white canvas다. 검은 GlobalHeader 배경은 모든 viewport에서
  top full-bleed로 렌더하고, header 내부 콘텐츠만 `--container-shell`과 `--page-gutter`에 맞춰
  중앙 정렬한다. skip link, main landmark, mobile drawer와 동일한 auth action을 모든 route에
  제공한다. 공통 footer는 검은 full-bleed surface 안에 브랜드 소개·자리 유래·Contact us 안내·외부
  GitHub 링크를 두고, 모바일에서는 안내와 외부 링크를 콘텐츠 아래로 쌓는다. route lazy loading 또는
  guard 확인 중에는 footer를 노출하지 않아 loading surface가 콘텐츠보다 먼저 보이지 않게 한다.
- Header composition: desktop은 `1fr / auto / 1fr` grid로 가운데 메뉴를 유지하고,
  tablet에서는 `auto / minmax(0, 1fr) / auto`와 16px gap으로 로고·메뉴·우측 버튼이 겹치지 않게 한다.
  주요 메뉴는 홈·탐색·활동·게시판·스파링·피드백을 한 줄로 배치한다. 실제 메뉴 수를
  `--header-nav-item-count`로 전달해 열 수·전체 폭·활성 밑줄 폭을 함께 계산하고 각 문구는 줄바꿈하지 않는다.
  로그인/프로필 왼쪽에는 민트색 `자리 만들기` 링크(`/groups/new`, action `group_create`)를 둔다.
  히어로와 같은 의자 이미지와 문구를 사용하며, 헤더의 의자 크기는 1.5rem으로 맞춘다.
  로그인 버튼과 같은 small 높이를 사용하며 익명 클릭은 생성 경로를 저장하고 기존 로그인으로 연결한다.
  wordmark와 우측 auth action을 고정하고,
  member tabs는 노출하지 않는다. 모바일 drawer에서는 탐색·모임 만들기 진입점을 유지하고, guard가
  인증이 필요한 destination을 처리한다. anonymous가 보호 메뉴를 누르면 해당 경로를 로그인 후
  복귀 대상으로 저장하고 GitHub 로그인으로 이동한다. authenticated 상태에만
  desktop에서 프로필 사진을 계정 메뉴 버튼으로 표시하고, 마이페이지와 로그아웃은 드롭다운 안에 둔다.
  프로필은 공통 `Avatar`로 서버의 `avatarUrl`을 표시하고, 사진이 없거나 로드에 실패하면
  크루 이름 첫 글자로 대체한다. 모바일 헤더는 프로필 없이 햄버거 버튼만 표시한다.
  햄버거 버튼은 투명 배경에 테두리 없이 표시하고, 44px 터치 영역과 공통 키보드 포커스 표시를 유지한다.
- Header GitHub login: [Octicons GitHub mark](https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg)를 `--space-5` 크기로 문구 왼쪽에 둔다.
  흰색 `--color-surface` 바탕, `--color-ink` 글자, `--color-line` 테두리와 기존 버튼의 `--radius-pill` 모서리를
  사용한다. hover는 `--color-surface-sunken`, pressed는 `--color-line`으로 구분한다.
  최소 높이는 `--button-height-sm`이며, 로고와 문구 간격은 `--space-2`다.
- Header profile: 원형 사진은 desktop `--space-10`(40px)이다.
  버튼은 최소 `--touch-target` 크기이며 접근성 이름은 `프로필 메뉴`다. 닉네임은 표시하지 않는다.
  사진 오른쪽에는 `--space-2` 간격으로 `--space-3` 크기의 가는 아래쪽 꺾쇠를 둔다.
  화살표는 장식용이며 메뉴가 열리면 180도 회전한다. 동작 줄이기 설정에서는 전환을 생략한다.
  클릭·터치·Enter/Space로 마이페이지 링크와 로그아웃 버튼을 담은 disclosure를 열고,
  다시 클릭하거나 바깥 클릭·포커스 이탈·Escape·항목 선택으로 닫는다. hover만으로 열리지 않는다.
  Tab으로 항목을 탐색하며 Escape는 메뉴 안의 포커스를 사진 버튼으로 돌린다.
  `aria-expanded`와 `aria-controls`로 펼침 상태를 알린다. 흰색 메뉴는 사진 오른쪽에 정렬하고
  `--space-2` 아래에 `--color-line` 테두리, `--radius-md`, `--shadow-float`로 표시한다.
  메뉴 항목은 최소 `--touch-target` 크기이며 hover/focus는 `--color-surface-sunken`이다.
  전역 focus ring을 유지한다.
  사진이 없거나 로드에 실패하면 크루 이름 첫 글자를 `--color-surface-sunken` 바탕과
  `--color-ink` 글자로 표시한다.
- Mobile account: 로그인한 모바일 전체 메뉴 상단은 마이페이지 프로필 카드의 가운데 정렬 세로 배치를 따른다.
  `나의 프로필` 안내, `calc(--space-12 * 2)`(96px) 원형 사진, 이름(`--text-h3`),
  기수/과정(`--text-caption`, muted), 전체 너비 로그아웃 버튼 순으로 쌓는다.
  카드에는 `--color-surface-sunken` 바탕, `--color-line` 테두리, `--radius-md`, `--space-4` padding을 사용한다.
  사진은 사이드바 폭에 맞춰 마이페이지보다 작게 표시하며, 사진과 글의 간격은 `--space-3`이다.
  코치는 기수 대신 `코치`, 기수 정보가 없는 크루는 `기수 미정`을 표시한다. 긴 이름은 줄바꿈한다.
  프로필 영역은 정보 표시용이며, 마이페이지는 아래의 탐색·모임 만들기와 같은 텍스트 메뉴로 둔다.
  마이페이지 링크와 로그아웃 버튼의 최소 클릭 높이는 `--touch-target`이다.
  계정 카드와 아래 메뉴는 `--space-4` 여백, `--color-line` 구분선, `--space-4` 안쪽 여백으로 나누고
  메뉴 영역에 muted caption 크기의 `메뉴` 제목을 둔다.
  비로그인 상태에도 같은 순서와 크기의 프로필 형태를 유지한다. 96px 회색 원형 바탕(`--color-line`)에
  장식용 UserRound 아이콘 아래에는 `게스트`만 표시하고 하단에는 GitHub 로그인 버튼을 둔다.
  비로그인 상태에는 `나의 프로필` 제목과 설명 문구를 렌더하지 않는다.
  제목의 caption line-height에 해당하는 첫 grid 행을 유지해 사진과 버튼 위치가 바뀌지 않게 한다.
  아이콘은 `--color-muted`, 게스트 이름은 `--text-h3`, bold, `--color-muted-ink`를 사용한다.
  이름·기수 또는 게스트 이름 영역은 최소 `calc(--space-12 + --space-2)`(56px)를 확보하며,
  게스트 이름은 그 안에서 세로 가운데 정렬한다. 빈 문구나 숨긴 텍스트로 공간을 채우지 않는다.
  로딩으로 오해하지 않도록 비로그인 프로필에 shimmer나 pulse를 적용하지 않는다.
  가입 중·인증 확인 중에도 프로필 형태를 유지하되 상태에 맞는 문구와 가입 계속하기·기존 인증 placeholder를 표시한다.
  카드 높이는 내용에 맞추며 기본 이름·기수 두 줄과 게스트 이름 한 줄에서는 로그인 전후 사진·버튼 위치를 유지한다.
  긴 이름은 줄바꿈하고, 높이가 짧은 화면에서는 기존 drawer가 세로 스크롤을 담당한다.
  마이페이지 선택·로그인·로그아웃 시 사이드바를 닫는다.
- Header active state는 모바일 drawer의 pathname 목적지에만 연결한다. `/groups/new`에서 상위
  `/groups` 탐색 링크를 동시에 활성화하거나, `/my/groups`에서 `/my`를 동시에 활성화하지 않는다.
- `PageContainer`: 모든 route의 좌우 gutter와 최대 폭을 통일한다.
- 공개 활동 목록은 탐색 목록과 같은 `--space-12` 상단 여백, `--text-h1` 제목과
  제목 아래 `--space-6` 간격을 사용한다. 영어 eyebrow와 중복 소개 문구는 두지 않는다.
  제목 다음 행에 범위 필터와 `활동 올리기` primary small 버튼을 하나의 toolbar로 묶는다.
  필터는 왼쪽, 버튼은 오른쪽에서 세로 가운데로 맞추며, 선택한 필터는 brand-ink 글자와
  brand 밑줄로 표시한다. toolbar 아래에는 `--color-line` 구분선을 둔다.
  선택 밑줄은 실제 탭의 위치·너비에 맞춰 `--duration-base`와 `--ease-standard`로 이동한다.
  목록은 새 필터의 데이터가 준비되면 공통 탭과 같은 opacity 0→1, `--space-2` 아래에서
  제자리로 이동하는 전환을 사용한다. 기존 사진 DOM과 masonry 측정은 유지하며,
  추가 페이지 로딩에는 반복하지 않는다. reduced-motion에서는 두 전환 모두 생략한다.
  필터의 클릭 높이는 `--touch-target` 이상이고, 좁은 화면에서는 좌우 padding을 줄여
  두 필터와 버튼을 배치하되 공간이 부족하면 자연스럽게 줄바꿈한다.
  카메라 아이콘은 `--space-5`, 글자와의 간격은 `--space-2`이며 하나의 inline-flex로 정렬한다.
  로그인 전후 문구·크기는 같고 기존 로그인 흐름과 action 식별자를 유지한다.
  공개 목록의 빈 상태는 숫자와 테두리 박스 없이 기존 빈자리 일러스트(최대 14rem),
  `--text-h3` 안내 제목, 한 줄 설명을 가운데 배치한다. 전체·내 기록의 안내를 구분하며
  올리기 버튼은 toolbar에 한 번만 표시한다. 모임 내부의 기록 권한과 빈 상태,
  사진 카드의 크기·정보·masonry 배치는 그대로 유지한다.
- `ListLayout`: PageHeader → search/filter → result meta → cards → cursor action. 한 화면 안의 hero,
  tool row, result heading, card grid는 `PageContainer`의 동일한 좌우 rail을 공유하며,
  카드 grid의 좌우 변을 기준으로 정렬한다. 탐색 discovery는 hero와 분리된 soft surface 안에
  배치하며, result meta는 `자리 둘러보기` 제목 바로 오른쪽에 두고 `모임 만들기` action은 같은
  줄의 오른쪽 끝에 둔다. 검색과 필터는 하나의 control panel로 묶고, `모임 유형`, `모임 상태`, `모집 상태`라는 추상화된 native select
  세 개로 노출한다.

  탐색 hero의 display copy는 `크루와` / `함께할 자리를` / `찾아보세요` 세 줄을 모든
  viewport에서 유지하되, 접근성 이름은 한 문장으로 제공한다. 랜딩에는 설명 문구 아래에
  텍스트 하이라이트형 CTA를 두고, 넓은 화면에서는 문구 시작점에 맞춰 왼쪽 정렬한다. CTA는
  상하 padding과 min-height를 0으로 두어 설명 문구와 시각적 간격을 맞춘다.

- 탐색 hero는 `src/shared/assets/brand/jarihana-signature.png`를 교체 가능한 signature art로
  사용한다. 표시 영역은 원본의 `1672 / 941` 비율을 따르고, 중앙 정렬과 `contain`으로
  상하좌우를 자르지 않는다.
  헤더 mark는 `src/shared/assets/brand/jarihana-favicon.png`를 교체 지점으로 사용한다.
- `DetailLayout`: group detail은 desktop에서 본문 + sticky support rail 구조를 사용하며
  전체 폭은 공통 `--container-shell`을 따른다. support rail은 운영자 프로필 카드 다음에 모집 정보 카드를
  배치한다. tablet 이하에서는 순차 single column으로 전환한다.
  모임 상세 hero는 모든 화면에서 기존 `--group-detail-hero-min-height`(24.5rem, 기본 392px)를
  최소 높이로 사용한다. 홈 hero는 mobile·tablet에서 `clamp(16rem, calc(24svh + 4rem), 20rem)`과
  상하 48px 여백을 사용한다. 1024px 이상에서는 `clamp(27rem, calc(34svh + 4rem), 31rem)`과
  상하 56px 여백을 사용한다. 압축된 비율보다 모든 화면의 높이를 64px 늘려 캐릭터와 경계 사이에 여유를 둔다.
  768px 이상에서는 `--page-hero-gap`(24px)으로 헤더 아래 간격도 맞춘다.
  홈의 가로 비율 기반 높이를 해제해 tablet 폭에 따라 hero 높이가 급변하지 않게 한다.
  상세 hero 내용은 세로 가운데 정렬하고 긴 제목·소개·일정이 있으면 자연스럽게 늘어난다.
  상세 기본 이미지의 배경은 녹색 그라데이션 없이 `--color-nav`를 사용한다.
  상세·생성·수정의 대표 이미지는 같은 `cover`·중앙 정렬을 사용한다. 이미지 자체의
  불투명도는 1로 유지하고, 공통 `--group-profile-overlay`로 명암을 조절한다.
  기본 이미지에는 검정 35% 레이어를 추가한다. 기본/업로드 이미지 모두 민트색 배경이나
  편집 전용 밝기 필터 없이 같은 효과를 사용하며, 모바일에서는 공통 세로 gradient로 전환한다.
  mobile(`47.9375rem` 이하)에서는 헤더와 상세 hero 사이 간격을 두지 않는다.
  상세 페이지의 좌우 바깥 여백은 없애고, hero·탭 본문 안쪽 여백은 유지한다.
  모바일 상세 hero는 별도 여백 없이 화면 가장자리와 맞닿게 배치하며,
  위쪽 모서리는 공통 본문 경계의 20px 곡률을 따른다.
  모바일에서는 `목록으로` 버튼과 그 버튼용 상단 빈 공간을 없앤다. 운영자에게 보이는 수정 버튼은
  유지하고, 모임 유형과 제목의 오른쪽에 버튼 공간을 확보해 겹치지 않게 한다.
- rail이 숨는 tablet/mobile에서는 운영자 프로필을 hero 안의 프레임 없는 byline으로 옮긴다.
  민트 ring의 compact avatar와 `운영자 · N기 크루` caption, 이름을 한 덩어리로 묶되 별도의
  card·chip·배경은 만들지 않고 hero 자체 overlay 위에 직접 배치한다.
- tablet/mobile에서는 `모집 정보` 진입 버튼을 hero 섹션 안쪽 하단에 가운데 배치한다. 모집 여부와
  모임 종료 상태에 관계없이 표시하며 기존 모집 action 버튼의 흰 surface·line 테두리·의자 로고를 그대로 사용한다.
  버튼을 누르면 모집 정보 모달을 열고, 모달 안의 신청 동작은 기존 흐름을 유지한다. detail tabs는
  content section을 바꾸지만 URL route는 detail에 남긴다.
- desktop 모집 rail은 내용의 자연 높이를 유지하고 내부 스크롤을 만들지 않는다. rail의 실제
  높이를 `ResizeObserver`로 측정해 `--group-rail-height`에 반영한다. sticky 상단 위치는
  `--header-height + --space-5`와 `100dvh - rail 높이 - --space-4 - safe area` 중 작은 값으로 정한다.
  짧은 카드는 고정 헤더 아래에 유지하고, 카드가 창보다 높으면 페이지 스크롤로 상단을 넘겨
  신청 action까지 도달할 수 있다. 모집 일정 펼치기나 글꼴·화면 크기 변경에도 위치를 다시 맞춘다.
  가로 `78.6875rem` 이하에서는 모집 rail을 숨기고 hero 안의 참여 action과 모집 정보 모달을 사용한다.
  세로 viewport 높이나 DPI, devicePixelRatio는 전환 조건으로 사용하지 않는다.
  모집 정보 일러스트는 desktop과 모달에서 같은 가운데 정렬 규칙을 사용한다. desktop rail에서는
  가용 가로 폭 안에 원본 비율로 맞추고 세로 viewport 높이에 따라 축소하지 않는다. 모달에서는
  가용 폭과 viewport 높이 안에 맞춘다. 이미지 자체보다 큰 최소 높이를 별도로 예약하지 않는다.
- desktop rail과 모집 정보 모달의 참여 버튼은 모임 유형에 관계없이 `자리하기`로 표시하고 흰 surface와 line 테두리를 사용한다.
  문구 왼쪽에는 홈과 같은 `jarihana-chairs-rainbow.png`를 `--space-12` × `--space-8` 크기의 장식 이미지로 표시한다.
  tablet/mobile의 hero 안 진입 버튼은 기존 의자 로고와 `모집 정보` 문구를 유지한다.
  모집 마감·운영자·참여 완료 등의 상태별 버튼은 기존 표현을 유지한다.
- 모달의 모집 정보 스크롤바는 투명 track과 얇고 둥근 thumb를 사용하며 스크롤바 공간을 상시 예약하지
  않는다. 모달은 둥근 외곽 안쪽의 모집 정보 한 곳에서만 세로 스크롤하고 제목·닫기 버튼·신청
  action은 고정한다. 내부 flex/grid 요소는 가용 폭까지 줄어들며 가로 스크롤을 만들지 않는다.
- `FormLayout`: 모임 생성·수정은 공통 `--container-shell`을 사용하고, 태블릿 이상에서
  `--page-gutter`로 좌우 여백과 콘텐츠 폭을 맞춘다. mobile(`47.9375rem` 이하)은 상세처럼
  바깥 좌우 여백 없이 hero와 탭을 화면 전체 폭으로 배치한다. hero·탭 본문 안쪽 여백은
  상세의 공통 규칙을 유지하고, 페이지 제목·관리 메뉴·하단 버튼에는 `--page-gutter`를 둔다.
  수정 form은 관리 shell의 안쪽 폭을 그대로 사용한다.
  대표 이미지는 선택한 모임 종류의 기본 이미지를 표시하고, 업로드 이후에는 선택한 사진을 유지한다.
  hero의 본문 폭과 이미지 배치는 상세의 `.group-profile` 규칙을 공유한다.
  mobile day picker와 설명 편집기의 `작성`·`미리보기` 도구는 2열로 유지한다.
- 모임 생성 폼은 제출 검증 실패 시 화면 순서상 첫 오류 필드로 포커스와 스크롤을 이동한다.
  기본 포커스의 즉시 스크롤은 막고, 고정 헤더 여백을 확보한 필드를 화면 중앙으로 부드럽게 이동한다.
  일정 오류는 본문의 모임 일정 설정 버튼으로 이동하고 오류 안내를 표시한다. 일정 모달은 사용자가 설정 버튼을 눌렀을 때 연다.
  소개 오류는 소개 탭을 열고 입력을 표시한다.
  동작 줄이기 환경에서는 애니메이션 없이 이동하며 입력값과 다른 오류 안내를 유지한다.
- `MyPageLayout`: profile column + activity panel의 desktop split, 3개 count link, 2-column
  summary cards를 사용한다. tablet/mobile에서는 각 grid를 정보 순서대로 한 column으로 접는다.
  dashboard surface의 좌우 확장과 내부 여백은 page gutter 이하로 제한해 모바일 가로 넘침을 막는다.
- `ManageLayout`: group name context header와 horizontal route-backed tabs(`모임 수정`,
  `모집 관리`, `모집 이력`, 조건부 `신청 관리`, `참여자 관리`)를 모든 leader page가 공유한다. `신청 관리`는 승인 방식과
  관계없이 모임장이 아직 확인하지 않은 신청 수가 1건 이상일 때만 label 뒤에 inline danger count
  badge를 표시하며, 1~99는 실제 숫자,
  100건 이상은 화면에 `99+`로 줄이고 숨은 텍스트는 실제 전체 수를 한국어로 전달한다. badge는
  `--color-danger`, surface/text token만 사용하고 active underline과 모바일 horizontal scroll을
  방해하지 않는다. 신청 관리 화면에서 대상 모집의 신청자 목록을 불러오면 해당 목록에서 확인한 마지막
  신청까지 읽음 처리한다.
  참여자는 검색·필터 가능한 table, 모집 이력은 참여 방식 필터와 최근 등록순 고정 정렬을 갖춘 table,
  모집은 summary + condition form + public-state rail, 신청은 applicant panel + operations rail로
  표현하고 mobile에서는 모두 single column으로 재배치한다. 모집 관리 기본 heading은
  `모집 관리` / `모집을 생성하고 이력을 관리해요.`를 사용하고, 새 모집 작성 중에는 같은 heading
  자리를 `새 모집 생성` / `새로운 모집 공고를 작성합니다.`로 전환해 form body에 제목을 반복하지 않는다.
  새 모집 form은 `모집 인원` → `승인 방식` → `모집 기간` 순서의 3-step wizard로 진행한다.
  세 단계는 이전 입력을 누적하지 않고 각각 별도 화면으로 전환한다. 각 단계 section 자체를 해당
  content rail 너비로 줄여 패널 가운데에 놓고, 그 안의 질문과 입력 정보는 왼쪽 정렬한다.
  각 단계는 질문만 간결하게 표시하고 별도의 보조 설명은 두지 않으며, 단계 숫자는 상단 진행 상태에만 표시한다. 모집 인원
  단계는 section과 control을 질문 길이에 가까운 같은 `18rem` rail로
  두어, 내부 문구는 왼쪽 정렬하면서 질문 묶음 전체는 패널 가운데에 놓는다. 승인 방식
  단계는 질문이 읽히는 `20rem` 중앙 rail을 section과 control이 함께 공유한다. 입력란은 rail의
  좌우 폭을 모두 채우고, 제목·field label·선택값 자체는 왼쪽 정렬을 유지한다.
  모집 기간 단계의 질문과 기간 입력은 날짜 빠른 선택 capsule 묶음이 차지하는 폭을 기준으로 한
  최대 `30rem` 중앙 rail을 공유하고, mobile에서는 가용 폭 전체까지 줄어든다. 상단 진행 상태는 질문을 반복하지 않고
  현재 입력 범주만 간결하게 표시한다.
  이전 action은 왼쪽, 다음 또는 생성 action은 오른쪽에 둔다. 공개 상태
  미리보기는 모든 단계에서 오른쪽 read-only summary로 노출한다. 넓은 화면에서는 왼쪽 입력 영역과
  같은 grid row에서 같은 세로 높이로 맞추고, 좁은 화면에서는 한 열로 쌓아 각 영역이 내용에 맞는
  자연 높이를 사용한다. 상시 모집을 해제하고 마감일을 고르는 동안에는 마감 시간 자리를
  `날짜 선택 후 설정`으로 유지하고, 미리보기에도 `날짜 선택` 상태를 보여 입력 영역이 사라지거나
  상시 모집으로 오해되지 않게 한다. 단계 전환 시 status와 입력 영역은 240ms opacity + 8px translate로
  진입하며, 동작 줄이기 설정에서는 즉시 전환한다.
- 일반 route는 page title 하나의 `h1`, section은 순차 `h2`, card title은 `h3`를 사용한다.
  탐색 route의 hero와 `자리 둘러보기`는 현재 제품 요구에 따라 각각 `h1`으로 노출한다.

## 4. Component visual grammar

- 홈 모집 카드: 유형 배지는 필터와 같은 유형별 soft 배경·ink 글자를 사용하고, 남은 자리 수는 같은 ink 색으로 맞춘다.
  사진 위에 놓인 큰 카드의 남은 자리 수는 가독성을 위해 같은 유형의 soft 색을 사용한다. 참여 문구는 `N명 자리하는 중`으로 표시한다.
- Buttons: primary mint/black text, secondary white/line, tertiary text, danger red. 모든 variant는
  `--radius-pill` 캡슐형이며 홈 히어로 CTA와 오늘 모임 카드의 `자세히`도 같은 곡률을 사용한다.
  높이는 `--button-height-sm/md/lg`로 통일한다. 마우스 환경에서 각각 2.25/2.5/2.75rem
  (최소 32/36/40px), 좌우 padding은 16/20/24px rem 토큰을 사용한다. 글자는 small/medium
  `--text-label`, large `--text-body`, 굵기 600, line-height 1.4로 맞춘다. 로그인·유형 필터는
  small 기준을 공유한다. 홈 유형 필터의 선택·hover 배경은 같이해요 amber, 스터디 blue,
  동아리 violet의 기존 activity soft 토큰을 사용하고, 선택 문구는 같은 유형의 ink 토큰을 쓴다.
  `전체`는 기존 mint를 유지한다. 카드 전체가 링크인 `자세히`와 파일 선택 영역 안의 시각적 CTA는
  터치 영역을 따로 키우지 않고 `--button-visual-height-sm`과 좌우 16px rem 여백을 사용한다.
  default/hover/active/focus/disabled/pending 상태를 갖는다. 목적지를 바꾸는 액션은 버튼처럼
  보이더라도 semantic link를 사용한다. 일반 목적지 링크는 visible label을 유지하고, 관리
  컨텍스트의 모임 상세 이동은 작은 visible label과 관습적인 `ExternalLink` 아이콘을 함께
  사용하는 예외로 둔다.
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
  표현한다. 새 모집 생성처럼 데이터를 수정하는 작성 flow의 숫자 input, select, 날짜 trigger,
  시간 trigger는 같은 underline variant를 사용한다. 모집 기간 빠른 선택은 날짜·시간 입력보다 먼저
  배치한 capsule button group으로 구분하며 불필요한 field card는 추가하지 않는다.
- DateRangePicker: 새 모집 form의 `모집 기간` 단계는 시작/마감 endpoint를 하나의 field group으로 묶되,
  별도 card로 감싸지 않는다. `시작`/`마감` 제목을 반복하는 대신 날짜·시간의 구체적인 visible label로
  endpoint를 구분하고, 두 endpoint는 모든 breakpoint에서 세로로 쌓으며 brand-soft 원형의 아래쪽 방향
  화살표로 연결한다. 날짜와 시간 모두
  visible label을 underline control 위에 배치하고 현재 선택 중인 endpoint는 label과 underline의 selected
  state로 표시한다. 날짜 trigger를 누르면 해당 trigger 아래에 한 달짜리 달력 하나를 popover로 띄우고,
  날짜를 선택하거나 바깥 영역을 누르면 닫는다. 본문 하단 경계를 넘는 날짜·시간 popover는
  해당 field 위로 열어 본문의 clipping에 잘리지 않게 한다. 달력 날짜는 semantic button grid로 제공하며
  마감 선택 중에는 시작일 이전 날짜를 실제 disabled state로 막는다. 같은 날짜의 마감 시간은 시작
  시각보다 최소 1분 뒤만 허용한다. 시간 trigger는 날짜 popover와 같은 surface·shadow·open/close 규칙을
  쓰는 단일 시간 popover를 연다. 브라우저 기본 시간 입력처럼 오전/오후·시·분을 한 줄에 배치하되,
  platform별 select 잘림을 피하도록 underline control과 custom listbox를 product theme로 제공한다.
  시와 분은 키보드로 직접 입력하거나 custom 목록에서 선택할 수 있고, 분 목록은 10분 단위로 제공한다.
  오전/오후, 시, 분 목록은 열릴 때 본문 또는 모달과 화면 경계 안의 여유 높이를 측정하고,
  일반 본문에서는 고정 헤더에 가려지는 영역을 제외한다.
  위쪽 경계에는 목록이 나타나는 이동 거리만큼 여유 간격을 남긴다.
  아래 공간이 부족하면 위로 열고, 목록 높이는 기존 14rem 상한과 실제 여유 높이 중 작은 값으로 제한해
  남은 선택지는 목록 안에서 스크롤한다. 실제 여유 높이는 `--time-options-available-height`로 전달한다.
  목록의 scrollbar는 투명한 track과 둥근 brand thumb를 사용해 native 사각형 scrollbar가 드러나지 않게 한다.
  popover 안에는 같은 정보를 반복하는 제목·설명·완료
  action을 두지 않는다. 값은 각 field 입력을 마칠 때 반영하고 바깥 영역 선택으로 panel을 닫는다.
  같은 날짜의 마감 시간에서는 시작 시각 이전 선택지를 실제
  disabled state로 막는다. Escape로 닫을 때는 trigger로 focus를 복원하고, 바깥 영역 선택이나 Tab으로
  focus가 panel 밖으로 이동하면 해당 대상의 focus를 유지한 채 닫는다.
  새 모집 화면을 여는 순간의 local minute를 시작 기본값으로 쓰고,
  UTC 변환 없이 `YYYY-MM-DDTHH:mm` 문자열을 유지한다. `지금 시작`, `3일 뒤`, `1주 뒤`, `2주 뒤`,
  `상시 모집`은 날짜·시간 endpoint 위에 44px 이상의 capsule button으로 제공한다. 선택된 기간은
  brand-soft surface와 brand-ink text로 구분하고, 상시 모집은 별도 설명 문구 없이 선택된 capsule과
  마감 endpoint의 `상시 모집`·`없음` 상태로 명시한다. 선택 중인 날짜 endpoint를 다시 눌러도 달력을
  닫지 않고 열린 상태를 유지하며, `Escape` 또는 `상시 모집` 선택으로도 닫는다. 달력의 이전/다음 이동은
  한 달 단위이며, 월 바깥 날짜는 빈
  slot으로 남겨 같은 날짜 button이 중복되지 않게 한다. 각 7열 행렬은
  `--date-calendar-grid-width`(7 × 44px)를 상한으로 중앙 정렬하고, 날짜의 선택·범위·keyboard focus
  surface는 browser 여유 폭과 무관하게 1:1 정사각형을 유지하고, 주 단위 행 사이는 작은 간격으로
  분리해 서로 다른 주의 범위 끝점이 세로 캡슐처럼 붙지 않게 한다.
  date-range 폭이 `24rem` 이상이면 각 endpoint의 날짜와 시간을 동일한 두 열에 놓는다. 마감 시간은
  상시 모집일 때 `없음`, 마감일을 고르는 중에는 `날짜 선택 후 설정` 비활성 자리를 유지해 날짜 선택
  전후에도 네 칸의 폭과 리듬이 달라지지 않게 한다. mobile은 endpoint 안의 날짜와 시간 control을 세로로 쌓아
  44×44px 날짜 touch target과 정보 순서를 유지한다.
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
  직접 등록한 `representativeImageUrl`은 그대로 사용한다. 이미지가 없거나 기존 공통 기본 경로
  `images/default-group.png`인 경우, 공통 `GroupImage`가 모임 종류에 맞는 기본 이미지를 표시한다.
  로딩 실패 시에도 같은 종류의 이미지로 대체한다. 승인된 1254×1254 원본은
  `public/images/default-group-{club,study,session}-3d.png`에 보관하며, 알 수 없는 종류에는 기존
  공통 기본 이미지를 사용한다. 탐색 이외의 기본 GroupCard는 기존 surface와 하단 fade를 유지한다.
- Account activity/group cards: 종료된 내 모임은 대표 이미지 밝기를 50%로 낮추고
  기존 `모임 종료` 배지를 함께 표시한다. 상세 목적지가 하나인 카드는 제목만이 아니라 카드 전체가 하나의
  semantic link다. 내부 mutation button이 있는 신청 카드는 중첩 interactive element를 피하기 위해
  제목 링크와 action을 분리한다.
- MarkdownContent: raw HTML을 실행하지 않고 제목, 굵게, 목록, 인용, 안전한 http(s)/내부 링크만
  React element로 렌더한다. 작성 화면 미리보기와 공개 모임 소개가 같은 renderer를 공유한다.
- GroupMemberInsights: 실제 group member cursor data로 상세 참여자 탭과 같은 `참여자` heading, 공통
  `Avatar`를 사용한 참여자 요약, 기수별 categorical rail, 기수별 인원 chip을 구성한다. heading 옆에는
  상세 참여자 탭과 중복되는 현재 인원 배지를 두지 않는다. avatarUrl이 있으면 GitHub 프로필 이미지를
  표시하고, 실패하거나 없을 때만 crew name 이니셜로 대체한다. rail segment는 hover와 keyboard
  focus에서 `N기 · M명` preview를 제공한다. 생성 전 화면은 아직 groupId가 없으므로 참여자를 꾸며내지
  않고 생성 후 확인 가능 상태를 표시한다.
- Badges: 유형·상태는 공통 `StatusBadge`를 사용한다. 홈·탐색·아카이브·상세·내 모임·관리 화면에서
  `--text-badge`(12px), 굵기 700, line-height 1.5, padding `--space-1`/`--space-2`(4px/8px),
  radius `--space-1`(4px)을 동일하게 적용한다. 화면별 크기·곡률 override를 두지 않는다.
  아이콘은 글자 크기에 맞추고 간격은 `--space-1`로 통일한다.
  유형·상태색은 기존 soft surface + 고대비 text를 쓰며, 모임 종료는 검정 바탕·흰 글자 `ended` tone을 쓴다.
  사진 위 상태 배지는 `placement="overlay"`로 위·왼쪽 `--space-3`(12px)에 배치한다.
  유형 배지는 제목 앞에 놓고 부모가 문맥에 맞는 간격을 관리한다. 버튼·필터·숫자 카운터는 이 규격과 구분한다.
- Tabs: route 또는 상태와 연결된 semantic tablist. 선택 underline 하나가 새 tab 위치로 이동하고
  panel은 짧게 fade/translate되어 공간 연속성을 전달한다. 모바일은 가로 scroll하되 page 자체
  overflow는 막는다. 상세 탭은 모든 화면에서 최소 `--touch-target`(44px), 상하 padding `--space-2`,
  글자 `--text-label`·굵기 600·line-height 1.4로 맞춰 헤더 메뉴처럼 얇고 간결하게 표시한다.
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
`DateRangePicker`, `TimePickerPopover`,
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

- 홈의 오늘 같이해요·모집 중·아카이브 카드와 탐색 카드는 상세 진입 시 동일한 대표 이미지를
  공유 요소로 연결한다. 클릭한 카드 하나만 이름을 부여해 같은 모임의 중복 카드와 충돌하지 않는다.
  이미지는 420ms `cubic-bezier(.2, 0, .2, 1)` 곡선으로 상세 배너에 도착한다.
  사진은 한 장만 그린다. 출발·도착 이미지의 실제 표시 크기와 `object-fit`을 측정해
  프레임 이동과 같은 곡선으로 크롭 크기를 보간한다. 서로 다른 크롭의 사진 두 장을
  교차 합성하지 않는다. 명암은 별도 공유 레이어로 분리해 이동 동안 전환한다.
  제목과 정보는 마지막 120ms에
  왼쪽 `--space-2`에서 제자리로 들어온다.
  상세 탭·본문은 아래 `--space-4`, 모집 rail은 오른쪽 `--space-4`에서
  420ms 동안 제자리로 모인다. 불투명도는 처음 120ms에 1이 되어 테두리와 글자가
  이동 내내 연해지지 않게 한다. 퇴장은 이동 없이 120ms 동안 사라진다.
  확대·반동은 추가하지 않고 공통 헤더는 이동에 포함하지 않는다.
  목록 복귀 시에는 카드 프레임을 도착 위치에 고정하고 본문을 처음 180ms 동안 나타낸다.
  전체 사진형 대표·아카이브 카드의 본문과 배지는 사진보다 위에서 나타나며,
  카드 명암은 사진과 같은 위치와 크기로 이동한다. 복귀 카드에는 상세 진입용 노출 지연을 적용하지 않는다.
  이미지 크기를 아직 측정할 수 없거나 원본 URL이 다르면 도착 사진 하나를 사용한다.
  뒤로 가기와 화면 크기 변경에도 현재 이미지 크기를 다시 사용한다.
  전환용 이미지 쌍에는 고정된 `--shadow-float` 그림자를 사용해 흰 이미지와 본문을 구분한다.
  그림자 크기를 매 프레임 바꾸지 않으며 전환 레이어가 사라질 때 함께 제거한다.
  카드 배지는 이미지와 함께 확대하지 않는다. 카드에 마우스를 올리거나 키보드로 포커스하거나
  터치를 시작하면 해당 모임 상세 query만 미리 준비한다. 상세 데이터와 페이지 모듈 준비 후 전환한다.
  뒤로 가기는 출발 URL의 필터·스크롤·카드 포커스와 오늘 캐러셀 순서를 복원한다.
  동작 줄이기에서는 이동을 생략하며 미지원 브라우저는 일반 링크 탐색을 유지한다.

- Fast `120ms`, base `180ms`, deliberate `240ms`, smooth `420ms`; easing `cubic-bezier(.2,.8,.2,1)`.
- Header 주요 메뉴는 글자 수와 관계없이 홈, 탐색, 활동, 게시판, 스파링, 피드백을 각각 `--header-nav-item-width`(4.25rem) 폭으로 맞춘다.
  열 수와 선택 밑줄 폭은 실제 메뉴 수를 따라 계산한다.
  주요 메뉴 글자는 `--text-body`(0.9375rem)를 사용한다. 헤더 의자 로고는 태블릿·데스크톱에서
  2.125rem, 모바일에서 2rem 크기를 사용한다.
  선택 밑줄은 한 개를 공유하며 180ms transform으로 이동한다. 홈, 탐색, 활동, 게시판 탭 사이에서는
  새 본문이 420ms 동안 opacity 0→1과 수평 이동을 함께 적용한다. 탐색 페이지 첫 진입은
  목록 첫 페이지와 모듈 준비 후 시작해 전환 도중 로딩 화면이 카드로 교체되지 않게 한다.
  캐시된 목록으로 돌아올 때는 기존 페이지들을 즉시 재사용하며 검색·필터 변경은 기존 query 로딩을 유지한다.
  이동 폭은 화면의 6%,
  최대 `--space-12`(48px)로 제한해 넓은 화면에서도 과하게 쓸려 들어오지 않게 한다.
  오른쪽 탭은 오른쪽에서, 왼쪽 탭은 왼쪽에서 들어오며 표준 easing으로 부드럽게 감속한다.
  main 내부의 content만 이동하고 배경·둥근 모서리·header·footer는 고정한다.
  본문을 remount하지 않고, 최초 진입·동일 경로의 query 변경·상세 페이지 진출입·피드백 모달에는 화면 전환을 적용하지 않는다.
  reduced-motion에서는 밑줄과 본문 모두 즉시 전환한다.
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
- DateRangePicker와 TimePickerPopover는 beui.dev `popover`의 controlled open state, trigger
  `aria-expanded`, Escape 시 trigger focus 복원과 `availability-scheduler`의 단일 active panel 원리를
  가져온다. 날짜·시간 panel은
  문서 흐름을 밀지 않는 overlay popover로 두고, 열릴 때 opacity + 4px translate만 180ms로
  전환한다. 날짜 범위와 빠른 선택 결과는 즉시 갱신하며 전환 중에도 입력을 막지 않는다.
- `HeroScrollButton`은 카드 수나 화면 높이에 관계없이 목록의 `자리 둘러보기` 제목에 맞춰
  smooth scroll한다. 고정 헤더 아래에서 제목까지의 여백은 `--space-4`(16px)이며, 제목 아래 검색·필터를
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

| Decision                                       | Reason                                               | Status              |
| ---------------------------------------------- | ---------------------------------------------------- | ------------------- |
| JavaScript/JSX + Webpack/Babel 사용            | 사용자가 TypeScript와 Vite를 명시적으로 제외         | accepted            |
| desktop-only Figma에서 responsive 규칙 파생    | 필수 360/768 검증을 충족하고 정보 우선순위 유지      | accepted            |
| Figma header의 frame 간 위치 불일치            | 화면별 복제 대신 common shell을 유지                 | accepted            |
| 모든 viewport의 full-bleed header 배경         | 사용자 피드백과 공통 shell 정렬을 반영               | accepted            |
| header 내부 콘텐츠의 shell/gutter 정렬         | 본문 section 시작·끝 rail과 일관성 유지              | accepted            |
| 대표 이미지 picker/업로드                      | presigned 업로드 API와 그룹 image key 계약 반영      | implemented         |
| 프로필 수정·참여자 제거 액션 제거              | backend에 실제 mutation 없음                         | accepted            |
| production runtime fallback 성공 데이터 금지   | API에 없는 기능·데이터를 성공처럼 보이지 않게 함     | accepted            |
| 생성 전 참여자 탭의 안내 상태                  | groupId가 생기기 전 실제 참여자 API를 호출할 수 없음 | accepted            |
| OAuth 실사용 검증은 자격 증명/테스트 계정 필요 | secret과 실제 계정은 저장소에 넣지 않음              | external dependency |

Figma reference screenshot은 root의 `.omo/evidence/figma/`에 보관한다. 해당 screenshot은
비교 근거이며 UI를 이미지로 복제하는 구현물은 아니다. 미해결 시각/접근성 부채는 구현·QA
과정에서 이 표에 추가하고, 근거 없이 “none”으로 닫지 않는다.

## 9. Reference comparison home (2026-09-27)

- Scope: isolated `feat/home-reference-comparison`; start from the current working state of
  `feat/session-home-discovery`. Keep the introduction hero, with the fixed service copy
  `크루와 함께할 자리를 찾아보세요` as the three-line h1 before login, followed by the
  time/location phrase. After login, swap the two content slots: the phrase becomes h1 and
  the fixed introduction moves below it. Only authenticated status enables the swap;
  loading, anonymous, signup-required and unavailable keep the pre-login arrangement.
  Preserve the user-supplied 2172×724 day, sunset and night originals at
  `src/shared/assets/brand/jarihana-hero-{day,sunset,night}.png` as references.
  The home hero uses the sibling `-responsive.png` versions, regenerated as whole scenes
  with more vertical breathing room while preserving the characters' identities and poses.
  Select day at 06:00–16:59, sunset at 17:00–19:59 and night at 20:00–05:59
  in Asia/Seoul, independently of the browser's timezone. Derive art and copy from the same
  clock, refresh at each hour boundary and reschedule immediately on focus or tab return.
  Preserve the existing headline slots, including the 19:00 night/campus phrase.
  Night uses a local `--reference-hero-night-surface` mixing 25% --color-activity-study-ink
  with --color-nav behind the full hero, so text remains readable as content changes height.
  Night title and subtitle use --color-surface; inline emphasis uses --color-brand.
  Both hero actions share the same frosted-glass surface and type treatment, with local tokens
  inherited from the existing data-time-of-day state. Day uses --color-brand-soft with
  --color-brand-ink text; sunset uses --color-activity-session-soft with
  --color-activity-session-ink text; night mixes --color-activity-study-ink at 70% with
  --reference-hero-night-surface and uses --color-activity-study-soft text.
  Name these tokens --reference-hero-action-surface and --reference-hero-action-ink.
  Keep the glass mostly opaque: mix the action surface at 82% over a transparent backing,
  increasing to 90% on hover and 94% when pressed. Apply a static 16px backdrop blur and
  130% saturation only within the two buttons. A 160-degree white glaze fades from 24% to
  4% at 60%; use one uniform --border-thin (1px) border at 48% white and a soft
  0/4px/12px black shadow at 10%. Clip the glass background to the padding box and omit
  inset edge highlights so the outline stays even. Use existing surface/nav and spacing tokens.
  The local --reference-hero-action-glass-backing defaults to the opaque action surface;
  supported backdrop filters switch it to transparent. Reduced transparency restores the
  opaque backing and disables blur. Keep chair images and labels fully opaque.
  Focus uses the action ink with the shared outline width and offset.
  Keep background changes immediate. The hero fills the page width with square corners;
  the existing main frame supplies its outer top rounding on tablet and desktop.
  A decorative pseudo-element fills the hero bounds without clipping action focus outlines.
  Use `홈`, `탐색`, `활동`, and `피드백` labels in desktop and mobile navigation.
  `홈` opens `/home` and is active only on `/home`; `탐색` opens `/groups`
  and is active only on that route. Reuse the existing header link and active styles.
  Both links close the mobile drawer without triggering login; browse opens unfiltered.
  Put two semantic CTA links beneath the hero copy, led by `자리찾기` opening
  unfiltered `/groups`. Both actions inherit the shared --radius-pill capsule shape and use ui-button--lg
  --button-height-lg minimum height and --text-body semibold label.
  Use the generated transparent `jarihana-chairs-rainbow.png` beside the label: three
  vivid red, green and blue chairs form a compact fan in the existing
  rounded 3D style. Render the single bitmap at --space-12 (48px) wide
  and --space-8 (32px) high, with object-fit contain and full opacity. Keep its original
  vivid colors without CSS color filters; the compact group stays inside the button.
  Use --space-1 block padding, --space-4 inline padding and --space-2 item gaps.
  The group is decorative (aria-hidden and empty alt), inside the same navigation target.
  `자리 만들기` opens `/groups/new` with the existing member guard, using the same
  filled button treatment. Its decorative mark
  uses the generated transparent `jarihana-chair-create.png`: one mint chair and a small
  ivory three-dimensional plus sign beside its upper-right backrest, rendered together
  as a single bitmap. Display it in a --space-8 (32px) square group. Do not overlay a separate SVG plus. Both action labels
  remain the accessible names, with the image decorative and no separate badge surface.
  Reuse ui-button shape and interaction states with local hero surface overrides.
  Actions use --space-3 gaps and --space-6 top spacing;
  wrap when needed. On mobile use compact content-width buttons side by side, with
  --space-2 between buttons, --touch-target-lg (48px) minimum height, --text-label (14px)
  semibold labels, --space-1 icon gaps and --space-3 inline padding. The browse chair fan is
  --space-8 (32px) wide and --space-7 (28px) high; the create mark is 28px
  square. Both labels fit on one row at 320px; allow wrapping for enlarged text.
  Keep hero action shells stationary while each chair mark and label gently move up and
  down by 3px over a 3.6s ease-in-out loop. Stagger each label by -0.45s after its mark
  and offset the create action by -0.9s, creating a traveling vertical wave across the
  four elements. Use local --reference-hero-motion-cycle and --reference-hero-motion-delay.
  Keep the glass surface static, without rings or surface ripples.
  Fine-pointer hover and keyboard focus lift the chair image by 1px and scale it to 1.08
  over --duration-smooth while the vertical wave continues. Press scales the image to 0.96.
  Pause decorative loops while the action row is offscreen
  or the document is hidden; remove all motion with prefers-reduced-motion.
  Preserve the shared focus outline and stable group_create/group_browse actions.
  Keep the section order hero, TodaySessionsHero, recruitment, then archive. Move the existing
  search and type controls to the recruitment section before its results. TodaySessionsHero keeps
  its live date, location prompt, rotating tickets and plan. The actual h2 section title is
  `오늘 같이해요`, matching the recruitment heading size and weight. Date/location are muted
  secondary metadata beside the title on desktop and wrap below on mobile.
  Both auth states share the same title → subtitle → actions layout and background.
  Main title: desktop 40–48px at 3.125vw; tablet and mobile 28–32px at 3.5vw,
  bold ink, 1.22 line height;
  keep the service title's original three lines and balance natural time-phrase wrapping.
  Subtitle: --text-h2 desktop; --text-hero-body (18px) below 1024px.
  Use semibold ink, 1.5 line height and --space-3 below the title (--space-2 below 1024px).
  Preserve inline mint emphasis on the key phrase or the word 자리.
  The active main title is the page's only h1 and labels the hero region. The home page
  owns the shared auth, campus and time state; login/logout swaps presentation only,
  without resetting the phrase variant, search, type filters or today's location control.
  Today's title/meta lead directly into its cards without repeating the headline.
  Recruitment search reuses develop's groups-search__control and groups-search__submit:
  transparent surface, no side/top border or rounded frame, a strong bottom border, and
  brand-color focus underline. Search submit and type selection scroll to recruitment results
  with reduced-motion support so the intervening today section does not hide the outcome.
  At every viewport the hero starts directly below the header and fills the available page width,
  without top or side gutters. The home page has no width cap or inline padding; subsequent
  sections retain the shared shell (1400px on desktop) minus shared gutters, centered independently. Below 1024px use
  clamp(16rem, calc(24svh + 4rem), 20rem) with 48px block padding instead of a 560px floor.
  Keep the height content-driven when longer copy requires more room.
  From 1024px, use a home-only minimum of max(clamp(27rem, calc(34svh + 4rem), 31rem), 28.125vw)
  with 56px block padding. The width-based floor only grows the hero on ultra-wide screens,
  keeping the 32:9 artwork's full vertical extent inside the visible background.
  Both responsive ranges add 64px to the compact hero, including when its content determines height.
  Keep the copy centered and preserve the following section's spacing.
  Keep content vertically centered and allow natural expansion. Mobile removes the main frame's
  top rounding and the sticky header's corner decorations, so its hero has square top corners.
  Following sections retain their normal page gutters.
  Use the regenerated 32:9 jarihana-hero-{day,sunset,night}-responsive.png artwork with
  height-fit sizing (`background-size: auto 100%`). The three runtime hero images are whole-scene
  generations cropped from native 2172×724 sources to the same 2144×603 center crop, without
  resize, compositing or color adjustment. Keep the original day/sunset/night PNGs as references
  only; the older square extended-sky variants and night-starry source are not runtime assets.
  Align it center center at every breakpoint so narrow screens crop evenly from the sides.
  Below 1024px, apply contrast only around title and subtitle glyphs using layered text shadows
  with 4px, 8px and 16px blur at 90%, 85% and 70% opacity. Let the shadows follow natural
  line wrapping; do not add a copy-container background or a rectangular backing around the actions.
  Use --reference-hero-copy-surface (light for day/sunset, dark navy for night).
  Clip this decorative backing at the hero boundary and keep it noninteractive.
  Desktop keeps the original artwork without contrast backing.
  Development builds only show compact preview selects at the hero's top right: one for
  automatic, day, sunset and night, and one for the artwork set. The artwork set defaults to
  the current responsive assets and can switch to the experimental `classic` set when the
  matching day/sunset/night files are present. A separate nebula option shares the classic
  day/sunset images and uses `jarihana-hero-night-nebula.png` only while the displayed period is
  night. The dev-only refined option labeled `얼굴 보정 (낮·노을·밤)` uses
  `jarihana-hero-{day,sunset,night}-refined.png` when present, preserving the same hero sizing
  and center/auto-100% background behavior. These controls override only the hero theme or
  background asset; live headlines, dates and session data keep their real-time behavior.
  Automatic resumes the current Korean-time theme. The selections are local to the mounted hero
  and reset on reload. Production builds have no selectors or theme override. Keep the controls
  outside the copy flow so previewing preserves layout.
  Recruitment search keeps its existing underline and mint focus state on the page canvas.
  Background bounds always equal the hero bounds; never reserve a separate mobile image row
  or center a fixed-ratio strip inside a taller surface. Place left-aligned copy/actions in the
  image's quiet area (46% desktop, 60% below 1024px with a 24rem minimum capped at 100%, so
  the two content-width buttons fit on one row at normal text size). Keep phrases intact where possible and
  allow long words to wrap within the available width without truncation.
  Center the copy vertically and allow the hero to grow when longer text wraps. Mobile shares the tablet
  copy width, min(100%, max(60%, 24rem)), and compact height and spacing.
  The wide artwork fills the hero height with the responsive focal positions above. The localized
  copy backing also applies on mobile; do not add a veil across the entire artwork.
  Below 1024px use clamp(1.75rem, 3.5vw, 2rem) for the title (28–32px, 1.22 line height),
  --space-2 between title and subtitle, and --space-4 above the actions. Align the title, subtitle
  and actions with the following sections using the shared --page-gutter (16px mobile, 24px from 768px).
  Beyond the 1440px --container-shell, include the centered shell's outer margin in the hero's
  inline padding while keeping its background full width. Retain compact side-by-side actions at 320px.
  The decorative scene has no separate image
  element or redundant accessibility name. Introduction, heading and controls remain real content.
  The recruitment section's selected type pill uses --color-brand mint with --color-ink text, matching the common
  primary action palette; do not use the dark --color-brand-ink as its background. Use
  --space-6 for action separation from copy and --space-3 between wrapped rows on desktop.
  Hero actions follow the copy column. Use the supplied background assets
  and actual API data.
- Visitor task: find a currently recruiting group, filter by the actual supported group type,
  open its details, and browse ended groups separately. No invented tags, participants, dates,
  counts, or sample runtime data. Live API state remains authoritative.
- Recruitment section: compact heading `지금 모집 중인 모임`, a labelled search field and type
  pills (`전체`, `같이해요`, `스터디`, `동아리`), then one large image-led featured card and three
  small image-over-body cards per desktop row. Their hover borders and keyboard focus rings
  use the same type colors as browse cards (SESSION amber, STUDY blue, CLUB purple).
  Keep borders at least 1 CSS px at compact desktop density and transition border color
  over the shared base duration without changing card dimensions. Desktop grid = `2.4fr repeat(3, 1fr)`;
  tablet = two equal columns with a full-width featured card; mobile = one column.
  The representative home shows at most four recruitment cards and never expands in place.
  Browsing beyond the preview belongs to a separate list page, reached from a heading-right
  text link `모집 중인 모임 더 보기` with an arrow. On narrow screens the link wraps
  below the heading and remains right-aligned to keep both labels intact. It opens `/groups` with the current keyword
  and type plus ACTIVE/recruiting=true. The lower recruitment pagination button is removed.
  The browse page reuses the original session-home-discovery `DiscoveryGroupCard` and
  `discovery.css` directly: four desktop columns, three tablet columns and horizontal mobile
  cards, original image crop, badges, title/introduction, schedule, location, session duration
  and seat count. Preserve type-colored hover lift/shadow/outline, focus and reduced motion.
  Its heading, underline search and native type/status/recruiting selects use the same original
  discovery styles. The single all-type list keeps URL filters, loading/empty/error states and
  cursor pagination. Its title is `자리 둘러보기`; creation remains available from that page.
  Below 64rem, the stacked search fills the same content width as the filters. The creation
  button uses the header's chair image, `자리 만들기` label, small height, 1.5rem icon and 4px
  icon gap while preserving its existing authentication flow and analytics action.
  Feature placement is the first API result, never labelled popular or recommended.
- Cards use GroupImage with real images and current type defaults. Like browse cards, place
  the type badge above the title. Home featured/regular and browse type badges match archive
  sizing through StatusBadge: --text-badge, --space-1/--space-2 padding, line-height 1.5 and 4px corners.
  Keep schedule and participant metadata at the bottom,
  with remaining seats aligned to the right of the participant row; allow wrapping on narrow cards.
  Preserve the group-type colors for badges and remaining seats. The featured card follows the
  same information order with its arrow after the remaining seats, a dark lower image scrim,
  white title and readable metadata. Small cards use white surfaces and thin borders. Recruitment cards, archive cards and their loading
  skeletons share --radius-lg (20px) corners with the existing today session tickets.
  Existing group_view click identifiers
  and /groups/:id routes remain intact. No nested interactive elements.
- Archive: heading `지난 모임 아카이브`; independently request status=ENDED, size=4. Four image-backed
  cards per row on desktop and two per row on tablet and mobile, with a dark gradient, ENDED
  label `종료`, a compact type-colored badge, name and actual schedule. Omit member counts.
  Reuse the shared type badge tones for SESSION/STUDY/CLUB. Keep a four-card preview on home.
  On mobile, use a 12px grid gap and 12px side/bottom content padding, with 15px titles
  and 12px type/schedule text. Reserve two line-heights for every title at all breakpoints,
  including single-line titles, so type badges and schedules stay aligned. Keep the two-line
  title limit and matching loading grid.
  The heading's `전체 보기` text link with a small arrow opens `/groups?status=ENDED`,
  where search, type filters and cursor pagination continue. Keep the title and link on
  the same row on mobile, with the description below. Use action `archive_browse` for this
  navigation instead of the retired `archive_load_more` action. Preserve independent
  empty, loading and retry states. Never describe merely recruitment-closed ACTIVE groups
  as ended groups.
- Reuse semantic colors, typography, spacing and motion from sections 2 and 6. Local tokens:
  `--reference-card-radius`=var(--radius-lg), `--reference-grid-gap`=var(--space-5),
  `--reference-feature-min-height`=22rem, `--reference-archive-min-height`=10rem,
  `--reference-feature-scrim`=linear-gradient(180deg, rgb(0 0 0 / 0%) 12%, rgb(0 0 0 / 82%) 100%),
  `--reference-archive-scrim`=linear-gradient(90deg, rgb(0 0 0 / 86%), rgb(0 0 0 / 28%)).
  Ratios and component dimensions are reference-derived; all other tokens are inherited.
- States: focus ring for links and filters, pressed type pills, disabled/pending pagination,
  data-shaped skeletons, explicit empty/error messages with retry. All controls carry stable
  analytics actions. 44px touch targets and reduced motion remain in force.
- Reference fidelity boundary: the screenshot's hand-drawn artwork, fabricated participant
  portraits and technology tags are not supplied production assets/API fields. Use existing
  imagery and supported types. New browser checks cover 375/768/1280px and live data.

## 12. 알림함과 웹푸시


- PWA 설치 이름과 짧은 이름은 `자리하나?`로 통일한다. 설치용 192px·512px 아이콘은
  기존 민트 의자 시그니처를 흰색 불투명 배경 위에 표시한다.
- OS 푸시 알림 제목은 사건 종류와 기본 안내 모두 `자리하나?`로 통일한다.
  사건별 본문과 알림함의 사건별 제목은 유지한다.
- 기존 검은 헤더와 흰 surface/mint palette를 유지한다. 로그인 시 desktop 프로필 바로 왼쪽,
  mobile 전체 메뉴의 닫기 버튼 왼쪽에 44px 종 버튼과 안 읽은 수를 표시한다.
  종 버튼을 누르면 전체 메뉴를 닫고 알림함을 연다. 닫기 버튼과 간격은 4px이며,
  숫자 배지는 신청관리와 같은 danger 배경과 surface 글자색을 사용한다.
  모바일 햄버거 버튼에는 미읽음이 있을 때만 숫자 없는 danger 색 점을 표시하고,
  스크린리더에는 미읽음 알림이 있다는 설명을 제공한다.
  모바일 알림함을 닫으면 전체 메뉴로 돌아온다. 알림을 선택해 이동할 때는 메뉴를 열지 않는다.
- 알림함은 공통 Drawer의 focus trap·Escape·닫기 후 focus 복귀를 재사용한다.
  [scroll-body-shell](https://github.com/changeroa/StyleGallery/blob/main/patterns/viewport-shell/scroll-body-shell.md)
  구조를 따라 패널 안쪽 콘텐츠가 스크롤하며 페이지는 잠긴다. 긴 문구는 줄바꿈한다.
- NotificationRow: 제목·본문·서울 기준 시각·읽음 상태, 별도의 삭제 버튼. 미읽음은
  왼쪽 세로 중앙의 brand 색 점으로 구분하고, 읽은 항목은 점 없이 surface-sunken 배경과
  muted 글자색을 사용한다. 읽음 상태 텍스트는 스크린리더에만 제공한다. 목록을 여는 동작은 읽음 처리하지 않는다.
- 전체 읽음은 재조회로 표시만 바꾼다. 삭제 API 성공 후 해당 행을 오른쪽 100%로
  translate하며 opacity를 낮추고 제거한다. 주변 행은 제거 후 자연스럽게 자리를 채운다.
  [beui swipeable-list](https://beui.dev/r/swipeable-list/raw)의 수평 transform·세로 스크롤 분리
  원리를 참조했으며 새 gesture/motion 라이브러리는 추가하지 않는다. 삭제는 버튼으로 수행한다.
  duration-deliberate(240ms)·ease-standard를 사용하고 reduced-motion에서는 즉시 제거한다.
  삭제된 행에 focus가 있으면 다음 항목, 이전 항목, 목록 제목 순으로 옮긴다.
- NotificationBell/NotificationRow/PushSettings는 loading·empty·error·pending·disabled·retry
  상태를 갖는다. 아이콘은 lucide-react, 색·글자·간격·radius는 기존 공통 token을 사용한다.
- 알림함은 종 버튼의 Drawer로 제공하며 독립된 /notifications 페이지는 두지 않는다.
  /notifications/open/:id는 알림 확인·이동에 사용한다. 종 아이콘은 --space-5 크기다.
- 푸시 설정은 이 브라우저의 상태를 설명한다. 모바일 설치 안내, 권한 거부·미지원·
  서버 비활성·동기화 실패와 재시도를 구분한다. 계정·endpoint·키는 분석에 보내지 않는다.
  켜기·끄기는 44px 터치 영역의 토글(`role="switch"`)로 제공하고, 실제 연결 상태를
  `aria-checked`로 알린다. 처리 중에는 비활성화하며 키보드와 reduced-motion을 지원한다.
- 변경 범위의 viewport 360/768/1440, 키보드·긴 문구·삭제 실패·reduced-motion을 확인한다.
  실제 OS 알림·외부 Push Service·모바일 설치는 6단계 실기기 검증으로 남긴다.

## 13. 알림에서 마이페이지 항목 찾기

- 승인 알림은 내 모임의 해당 유형 탭, 미승인 알림은 내 신청의 미승인 탭을 연다.
- 다음 페이지의 항목도 조회한 뒤 카드 중앙으로 스크롤하고 `tabIndex=-1`인 카드에
  키보드 focus를 옮긴다. 기존 focus-visible 토큰과 함께 brand-soft 배경·shadow-float로
  3초 동안 강조한다. 기존 카드·44px 클릭 영역을 재사용하며 새 색·motion 토큰은 만들지 않는다.
- reduced-motion에서는 즉시 스크롤한다. 찾는 중·조회 실패·기록 없음은 명시적으로 안내한다.

## 14. 초대장 확인과 수락

### 모임 상세의 초대 진입점

- ACTIVE 모임의 현재 구성원에게 히어로 우측 상단 `초대 링크 복사`를 제공한다. 모임장만 보는 기존 톱니바퀴와 같은 action row를 사용하며 일반 모임원에게 관리 권한을 추가하지 않는다. 작은 화면에서는 제목과 겹치지 않도록 상단 여백을 확보한다.
- 참여자 패널 안에서 제목과 `+ 초대`를 한 줄에 배치한다. 기수 구성 영역에는 초대 버튼을 놓지 않는다. 보이는 버튼 높이는 `--space-8`(32px), 작은 아이콘과 label typography를 사용하며 투명 클릭 영역으로 44px를 유지한다.
- 회원 초대 모달은 공통 Modal의 focus·Escape·스크롤 처리를 재사용한다. 열면 초대 가능한 회원 목록을 바로 표시하고 다음 페이지를 제공한다. 이름 두 글자 이상으로 검색하고 검색어를 지우면 전체 목록으로 돌아간다. 여러 체크박스 선택·선택 chip 해제·검색 변경 후 선택 유지를 지원한다. 제목 아래 설명과 검색 위 안내 문구는 표시하지 않는다. 전송 결과는 성공·실패 인원으로 구분하고 실패 대상만 선택에 남긴다. 모달에 개인 메시지 입력을 두지 않는다.
- 초대 후보는 체크박스·공통 `Avatar`(`sm`, `--touch-target`)·이름·회원 정보 순으로 표시한다. 기본 목록·검색·추가 페이지 모두 `avatarUrl`을 사용하고 URL 누락·null·이미지 실패 시 이름 첫 글자로 대체한다. 30rem 이하에서는 이름 아래에 회원 정보를 배치하고 체크박스와 사진은 두 행 높이에 맞춰 정렬한다.
- 보낸 초대·공유 링크 관리는 같은 모달에서 보조 탭으로 제공한다. 받은 초대 전용 화면을 추가하지 않고 기존 알림함→초대장 경로를 유지한다. 취소는 canRevoke에 따라 표시하며 공유 링크 복사는 모든 현재 구성원에게 제공한다.
- 초대 모달은 별도 검색 버튼 없이 입력창 하나가 검색 영역의 전체 너비를 사용한다. 높이 `calc(--space-12 + --space-1)`(52px)와 `--radius-sm`을 유지하며, 입력 후 250ms debounce와 Enter로 검색한다. 모바일에서도 빈 버튼 행을 남기지 않는다.
- 검색창 위 가시적인 label은 표시하지 않고 `aria-label="회원 이름 검색"`으로 접근 가능한 이름을 유지한다. `내가 보낸 초대`는 본인 발급 DIRECT만, `공유 링크`는 모임 전체 LINK를 조회한다. 본인이 만든 LINK도 공유 링크 탭에서만 표시한다. 화면 안내도 이 범위에 맞춘다.
- `내가 보낸 초대`의 각 행은 상태 아래에 `수신자: 이름`을 표시하고 발신자를 반복하지 않는다. 긴 수신자 이름은 행 안에서 줄바꿈하며 이름을 분석 이벤트에 포함하지 않는다.
- 복사는 같은 모임의 현재 유효한 링크 하나를 재사용하며 기간을 연장하지 않는다. clipboard 실패 시 읽기 전용 주소와 직접 선택·복사 안내를 공통 Modal로 제공한다. 링크 원본은 분석·녹화에서 가린다.

- 지정 초대와 공유 초대는 공통 `PageContainer`, `PageHeader`, `Card`, `StatusBadge`,
  `Button`, 상태 컴포넌트를 사용한다. 모임 이름·소개, 초대한 사람, 만료 시각, 수락 안내와
  action 순서로 한 열에 배치하고 긴 이름과 소개는 자르지 않고 줄바꿈한다.
  모바일에서는 가용 폭을 채우며 카드 여백은 `--space-6`, 내용 간격은 `--space-4`다.
  읽기 영역은 `calc(--space-16 * 8)`(512px) 상한으로 가운데 정렬한다.
  제목 위 보조 문구와 VALID 상태 배지는 표시하지 않는다. 본문 뒤 `거절`, `수락`
  버튼은 오른쪽 정렬하며 좁은 화면에서는 자연스럽게 줄바꿈한다. 페이지가 스크롤을 소유한다.
  거절은 공통 ConfirmDialog로 모임장에게 알림이 가지 않음을 안내하고, 확인 후 본인의
  지정 초대의 REJECTED 상태를 서버에 저장한다. 알림은 유지하고 재진입하면
  `거절한 초대장입니다.`를 표시하며 다시 수락할 수 없다. 공유 링크에는 거절 버튼을 두지 않는다.
  확인 창의 취소·거절 버튼은 모든 화면 폭에서 오른쪽 한 줄로 배치하고 초대장과 동일한
  기본 버튼 크기를 사용한다. 취소·Escape는 초대장과 버튼 focus를 복구한다.
  처리 실패는 확인 창에 표시한다.
- `InvitationPage`는 로딩·로그인 필요·가입 필요·인증 확인 실패·대상 불일치·유효하지 않은
  초대·만료·취소·모임 종료·이미 수락·수락 중·수락 실패·합류 완료 상태를 제공한다.
  서버의 상태와 수락 자격을 표시하고 로그인·가입만으로 수락하지 않는다.
- 수락 중에는 버튼을 잠그고 오류는 `role=alert`, 성공은 `role=status`로 알린다.
  합류 완료 또는 이미 참여 중인 결과를 먼저 설명하고 `모임으로 이동` 링크를 제공한다.
  합류 전에 모임 상세 API를 호출하지 않고 초대 미리보기 정보만 표시한다.
- 새 색·크기·motion token 없이 기존 공통 토큰을 재사용한다. 초대 내용은 `data-ph-private`로
  녹화에서 가리고 공유 토큰 경로에서는 기존 개인정보 보호 방식으로 수집을 중단한다.

## 15. 활동 기록 댓글과 하트 반응

- 카드: 캡션과 바이라인 아래에 구분선 없이 하트 이미지와 개수 배지, 댓글 수를 둔다. 반응과
  댓글이 없으면 줄 자체를 그리지 않는다. 시각 배지는 `aria-hidden`이고 스크린리더에는
  "반응과 댓글: 하트 3개, 댓글 2개" 같은 요약을 제공한다. 종료된 모임 카드의 하트는 사진처럼 바랜 색으로 보인다.
- 종료된 모임의 기록은 "아카이브" 배지 대신 바랜 사진(grayscale, sepia), 누렇게 변한 인화지,
  위쪽 테이프로 오래된 앨범 사진처럼 보인다. hover나 focus 시 색이 조금 돌아오고 reduced-motion에서는
  전환하지 않는다. 의미는 스크린리더 전용 "종료된 모임의 기록" 텍스트로도 전달한다.
- 카드 전체가 하나의 버튼이며 누르면 가운데 상세 다이얼로그를 연다. 길게 누르기와 우클릭으로 여는 수정, 내리기는 유지한다.
- 상세: 공통 Modal의 focus trap, Escape, focus 복귀를 재사용한다. 데스크톱은 왼쪽 어두운 사진 영역,
  오른쪽 제목, 캡션, 그룹 줄, 반응, 댓글과 하단 입력창이며 반응과 댓글 사이에 구분선을 두지 않는다.
  639px 이하에서는 전체 화면이 되어 사진과 대화를 함께 스크롤하고 입력창은 하단에 고정한다.
- 그룹 줄: 구성원에게는 "모임 보기 ›", 외부인이 모집 중인 모임을 보면 "모집 중"과 brand-ink 바탕의
  "모임 둘러보기", 종료된 모임은 "종료된 모임"과 "기록 보기 ›"를 보인다.
- 반응: 피드는 단순한 공감만 반응으로 받고 더 깊은 의견은 댓글로 남기도록 우선 하트 하나만 제공한다.
  이모지 글자 대신 `shared/assets/reactions/heart.webp`(96px) 하트 이미지를 쓴다. 하트와 개수를 담은
  pill 하나를 눌러 남기거나 취소하며, 고르기 창은 없다. 남기기 전에는 흐린 회색 하트이고 개수가 0이면 숫자를
  숨긴다. 내가 남긴 반응은 원래 색 하트와 brand-soft 바탕, brand 테두리다. 버튼 이름은 "하트 반응 3개, 내가 남김"처럼
  개수와 내 반응 여부를 전한다. 댓글에는 같은 형태를 작게 쓰고, 처리 중인 버튼은 다시 누를 수 없다.
- 반응한 사람: Slack처럼 하트 버튼에 마우스를 올리거나 키보드로 초점을 옮기면 버튼 위에 `--color-ink` 바탕의
  말풍선으로 "나, 바다 외 3명이 하트를 남겼어요"를 보여 준다. 내 반응은 맨 앞에 "나"로, 이름은 먼저 남긴 순서로
  최대 10명까지 쓴다. 개수가 0이거나 터치로 누를 때는 띄우지 않고, 말풍선은 버튼의 `aria-describedby`로 연결한다.
- 좋아요한 사람 전체 목록: 하트 옆에 "나, 바다 외 126명이 하트를 남겼어요" 요약 버튼을 둔다. 목록은 먼저 남긴 순서이고
  GitHub 프로필, 이름, "8기 프론트엔드"나 "코치", 내 반응의 "나" 배지를 한 줄에 보여 준다. 끝에 닿으면 30명씩 이어서 불러온다.
  - 데스크톱(640px 이상): 요약을 누르면 그 아래에 최대 22rem 너비와 높이의 목록 카드를 연다. 바깥을 누르거나
    Escape로 닫고, Escape는 상세 다이얼로그까지 닫지 않으며 초점은 요약 버튼으로 돌아간다.
  - 모바일(639px 이하): 시안 A의 바텀 시트를 사용한다. 요약을 누르면 상세를 어둡게 덮고 화면 하단 74% 높이에
    목록을 연다. 위쪽 모서리, 손잡이, 좋아요 수와 닫기 버튼을 두고 목록만 독립적으로 스크롤한다.
    바깥, 닫기 버튼이나 Escape로 시트만 닫으며 댓글 초안과 상세 스크롤은 유지한다. 시트가 열린 동안 배경을
    inert로 처리하고 초점을 시트 안에 유지하며, 닫으면 요약으로 돌려준다. 하단 안전 영역과 모션 감소 설정을 따른다.
  - 데스크톱은 시안 D, 모바일은 시안 A를 기준으로 한다. 요약 조회 실패 중에도 인원수로 목록을 열어 재시도할 수 있다.
- 댓글 작성자 프로필: 이름 첫 글자 대신 공통 `Avatar`로 작성자의 GitHub 프로필 이미지를 1.75rem 원으로 보여 준다.
  이미지를 불러오지 못하면 이름 첫 글자로 돌아간다.
- 사진을 누르면 거의 검은 배경의 크게 보기를 연다. 닫기 버튼, 바깥 클릭, Escape, 모바일 아래로 쓸기로 닫고
  상세와 사진 버튼 focus는 유지한다.

## 공개 랜딩 진입

`/`는 세션 확인 후 비회원은 `/land`, 회원은 `/home`으로 replace 이동하며 검색 조건과 해시를 유지한다. `/home`은 로그인 여부와 관계없이 기존 홈을 제공한다. `/land`에서는 회원도 같은 랜딩을 볼 수 있다. 랜딩의 질문 도입부, 프레임 밖으로 나오는 민트 의자, 별도 서비스 설명, 유형 선택과 이용 가이드 순서를 유지한다. 이용 예시는 화면 재진입 시 초기화하고 1.5배 속도로 재생하며 동작 줄이기를 지원한다. 랜딩도 홈과 같은 공통 배율을 사용해 가로 1024px 이상에서는 기본 rem 크기를 87.5%로 두고, 모바일·태블릿에서는 기본 크기를 유지한다. 로그인한 회원의 시작 CTA는 홈(`/home`), 생성 CTA는 `/groups/new`로 연결한다.

이용 가이드의 `01 모임에 참여하기`, `02 자유게시판`, `03 직접 만들고 운영하기`는 같은 설명과 데모 배치를 사용한다. 대분류 소제목은 번호와 이름을 띄어쓰기로 구분한다. 높이가 충분한 데스크톱에서는 왼쪽 단계와 오른쪽 고정 데모가 함께 전환되고, 모바일, 낮은 창, 모션 감소 설정에서는 각 설명 아래에 해당 화면을 표시한다. 생성 데모는 고정 영역에서만 여백을 줄여 제어 버튼과 하단 동작까지 한 화면에 담는다. 모든 이용 가이드는 도입부와 같은 `wheel-gestures`로 관성을 구분해 한 번의 입력에 한 단계만 이동한다. 관성의 작은 튐과 마지막 단계 뒤의 잔여 입력은 흡수하고, 새 입력이나 명확한 역방향 입력은 다시 받아들인다.


## Landing guide continuous flow

- 세부 사용법은 제목, 기능 체크 2개, 서비스 시연창 순서로 통일한다. 같은 내용을 반복하는
  설명 문단은 두지 않는다. 탐색 링크는 시연창 뒤에 배치한다.
- 모바일·태블릿의 세부 사용법은 헤더를 제외한 한 화면을 채운다. 체크 목록은 `--space-2`,
  제목·시연창 간격은 `--space-3`, 슬라이드 상하 여백은 `--space-4`를 사용한다.
  시연창은 남는 높이를 사용하고, 긴 내용은 재생 시간에 맞춰 검색 결과·신청·댓글 등으로
  이동한다. 너비 48rem 미만에서는 시연창 내부만 `--landing-mobile-demo-scale`(87.5%)로
  축소한다. 제목·체크·재생 버튼·캡션과 태블릿·데스크톱 배율은 유지한다.
  페이지 스크롤과 시연창의 이동은 별개로 작동한다.
  신청·일정 대화상자는 시연창 안에 머무르고, 창보다 긴 경우 입력란부터 버튼까지 이동한다.
  일시정지·다시보기·재진입 시 이동도 함께 멈추거나 초기화한다.
  동작 줄이기 설정과 높이 32rem 미만의 화면에서는 전체 내용을
  일반 문서 흐름으로 제공한다.
- CSS scroll timeline을 지원하지 않는 휴대폰에서는 도입부의 기존 keyframe을 정지된 animation으로
  재사용하고 JavaScript가 문서 스크롤 위치에 맞춰 진행률을 갱신한다. `hover: none`, `pointer: coarse`,
  기기 화면의 짧은 변 600 CSS px 미만을 함께 확인해 좁게 열린 태블릿·데스크톱 창은 제외한다.
  지원 브라우저와 태블릿·데스크톱의 기존 분기는 유지한다. 한 번의 터치에 질문 한 장씩 이동하고,
  마지막 질문에서 의자 등장·서비스 소개로 이어진다. 주소 표시줄 높이 변화는 진행률에 반영하지 않으며,
  동작 줄이기 설정에서는 일반 문서 흐름을 유지한다.
  같은 휴대폰 분기를 서비스 소개부터 마지막 CTA까지 적용한다. 세로 스와이프는 손을 뗀 뒤
  한 단계씩 이동하며, 주소 표시줄로 인한 높이 변경이나 지연된 스크롤 좌표 때문에 전환을 취소하지 않는다.

- 사용법 예시는 최신 서비스 화면의 구조와 공통 토큰을 따른다. 탐색은 실제 `DiscoveryGroupCard`와
  밑줄 검색·유형/상태/모집 필터를 재사용한다. 카드 크기는 데모 창에 맞춰 같은 너비로 배치하며
  별도 확대나 기울임을 추가하지 않는다. 프로필 열, 신청 상태 필터·모집 현황, 초대창 검색 버튼과
  하단 동작도 실제 화면을 기준으로 한다. 예시는 비대화형이며 재생 제어만 조작할 수 있다.
  예시 속 회원은 가입 대상 확장에 맞춰 크루 기수 대신 실제 목록의 회원 유형 표기(`부트캠프`, `현직자`)를 쓴다.
  활동 예시의 반응은 실제 피드와 같은 하트 이미지 pill 하나다. 다른 사람이 남긴 회색 하트 2개에서
  내 하트를 더하면 하트에 색이 채워지고 brand-soft 바탕, brand 테두리와 함께 3이 된다. 이모지 고르기 버튼은 없다.
  반응이 쌓인 뒤 시연창 위쪽에 알림함 카드가 내려와 서버의 실제 문구로 `좋아요`(모아 외 2명이 좋아요를 눌렀어요.)와
  `새 댓글` 두 알림을 실제 알림 목록 스타일로 보여 준다. 활동 예시는 12초 기준으로 재생하며, 모바일에서는 카드가 시연창 위쪽에 머문다.
  자유게시판 예시는 실제 제안 카드와 모인 조건의 스타일을 재사용한다. 함께하고 싶어요가 4에서 5로 바뀌며 켜진 상태가 되고,
  응답 5명 기준의 시간, 방식, 분위기 칩과 가능한 시간 막대가 차례로 채워진다. 드롭다운은 열린 모습을 문서 흐름 안에 정적으로 둔다.
  분야 배지에는 실제 카드처럼 `ProposalCategoryIcon`을 함께 둔다.
  채팅 예시는 실제 채팅 목록과 대화 스타일을 쓰되 목록과 대화를 위아래로 쌓는다. 안 읽은 메시지 2개가 있는 대화방을 열면
  배지가 사라지고 두 메시지가 나타나며, 입력란에 답장을 쓰고 전송하면 내 말풍선이 오른쪽에 붙는다.
  캘린더 예시는 실제 모임 캘린더의 휴대폰 화면처럼 2026년 10월 날짜 칸에 정기 모임과 개별 일정 점만 찍는다.
  오늘(22일)에서 24일로 선택이 옮겨 가며 아래 일정 목록이 그날의 정기 모임으로 바뀐다.
- 사용 예시의 본문은 `--text-body-lg`, 보조 정보는 `--text-body`를 기준으로 읽기 크기를 유지한다.
  낮은 데스크톱에서도 바깥 여백은 `--space-4`, 내용 사이 간격은 `--space-3`보다 줄이지 않는다.
  상태 전환 전후 배지는 같은 grid 칸에 겹치고, 생성 히어로의 모임 방식·일정·장소는
  레이블과 입력 밑줄을 같은 높이에 맞춘다. 긴 내용은 기존 슬라이드 안에서 이어 읽는다.
- 마지막 시작 안내는 제목 아래에 "부트캠프 수강생도, 현직자도 가입할 수 있어요." 한 줄을 두어,
  크루가 아니어도 가입할 수 있다는 것을 시작 버튼 앞에서 알린다.

- 의자 등장 완료 위치에서 다음 새 입력은 서비스 소개의 중앙 정착점으로 520ms 동안 이동한다.
  도입부 제어기는 소개에 도착할 때까지 입력을 소유하고 남은 관성을 흡수한 뒤 다음 입력을
  사용법 제어기에 넘긴다. 역방향 입력은 소개에서 완성된 의자 장면으로 돌아간다.
- 사용법 데모는 공통 창 프레임 안에 표시한다. 둥근 경계·옅은 그림자·세 점 장식과 기존 재생
  제어를 한 상단바에 배치해 높이를 절약하고, 장식은 접근성 트리에서 제외한다. 캡션은 창 밖에 둔다.
- `/land` 의자 이후 서비스 소개부터 모임 종류, 사용법 01~06, 기술 소개, 마지막 시작 안내까지 하나의 문서 스크롤과
  하나의 제스처 제어기를 공유한다. 서비스 소개, 모임 종류, 참여 소개, 검색, 상세, 내 모임, 제안 소개, 제안,
  운영 소개, 생성, 관리, 초대 소개, 초대, 채팅 소개, 채팅, 캘린더, 활동 소개, 활동,
  기술 소개, 배포 시간, 이미지 크기, 실제 배포, 시작 안내의 23개 정착점을
  순서대로 이동하며, 구간 경계에서도 같은 입력의 관성으로 다음 정착점을 건너뛰지 않는다.
- 기술 소개는 사용법 다음, 시작 안내 앞에 둔다. 소개 한 화면은 사용법 대분류 소개와 같은 구조이고,
  이어서 도표 세 장(단계별 배포 시간, 1 MB 칸 그림, 실제 배포 11번 막대)이 각각 정착점이 된다.
  도표는 흰 카드에 랜딩 그림자를 쓰며, 사용법 데모와 같은 `useLandingDemo`로 장이 활성일 때만 재생하고 벗어나면 첫 장면으로 돌아간다.
  배포 시간 도표는 처음 줄이 차오른 뒤 다음 줄이 앞 줄 모양에서 줄어들고, 줄어든 구간을 말풍선으로 설명한다.
  칸 그림은 한 칸을 1 MB로 두어 101칸과 한 칸 미만을 나란히 비교한다. 실제 배포 막대는 개선 PR 병합 시점을 점선으로 표시한다.
  수치는 백엔드 이미지 빌드 개선 리포트의 GitHub Actions 실측값을 그대로 쓰고, 출처는 마지막 도표 아래에 적는다.
  모바일에서 화면보다 긴 도표는 기존 슬라이드 정착점을 따라 나눠 읽는다.
- 01~06 대분류 소개는 헤더 아래 한 화면으로 정착한다. 다음 입력에서
  세부 사용법으로 이동하고 데모를 시작하며, 역방향에서도 소개를 같은 정착점으로 거친다.
- 여섯 사용법 구간은 동일한 흰색, 옅은 민트, 흰색 그라데이션과 설명 및 데모 컴포넌트를 공유한다.
  세부 사용법이 하나인 02, 04, 06에도 다른 사용법과 같은 번호와 아이콘 행, 제목 크기, 데모 너비와 여백을 적용한다.
  02 자유게시판 소개에는 `/board`로 가는 `자유게시판 둘러보기` 버튼(action `landing_board_explore`)을 둔다.
  05 모임 채팅과 일정은 채팅과 캘린더 두 세부 사용법을 둔다. 06 활동 피드 소개는 알림함과 휴대폰 푸시 알림을 한 문단으로 안내한다.
- 너비 64rem 이상에서는 창 높이와 관계없이 01, 03, 05의 설명을 왼쪽, 02, 04, 06의 설명을 오른쪽에 배치한다.
  데모는 반대편의 넓은 열을 사용한다. 모바일 읽기 순서는 설명 다음 데모를 유지한다.
- 기존 `landing-guide` 공간·색·타이포 토큰을 재사용한다. 독립 스크롤 영역이나 새 의존성을
  추가하지 않는다. 모션 감소 설정을 제외한 모든 화면에서 슬라이드 정착을 사용하며,
  짧은 소개와 안내도 헤더 아래 한 화면을 채운다. 데스크톱 사용법은 데모를 담을 최소 높이 48rem을 확보한다.
  높이 55rem 이하에서는 데모의 여백을 줄여 글자 크기를 유지하면서 화면 안에 담는다.
  높이 48rem 이하에서는 좌우 배치를 유지한 채 데모를 각 설명 안에 놓아,
  화면보다 긴 데모도 기존 슬라이드 정착점을 따라 하단 동작까지 읽을 수 있게 한다.
  데스크톱에서 화면보다 긴 내용은 같은 슬라이드 안의 정착점을 거쳐 끝까지 읽는다.
  모바일·태블릿은 위의 한 화면 시연창 규칙을 따르고, 모션 감소 설정에서는 일반 스크롤과 인라인 데모를 유지한다.
- 레이아웃 참고: [StyleGallery sticky-aside](https://github.com/changeroa/StyleGallery/blob/main/patterns/split-sidebar/sticky-aside.md)의
  문서 스크롤 소유권·명시적 grid 배치를 적용했다. [BEUI scroll-animation](https://beui.dev/r/scroll-animation/raw)의
  공통 스크롤 제어 원칙은 기존 wheel-gestures 제어기로 구현하며 Lenis/Motion은 추가하지 않는다.

### Sparring live integration

- 전송 입력은 흡입구 앞 3D 캐릭터의 말풍선이다. 전송한 말풍선과 캐릭터가 360ms 동안 캡슐로 포장되고 180ms 동안 흡입구로 이동한 뒤 호스를 통과한다. 캡슐 지름은 통에서 새로 발사되는 캡슐의 투영 지름과 같다. 입력값·편·답장 대상을 전송마다 고정하고 입력창은 즉시 비워 포커스를 유지한다. 모션 감소에서는 이동 없이 전달한다. 포장 연출은 기존 캐릭터와 캡슐 모델을 결합한 전용 동작이며 입력 대기를 만들지 않는다.
- Layout: 입구 앞 캐릭터와 안쪽 말풍선 -> 고정 외곽 앵커 + 접히는 본문; scroll owner: 부모 document; 전송 중 다음 말풍선은 계속 편집할 수 있다. 이전 전송 실패는 별도로 재시도하고 새 초안을 덮어쓰지 않는다.

#### 토론 만들기

- 우선순위: 주제 → 두 가지 생각 → 선택 대표사진과 필수 마감일. 모집 공고 작성의 3구간 진행 표시와 이전/다음 푸터를 재사용하는 구성으로 단계별 입력을 유지한다. 주 동작은 다음, 마지막 단계에서는 토론 만들기다.
- Layout: 사진 중심형 5번 시안을 따라 넓은 중앙 모달 -> 원형 3단계 진행 표시 / 단일 단계 본문 / 하단 액션 stack; scroll owner: 모달 하나다. 마지막 단계는 승인된 5번 이미지와 같은 756px 모달, 692:316 대표사진, 58px 높이의 둥근 주제·의견 입력칸을 사용한다. 민트·코랄 말풍선 아이콘과 연필 아이콘을 배치하고 마감일·퀵 선택·달력을 한 줄로 묶는다. 이전/생성 버튼은 같은 폭과 52px 높이다. 짧은 데스크톱에서는 사진을 줄이지 않고 모달 내부를 스크롤한다. 모바일에서는 사진 비율을 유지하고 의견 입력을 두 행으로 전환한다. 이전 단계로 돌아가도 모든 입력을 유지한다. 마감은 한국 날짜 기준 내일 기본값과 내일·3일·1주일·15일 빠른 선택을 제공한다.
- 대표사진은 기존 JPEG/PNG/WebP 5MB 업로드 검증과 저장 API를 사용한다. 미리보기·교체·제거·실패 재시도를 제공하며 업로드 중에는 생성할 수 없다. 기본 사진 영역에는 집콕·나들이 클레이 일러스트를 보여주고 사진 생략 시 업로드 슬롯으로 접는다. 생략한 토론의 목록 이미지는 기존 기본 캐릭터 규칙을 따른다.
- 생성 진입 버튼은 홈의 반투명 민트 버튼과 같은 pill·여백·진한 민트 글자를 사용한다. 두 대화 아이콘은 1.1초 주기로 쉬지 않고 오가며, 뒤 아이콘이 80ms 늦게 따라 파도처럼 움직인다. hover/focus 중에도 연속 재생하고 reduced-motion에서는 정지한다. 불필요한 단계 설명 카드와 중복 요약은 추가하지 않는다.

- 입력 장치는 각 편의 반투명 민트/코랄 몸체로 구분한다. 양 끝 호스 앞 캐릭터가 입력을 여는 버튼이다. 처음에는 말풍선을 접고 캐릭터 위에 작은 ‘눌러서 한마디’ 안내만 표시한다. 캐릭터를 누르면 해당 편으로 참여하고 말풍선만 중앙 방향으로 최대 460px까지 펼쳐진다. 같은 캐릭터를 다시 누르면 투표를 바꾸지 않고 말풍선을 접는다. 380ms 동안 외곽 접점은 고정하고 폭·본문을 함께 전환하며 글과 입력 포커스를 유지한다. 접힌 본문은 inert이며 움직임 줄이기에서는 즉시 전환한다. [Expandable tabs](https://beui.dev/r/expandable-tabs/raw)의 고정 앵커와 펼침/닫힘 연속성을 기존 CSS에 적용한다.
- Layout: 양 끝 고정 입력 장치 -> 좌우 justify-between + 안쪽으로 확장하는 drawer; 좁은 화면은 좌/우 정렬된 두 행; scroll owner: 부모 document; anti-patterns: 접혀도 가운데를 차지하는 절반 폭 입력 바, 노즐과 굵기가 다른 호스, 편 색상을 테두리로만 구분하기.
- 호스 지름과 입력구의 원형 단면은 3D 노즐 단면을 화면에 투영한 값으로 통일한다. 입력구는 통 노즐과 같은 원통 몸통과 두꺼운 둥근 입술 비례를 유지한다. 통 노즐·입력구·호스의 몸통은 투명하게 유지하고, 지름의 1.8배 간격으로 얇은 민트/코랄 링을 두른다. 링은 관 둘레에서 살짝 돌출되는 실제 3D 도넛형 메시이며, 폭은 관 지름의 8%다. 곡선도 경로 길이 기준으로 간격을 유지한다. 입술과 링만 불투명하며, 이동 캡슐은 투명한 관 안에서 계속 보인다. 외곽 호스는 바닥 앞, 통 노즐 직전 연결부는 뒤에 놓고 하나의 캡슐 이동 경로를 공유한다. 유리 벽은 무색·저불투명도로 캡슐이 선명하게 보이게 한다.

- 데스크톱에서 3D 영역의 위·아래 경계를 같은 64px만큼 내려 제목과 통 사이 간격을 확보한다. 렌더링 영역의 폭·높이와 카메라 배율은 유지하며 파이프·말풍선 앵커도 내려간 위치를 따른다.
- 착지 바닥이 영역 아래로 이어져도 잘리지 않도록 실제 렌더용 카메라의 아래쪽 범위만 iframe 하단까지 확장한다. 통의 배율·위치·앵커 투영은 기존 카메라를 유지하며, 데스크톱 하단 안내 문구는 바닥과 겹치지 않게 32px 간격을 더 둔다.
- 상세 화면은 데스크톱에서 제목을 좌우 편 이름과 같은 행의 중앙에 놓는다. 세 이름의 텍스트 중앙 높이를 맞추고 제목 폭은 양쪽 편 이름 안쪽 여백에 맞춰 제한해 긴 제목을 줄바꿈한다. 설명과 마감일은 제목 아래 작은 메타 줄로 묶는다. 모바일은 상단 제목 배치를 유지한다. 반복되는 기능 배지와 경로 표시는 없애고, 목록 이동 화살표와 연결 상태만 좌우 상단에 겹쳐 배치한다.
- 경기장은 화면 폭을 사용한다. 통 폭 18은 유지하고, 정면 직교 카메라 `(0, 5, 24)`로 통의 수직·수평선을 평행하게 보여준다. 약간의 높이를 두어 미끄럼틀과 착지 바닥의 깊이를 남긴다. 노즐 축은 화면에서 수평으로 맞추며 캡슐의 기존 하강 속도는 유지한다.
- 호스와 입력구는 동일 WebGL 렌더러·조명·환경맵에서 실제 원통/튜브 메시로 그린다. 통 노즐 뒤 연결부 → 경기장 → 외곽 호스 순서로 그려 연결부가 통을 덮지 않게 한다. DOM 입력구와 3D 투영 지름을 기준으로 경로를 재계산하고, 이동 캡슐도 같은 경로를 따라간다.
- 통은 첫 진입 시 투표 비율로 채운다. 이후 투표가 바뀌어도 기존 캡슐의 색은 유지하고, 보호 시간이 지난 오래된 캡슐부터 새 발사 캡슐로 교체한다. 전체 공급 템포를 유지하면서 양쪽 공급 빈도가 실제 투표 비율을 따르므로 통의 색은 한 교체 주기에 걸쳐 서서히 바뀐다. 투표 수·퍼센트는 즉시 갱신한다.

- 마감된 토론은 첨부 목록 시안처럼 흰색 가로 행으로 표시한다. 종료 배지, 130×64 대표사진, 제목과 집계, 오른쪽 의견별 결과 막대를 배치한다. 업로드 사진을 우선 쓰고 없으면 주제에 맞는 기본 클레이 썸네일을 사용한다. 좁은 화면은 결과를 제목 아래로 옮긴다. 투표가 없으면 비율 대신 안내 문구를 표시한다.

#### 지난 대화를 나누는 캐릭터 (2026-10-29)

- 받아치기 보존 기준은 `f621dd9a`다. 발사/충돌 파동/함께 구르기/개봉/두 캐릭터 VS는 그대로 사용한다.
- Layout: 미끄럼틀 아래 좌우 캐릭터 모임 -> 기존 stage overlay-stack; scroll owner: 부모 document; anti-patterns: 모든 과거 글을 답장처럼 연출, 전문을 읽기 위한 애니메이션 대기, 4개의 커다란 말풍선.
- 지난 메시지는 3.2초 간격으로 캡슐 하나씩 내려보낸다. 개봉 위치에서 작은 인물이 나와 자기 편으로 이동한다. 편당 2명, 총 4명을 유지하고 같은 편의 오래된 인물이 먼저 퇴장한다.
- 한 편의 최신 인물만 2줄 말풍선을 유지하고 말하기/듣기 자세를 번갈아 보여준다. 실제 답장 관계가 없는 의견을 서로의 답장으로 표시하지 않는다.
- 새 일반 채팅은 파이프 발사 + 4.5초 추적 말풍선으로 알린 뒤, 오래된 대화의 순번을 기다리지 않고 다음 미끄럼틀 리플레이로 한 번 내보낸다. 이후 기존 대화와 함께 순환한다. 새 받아치기는 충돌·VS 연출을 보존하고 끝난 뒤 같은 리플레이에 합류한다. 내 메시지와 다른 참여자의 실시간 메시지에 동일하게 적용한다.
- 지난 받아치기도 자동 재생에서는 한 인물로 등장한다. 선택 의견의 `받아치기 다시 보기`로 원문-답장 충돌 연출을 다시 볼 수 있다.
- `다음 대화 보기`는 자동 대기 간격을 건너뛴다. 기록을 선택하면 전문은 즉시 표시된다. 캐릭터 말풍선을 누르면 해당 의견을 받아치기 대상으로 선택하고 입력창에 초점을 둔다. 말풍선 포커스는 재생을 고정하고 Escape로 풀며, 모션 감소에서는 이동을 생략한다.
- 새 캐릭터 선택 action은 `sparring_history_character_select`, 받아치기 재생은 `sparring_clash_replay`다. 이름과 본문은 비공개 마스킹 영역 안에 둔다.

#### 미끄럼틀에서 나온 캐릭터 대치 (2026-10-29)

- 기준 화면은 `2243b57d`로 보존한다. 주 동작과 기존 크루/코치의 항의·팔짱 자세는 유지한다.
- 순서: 통에서 캡슐 배출 → 기존 3D 미끄럼틀을 굴러 내려옴 → 충돌로 뚜껑이 열림 → 작은 캐릭터가 그 개봉 위치에서 폴짝 나옴 → 양옆으로 나서서 서로 항의·반응한다.
- Layout: 스파링 상세 - 미끄럼틀과 등장 인물을 하나의 좌표계로 연결 -> overlay-stack (https://every-layout.dev/layouts/stack/); scroll owner: 부모 document; anti-patterns: 별도의 고정 캐릭터 무대, 캡슐 반구를 발판으로 사용, 입장 전에 이미 떠 있는 인물/말풍선.
- 캐릭터는 실제 개봉 이벤트 이후에만 보인다. 받아치기는 양쪽 파이프에서 원문과 답장 캡슐이 발사되어 충돌하는 기존 연출을 먼저 보여주고, 미끄럼틀에서 나온 두 캐릭터의 VS로 이어진다. 같은 편이어도 원래 색을 유지하며 없는 상대 의견을 만들지 않는다.
- 받아치기 캡슐은 충돌 후 맞붙어 비비면서 아래로 떨어진다. 충돌 중심에서 가까운 캡슐부터 약 0.85초 동안 바깥으로 충격이 번지며, 중심은 세게 튀고 멀어질수록 약해진다. 이후 중력으로 가라앉는다. 충돌 중에는 주변 파이프의 반복 발사를 쉬며, 두 캡슐은 미끄럼틀도 함께 구른 뒤 열린다.
- 닫힌 캡슐에는 작은 크루/코치를 담는다. 개봉하면 내부 이미지를 숨기고 같은 위치에서 새 대치 이미지로 이어진다. 껍데기는 옆에 남았다가 2.5초 후 치워지며 캐릭터를 받치지 않는다.
- 등장 0.95s: 작은 크기 0.18에서 확대, 위로 폴짝 56px, 양쪽 자리로 이동. 항의/반응 각 1.4s, 전진 18px, 반동 8px, 회전 최대 5deg. 다음 대화는 이전 말 읽기가 끝난 뒤 시작한다.
- 모션 감소는 미끄러짐/확대/반동을 생략하고 개봉 상태와 실제 의견을 바로 표시한다. 일시정지/화면 밖/말풍선 포커스 동안 출력 캡슐과 대치 시계가 멈춘다.
- 두 인물의 발 위치는 3D 착지 바닥을 투영한다. 위에서 내려다보는 시점으로 미끄럼틀의 길을 보여주고, 말풍선은 인물 머리 가까이에 표시한다. 말풍선을 누르면 해당 의견을 받아치기 대상으로 선택한다. 부모 문서가 스크롤을 소유한다.
- 주제, 투표 비율, 서버 저장, 받아치기, 기록, 민트/코랄 색과 고정 행동 식별자는 유지한다.

- 크루/코치: 기존 signup 이미지와 같은 검정 머리, 둥근 얼굴, 니트/배낭과 민트 명찰.
  미끄럼틀을 내려온 캡슐의 개봉 위치에서 등장해 마주 보는 2.5D 스프라이트를 배치한다.
- 민트 `--color-brand`, 코랄 `--color-cohort-2`, 본문/배경은 기존 ink/surface 토큰.
- 경기장은 화면 폭을 사용하며, 바깥 gutter는 16px(좁은 화면)/24px(넓은 화면)이다.
  통/파이프/작성창은 그 폭 안에서 연결된다. 기록은 960px 안에서 읽는다.
- Layout: 스파링 상세 - 경기장과 기록을 자연스럽게 이어 배치 -> stack + content-limiter
  (https://every-layout.dev/layouts/stack/); scroll owner: 부모 document;
  anti-patterns: 중첩 스크롤, 중복 서비스 헤더, 진영 선택 카드.
- 연결 상태는 연결 중/연결됨/재연결/오프라인으로 표시한다. 지난 대화는 리플레이로 구분한다.
- 사용자가 입력/기록을 읽을 때 자동 재생으로 선택한 글을 빼앗지 않는다.

### 스파링 편 선택과 관 연결 보완

주장과 노즐 위 투표 수치는 동일한 편 선택 동작이다. 두 버튼의 선택·저장 중 상태를
함께 표시하고, 실패 안내는 주장 근처와 입력창 아래에서 모두 확인할 수 있게 한다.
연결 관은 화면 안쪽으로 꺾여 입력구까지 이어진다. 상단의 긴 구간은 수평을 유지하고,
노즐 직전의 짧은 연결부만 3D 투영 각도·지름에 맞춘다.

### 캡슐에서 걸어나오는 지난 대화

- 넓은 상세 화면에서는 통의 높이를 유지하며 가로를 넓히고, 미끄럼틀 바닥을 좌우로 연장한다. 지난 대화의 실제 인물만 양옆으로 걸어 나와 말하며, 응원석이나 장식용 관중은 추가하지 않는다. 말풍선의 받아치기·포커스 동작은 유지한다.
- Layout: 토론 상세의 넓은 경기장 -> 기존 overlay-stack + content-limiter; scroll owner: 부모 document. 뒤로가기·토론명·마감일·입력창은 모임 상세의 container-shell과 page-gutter 기준으로 정렬한다. iframe에는 부모에서 측정한 콘텐츠 폭을 전달한다.
- 데스크톱에서는 통과 바닥 전체를 함께 맞추고, 모바일에서는 통의 폭에 맞춰 바닥이 화면 가장자리까지 이어지도록 한다. anti-patterns: 제목·입력창마다 다른 최대 폭, 입구에서 떨어진 편 이름, 데스크톱에서 화면 밖으로 잘린 바닥.

- 주 동작은 기존 한마디 보내기다. 읽기 순서는 주제/편 선택, 실제 인물이 나오는 캡슐, 인물의 말풍선이다.
- 미끄럼틀의 캡슐과 지난 대화 인물은 동일한 입체 크루/코치 모델을 사용한다. 크루의 곱슬 검정 머리·회색 니트·청바지·남색 배낭, 코치의 검정 옷·민트 명찰, 큰 둥근 얼굴·흰 신발을 유지한다.
- 캡슐 개봉 순간의 발 위치를 고정하고, 0.5초 동안 몸을 펴며 나온 다음 1.65초 동안 3번의 보행 주기로 자기 편까지 걷고 0.35초 동안 상대에게 돌아선다. 발은 트레이 위에 두고 팔/다리가 반대로 움직인다. 평면 이미지의 통째 확대/점프는 사용하지 않는다.
- 최대 4명과 두 말풍선, 기록 즉시 읽기, 다음 대화 보기, 일시정지, 말풍선 포커스 고정, 받아치기 충돌/VS 흐름은 유지한다. 모션 감소는 걷기와 몸짓을 생략한다.
- 추가 버튼이나 게임 수치는 만들지 않는다. 캐릭터의 입체 조명과 바닥 그림자는 기존 경기장 조명/재질을 공유한다. 큰 화면에서 표정이 보이도록 최종 모델 배율은 1.8로 둔다.
- 원본의 머리 실루엣·작은 미소·회색 맨투맨/청바지/배낭과 검정 옷/민트 명찰을 기준으로 둥근 입체 부품을 구성한다. 천과 머리의 미세 질감까지 동일하게 복제한 자산은 아니다.
- 입체 모델은 `crew-coach-atlas.png`의 얼굴 비율과 크루의 곱슬·백팩·회색 맨투맨·청바지, 코치의 옆가르마·검은 옷·민트 명찰을 기준으로 조형한다. 머리카락은 두피 위로 휘어지는 머릿결이며, 소매·바지는 끊어진 부품 대신 팔꿈치·무릎을 따라 변형되는 연속 곡면이다. 입체 피부와 옷에는 약한 무광 표면 질감을 사용한다. 얼굴은 둥근 턱과 옅은 볼 색, 머리는 겹쳐지는 곱슬과 옆가르마의 차이, 옷은 넉넉한 소매·바지 밑단·골지 옷깃·납작한 명찰 끈으로 구분한다. 머리 덩어리는 인물별 하나의 메시로 묶고, 소매와 바지의 겉면은 바깥을 향하도록 생성한다. 발 원점과 약 2.1의 높이는 포장·보행·말풍선 앵커의 기준이므로 유지한다. 관절별 변형은 인스턴스마다 독립적이며 그림자에도 적용한다.

## 토론 입력 말풍선과 캡슐 포장

- 양쪽 흡입구 앞에 기존 3D 캐릭터를 두고 선택한 편 캐릭터 옆 말풍선이 입력란으로 펼쳐진다. 말풍선 꼬리는 캐릭터를 향하며 색은 편 색을 옅게 사용한다. 별도의 편명 버튼은 두지 않고 접힌 편은 캐릭터와 짧은 클릭 안내만 남긴다. 버튼은 키보드로도 조작할 수 있고 열리면 바로 입력란에 포커스한다. 받아치기 선택도 내 말풍선을 열며 초안과 연속 전송 흐름을 유지한다.
- 전송한 내용과 캐릭터가 열린 캡슐에 들어가 닫힌 뒤 흡입구와 호스를 따라 이동한다. 이동 캡슐의 지름은 실제 새 캡슐의 투영 지름과 같으며 도착 시 통 안 발사로 이어진다.
- 입력 초안과 배송 중 메시지를 분리한다. 전송 직후 비워진 입력란의 포커스를 유지하고 다음 메시지를 바로 입력·전송할 수 있다. 실패한 메시지는 새 초안과 별도로 재시도하며 모션 감소에서는 즉시 전달한다.
