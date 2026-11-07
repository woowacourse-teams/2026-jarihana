# 행성이의 리듬 작살 공식 도전

[API 공통 설계](../common-contract.md), [API 문서화 컨벤션](../../../conventions/api.md),
[공식 도전 모델](../../domain/model/rhythm-harpoon.md)을 따른다.
실제 계약은 Controller, 요청/응답 DTO, ErrorCode와 RestAssured 인수 테스트(`RhythmChallengeAcceptanceTest`)를 기준으로 한다.

## 공통 규칙

- 아래 경로는 `/api`를 포함한 외부 경로이며 모두 `MEMBER` 권한이다. 회원 ID는 인증 정보에서 정한다.
- 변경 요청은 `XSRF-TOKEN` 쿠키와 `X-XSRF-TOKEN` 헤더를 검증한다.
- 남의 도전과 없는 도전은 구분하지 않고 `RHYTHM_CHALLENGE_NOT_FOUND`로 응답한다.
- 무효(`INVALID`)나 기록(`FINISHED`)으로 끝난 도전에 시작, 묶음, 이탈을 보내면 오류 대신 현재 상태를 `200 OK`로 돌려준다.
  클라이언트는 응답의 `status`로 분기한다.
- `level`은 `EASY`, `MEDIUM`, `HARD`, `HARDEST`다.

## API 목록

| Method | 경로 | 권한 | 성공 |
| --- | --- | --- | --- |
| `POST` | `/api/games/rhythm-harpoon/challenges` | `MEMBER` | `201 Created`, 도전 상태(시드 포함) |
| `POST` | `/api/games/rhythm-harpoon/challenges/{id}/start` | `MEMBER + 본인` | `200 OK`, 도전 상태 |
| `POST` | `/api/games/rhythm-harpoon/challenges/{id}/batches` | `MEMBER + 본인` | `200 OK`, 서버가 다시 계산한 도전 상태 |
| `POST` | `/api/games/rhythm-harpoon/challenges/{id}/abandon` | `MEMBER + 본인` | `200 OK`, 도전 상태 |
| `GET` | `/api/games/rhythm-harpoon/rankings` | `MEMBER` | `200 OK`, 난이도별 랭킹 커서 목록과 내 순위 |

## 도전 상태 응답

모든 도전 API는 같은 형식으로 응답한다.

| 필드 | 설명 |
| --- | --- |
| `challengeId`, `level`, `scrollSpeed` | 도전 식별자, 난이도, 세균 이동 배속 |
| `seed` | 서버가 정한 방향 섞기 시드. 클라이언트는 같은 시드로 판을 그린다. |
| `rulesVersion`, `chartVersion` | 서버 재계산 규칙과 채보 판본. 클라이언트의 채보 판본과 다르면 시작하지 않는다. |
| `status` | `CREATED`, `PLAYING`, `FINISHED`, `INVALID` |
| `sequence` | 마지막으로 계산한 묶음 순번 |
| `score`, `lives`, `bestCombo`, `loopReached` | 서버가 다시 계산한 점수, 남은 라이프, 최고 콤보, 도달 루프 |
| `perfect`, `hit`, `enough`, `uhoh`, `poor`, `miss` | 판정별 수 |
| `invalidReason` | 무효 이유. `ABANDONED`, `LAGGED`, `CLOCK_AHEAD`, `STALE`, `EXPIRED` 중 하나이며 무효가 아니면 `null` |
| `finishedAt` | 기록이나 무효로 끝난 시각 |

## 엔드포인트 상세

### 도전 만들기

요청 본문은 `{ "level": "HARD", "scrollSpeed": 1.5 }`이다. 배속은 1.0부터 3.0까지 0.25 단위다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 난이도 누락, 배속 누락이나 범위/단위 위반 | `INVALID_PARAMETER` | 400 |

### 시작

음악을 틀기 직전에 보낸다. 이 요청을 받은 서버 시각이 실제 경과 시간의 기준이다.
만든 지 5분이 지났으면 `INVALID(EXPIRED)`를 돌려준다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 이미 시작한 도전 | `RHYTHM_CHALLENGE_CONFLICT` | 409 |

### 입력 묶음

요청 본문은 다음과 같다. 시각은 곡 시작 기준 초이며 입력 지연 보정을 적용한 값이다. `lane`은 left, down, right, up 순서의 순번이다.

```json
{
  "sequence": 3,
  "playedUntil": 6.02,
  "inputs": [{ "lane": 0, "at": 4.118 }, { "lane": 3, "at": 4.351 }],
  "finished": false
}
```

- 같은 순번을 다시 보내면 계산하지 않고 현재 상태를 돌려준다.
- 진행 시각이 서버 경과 시간보다 3초 넘게 앞서거나 15초 넘게 늦으면 무효로 바꾸고 `200 OK`로 무효 상태를 돌려준다.
- `finished: true`는 화면에서 라이프를 모두 잃었다는 뜻이다. 서버 계산이 살아 있으면 입력 없이 끝까지 계산해 기록한다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 순번 누락, 입력 401개 이상, 방향 순번 범위 밖 | `INVALID_PARAMETER` | 400 |
| 입력 시각이 앞선 입력보다 이르거나 진행 시각보다 늦음, 진행 시각이 앞선 묶음보다 이름 | `INVALID_PARAMETER` | 400 |
| 다음 순번이 아님, 시작하지 않은 도전 | `RHYTHM_CHALLENGE_CONFLICT` | 409 |

### 이탈

Esc, 탭 전환, 창 이탈, 페이지 이동 때 보낸다. 진행 중이거나 시작 전인 도전을 `INVALID(ABANDONED)`로 바꾼다.

### 랭킹

`level`(필수), `cursor`, `size`(기본 20, 최대 100)를 받는다.
응답은 `items`, `me`, `nextCursor`, `hasNext`이며 항목은 `memberId`, `challengeId`, `rank`, `name`, `avatarUrl`, `score`,
`bestCombo`, `loopReached`, `achievedAt`이다. 현재 규칙 판본의 `FINISHED` 판만 회원별 최고 기록으로 줄 세운다.
`me`는 요청한 회원의 순위이며 기록이 없으면 `null`이다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 난이도 누락, 잘못된 커서, 범위 밖 `size` | `INVALID_PARAMETER` | 400 |

## 공통 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 없는 도전이나 남의 도전 | `RHYTHM_CHALLENGE_NOT_FOUND` | 404 |
