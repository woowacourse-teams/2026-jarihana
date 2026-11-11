# 미니게임

빼빼로데이 반 나누기 이벤트("공평하게 반띵") API다. 공통 접두사는 `/api`, JSON 응답은 공통 `ApiResponse` 봉투를 따른다.

| 메서드 | 경로 | 권한 | 결과 |
| --- | --- | --- | --- |
| GET | `/events/pepero-day` | PUBLIC | 진행 상태, 기간, 게임방으로 옮기는 시각, 서버 시각 |
| POST | `/events/pepero-day/runs` | MEMBER + CSRF | 201 판 ID와 1번 막대 |
| POST | `/events/pepero-day/runs/{runId}/rounds` | MEMBER + CSRF + 본인 판 | 200 다음 막대와 남은 제한 시간 |
| POST | `/events/pepero-day/runs/{runId}/cuts` | MEMBER + CSRF + 본인 판 | 200 판정 결과 |
| GET | `/events/pepero-day/rankings` | PUBLIC (로그인하면 내 순위 포함) | 상위 50명과 내 순위 |
| POST | `/games/stick-halving/runs` | MEMBER + CSRF | 201 게임방 판 ID와 1번 막대 (횟수 제한 없음) |
| POST | `/games/stick-halving/runs/{runId}/rounds` | MEMBER + CSRF + 본인 게임방 판 | 200 다음 막대와 남은 제한 시간 |
| POST | `/games/stick-halving/runs/{runId}/cuts` | MEMBER + CSRF + 본인 게임방 판 | 200 판정 결과 |
| GET | `/games/stick-halving/rankings` | PUBLIC (로그인하면 내 순위 포함) | 게임방 상위 50명과 내 순위 |

## 기간과 진행 상태

- `status`는 `UPCOMING`, `OPEN`, `CLOSED` 중 하나다. 서버 `Clock`(Asia/Seoul) 기준으로 `opensAt <= now < closesAt`이면 `OPEN`이다.
- 운영 기간은 `jarihana.minigame.pepero-day.opens-at`, `closes-at`으로 정하며 기본값은 2026-11-11T00:00:00부터 2026-11-12T10:00:00까지다.
- 이벤트가 끝난 뒤 `game-room-opens-at`(기본 2026-11-12T13:00:00)부터 `gameRoomOpen`이 `true`가 되고, 게임방(`/games`)에 반띵 카드가 나타나 연습으로 계속 할 수 있다. 이 시각은 `closes-at`보다 이를 수 없다. 이벤트 상태는 그 뒤에도 `CLOSED`이고, 순위 조회는 이벤트 최종 순위로 남는다.
- local과 dev 프로필은 `always-open: true`라 기간과 관계없이 `OPEN`이고, `gameRoomOpen`도 `true`다.
- `serverTime`은 초 단위로 자른 서버 시각이다. 화면은 기기 시계 대신 이 값과의 차이로 남은 시간을 센다.
- 순위 도전 횟수에는 제한이 없다. 이벤트 기간에도, 게임방으로 옮긴 뒤에도 회원마다 가장 좋은 끝난 판 하나만 순위에 쓴다.

```json
{
  "status": "OPEN",
  "opensAt": "2026-11-11T00:00:00",
  "closesAt": "2026-11-12T10:00:00",
  "gameRoomOpensAt": "2026-11-12T13:00:00",
  "gameRoomOpen": false,
  "serverTime": "2026-11-11T12:30:00",
}
```

## 막대

막대는 길이 12cm를 0.5cm 칸 24개로 나눈다. `cells[i]`는 왼쪽 끝부터 i번째 칸의 초코 두께이며 `NONE`, `THIN`, `THICK` 중 하나다.
칸 무게는 과자를 포함해 각각 100mg, 150mg, 200mg이다. `almonds[].cell`은 아몬드가 붙은 칸, `size`는 `SMALL`(50mg) 또는 `LARGE`(100mg)이며 무게는 그 칸의 가운데 한 점에 있다고 본다.
`startPosition`은 칼 시작 위치(cm), `totalMilligrams`는 막대 전체 무게다. 정답 위치는 자르기 전에 내려주지 않는다.

```json
{
  "lengthCm": 12.0,
  "cells": ["NONE", "NONE", "THICK"],
  "almonds": [{"cell": 2, "size": "LARGE"}],
  "startPosition": 5.4,
  "totalMilligrams": 3350
}
```

(예시의 `cells`는 줄였다. 실제로는 항상 24개다.)

## 순위 도전 시작

- 이벤트가 `OPEN`이 아니면 `MINIGAME_EVENT_NOT_OPEN`(409)이다.
- 회원은 횟수 제한 없이 몇 번이든 시작할 수 있다.
- 응답은 `{runId, round: 1, timeLimitSeconds: 30, remainingMillis, stick}`이다. 1번 막대는 시작할 때 내려주고, 제한 시간도 이때부터 잰다.
- `remainingMillis`는 서버가 정한 그 막대의 마감(내려준 시각 + 60초)까지 남은 시간이다. 화면은 응답을 받은 때부터 이 값으로 남은 시간을 센다.

