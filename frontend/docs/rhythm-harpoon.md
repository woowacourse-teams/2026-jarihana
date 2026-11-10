# 행성이의 리듬 작살

## 진입과 실행

- 헤더의 게임방 메뉴로 `/games` 게임판에 들어간 뒤 리듬게임 카드의 게임 시작으로
  `/games/rhythm-harpoon` 첫 화면에 진입한다. 로그인 없이 쓸 수 있다.
- 첫 화면은 게임방 목록(`/games`)과 같은 카드 모양(그림, 제목, 설명, 버튼)으로 싱글 플레이와 온라인 매칭 중 하나를 고른다. 싱글은 판 하나, 온라인은 판 두 개 그림이며 온라인 카드는 준비 중 비활성 버튼이다.
  온라인 매칭은 아직 비활성 버튼과 준비 중 표시만 둔다. 붙일 때는 오목 대기실처럼 방 목록, 방 만들기,
  초대 링크, 준비, 방장 시작으로 이어 가고 1:1이라 인원 수는 표시하지 않는다.
- `/games/rhythm-harpoon/single`은 싱글 플레이 화면이다. 위 줄에 혼자 연습과 공식 도전 카드를 크게 두고,
  아래 줄에 따라 하기 카드를 전체 너비로 둔다(휴대폰에서는 한 열). 카드는 밝은 색이며 혼자 연습은 파랑,
  공식 도전은 노랑, 따라 하기는 초록 계열로 구분한다. 소리 이름(빨강 쿵, 파랑 착, 노랑 치)과 패턴 악보는
  따라 하기 화면의 서랍에서 보여 주므로 여기에는 두지 않는다. 따라 하기를 마치거나 건너뛰기 전에는
  따라 하기 카드에 "처음이라면" 배지를 붙인다.
  공식 도전은 `/games/rhythm-harpoon/challenge`로 이동한다(아래 공식 도전 절).
- `/games/rhythm-harpoon/learn`은 따라 하기다. 쿵, 착, 치 세 단계마다 2마디 듣기와 4마디 해보기를 하고,
  놓친 세균과 헛공격이 전체의 30% 이하면 통과한다. 빠르기는 72, 96, 128 BPM(기본 96), 세균 이동 배속은
  ×1.0~×2.5에서 고르고, 패턴은 두 마디마다 좌우와 상하를 바꾸는 두 방향 트릴이다. 배경음은 녹음된 곡 없이
  Web Audio로 만든 드럼 비트이며 본편보다 1.5배 크게 섞는다. 단계 완료와 건너뛰기 여부는 이 브라우저의
  `haengseong-lesson-v1`에만 저장한다.
- `/games/rhythm-harpoon/practice`는 Pixel Circuit 원곡 연습 플레이다. 상단 링크는 싱글 플레이로 돌아가고,
  색 범례를 소리 이름과 함께 보여 주며 세균 위 소리 글자 표시를 켜고 끌 수 있다(기본 켬).
- 연습과 따라 하기의 판은 데스크톱에서 앱 헤더와 도구 막대를 뺀 화면 높이를 모두 쓴다. 연습 판 왼쪽에는 폭이 고정된
  난이도 열을 두어 난이도 설명 길이와 관계없이 판 위치가 바뀌지 않게 한다. 난이도 버튼은 Easy 초록, Medium 파랑,
  Hard 보라, Hardest 빨강으로 구분하고 라이프는 SVG 하트와 숫자 배지로 표시한다. 나머지 설정과 안내(따라 하기는
  단계, 설명, 악보, 빠르기와 배속)는 게임 영역 오른쪽에서 밀려 나오는 서랍에 둔다.
  서랍은 플레이가 시작되면 닫히고 멈추거나 끝나면 다시 열리며, 도구 막대의 설정 버튼으로 언제든 열고 닫는다.
  플레이 중 설정 버튼을 누르면 포커스가 판을 떠나므로 연습은 일시정지하고 따라 하기는 이번 시도를 멈춘다.
  따라 하기의 다음 소리 줄은 판 위에 겹쳐 플레이 중에도 보인다. 휴대폰에서는 서랍 대신 판 아래에 한 열로 쌓는다.
