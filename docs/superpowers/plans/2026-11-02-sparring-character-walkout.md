# 토론 캐릭터 퇴장 Implementation Plan

**Goal:** 자리가 차면 기존 인물이 바깥으로 걸어나가는 동안 새 인물이 입장한다.
**Architecture:** 대화 자리 4개는 유지하고 퇴장용 렌더 슬롯 4개를 별도로 사용한다. 현재 자세에서 0.2초간 방향을 돌린 뒤 1.2초 동안 화면 밖까지 걷고 제거한다. 연속 입장은 빈 퇴장 슬롯이 생길 때까지 순서대로 보존한다.
**Tech Stack:** 기존 JavaScript, Three.js, Jest. 새 의존성 없음.
**Spec:** 이 채팅에서 사용자가 승인한 옆으로 걸어 나가는 연출.

## Constraints and review focus
- 기존 입장, 말풍선 선택, 포커스 고정, 일시정지, 화면 숨김, 모션 감소를 유지한다.
- 캐릭터는 이동 중 축소하지 않고 실제 화면 경계 밖에서 제거한다.
- 기존 다른 작업 공간의 변경을 건드리지 않는다.
- 좁은 화면, 세 가지 경기장 구도, 연속 입장, 중간 일시정지, 모션 감소 전환을 검증한다.
- 저장소 지침에 따라 직접 구현·검증한다. TDD 및 별도 검증 에이전트를 사용하지 않는다. 게시하지 않는다.

## Task 1: 겹치는 입퇴장
- [x] history-walk.js: 현재 프레임에서 방향 전환·고개 인사·보행을 이어가는 historyExitPose 추가.
- [x] history-conversation.js: 퇴장 슬롯과 대기 입장을 관리하고 포커스·정지·숨김·모션 감소에 함께 반응.
- [x] scene.js: 렌더 용량과 실제 화면 밖 퇴장 좌표 연결, 슬롯이 꽉 찬 동안 추가 배출 대기.
- [x] DESIGN.md에 퇴장 규칙 기록.
- [x] Jest: 자세 연속성, 좌우 보행, 겹치는 입퇴장, 연속 입력 보존, 제어 상태 검증.
- [x] lint, 관련 Jest, production build 통과. 로컬 브라우저에서 데스크톱·모바일·모션 감소 확인.

## Verification record
- 2026-11-02: 토론 관련 Jest 27개 suite / 251개 test 통과.
- ESLint --max-warnings=0 통과, git diff --check 통과.
- Production Webpack build 통과. 기존 asset/entrypoint size 경고 2개 유지.
- Chromium 실제 WebGL 렌더러에서 1440px compact/reference/original, 390px compact 확인. 퇴장 중 입장 인물이 함께 보이고 크기 유지, 화면 밖 퇴장, 모션 감소 정리, pageerror 없음 확인.
- 브라우저의 소프트웨어 렌더링이 느려 실제 장면 제어기의 시간을 고정해 중간/끝 프레임을 확인했다. 실제 기기에서의 실시간 부드러움은 측정하지 않았다.
- 테스트 fixture와 브라우저 계측은 /private/tmp/sparring-walkout-qa.cjs에만 두고 제품 코드에는 포함하지 않았다.
- 직접 최종 diff와 배출→개봉→입장/퇴장 호출 경로를 검토했다. 기존 작업 공간은 수정하지 않았다.
- 후속 테두리·발사 강조 수정과 함께 `fix/sparring-arena-rim-and-highlight` 별도 브랜치에서 관리한다. 배포하지 않았다.

## Changed files
- frontend/public/sparring-arena/src/history-walk.js
- frontend/public/sparring-arena/src/history-conversation.js
- frontend/public/sparring-arena/src/scene.js
- frontend/tests/app/history-walk.test.js
- frontend/tests/app/history-conversation.test.js
- frontend/tests/app/sparring-history-routing.test.js
- frontend/DESIGN.md
