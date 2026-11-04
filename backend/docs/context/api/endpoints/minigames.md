# 미니게임

빼빼로데이 반 나누기 이벤트("공평하게 반띵") API다. 공통 접두사는 `/api`, JSON 응답은 공통 `ApiResponse` 봉투를 따른다.

| 메서드 | 경로 | 권한 | 결과 |
| --- | --- | --- | --- |
| GET | `/events/pepero-day` | PUBLIC (로그인하면 남은 횟수 포함) | 진행 상태, 기간, 게임방으로 옮기는 시각, 서버 시각, 한 시간 도전 횟수와 다음 충전 시각 |
| POST | `/events/pepero-day/runs` | MEMBER + CSRF | 201 판 ID와 1번 막대 |
| POST | `/events/pepero-day/runs/{runId}/cuts` | MEMBER + CSRF + 본인 판 | 200 판정 결과와 다음 막대 |
| GET | `/events/pepero-day/rankings` | PUBLIC (로그인하면 내 순위 포함) | 상위 50명과 내 순위 |

## 기간과 진행 상태

- `status`는 `UPCOMING`, `OPEN`, `CLOSED` 중 하나다. 서버 `Clock`(Asia/Seoul) 기준으로 `opensAt <= now < closesAt`이면 `OPEN`이다.
- 운영 기간은 `jarihana.minigame.pepero-day.opens-at`, `closes-at`으로 정하며 기본값은 2026-11-11T00:00:00부터 2026-11-12T10:00:00까지다.
- 이벤트가 끝난 뒤 `game-room-opens-at`(기본 2026-11-12T13:00:00)부터 `gameRoomOpen`이 `true`가 되고, 게임방(`/games`)에 반띵 카드가 나타나 연습으로 계속 할 수 있다. 이 시각은 `closes-at`보다 이를 수 없다. 이벤트 상태는 그 뒤에도 `CLOSED`이고, 순위 조회는 이벤트 최종 순위로 남는다.
- local과 dev 프로필은 `always-open: true`라 기간과 관계없이 `OPEN`이고, `gameRoomOpen`도 `true`다.
- `serverTime`은 초 단위로 자른 서버 시각이다. 화면은 기기 시계 대신 이 값과의 차이로 남은 시간을 센다.
- 순위 도전은 1시간에 `hourlyAttemptLimit`번(`hourly-attempt-limit`, 기본 10)까지 할 수 있고, 매시 정각(서비스 시간대)에 다시 채워진다. 남은 횟수는 다음 시간으로 넘어가지 않는다.
- `remainingAttempts`는 로그인 회원의 이번 시간 남은 순위 도전 횟수이고, 비로그인이면 `null`이다. `attemptsRefillAt`은 다음 정각이다.

```json
{
  "status": "OPEN",
  "opensAt": "2026-11-11T00:00:00",
  "closesAt": "2026-11-12T10:00:00",
  "gameRoomOpensAt": "2026-11-12T13:00:00",
  "gameRoomOpen": false,
  "serverTime": "2026-11-11T12:30:00",
  "hourlyAttemptLimit": 10,
  "remainingAttempts": 8,
  "attemptsRefillAt": "2026-11-11T13:00:00"
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
- 회원마다 1시간에 10번까지 시작할 수 있다. 이번 시간 칸(정각부터)에 시작한 판을 세며, 끝내지 않은 판도 횟수에 들어간다. 넘으면 `MINIGAME_ATTEMPT_LIMIT_EXCEEDED`(409)다. 같은 회원의 동시 시작은 회원 행 잠금으로 줄을 세운다.
- 응답은 `{runId, round: 1, timeLimitSeconds: 30, remainingAttempts, attemptsRefillAt, stick}`이다.

## 막대 자르기

- 요청 `{round, position}`. `round`는 1부터, `position`은 0 이상 12 이하 cm다. 범위 밖이면 `INVALID_PARAMETER`(400)다.
- 다른 회원의 판이나 없는 판은 `MINIGAME_RUN_NOT_FOUND`(404)다. 지금 차례가 아닌 막대, 이미 자른 막대, 끝난 판은 `MINIGAME_ROUND_CONFLICT`(409)다.
- 오차는 `|왼쪽 무게 - 오른쪽 무게| / 전체 무게`이고, 점수는 `round(1000 * max(0, 1 - 오차 / 0.1))`다.
- 걸린 시간은 서버가 막대를 내려준 시각부터 잰다. 제한 시간 30초에 여유 3초를 더한 33초를 넘기면 `timedOut: true`, 0점이다.
- 응답은 `{round, score, errorRate, answerPosition, timedOut, totalScore, finished, nextStick}`이다. 5번 막대를 자르면 `finished: true`, `nextStick: null`이다.
- 막대마다 자른 위치, 오차, 점수, 걸린 시간, 시간 초과 여부를 `minigame_cut`에 남겨 수상자 확인에 쓴다.
- 자르기는 이벤트 기간을 확인하지 않는다. 닫히기 전에 시작한 판은 닫힌 뒤에도 끝까지 자를 수 있고, 막대마다 제한 시간이 있어 늦어도 시작 후 약 3분 안에 끝난다.

## 순위

- 회원마다 가장 좋은 끝난 판 하나만 쓴다. 점수 내림차순, 걸린 시간 합 오름차순, 끝낸 시각 오름차순 순서이며 끝나지 않은 판은 넣지 않는다.
- `items`는 상위 50명 `{rank, nickname, totalScore, totalDurationMillis}`이고, `me`는 로그인 회원이 끝낸 판이 있을 때만 같은 모양으로 온다.
- 이벤트 기간이 끝나도 순위는 그대로 조회할 수 있다.

## 게임방 이관

막대 생성과 판정은 `minigame.domain`의 `StickPuzzle`, `StickPuzzleGenerator`가 이벤트와 무관하게 맡는다.
판 기록은 `MinigameEvent` 값으로 나뉘므로, 게임방으로 옮길 때는 새 값을 더해 이벤트 순위와 섞지 않는다.