- 연습에서는 R(다시 하기 키)로 플레이 중, 일시정지 중, 게임 오버 뒤에 같은 설정으로 처음부터 다시 시작한다.
  눌러 둔 키의 반복 입력과 입력창에 포커스가 있을 때는 무시한다.
- 설정 서랍의 키 배치에서 왼쪽, 아래, 위, 오른쪽(기본 W, A, S, D)과 다시 하기(기본 R) 키를 바꾼다.
  방향키는 항상 쓸 수 있다. 글자, 숫자, 기호 키만 배정하고 Esc, Enter, Space, Tab, 수정 키와 방향키는 받지 않는다.
  다른 동작이 쓰던 키를 고르면 두 동작의 키를 맞바꾼다. 바꾸는 동안 누른 키는 게임 조작으로 쓰지 않는다.
  따라 하기도 같은 방향 키 배치를 쓴다.
- 다시 접속해도 유지되도록 이 브라우저의 localStorage에 저장한다. 연습 설정(난이도, 배속, 음량, FAST/SLOW,
  소리 글자)은 `haengseong-practice-settings-v1`, 키 배치는 `haengseong-keymap-v1`, 따라 하기의 빠르기와 배속은
  `haengseong-lesson-settings-v1`, 입력 지연 보정은 기존 키에 둔다. 읽을 때 값을 검증하고 맞지 않으면 기본값을 쓴다.
- 첫 화면의 게임방 링크는 오목 화면과 같은 `games_back`으로 게임판에 돌아간다.
- Esc는 바로 전 단계 화면으로 돌아간다(첫 화면은 게임방, 싱글 플레이는 첫 화면, 따라 하기와 연습은 싱글 플레이). 각 화면의 뒤로 가기 링크에 `aria-keyshortcuts="Escape"`를 붙였다.
  게임이 먼저 Esc를 쓰면 화면은 움직이지 않는다. 연습은 플레이 중 Esc가 일시정지, 일시정지 중 Esc가 다시 시작이고, 따라 하기는 진행 중 Esc가 멈춤이다.
  키 바꾸기 중의 취소, 열린 싱크 진단 창, 글자 입력 칸에서도 화면을 떠나지 않는다(`useEscapeBack.js`).
- `src/features/game/rhythm/RhythmHarpoonGame.jsx`가 연습 React 화면을 소유한다.
  독립 HTML과 iframe은 사용하지 않는다. 정적 경로에는 음악, 채보, 스프라이트만 둔다.
- `mount-practice-game.mjs`가 DOM 이벤트, 음악 시계, Canvas와 싱크 진단의 실행 수명을 관리한다.
  컴포넌트 정리 시 fetch와 이벤트를 취소하고, 애니메이션과 모든 AudioContext를 종료한다.
  자산 로딩이나 음악 활성화 중 이탈해도 이전 실행이 뒤늦게 시작되지 않는다.
- 키 입력은 게임 영역에 포커스가 있을 때만 처리한다. 바깥 메뉴와 폼의 입력을 가로채지 않는다.
  포커스가 바깥으로 이동하면 게임을 멈추고 바깥 포커스를 유지한다.
- 오류 안내와 다시 불러오기를 제공한다. 재로딩은 이전 런타임을 정리한 뒤 새로 시작한다.

## 게임과 서비스의 경계

연습과 공식 도전은 루프를 완주할 때 Hardest는 하트 5개, 나머지 난이도는 3개를 충전한다.
최대 라이프를 넘지 않고 완주당 한 번만 지급하며, 게임오버 후에는 충전하지 않는다.
곡 배속은 Easy와 Medium은 2루프, Hard는 3루프, Hardest는 6루프부터 매 루프 +0.05씩 오른다.
Easy와 Medium은 첫 루프를 버티기 쉬워서 일찍 빨라지게 했고, Hardest는 기본 패턴이 어려워 기존 시점을 유지한다.
공식 도전은 서버도 같은 규칙으로 재계산하며 규칙 판본은 `rhythm-harpoon-ranked-4`이다.

