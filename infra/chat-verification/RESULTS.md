# 채팅 구현 검증 결과

## 채팅 모달 전환 — 2026-10-25

`feat/group-chat-modal`에서 기존 채팅 구현을 유지하고 현재 페이지 위의 모달로 전환했다.

- 전체 프론트엔드: 95 suites / 1,000 tests 통과. ESLint 경고 0, production build 성공. 기존 번들·이미지 크기 경고 2개는 남아 있다.
- 실제 브라우저: 검색 조건·배경 DOM·스크롤·진입 버튼 포커스 보존, 한 단계 뒤로가기, 닫기·Esc·바깥 클릭, 중첩 모임 정보 창의 Esc 순서 확인.
- 모임 정보에서 상세로 이동할 때 스크롤 잠금 해제, 상세의 채팅 바로가기와 모바일 메뉴 진입, 기존 `/chat/:roomId` 링크 확인.
- 1440 / 768 / 360px 화면 크기와 키보드 이동 확인. 모달 영역 axe WCAG A/AA 위반 0.
- 두 서버에 접속한 브라우저 간 송수신, IME, 동일 키 재시도, 오프라인 복구, 이전 대화 스크롤, 종료 읽기 전용, 로그아웃 소켓 종료 확인.
- 재현: `node infra/chat-verification/modal-browser.mjs`, `node infra/chat-verification/browser.mjs`. 기존 로컬 검증 서버·DB를 사용하며 운영 배포 검증은 아니다.
- 로그: `/private/tmp/jarihana-chat-modal-{full-tests,lint,build,browser,messaging}.log`. 화면: `/private/tmp/jarihana-chat-realtime/evidence/chat-modal-{1440,768,360}.png`.

## 최초 전체 기능 검증

2026-10-25, `feat/group-chat-realtime`, 기준 develop `ecfe3c0832d4677d3ae4f6be0168555325947c63`.
로컬 Java 21 / Node 24 / PostgreSQL 17.11 / 실제 nginx 컨테이너에서 확인했다.

| 검증 | 결과 |
| --- | --- |
| 백엔드 전체 | 122 suites, 948 tests, 실패·오류·skip 0 |
| 프론트 전체 | 93 suites, 995 tests 통과, lint/typecheck 통과, production build 통과 |
| 배포 실패 주입 | 12개 테스트, readiness/reload/smoke/drain/state/stop 실패 경로와 롤백 통과 |
| 실제 두 서버 API·WS | 개인 전달, 비참여자 차단, 동시 멱등 20개, 동시 쓰기 100개, 읽음·종료·삭제 통과 |
| 브라우저 | 두 사용자, IME, 실패 재시도, 오프라인 복구, 이력 스크롤, 종료 읽기 전용, 로그아웃 소켓 종료 통과 |
| 반응형·접근성 | 1440/768/360px 수평 overflow 없음, 목록 너비 조절·underline 확인, 채팅 영역 axe WCAG A/AA 위반 0 |
| 실제 전환·복구 | LISTEN 강제 단절 후 RESYNC/REST, nginx 전환 100건, 기존 소켓 유지, 종료 코드 1001, 재시작 저장 이력 통과 |
| 배포 인증 smoke | 최종 로컬 서버에서 배포용 chat-smoke.py의 HTTP·STOMP CONNECT·구독 전송·이력 조회 통과 |
| 로컬 5분 부하 | 2서버/100소켓/10모임, 초당10건, 3,000건 저장·300,000회 수신, 누락·중복 없음 |

부하 시험은 300.55초, HTTP 저장 응답 완료→WS 수신 p95 12.35ms / p99 17.68ms였다.
WS가 HTTP 응답보다 먼저 도착한 값은 0ms로 처리한다. 이는 전체 요청 지연이나 운영 성능 보증이 아니다.
부하 시험 이후 읽음 응답 워터마크와 종료 순서를 수정했다. 최종 빌드에서는 해당 회귀 테스트,
전체 테스트, 두 서버 기능 시험, 실제 전환/재시작 시험, 브라우저 시험을 다시 통과했다.
부하 시험은 읽음 갱신을 발생시키지 않으며 재실행하지 않았다.

최종 백엔드 jar SHA256:
`5d4564bc3d26ecf3e3a2e46f2261661dee9a4bb3ebb34139f1619c873b3c0eda`.

프론트 build의 번들 크기 경고 2개는 남아 있다. 테스트나 lint 실패는 없다.
기존 운영 배포 workflow는 보존했으며 별도 수동 블루그린 workflow를 추가했다.
운영 배포, 실제 TLS/호스트 자원 검증과 최초 호스트 이전은 수행하지 않았다.
재현 명령과 fixture 범위는 [README](README.md), 운영 이전 조건은 [배포 안내](../BLUEGREEN.md)를 따른다.