## 다음 막대 받기

- 요청 `{round}`. 막대를 자르고 결과를 본 회원이 다음 막대를 받을 때 보낸다. 제한 시간은 이 요청을 처리한 시각부터 잰다. 결과 화면에서 기다린 시간은 걸린 시간에 들어가지 않는다.
- 응답은 판 시작과 같은 `{runId, round, timeLimitSeconds, remainingMillis, stick}`이다.
- 이미 받은 막대를 다시 요청하면 같은 막대와 처음 받은 시각 기준의 `remainingMillis`를 준다. 다시 받아도 제한 시간은 늘어나지 않는다.
- 지금 차례가 아닌 막대나 끝난 판은 `MINIGAME_ROUND_CONFLICT`(409), 다른 회원의 판이나 다른 순위표의 판은 `MINIGAME_RUN_NOT_FOUND`(404)다.
- 판을 시작하고 10분이 지나면 다음 막대를 받을 수 없고 `MINIGAME_RUN_EXPIRED`(409)다.

## 막대 자르기

- 요청 `{round, position}`. `round`는 1부터, `position`은 0 이상 12 이하 cm다. 범위 밖이면 `INVALID_PARAMETER`(400)다.
- 다른 회원의 판이나 없는 판은 `MINIGAME_RUN_NOT_FOUND`(404)다. 지금 차례가 아닌 막대, 아직 받지 않은 막대, 이미 자른 막대, 끝난 판은 `MINIGAME_ROUND_CONFLICT`(409)다.
- 오차는 `|왼쪽 무게 - 오른쪽 무게| / 전체 무게`이고, 점수는 `round(1000 * max(0, 1 - 오차 / 0.1))`다.
- 걸린 시간은 서버가 막대를 내려준 시각부터 잰다. 제한 시간 60초에 여유 3초를 더한 63초를 넘기면 `timedOut: true`, 0점이다.
- 응답은 `{round, score, errorRate, answerPosition, timedOut, totalScore, finished}`이다. 다음 막대는 응답에 담지 않고 회원이 결과를 본 뒤 따로 받는다. 5번 막대를 자르면 `finished: true`다.
- 막대마다 자른 위치, 오차, 점수, 걸린 시간, 시간 초과 여부를 `minigame_cut`에 남겨 수상자 확인에 쓴다.
- 자르기는 이벤트 기간을 확인하지 않는다. 닫히기 전에 시작한 판은 닫힌 뒤에도 끝까지 자를 수 있다.
- 대신 판마다 기한이 있다. 다음 막대는 시작 후 10분 안에만 받을 수 있고, 받은 막대는 판의 기한과 그 막대의 마감 + 여유 3초 중 늦은 때까지만 자를 수 있다. 그 뒤로 자르면 `MINIGAME_RUN_EXPIRED`(409)이고 기록하지 않는다.
- 따라서 끝난 판은 늦어도 시작 후 11분 3초 안에 끝나고, 이벤트 순위는 `closes-at` 뒤 11분 3초 안에 확정된다. 기한이 지나도록 끝내지 못한 판은 끝나지 않은 판으로 남아 순위에 들지 않는다.

## 순위

- 회원마다 가장 좋은 끝난 판 하나만 쓴다. 점수 내림차순, 걸린 시간 합 오름차순, 끝낸 시각 오름차순 순서이며 끝나지 않은 판은 넣지 않는다.
- `items`는 상위 50명 `{rank, nickname, totalScore, totalDurationMillis}`이고, `me`는 로그인 회원이 끝낸 판이 있을 때만 같은 모양으로 온다.
- 이벤트 기간이 끝나도 순위는 그대로 조회할 수 있다.

## 게임방 이관

막대 생성과 판정은 `minigame.domain`의 `StickPuzzle`, `StickPuzzleGenerator`가 이벤트와 무관하게 맡는다.
판 기록은 `MinigameEvent` 값(`PEPERO_DAY_2026`, `STICK_HALVING_ROOM`)으로 나뉘어 이벤트 순위와 게임방 순위가 섞이지 않는다.

- `gameRoomOpen`이 `true`가 된 뒤(운영 2026-11-12 13:00, local과 dev는 항상)에만 `/games/stick-halving/runs`로 시작할 수 있다. 그 전이면 `MINIGAME_GAME_ROOM_NOT_OPEN`(409)이다.
- 게임방 판도 횟수 제한이 없다. 판정, 제한 시간, 기록은 이벤트 판과 같다.
- 자르기는 판이 속한 순위표의 경로로만 한다. 게임방 판을 이벤트 경로로 자르거나 그 반대면 없는 판과 같은 `MINIGAME_RUN_NOT_FOUND`(404)다.
- `/games/stick-halving/rankings`는 게임방 판만으로 이벤트 순위와 같은 규칙에 따라 매긴다. 이벤트 순위(`/events/pepero-day/rankings`)는 이벤트 기간의 판만 남는다.