| 모듈 | 책임 |
| --- | --- |
| `engine.mjs` | 채보 단순화, 랜덤 배치, 판정과 클라이언트 표시용 점수 |
| `render.mjs`, `audio.mjs` | Canvas와 실제 오디오 출력 시계 |
| `calibration.mjs`, `sync-ui.mjs` | 기기 입력 지연 보정과 진단 |
| `practice-session.mjs` | 로컬 연습 세션과 미검증 결과 구분 |
| `mount-practice-game.mjs` | React 영역에서 모듈 연결과 실행 수명 관리 |
| `RhythmHarpoonGame.jsx`, `pages/games/RhythmHarpoonPage.jsx` | 연습 화면과 싱글 플레이 복귀 |
| `lesson.mjs` | 따라 하기 단계, 트릴 채보, 통과 판정, 진행 저장, 드럼 배치 |
| `lesson-audio.mjs` | 따라 하기 드럼 비트 렌더링 |
| `mount-lesson-game.mjs` | 따라 하기의 판, 입력, 음악 시계 실행 수명 |
| `notation.mjs`, `RhythmScore.jsx` | 한 마디 리듬 악보 배치와 그리기 |
| `RhythmBoardArt.jsx` | 첫 화면 카드의 판 그림 |
| `pages/games/RhythmHarpoonEntryPage.jsx`, `RhythmHarpoonSinglePage.jsx`, `RhythmHarpoonLessonPage.jsx` | 첫 화면, 싱글 플레이, 따라 하기 |
| `ranked-run.mjs` | 공식 도전의 시드 랜덤, 서버와 같은 순서의 입력 처리, 입력 묶음과 순차 전송 |
| `mount-ranked-game.mjs`, `RhythmRankedBoard.jsx` | 공식 도전 판의 실행 수명, 묶음 전송, 이탈 시 무효 |
| `rankedApi.js`, `useRhythmRanking.js`, `RhythmRanking.jsx` | 공식 도전 API, 난이도별 랭킹 |
| `pages/games/RhythmHarpoonChallengePage.jsx` | 옵션, 확인, 도전, 결과와 랭킹 단계 |

따라 하기는 본편 엔진과 렌더러, 음악 시계를 그대로 쓴다. 엔진에 미리 만든 채보(`events`)를 넘겨
난이도별 단순화를 건너뛰고, 다음 루프의 세균이 보이기 전에 끝나도록 채보 끝에 빈 두 마디를 둔다.
들어보기는 엔진의 autoplay로 두 마디를 보여 주는 시연이며 통과나 점수로 인정하지 않는다.
따라 하기 결과도 서버로 보내지 않는다.

서비스 세션 팩터리는 난이도와 이동 배속만 받는다. 매번 1마디, 1루프부터 수동으로 시작한다.
오토 감상, 구간 이동, 시작 루프, 임의 랜덤 함수와 클라이언트의 랭킹 자격 지정은 서비스 설정이 아니다.
엔진의 해당 옵션은 회귀 테스트와 개발용 시뮬레이션에서 사용할 수 있다.
기본 난이도는 Easy다. 난이도와 이동 배속 변경은 처음부터 다시 시작한다.

연습 세션과 결과는 모두 `mode: practice`, `verification: unverified`다.
화면도 연습 점수와 기록 미저장 여부를 표시한다. 연습 점수는 서버로 보내지 않는다.

## 기록의 신뢰 경계

이 분리는 유지보수와 잘못된 연결을 막기 위한 구조이며 보안 검증이 아니다.
브라우저 코드, 점수, 입력 시각과 `verification` 같은 클라이언트 필드는 사용자가 바꿀 수 있다.
클라이언트가 계산한 점수를 그대로 회원 기록에 저장하는 API는 두지 않는다.
화면에서 옵션을 없앤 것도 랭킹의 서버 검증을 대신하지 않는다.

공식 도전은 연습 세션과 별도로 구현했다.

1. 서버가 인증된 회원과 도전을 연결하고 채보 및 규칙 판본, 난이도와 랜덤 시드를 정한다.
2. 클라이언트는 순번 있는 입력 묶음과 진행 시각을 보낸다. 점수와 회원 ID는 보내지 않는다.
3. 서버는 수신 시각과 진행 시각, 입력 순서, 소유권과 중복 순번을 검사하고 점수와 생존 상태를 다시 계산한다.
4. 서버 계산에서 라이프를 모두 잃은 판만 기록한다. 난이도와 규칙 판본마다 회원별 최고 기록으로 랭킹을 만든다.
5. 연습, 따라 하기, 오토 감상과 무효가 된 판은 기록하지 않는다.