## 로컬 직접 테스트 계정

`feat/group-chat-local-demo`에서 `demo-browser.mjs` 검증을 통과했다.
하루·모아가 실제 백엔드에 로그인하고 세 모임에 참여한 상태를 API로 확인했다.
격리된 두 브라우저에서 양방향 실시간 전송, 새로고침 후 이력 유지, 종료 모임 읽기 전용을 확인했다.
선택 화면 axe WCAG A/AA 위반과 페이지 오류는 0건이며 360px에서 수평 overflow가 없다.
계정 선택 화면은 데스크톱 캡처에서도 버튼, 안내 문구, 여백이 겹치지 않음을 확인했다.
비활성화 시 404, DB·호스트 제한, Origin·CSRF 및 고정 계정 검증도 통과했다.
seed 재실행은 모든 INSERT가 0건이며, 세 스크립트 구문 검사와 `git diff --check`가 통과했다.
이번 변경은 로컬 프록시와 fixture 범위이며 운영 배포는 수행하지 않았다.

## 채팅 시각 피드백 반영

`feat/group-chat-visual-polish`: 헤더 생성 버튼을 채팅 왼쪽으로 이동하고 채팅을 알림과 동일한
크기·색의 아이콘으로 변경했다. 목록은 공통 GroupImage의 대표사진, 유형별 hover 테두리,
종료 상태의 회색 면·사진·배지를 사용한다. 미선택 화면의 설명과 정상 상태 재조회 버튼을 제거했다.
방 이동은 native View Transition과 reduced-motion fallback을 사용한다.

- frontend lint, 전체 Jest 96 suites / 1,002 tests, production build 통과. 기존 번들 크기 경고 2개 유지.
- backend 채팅 테스트 15개와 bootJar 통과. 대표사진은 기존 이미지 접근 URL을 재사용하며 추가 DB 조회 없음.
- `visual-polish.mjs`: 헤더 순서·아이콘 색/크기 동일, 대표사진, 1456/1135/768/360px overflow 없음,
  axe WCAG A/AA 위반 0, 방 전환 후 초안 유지, 모바일 뒤로, reduced-motion, 페이지 오류 0 확인.
- Chromium에서 native 전환 호출을 관측하고 완료 후 캡처한 방 제목과 초안 상태를 확인했다.
  PNG와 전환 영상은 `/private/tmp/jarihana-chat-realtime/evidence/polish`에 저장했다.
- 새 jar로 8095를 갱신한 뒤 `demo-browser.mjs`에서 대표사진 URL 응답, 두 계정 실제 양방향 전송,
  새로고침 이력, 종료 모임 읽기 전용을 다시 통과했다. `git diff --check` 통과.

## 상세 배경 전환과 카드 배치 보정

`fix/chat-panel-layout`: 모임 상세의 `group-image` snapshot이 채팅 전환에 함께 잡히는 현상을
브라우저에서 재현했다. 채팅이 열려 있는 동안 상세 named snapshot을 제외하고, 닫으면 복원한다.
목록은 마이페이지와 같은 왼쪽 전체 높이 이미지 / 세로 중앙 본문 배치로 바꿨다.
카드 내용은 유지하며 긴 마지막 메시지는 줄임표로 제한하고 시간 표시를 보존한다.
모달과 내부 split-pane은 모든 화면에서 viewport 좌우 끝에 붙는다.

관련 Jest 5개, lint, production build, diff-check 통과. 기존 번들 크기 경고 2개 유지.
실제 상세 페이지 위에서 1456/1135/768/360px의 좌우 위치·이미지 높이·본문/시간 경계,
axe 위반 0, 전환/초안 유지/모바일 뒤로/동작 줄이기/닫기 후 상세 전환 복원을 확인했다.
캡처·영상은 동일한 evidence/polish 경로에 갱신했다.

## 입력창 정렬과 모임 상세 링크

`fix/chat-composer-header`: 보이는 입력 레이블과 모임 정보 버튼/Drawer를 제거했다.
대화 헤더는 목록과 같은 왼쪽 대표사진 / 중앙 본문 배치의 상세 링크다.
입력창은 한 줄에서 내용에 따라 최대 높이까지 늘어나며 전송 버튼과 밑줄 하단을 맞춘다.

관련 Jest 3 suites / 9 tests, lint, production build 통과. 기존 번들 크기 경고 2개 유지.
실제 Chromium에서 한 줄 높이 52px 이하, 세 줄 확장과 빈 입력 복원, 버튼/밑줄 하단 오차
2px 미만, 정보 버튼 제거, 상세 링크 이동 시 모달 닫힘을 확인했다.
1456/1135/768/360px의 목록 회귀와 axe 위반 0, PC/모바일 대화 캡처를 확인했다.

## 상세 채팅 진입점 통일