실시간 진행 검사는 미리 만든 입력을 한꺼번에 내는 것을 막지만 입력 자체의 조작이나
자동 입력 봇을 막지는 못한다. 난독화나 숨긴 버튼을 보안 근거로 삼지 않는다.
서버 쪽 규칙은 [백엔드 공식 도전 모델](../../backend/docs/context/domain/model/rhythm-harpoon.md)과
[API 문서](../../backend/docs/context/api/endpoints/rhythm-harpoon.md)에 있다.

## 공식 도전

- `/games/rhythm-harpoon/challenge`는 회원 전용이다. 옵션 설정, 확인, 도전, 결과의 네 단계를 한 화면에서 진행하고
  도구 막대에 지금 단계를 표시한다.
- 옵션 설정에서 난이도, 세균 이동 배속과 입력 지연 보정을 고른다. 처음 값은 연습에서 마지막으로 쓴 난이도, 배속과 저장된 보정값이다.
  보정은 판정 시각을 옮기므로 슬라이더(±150ms)와 연습과 같은 싱크 진단 창(`SyncDialog.jsx`)으로 이 화면에서 바로 맞추며,
  바꾼 값은 연습과 같은 `haengseong-input-offset-v1`에 저장한다. 키 배치, 음량, FAST/SLOW와 소리 글자 표시는 연습에서 저장한 값을 쓴다.
- 옵션 카드 오른쪽에는 지금 고른 난이도의 랭킹을 옵션보다 좁은 열로 둔다. 난이도를 누르면 그 난이도의 랭킹으로 바뀐다.
  랭킹 카드는 옵션 카드 높이에 맞추고 목록만 안에서 스크롤하며, 좁은 화면에서는 옵션 아래에 쌓는다.
- 확인 단계는 설정을 요약하고 멈출 수 없음, 이탈 시 무효, 서버 재계산을 알린다. 도전 시작을 누르면 서버에 도전을 만들어 시드를 받는다.
- 판은 연습과 같은 엔진, 렌더러, 음악 시계를 쓴다. 시작 버튼을 누르면 서버에 시작을 알린 뒤 음악을 튼다.
  일시정지, 설정 서랍과 R(다시 하기)은 없다. Esc, 창 이탈(blur), 탭 전환, 판 밖으로 포커스 이동, 페이지 이탈,
  0.75초 넘게 화면이 멈춘 경우는 이탈로 보고 서버에 알린 뒤 무효 화면을 보여 준다.
- 입력은 입력 지연 보정을 적용한 시각으로 판정하며 앞선 입력이나 이미 보낸 묶음의 진행 시각보다 이른 시각은 그 시각으로 맞춘다.
  서버는 이미 계산한 진행 시각보다 이른 입력을 400으로 거절한다.
  서버와 같은 순서가 되도록 입력마다 그 시각까지 진행한 뒤 판정한다(`applyRankedInput`). 그림은 음악 시각에 맞춘다.
- 2초마다 그동안의 입력을 순번과 진행 시각을 붙여 보낸다. 묶음은 하나씩 순서대로 보내고, 네트워크 오류는 같은 순번으로
  1초 간격 최대 8번 다시 보낸다. 서버가 거절하거나 다시 보내기가 모두 실패하면 판을 멈추고 기록되지 않았다고 알린다.
- 화면에서 라이프를 모두 잃으면 마지막 묶음에 `finished`를 붙여 보내고, 서버가 돌려준 기록을 결과로 쓴다.
  화면 점수는 표시용이며 결과 화면의 점수는 서버가 다시 계산한 값이다.
- 결과 단계는 서버 점수와 판정 수, 최고 콤보, 도달 루프(왼쪽)와 같은 난이도의 랭킹(오른쪽)을 나란히 둔다.
  랭킹은 내 순위와 최고 점수를 먼저 보여 주고 목록에서 내 줄을 표시하며, 1, 2, 3위 줄은 금, 은, 동 색 카드로 구분한다. 700px 이하에서는 결과 아래에 랭킹을 쌓는다.
- Esc는 판 밖에서 한 단계 뒤로 간다. 확인에서는 옵션으로, 시작 전의 판에서는 만든 도전을 버리고 확인으로,
  옵션, 결과와 무효 화면에서는 싱글 플레이로 돌아간다.

### 서버 재계산과 대조

서버는 `engine.mjs`의 판정을 Java로 옮긴 엔진으로 점수를 다시 계산한다. 난이도별 단순화 채보와 계단 회전표는
`node scripts/export-rhythm-ranked-fixtures.mjs`가 `backend/src/main/resources/rhythm-harpoon/ranked-chart.json`으로 만든다.
같은 스크립트가 여러 플레이 유형(정확한 플레이, 4키 연타, 빨라진 루프, 자주 놓치는 플레이)의 입력 묶음과 기대 결과를
`backend/src/test/resources/rhythm-harpoon/golden-replays.json`으로 만든다.
`tests/games/rhythm-harpoon/ranked-run.test.mjs`는 두 파일이 현재 엔진으로 다시 만든 결과와 같은지,
백엔드 `RhythmEngineGoldenReplayTest`는 Java 엔진이 대조 입력에서 같은 결과를 내는지 확인한다.
채보, 판정, 라이프를 바꾸면 스크립트를 다시 실행하고 `RANKED_RULES_VERSION`을 올린다. 판본이 바뀌면 랭킹은 새로 시작한다.

## 유지한 게임 동작

이관 기준 원본은 Sites 버전 23의 커밋 `2c8f38377dc1ae588091099c7738c605166d1adf`다.
128 BPM, 90초 루프와 기존 스프라이트를 유지한다. 음악과 채보의 추가 편곡은 아래 2연타 구간을 따른다.
Easy 10, Medium 8, Hard 8, Hardest 10 라이프, 화살표와 WASD 및 터치,
이동 배속 1.0~3.0(0.25 단위), 판정, 헛공격, 패스트/슬로우와 싱크 진단을 유지한다. 헛공격 감점은 원본의 -1,000점에서 -300점으로 줄였다(아래 조기 미스와 콤보).
계단 진행 방향과 반전 예고, 루프 랜덤과 템포 상승도 유지한다.
기존 Sites 출처의 보정값은 자동 이전되지 않으므로 자리하나에서 다시 맞춘다.

## 2연타 구간 편곡

90초 루프와 29마디의 짧은 2연타 소개를 유지한다. 본격적인 2연타 난사는 트릴과 회오리 뒤로 옮긴다.

| 재생 위치 | 패턴 |
| --- | --- |
| 37~38마디 | 16분 교대 트릴 |
| 39~40마디 | 두 번째 회오리, 반전 예고 유지 |
| 41~42마디 | 기존 39~40마디의 완충 패턴 |
| 43~44마디 | 사방으로 이동하는 16분 2연타 난사 |

다른 난이도도 같은 음악 구간을 함께 이동한다. 2연타 구간의 Easy는 4분 단노트 4개,
Medium은 8분 교대 8개, Hard는 8분 진행과 마지막 박의 짧은 트릴 10개,
Hardest는 16분 2연타 16개를 한 마디에 배치한다.
회오리 직후 단노트와 난사 전후의 방향을 조정해 경계에서 의도하지 않은 연타가 생기지 않게 한다.

채보의 `events`와 `sections`는 작곡 원본의 마디 좌표를 보존한다. `playbackBarOrder`는 재생 마디마다
원본의 어느 마디를 사용할지 지정하는 48개 정수의 순열이다. `simplifyChart`가 난이도별 단순화 후
노트의 마디와 샘플 위치를 변환하고, `playbackSections`가 회오리 신호와 랜덤 회전에 사용할 구간을 변환한다.
따라서 원본 JSON의 마디 번호를 곧바로 화면이나 서버 검증에 사용하지 않는다.
원본 좌표의 회귀 검증은 `tests/games/rhythm-harpoon/fixtures/pre-climax-chart.json`,
현재 재생 순서는 `climax-order.test.mjs`에서 별도로 검사한다.

음악도 같은 순열로 마디 블록을 옮기며 새 접합부에 3ms 페이드를 적용한다. 39~48마디에는 낮은
16분 아르페지오를 계속 깐다. 새 화성 진행은 G, D, Em, B, G, D, Em, C, G, B다.
43~44마디는 39~40마디 회오리 프레이즈를 같은 선율과 반주 흐름으로 재사용한다. 난사 구간이 커지지 않도록 기존 음량에 맞추며 채보는 유지한다.
기존 반주에는 필터와 덕킹을 추가하지 않는다. 채보 버전은 `climax-order-4`, 음원 버전은 `spiral-melody-5`다.