`fix/chat-entry-placement`: 마이페이지 카드의 중복 채팅 버튼을 제거하고,
상세 페이지는 구성원에게 탭 행 오른쪽 채팅 링크를 표시한다. 좁은 화면에서는 탭만 가로로
스크롤하고 채팅 링크는 유지한다. 공통 Tabs의 headerAction으로 탭 선택과 모달 열기를 분리했다.

관련 Jest 3 suites / 17 tests, lint, production build 통과. 기존 번들 크기 경고 2개 유지.
`entry-placement.mjs`로 같이해요/스터디 상세 각각 1456/1135/858/768/360px에서
탭 정렬, 가로 넘침 없음, 채팅 열기/닫기, axe 위반 0과 페이지 오류 0을 확인했다.
마이페이지 카드의 채팅 링크 제거를 확인했으며 캡처는
`/private/tmp/jarihana-chat-realtime/evidence/entry-placement`에 저장했다.

## 대화 본문 여백과 목록 선택 표시

`fix/chat-content-spacing`: 사용자가 지정한 대상은 모달 바깥이 아닌 chat-thread였다.
데스크톱 모달 바깥 여백을 복원하고 대화 본문의 최대 너비/가운데 정렬을 제거했다.
본문은 전체 폭과 좌우 space-3을 사용한다. 목록 선택은 회색 배경/왼쪽 짙은 선으로 표시하고,
호버 테두리 변경·상승·그림자를 제거했다. 키보드 포커스 표시는 유지한다.

lint, production build, diff-check 통과. 기존 번들 크기 경고 2개 유지.
실제 Chromium 네 너비/axe 위반 0, 본문 폭과 여백, 회색 선택선/호버 테두리 불변,
데스크톱 모달 여백/모바일 전체 너비, 초안 유지/상세 이동/전환을 검증했다.
evidence/polish/conversation.png를 직접 확인했다.

## 선택 상태와 종료 상태 구분

`fix/chat-selected-room`: 왼쪽 짙은 선을 제거했다. 선택된 활동 중 방은 흰 배경과 진한
1px 테두리를 사용한다. 종료된 방은 회색 배경·사진·종료 배지를 유지한다.
호버는 테두리를 바꾸지 않는다. lint/build/diff-check 통과, 기존 번들 크기 경고 2개 유지.
실제 Chromium 네 화면 너비에서 선택/종료 배경과 테두리 차이, 왼쪽 선 부재,
호버 테두리 불변과 axe 위반 0을 확인했다. conversation.png를 직접 확인했다.

## 메시지 읽기 폭 조정

`fix/chat-modal-reading-width`: 공통 페이지 최대 너비 대신 채팅 전용 최대 너비 72rem을
사용한다. 기본 목록 너비를 유지하면서 좌우 메시지 간 거리를 좁혔다. 모바일은 전체 화면이다.
lint/build/diff-check 통과, 기존 번들 크기 경고 2개 유지. 실제 Chromium 네 너비에서
모달 최대 너비/모바일 전체 폭, 카드/본문 배치, axe 위반 0을 검증하고 대화 캡처를 확인했다.

## 상세 사이드바 채팅 진입점

`fix/group-chat-sidebar-entry`: 채팅을 탭 행에서 오른쪽 운영자 카드 아래로 옮겼다.
사이드바가 숨겨지면 기존 모집 정보 액션 영역에 표시한다. 공통 Tabs의 불필요해진
headerAction을 제거했다. lint/build/diff-check, 관련 Jest 13개 통과.
테스트 명령이 기본 Node로 실행되어 발생한 ESM 오류는 프로젝트 Node 24로 재실행해 해결했다.
기존 번들 크기 경고 2개 유지. 실제 브라우저 같이해요/스터디 각각 다섯 화면 너비에서
배치/열기/닫기/가로 넘침/axe 위반 0을 확인했고 PC·모바일 캡처를 직접 확인했다.

## 사이트 공통 폰트와 채팅 액션 마감

`fix/chat-typography-interactions`: 채팅 전용 데스크톱 글자 확대를 제거하고 공통 토큰을
상속한다. 헤더 채팅/알림 간 간격은 space-1로 줄이고 클릭 영역을 유지했다.
채팅 버튼은 사이드바와 모바일 액션 영역의 마지막으로 이동했다.
목록 선택/호버는 shadow-card로 표시하고 기본 테두리 색은 유지한다.

lint/build/diff-check, 관련 Jest 19개 통과. 기존 번들 크기 경고 2개 유지.
실제 Chromium에서 공통 body 토큰 상속, 헤더 버튼 간격 5px 이하, 선택 그림자와
테두리 불변, 사이드바/모바일 마지막 순서, 5가지 화면 너비/axe 위반 0을 확인했다.
PC 대화·사이드바 캡처를 직접 확인했다.