`scripts/arrange-double-taps.py`가 원본 48kHz 스테레오 16비트 WAV와 현재 채보로 음악을 생성한다.
NumPy와 libvorbis를 지원하는 ffmpeg가 필요하며 프론트엔드 빌드 의존성은 아니다.
원본은 `pixel-circuit-128-axis-trill.wav`이고 SHA-256은 아래 측정 보고서에 기록한다.
이미 편곡한 출력을 다시 입력하지 않는다.

```text
python scripts/arrange-double-taps.py --input-wav <원본 WAV 절대 경로> --chart public/game-assets/rhythm-harpoon/assets/chart.json --output-wav <출력 WAV 절대 경로> --output-ogg public/game-assets/rhythm-harpoon/assets/pixel-circuit.ogg --report docs/rhythm-double-tap-mix.json
```

샘플 위치, 음량, 피크, 변경하지 않은 PCM 구간과 배포 음원 해시는
[편곡 측정 보고서](rhythm-double-tap-mix.json)에서 확인한다.

## Hardest 13~16마디

`playbackOverrides.hardest`는 난이도 단순화와 재생 순서 변환을 마친 뒤 지정한 재생 마디만 교체한다.
각 마디의 `column`은 0부터 시작하는 16분음표 위치다. 다른 난이도와 음원은 유지한다.

- 13~14마디: 왼쪽 8분 연타에 오른쪽, 아래, 위 동시타를 더한 24노트.
- 15~16마디: 8분 교대에서 엇박과 끝의 16분 교대로 이어지는 17노트.

이 수정의 채보 버전은 `bars-13-16-1`이며 기본 편곡 버전과 음원 버전은 위와 같다.

13~14마디는 왼쪽 8분 연타에 동시타가 겹쳐 40루프(2.75배속)에서 4키를 초당 2번 누르기만 해도 점수가 +1100이 됐다.
채보는 그대로 두고 빈 입력을 무시하는 범위를 150ms 초과~200ms 미만에서 150ms 초과~180ms 미만으로 줄였다.
이 값만 바꿨을 때 `scoring.test.mjs`의 1280개 연타 경우 중 가장 높은 점수는 -8100이었다.

## 조기 미스와 콤보

점수가 마이너스여도 판정이 너그러우면 뭉개서 친 입력도 콤보와 라이프가 이어졌다.
16분 트릴을 8분마다 두 키 동시에 누르면 늦은 쪽 노트가 Uh oh(+100)로 잡혀 벌점과 콤보 끊김이 없었고,
4키 연타도 헛공격 벌점만 받고 풀콤보를 유지했다. 판정 폭을 ±21ms 수준으로 줄인 시뮬레이션에서도 같은 결과였다.

- 일찍 누른 입력은 120ms, 늦게 누른 입력은 100ms까지 세균을 잡는다(그 바깥쪽 ENOUGH, +300).
  그보다 벗어나 일찍 누른 입력은 200ms, 늦게 누른 입력은 150ms까지 Uh oh 판정으로 세균을 놓친다.
  그보다 더 벗어난 입력은 헛공격이다. 너무 일찍 누른 입력을 헛공격 대신 놓침으로 다뤄 성급한 입력의 벌점을 줄였다.
  일찍 누른 쪽을 너그럽게 해서 128 BPM의 16분 트릴(약 117ms 간격)을 앞 노트에 맞춰 두 키로 누르면
  뒤 노트가 ENOUGH로 잡힌다. 뒤 노트에 맞춰 누르면 앞 노트는 늦게 누른 셈이라 Uh oh로 놓친다.
  점수는 0점이고 콤보가 바로 끊기며, 놓친 세균은 판정선을 지나 돌진해 다른 미스처럼 그 묶음에서 라이프 1개를 깎는다.
  놓친 세균은 다시 잡을 수 없고 미스 수에 두 번 세지 않는다.
- 헛공격은 300점을 깎고 콤보와 라이프는 그대로 둔다. 판정 범위 바로 바깥을 따로 무시하던 30ms 구간은 없앴다.
  헛공격을 아예 없애면 빈 레인 입력에 비용이 없어, 4키를 8분음표 박자에 맞춰 계속 누르기만 해도 Easy와 Medium 첫 루프가
  완벽한 플레이와 같은 점수(95,000점, 211,000점)를 라이프 손실 없이 얻었다. 빈 입력 뒤 레인을 잠그는 방식은 템포가 오르면
  노트 간격(Hardest 40루프에서 같은 레인 43ms)이 잠금 시간보다 짧아져 정상 연타까지 막으므로 쓰지 않았다.
  헛공격은 그 레인의 판정 범위 안에 노트가 없을 때만 생기므로 템포가 오를수록 정상 연타에서는 오히려 덜 생긴다.
- `scoring.test.mjs`의 1280개 연타 경우에서 라이프가 다할 때까지의 점수는 완벽한 플레이의 5% 이하다.
  실제 라이프로 돌린 시뮬레이션의 최고는 1.5%(Hardest, 4분음표 연타, 도중 사망)였다. 이전(-1,000점, 콤보 끊김)의 최고 점수는 -900이었다.
  입력 오차가 표준편차 25ms인 사람을 가정한 시뮬레이션은 Hard와 Hardest에서 Uh oh 없이 풀콤보를 유지했다.

## 클레이 스프라이트

방향 패널은 Canvas의 둥근 면과 부드러운 음영으로 클레이 두께를 표현한다.
캐릭터 쪽에서 패널 길이의 약 3분의 1 안에 밝은 크림색으로 바뀌며, 나머지는 밝게 유지한다.
판정선은 그림자 없이 진한 청록색 7px 선과 흰색 14px 테두리로 마지막에 그리며,
판정 위치는 중심에서 242px인 기존 좌표와 같다. 연습과 따라 하기가 같은 렌더러를 쓴다.

`assets/sprites-clay-v1.png`는 승인한 클레이 시안의 배경을 제거한 1254×1254 RGBA 이미지다.
`sprite-atlas.mjs`의 URL, 시트 크기와 프레임 좌표를 연습, 따라 하기, 메뉴의 판 그림과 결과 화면이 공유한다.
행성이 표정 4개, 세균의 기본/포획 상태 4색, 작살, 포획 효과와 하트를 기존 인덱스 순서로 유지한다.
초록색은 기타 박자를 위한 예비 프레임이며 현재 채보에 새 노트를 추가하지 않는다.
원본 `sprites.png`는 보존한다.

내장 `image_gen`으로 승인 시안에 아래 프롬프트를 적용했다.

```text
Use case: background-extraction.
Edit this approved clay sprite sheet into a production game texture atlas.
Preserve the 15 approved clay sculptures, expressions, material, colors and scale. Preserve the exact 4-column by 4-row arrangement and the empty bottom-right cell. Do not redesign or add objects.

Remove the ivory studio background AND ALL shadows beneath the objects. Deliver truly transparent alpha outside the actual solid sculptures, including every gap between sprites. No ivory patches, no color spill, no colored halos, no dust, flecks or remaining background noise. Silhouettes must have clean anti-aliased cutout edges. The result must composite cleanly on BOTH a pale mint game board and a very dark scoreboard.
Keep all four white mascot faces complete, including the separate yellow emphasis marks of the hurt expression, all eight colored germ shapes, arrow, impact star and heart. No text, labels, grids, frames or new elements.
This is precise background removal of the existing approved image, not a new style variation.
```

## 검증

`npm run lint`, 관련 Jest 테스트, `npm run build`를 사용한다.
Jest의 `tests/games/rhythm-runtime.test.js`가 `tests/games/rhythm-harpoon/`의 Node 회귀 테스트를 실행한다.
`lesson.test.mjs`는 트릴 채보, 빈 마디, 통과 판정, 진행 저장, 드럼 배치와 악보 배치를 확인한다.
페이지 테스트는 `.mjs` 런타임 모듈을 함께 읽으므로 Jest가 `.mjs`도 babel로 변환한다.
엔진 테스트는 실제 서비스가 번들링하는 소스 모듈을 읽는다.
브라우저에서는 진입, 플레이, 입력과 포커스, 난이도와 배속, 싱크 진단, 재로딩과 게임방 복귀를 확인한다.
