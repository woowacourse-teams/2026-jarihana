# 오목

[API 공통 설계](../common-contract.md), [API 문서화 컨벤션](../../../conventions/api.md),
[오목 모델](../../domain/model/gomoku.md)을 따른다.
통신 방식과 선택 이유는 [백엔드 ADR 0029](../../../adr/0029-gomoku-http-and-sse.md)에서 확인한다.
실제 계약은 Controller, 요청/응답 DTO, ErrorCode와 RestAssured 인수 테스트를 기준으로 한다.

## 공통 규칙

- 아래 경로는 `/api`를 포함한 외부 경로다. 일반 HTTP 응답은 공통 `success/data/error` 봉투를 사용한다.
- 오목은 모임 소속과 독립적이다. `MEMBER`는 가입 완료 회원이며, 참가자와 방장 권한은 서버가 별도로 확인한다.
- 인증에는 `accessToken` HttpOnly 쿠키를 사용한다. 변경 요청은 `XSRF-TOKEN` 쿠키와 `X-XSRF-TOKEN` 헤더를 검증한다.
- 회원 ID는 요청 본문으로 받지 않고 인증 정보에서 결정한다. 회원은 대기/진행/결과 상태의 방 하나에만 참여할 수 있다.
- 공개 범위와 규칙은 생성 후 변경할 수 없다. `PUBLIC`은 공개방, `PRIVATE`은 초대 전용 방이다. `RENJU`는 기본 규칙, `FREESTYLE`은 제한 없음이다.
- 준비/시작의 `gameNumber`는 다음 판 번호이고 착수/기권은 현재 판 번호다. 대기실로 화면만 이동하는 동작은 퇴장 API를 호출하지 않는다.
- 오목의 `serverNow`, `turnDeadline`은 공통 날짜 문자열 대신 Unix epoch 밀리초로 전달한다. SSE 이벤트도 JSON 봉투 없이 스냅샷을 직접 전달한다.

## API 목록

| Method | 경로 | 권한 | 성공 |
| --- | --- | --- | --- |
| `GET` | `/api/games/gomoku/rooms` | `PUBLIC` | `200 OK`, 기존 상세 형식의 공개 대기방 커서 목록 |
| `GET` | `/api/games/gomoku/rooms?view=summary` | `PUBLIC` | `200 OK`, 공개 대기방과 게임 중인 방의 요약 커서 목록 |
| `GET` | `/api/games/gomoku/rooms/me` | `MEMBER` | `200 OK`, 현재 참여 방 |
| `POST` | `/api/games/gomoku/rooms` | `MEMBER` | `201 Created`, 방 식별자 |
| `POST` | `/api/games/gomoku/rooms/{id}/join` | `MEMBER + 공개 범위/토큰 검증` | `200 OK`, 방 식별자 |
| `GET` | `/api/games/gomoku/rooms/{id}` | `MEMBER + 참가자` | `200 OK`, 스냅샷 |
| `PUT` | `/api/games/gomoku/rooms/{id}/ready` | `MEMBER + 참가자` | `200 OK`, 방 식별자 |
| `POST` | `/api/games/gomoku/rooms/{id}/start` | `MEMBER + 방장` | `200 OK`, 방 식별자 |
| `POST` | `/api/games/gomoku/rooms/{id}/moves` | `MEMBER + 참가자/현재 차례` | `200 OK`, 방 식별자 |
| `POST` | `/api/games/gomoku/rooms/{id}/resign` | `MEMBER + 참가자` | `200 OK`, 방 식별자 |
| `POST` | `/api/games/gomoku/rooms/{id}/leave` | `MEMBER + 참가자` | `200 OK`, 방 식별자 |
| `POST` | `/api/games/gomoku/rooms/{id}/invite` | `MEMBER + 대기방 참가자` | `200 OK`, 새 초대 토큰 |
| `GET` | `/api/games/gomoku/invitations/{token}` | `PUBLIC` | `200 OK`, 제한된 미리보기 |
| `GET` | `/api/games/gomoku/rooms/{id}/events` | `MEMBER + 참가자` | `200 OK`, `text/event-stream` |

## 엔드포인트 상세

각 절의 예외 표에는 엔드포인트 고유 오류를 적는다. 인증, CSRF, 요청 바인딩의 공통 오류는
[공통 오류](#공통-오류)를 함께 적용한다. 숫자로 바인딩할 수 없는 `id`는 `INVALID_PARAMETER`다.

### `GET /api/games/gomoku/rooms`

- 설명: 방장 이름으로 공개 방을 검색한다. `view` 생략은 구버전 화면 호환용 대기방 목록이며, 새 화면은 `view=summary`를 명시한다.
- 권한: `PUBLIC`

#### Query Parameters

| 이름 | 필수 | 타입 | 규칙 |
| --- | --- | --- | --- |
| `cursor` | X | String | 첫 요청은 생략. 다음 페이지는 응답의 `nextCursor` 사용, 최대 256자 |
| `size` | X | Integer | 기본 20, 1~100 |
| `keyword` | X | String | 방장 크루 이름 부분 검색, 최대 50자 |
| `view` | X | String | 생략 시 기존 계약, `summary` 지정 시 새 요약 계약. 다른 값은 400 |

Request Body는 없다. `view`를 생략하면 `PUBLIC`, `WAITING`, 빈 손님 자리, 마지막 활동 후 30분 미경과 조건을 모두 만족하는 방만 기존 스냅샷 형식으로 반환한다. 진행 중인 방은 기존 목록에 절대 포함하지 않는다.

`view=summary`는 `PUBLIC` 방 중 `WAITING`이며 손님 자리가 비어 있고 마지막 활동 후 30분이 지나지 않은 방, 또는 `PLAYING`이며 현재 차례 기한이 지나지 않은 방을 반환한다. 진행 중인 방에는 대기 상태의 30분 만료 조건을 적용하지 않는다.
비공개 방, 만석 대기방, `FINISHED`/`CLOSED` 방은 제외한다. 목록에 표시되어도 참가자 전용 상세 조회와 게임 중 신규 참가 제한은 유지한다.
정렬은 `createdAt DESC, id DESC`다. 검색과 공개/상태/미만료 조건을 DB limit 전에 적용한다.
`keyword`는 앞뒤 공백을 제거하고 대소문자를 구분하지 않는다. 빈 문자열은 전체 목록이며 `%`, `_`는 와일드카드가 아니다.
검색어 변경 시 `cursor`를 생략하고, 같은 검색어로 다음 페이지를 요청한다.

#### 응답 200 (`view=summary`)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "hostMemberId": 10,
        "hostName": "가온",
        "hostAvatarUrl": "https://avatars.githubusercontent.com/u/123",
        "guestMemberId": null,
        "guestName": null,
        "guestAvatarUrl": null,
        "visibility": "PUBLIC",
        "rule": "RENJU",
        "status": "WAITING",
        "spectatorCount": 0
      }
    ],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

`items`는 위 예시의 방/참가자 요약 필드만 포함한다. 대국판, 수순, 돌 색, 착수 위치, 준비 상태와 타이머는 공개 목록에 포함하지 않는다. 결과가 없으면 빈 배열이다.

#### 응답 200 (`view` 생략, 전환 기간에 유지)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "hostMemberId": 10,
        "hostName": "가온",
        "hostAvatarUrl": "https://avatars.githubusercontent.com/u/123",
        "guestMemberId": null,
        "guestName": null,
        "guestAvatarUrl": null,
        "visibility": "PUBLIC",
        "rule": "RENJU",
        "status": "WAITING",
        "hostReady": false,
        "guestReady": false,
        "gameNumber": 0,
        "blackMemberId": 0,
        "board": "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "ply": 0,
        "lastX": null,
        "lastY": null,
        "winnerMemberId": null,
        "endReason": null,
        "revision": 1,
        "serverNow": 1793667600000,
        "turnDeadline": null
      }
    ],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

`items`는 [방 스냅샷](#방-스냅샷)의 전체 필드를 유지한다. 구버전 `roomSchema`가 요구하는 `board`, `hostReady`, `revision`, `serverNow` 등의 필드를 삭제하지 않는다. 대기방만 반환하므로 진행 중인 대국판을 노출하지 않는다.

#### 배포와 기존 계약 제거

1. 두 요청 방식을 지원하는 백엔드를 먼저 배포한다. 이미 열린 구버전 탭은 `view` 없는 요청으로 계속 동작한다.
2. 새 프론트엔드는 첫 페이지, 검색, 다음 페이지와 자동 갱신 모두 `view=summary`를 요청한다.
3. 기존 요청이 충분히 줄었는지 확인한 뒤, **별도 후속 PR로 기존 요청 처리와 응답 DTO를 제거한다.** 배포 성공만으로 기존 탭의 종료를 가정하거나 이번 PR에서 제거하지 않는다.
4. 제거 시점과 판단 근거, 남아 있는 구버전 탭에 미치는 영향, 롤백 방법은 제거 PR에서 명시한다. 종료 후 `view` 없는 요청을 어떻게 처리할지도 해당 PR에서 정한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| size 범위, keyword/cursor 길이, cursor 형식 또는 지원하지 않는 view 오류 | `INVALID_PARAMETER` | 400 |

### `GET /api/games/gomoku/rooms/me`

- 설명: 인증 회원이 현재 참여 중인 방을 조회한다.
- 권한: `MEMBER`

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

참여 중인 방이 없으면 `data`는 `{ "roomId": null }`이다. 이 조회만으로 방에 참여하거나 대기 수명을 연장하지 않는다.

### `POST /api/games/gomoku/rooms`

- 설명: 공개 범위와 규칙을 지정해 방을 만들고 방장 자리를 차지한다.
- 권한: `MEMBER`

#### 요청

```json
{
  "visibility": "PUBLIC",
  "rule": "RENJU"
}
```

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `visibility` | enum | 필수, `PUBLIC` 또는 `PRIVATE` |
| `rule` | enum | 필수, `RENJU` 또는 `FREESTYLE` |

API는 두 값을 모두 요구하며 기본값을 적용하지 않는다.

#### 응답 201

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

생성한 방은 `WAITING`, `gameNumber=0`, `revision=1`이며 방장만 참가한 상태다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 이미 다른 방에 참여 중 | `GOMOKU_CONFLICT` | 409 |
| 인증 회원 데이터 없음 | `MEMBER_NOT_FOUND` | 404 |

### `POST /api/games/gomoku/rooms/{id}/join`

- 설명: 빈 손님 자리에 참여한다.
- 권한: `MEMBER + 공개 범위/토큰 검증`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

```json
{}
```

공개방은 `{}`를 보낸다. 초대 전용 방은 다음 본문을 보낸다.

```json
{
  "token": "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
}
```

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `token` | String/null | 공개방은 생략 가능. 초대 전용 방은 현재 발급 토큰 필수. 값이 있으면 영문 대소문자, 숫자, `_`, `-`로 된 43자 문자열 |

Request Body 자체는 필수다. 토큰 형식 검증은 공개방 요청에도 적용한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

참여 시 두 참가자의 준비 상태를 초기화한다. 이미 같은 방의 참가자이고 방이 만료/종료되지 않았다면 추가 좌석 없이 성공한다. 다른 방에 참여 중이면 거절한다. GET 상세/초대 미리보기만으로는 참여하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 초대 전용 방에 유효한 현재 토큰이 없음 | `ACCESS_DENIED` | 403 |
| 다른 방에 참여 중, 정원 초과, 참가 불가 상태 또는 만료 | `GOMOKU_CONFLICT` | 409 |
| 인증 회원 데이터 없음 | `MEMBER_NOT_FOUND` | 404 |

### `GET /api/games/gomoku/rooms/{id}`

- 설명: 참가자가 현재 방 상태와 판을 조회한다.
- 권한: `MEMBER + 참가자`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 1,
    "hostMemberId": 10,
    "hostName": "가온",
    "hostAvatarUrl": "https://avatars.githubusercontent.com/u/123",
    "guestMemberId": null,
    "guestName": null,
    "guestAvatarUrl": null,
    "visibility": "PUBLIC",
    "rule": "RENJU",
    "status": "WAITING",
    "hostReady": false,
    "guestReady": false,
    "gameNumber": 0,
    "blackMemberId": 0,
    "board": "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "ply": 0,
    "lastX": null,
    "lastY": null,
    "winnerMemberId": null,
    "endReason": null,
    "revision": 1,
    "serverNow": 1793667600000,
    "turnDeadline": null
  },
  "error": null
}
```

응답 필드는 [방 스냅샷](#방-스냅샷)을 따른다. 공개방도 비참가자에게는 상세 판을 제공하지 않는다. 이전 참가자는 `CLOSED` 방의 마지막 상태를 조회할 수 있다. 조회만으로 대기 수명을 연장하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아님 | `ACCESS_DENIED` | 403 |

### `PUT /api/games/gomoku/rooms/{id}/ready`

- 설명: 본인의 다음 판 준비 상태를 설정하거나 취소한다.
- 권한: `MEMBER + 참가자`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

```json
{
  "ready": true,
  "gameNumber": 1
}
```

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `ready` | Boolean | 필수. `true` 준비, `false` 취소 |
| `gameNumber` | Integer | 1 이상, 현재 스냅샷의 `gameNumber + 1` |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

손님이 있는 `WAITING` 또는 `FINISHED`에서만 가능하다. 같은 준비 상태의 재요청은 상태를 중복 변경하지 않는다. 두 사람이 모두 준비해도 자동 시작하지 않으며 대국과 타이머는 방장의 시작 요청에서 시작한다. 재대결도 같은 API로 다음 판을 준비한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아님 | `ACCESS_DENIED` | 403 |
| 상대 미입장, 준비 불가 상태, 다음 판 번호 불일치 또는 만료 | `GOMOKU_CONFLICT` | 409 |

### `POST /api/games/gomoku/rooms/{id}/start`

- 설명: 두 사람이 준비한 방에서 방장이 대국을 시작한다.
- 권한: `MEMBER + 방장`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

```json
{
  "gameNumber": 1
}
```

`gameNumber`는 1 이상이며 현재 스냅샷의 `gameNumber + 1`이어야 한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

`WAITING` 또는 `FINISHED`이며 손님이 있고 두 사람 모두 준비해야 한다. 시작하면 `PLAYING`으로 바뀌고 판 번호 증가, 빈 판/수순 0, 준비 상태 초기화와 첫 60초 기한을 반영한다. 첫 판 흑백은 무작위이며 재대결은 직전 판의 흑백을 교환한다. 같은 시작 요청을 재전송해도 새 판을 추가로 시작하지 않으며 이미 시작한 판 번호 요청은 충돌로 거절한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아니거나 방장이 아님 | `ACCESS_DENIED` | 403 |
| 미준비, 시작 불가 상태, 다음 판 번호 불일치, 중복 시작 또는 만료 | `GOMOKU_CONFLICT` | 409 |

### `POST /api/games/gomoku/rooms/{id}/moves`

- 설명: 현재 차례의 참가자가 교차점에 돌 하나를 놓는다.
- 권한: `MEMBER + 참가자/현재 차례`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

```json
{
  "gameNumber": 1,
  "expectedPly": 0,
  "x": 7,
  "y": 7,
  "requestId": "5f7d4c53-3f10-4b78-a237-814f7e9e3439"
}
```

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `gameNumber` | Integer | 1 이상, 현재 판 번호 |
| `expectedPly` | Integer | 0~224, 요청 시점의 현재 수순 |
| `x` | Integer | 필수, 0~14. 왼쪽부터 열 번호 |
| `y` | Integer | 필수, 0~14. 위쪽부터 행 번호 |
| `requestId` | UUID | 필수. 같은 착수의 통신 재시도에는 같은 값 사용 |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

성공하면 수순과 revision을 증가시키고 마지막 좌표, 다음 차례의 60초 기한을 갱신한다.
승리/무승부면 `FINISHED`와 결과를 저장하고 `turnDeadline`은 null이다. 금수 거절은 판과 차례를 바꾸지 않으며 시간은 계속 흐른다.

같은 방/판/회원/UUID의 같은 좌표와 `expectedPly` 재시도는 중복 적용 없이 200이다.
이미 성공한 착수는 상대 시간패 이후 재요청해도 기존 성공으로 확인한다. 같은 UUID의 다른 내용은 409다.
서버가 `now >= turnDeadline`에서 시간패를 판정하며 만료 직후 명령을 거절해도 만료 상태 자체는 커밋한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아님 | `ACCESS_DENIED` | 403 |
| 현재 판/수순 불일치, 다른 차례, 점유된 자리, 종료/시간 만료 또는 동일 UUID의 다른 내용 | `GOMOKU_CONFLICT` | 409 |
| RENJU 흑돌의 쌍3, 쌍4, 장목 | `GOMOKU_FORBIDDEN_MOVE` | 422 |

### `POST /api/games/gomoku/rooms/{id}/resign`

- 설명: 진행 중인 현재 판을 기권한다.
- 권한: `MEMBER + 참가자`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

```json
{
  "gameNumber": 1
}
```

`gameNumber`는 1 이상이며 현재 판 번호여야 한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

`PLAYING`에서만 가능하다. 상대를 승자로 기록하고 `status=FINISHED`, `endReason=RESIGN`, `turnDeadline=null`, 두 사람 준비 해제를 반영한다. 좌석은 유지하므로 재대결 준비가 가능하다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아님 | `ACCESS_DENIED` | 403 |
| 현재 판 번호 불일치, 진행 중인 판 없음 또는 만료 | `GOMOKU_CONFLICT` | 409 |

### `POST /api/games/gomoku/rooms/{id}/leave`

- 설명: 방에서 실제로 퇴장하고 좌석을 해제한다.
- 권한: `MEMBER + 참가자`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "roomId": 1
  },
  "error": null
}
```

- `WAITING`에서 손님이 나가면 손님 자리만 비우고 두 사람의 준비를 초기화한다. 방은 유지한다.
- 대기방장이 나가거나 `PLAYING`/`FINISHED`에서 참가자가 나가면 `CLOSED`로 바꾸고 모든 좌석을 해제한다. 진행 중 퇴장은 기권 결과도 보존한다.
- 이미 닫힌 방의 이전 참가자가 재요청하면 200이다. 이후 참여한 다른 방의 좌석에는 영향을 주지 않는다.
- 방과 착수 이력은 삭제하지 않는다. 대기실 화면으로 이동만 하려면 이 API를 호출하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아님 | `ACCESS_DENIED` | 403 |
| 인증 회원 데이터 없음 | `MEMBER_NOT_FOUND` | 404 |

### `POST /api/games/gomoku/rooms/{id}/invite`

- 설명: 대기방의 새 초대 토큰을 발급한다.
- 권한: `MEMBER + 대기방 참가자`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "token": "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
  },
  "error": null
}
```

응답 헤더는 `Cache-Control: no-store`다. 공개방과 초대 전용 방 모두 발급할 수 있다.
토큰은 32바이트 난수의 URL-safe Base64 43자 표현이며 DB에는 SHA-256 해시만 저장한다.
원문은 이 발급 응답에서만 제공하고 재발급하면 이전 토큰을 무효화한다.
클라이언트는 토큰으로 `/games/gomoku/invite/{token}` 화면 링크를 구성한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아님 | `ACCESS_DENIED` | 403 |
| 대기 상태가 아니거나 만료 | `GOMOKU_CONFLICT` | 409 |

### `GET /api/games/gomoku/invitations/{token}`

- 설명: 초대 링크의 제한된 공개 미리보기를 조회한다.
- 권한: `PUBLIC`

#### Path Parameters

- `token`: 발급받은 43자 초대 토큰. 영문 대소문자, 숫자, `_`, `-`만 허용한다.

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 1,
    "hostName": "가온",
    "guestName": null,
    "rule": "RENJU",
    "visibility": "PRIVATE",
    "status": "WAITING"
  },
  "error": null
}
```

응답 헤더는 `Cache-Control: no-store`다. 참가자 ID/프로필, 판, 준비 여부, 시간과 토큰 원문은 포함하지 않는다.
토큰이 일치하는 방이면 정원 초과나 `CLOSED` 상태도 미리보기의 `guestName`, `status`로 확인할 수 있다.
미리보기 성공이 참여 가능을 보장하지 않으며 실제 참가 시 `join`이 정원과 현재 상태를 다시 검증한다.
비로그인/가입 전에도 조회 가능하지만 참가에는 회원 가입과 별도 참여 요청이 필요하다. 자동으로 좌석을 차지하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 토큰 형식 오류 | `INVALID_PARAMETER` | 400 |
| 일치하는 초대 없음 또는 재발급으로 무효화된 토큰 | `GOMOKU_NOT_FOUND` | 404 |

### `GET /api/games/gomoku/rooms/{id}/events`

- 설명: 참가자가 방 전체 스냅샷을 SSE로 구독한다.
- 권한: `MEMBER + 참가자`

#### Path Parameters

- `id`: 대상 오목방 식별자

#### 요청

Request Body는 없다.

#### 요청 헤더

```http
Accept: text/event-stream
```

#### 응답 200

```http
Content-Type: text/event-stream
Cache-Control: no-store, no-transform
X-Accel-Buffering: no
```

이벤트 예시에서 `data`는 [방 스냅샷](#방-스냅샷)이며 JSON 봉투를 사용하지 않는다.

```text
event: snapshot
id: 1
retry: 2000
data: {"id":1,"hostMemberId":10,"hostName":"가온","hostAvatarUrl":"https://avatars.githubusercontent.com/u/123","guestMemberId":null,"guestName":null,"guestAvatarUrl":null,"visibility":"PUBLIC","rule":"RENJU","status":"WAITING","hostReady":false,"guestReady":false,"gameNumber":0,"blackMemberId":0,"board":"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","ply":0,"lastX":null,"lastY":null,"winnerMemberId":null,"endReason":null,"revision":1,"serverNow":1793667600000,"turnDeadline":null}

:keepalive
```

- 최초 연결과 재연결은 항상 현재 스냅샷을 보낸다. `id`는 방 revision의 10진수 문자열이며 과거 이벤트 재생이나 `Last-Event-ID` 기반 복구에 의존하지 않는다.
- 구독 중인 방들의 id/revision을 약 500ms마다 묶어서 조회하고 변경된 방만 전체 스냅샷을 조회한다. 상세 조회는 서버당 최대 4개이며 같은 방의 동시 조회와 대기열 적재를 하지 않는다. 다른 서버의 커밋도 조회로 발견하며 중간 버전 누락은 다음 전체 스냅샷으로 복구한다.
- 상태가 조용하면 약 15초마다 keepalive 주석을 보낸다. 연결은 최대 120초 또는 access token 만료 중 더 이른 시각에 종료한다.
- 서버당 500개, 회원당 6개 연결로 제한한다. 참가 자격이 사라지면 종료하며 `CLOSED` 스냅샷 전송 후에도 종료한다.
- 재연결 시 쿠키 인증을 갱신하고 상세 조회로 최신 판을 확인한다. 낮은 revision으로 상태를 되돌리지 않고 로그아웃/계정 변경/방 이동 때 연결을 정리한다.
- 최초 요청은 일반 쿠키 인증과 참가 권한을 검증한다. 열리기 전 오류는 `Accept: text/event-stream`이어도 `application/json` 오류 봉투와 원래 HTTP 상태로 반환한다.
- 이미 열린 스트림 종료에는 JSON 오류를 쓰지 않는다. 해당 SSE 경로의 내부 ASYNC 완료 디스패치만 별도로 허용하며 최초 요청 권한을 완화하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 방 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 방 참가자가 아님 | `ACCESS_DENIED` | 403 |
| 연결 한도 도달 또는 서버 종료 중 | `GOMOKU_STREAM_BUSY` | 503 |

## 방 스냅샷

`view=summary` 공개 목록은 `GomokuLobbyRoomResponse` 요약을 사용한다. 전환 기간의 `view` 없는 대기방 목록, 방 상세와 SSE는 `GomokuRoomResponse`를 사용한다.
HTTP 목록/상세에는 공통 응답 봉투가 있고 SSE에는 없다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Long | 방 식별자 |
| `hostMemberId` | Long | 방장 회원 식별자 |
| `hostName` | String | 방장 크루 이름 |
| `hostAvatarUrl` | String/null | 방장의 GitHub 프로필 이미지 URL, 회원 정보 부재 시 null |
| `guestMemberId` | Long/null | 손님 회원 식별자, 빈 자리이면 null |
| `guestName` | String/null | 손님 크루 이름, 빈 자리이면 null |
| `guestAvatarUrl` | String/null | 손님의 GitHub 프로필 이미지 URL, 빈 자리/회원 정보 부재 시 null |
| `visibility` | enum | `PUBLIC`, `PRIVATE` |
| `rule` | enum | `RENJU`, `FREESTYLE` |
| `status` | enum | `WAITING`, `PLAYING`, `FINISHED`, `CLOSED` |
| `hostReady` | Boolean | 방장의 다음 판 준비 여부 |
| `guestReady` | Boolean | 손님의 다음 판 준비 여부 |
| `gameNumber` | Integer | 첫 시작 전 0, 판을 시작할 때마다 1 증가 |
| `blackMemberId` | Long | 흑돌 회원 식별자, 첫 시작 전 0 |
| `board` | String | 행 우선 225자리. 인덱스는 `y * 15 + x`, `0` 빈 자리, `1` 흑돌, `2` 백돌 |
| `ply` | Integer | 현재 판에 놓인 돌 수, 0~225 |
| `lastX` | Integer/null | 마지막 착수 열, 현재 판 착수 전 null |
| `lastY` | Integer/null | 마지막 착수 행, 현재 판 착수 전 null |
| `winnerMemberId` | Long/null | 승자 식별자, 무승부/결과 없음이면 null |
| `endReason` | String/null | `FIVE`, `DRAW`, `TIMEOUT`, `RESIGN`, 결과 없음이면 null |
| `revision` | Long | 방 상태가 실제로 변경될 때 증가하는 버전 |
| `serverNow` | Long | 응답 생성 시 서버 시각, Unix epoch 밀리초 |
| `turnDeadline` | Long/null | 현재 차례 제한 시각, Unix epoch 밀리초, 진행 중이 아니면 null |

프로필 URL은 회원 정보를 조인해 구성하며 응답 중 외부 GitHub API 호출이나 별도 이미지 저장은 하지 않는다.
판에는 돌의 색과 좌표만 포함하며 캐릭터/외형 정보는 포함하지 않는다.

## 명령 처리와 동시성

- 회원 행 잠금으로 방 생성/참가의 좌석 확인을 직렬화하고 `gomoku_seat`의 회원 PK로 한 회원의 동시 방 참여를 제한한다.
- 입장/준비/시작/착수/기권/만료는 방 행 잠금으로 직렬화한다. 같은 판/회원/UUID의 착수는 한 번만 적용한다.
- 좌석은 참가 주장으로만 사용하며 퇴장/방 종료 시 해제한다. 방과 착수 이력은 보존한다.
- 시간 경계는 서버가 판정한다. 조회나 재연결은 대기/결과 상태의 30분 수명을 연장하지 않는다. 만료 후 명령을 거절해도 만료 상태 자체는 커밋한다.

## 공통 오류

일반 HTTP 오류와 SSE가 열리기 전 오류는 [API 공통 설계](../common-contract.md)의 오류 봉투를 따른다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 인증 정보 없음/만료 또는 가입 미완료 상태의 회원 전용 API 접근 | `UNAUTHENTICATED` | 401 |
| CSRF 검증 실패, 참가 권한 없음, 방장 권한 없음 또는 비공개 참가 토큰 불일치 | `ACCESS_DENIED` | 403 |
| 요청 본문/파라미터 바인딩, 필수 필드, enum/UUID/토큰 형식, 좌표/수순 범위 오류 | `INVALID_PARAMETER` | 400 |
| 방/초대 없음 | `GOMOKU_NOT_FOUND` | 404 |
| 현재 상태, 판 번호/수순, 정원, 만료 또는 요청 내용 충돌 | `GOMOKU_CONFLICT` | 409 |
| 렌주 흑돌의 금수 | `GOMOKU_FORBIDDEN_MOVE` | 422 |
| 실시간 연결 한도 도달 또는 서버 종료 중 | `GOMOKU_STREAM_BUSY` | 503 |

## 검증 근거

- `GomokuAcceptanceTest`: 공개 목록/검색, 프로필, 생성/참가, 방장 시작, 중복 착수, 재대결, 초대와 좌석 해제의 HTTP 계약.
- `GomokuInvitationAuthAcceptanceTest`: 공개 미리보기와 로그인/가입 이후 명시적 참여 경계.
- `GomokuRealtimeIntegrationTest`: PostgreSQL과 실제 HTTP SSE를 통한 권한, 동시 참가/생성/시작, 만료와 재연결. 로컬 이벤트 발행 없이 DB 변경이 수신되는지도 검증한다.
- `GomokuStreamSecurityTest`: 인증된 최초 SSE 요청과 내부 ASYNC 완료 디스패치 구분.

위 테스트 범위는 실제 두 서버 배포, 운영 프록시와 부하 환경의 SSE 검증과 구분한다.

## 대전기록, 승률과 랭킹

다음 세 GET은 가입 완료 회원 전용이다. 인증은 공통 쿠키 계약을 따르며 다른 회원 ID로 조회할 수 없다. 성공 HTTP 200은 공통 `ApiResponse` 봉투를 사용한다. 비로그인/가입 미완료는 401 `UNAUTHENTICATED`, 잘못된 커서와 size는 400 `INVALID_PARAMETER`다.

### `GET /api/games/gomoku/history/me/summary`

`data`는 `total`, `wins`, `losses`, `draws`(완료 판 집계 정수)와 `winRate`(0~100, 소수 첫째 자리 반올림, 0판이면 null)다. 승률의 분모에 무승부를 포함한다. 예: 24판, 15승, 7패, 2무이면 `winRate: 62.5`다. 진행 중인 판은 집계하지 않는다.

### `GET /api/games/gomoku/history/me`

쿼리는 `cursor`(최초 생략, 최대 256자), `size`(기본 20, 1~100)다. 완료 시각 DESC, ID DESC로 조회하며 같은 시각의 판도 ID로 구분한다.

`data`는 `items`, `nextCursor`, `hasNext`다. 각 항목은 다음 필드를 가진다.

| 필드 | 의미 |
| --- | --- |
| `id` | 판별 기록 ID |
| `opponentName`, `opponentAvatarUrl` | 시작 당시 상대 이름과 현재 GitHub 프로필 URL |
| `result` | 본인 기준 `WIN`, `LOSE`, `DRAW` |
| `rule` | `RENJU`, `FREESTYLE` |
| `endReason` | `FIVE`, `DRAW`, `RESIGN`, `TIMEOUT` |
| `endedAt` | 서울 기준 `YYYY-MM-DDTHH:mm:ss` 날짜/시간, 소수 초가 있을 수 있음 |

시간패의 종료 시각은 판정 명령 수신 시각이 아닌 해당 차례 마감 시각이다. 기권과 진행 중 퇴장도 결과를 남긴다. 종료 후 재요청이나 방 닫힘은 기록을 추가하지 않는다. 최종 페이지는 `nextCursor: null`, `hasNext: false`다.

### `GET /api/games/gomoku/ranking`

쿼리와 페이지 봉투는 기록 목록과 같다. 각 항목은 `memberId`, `rank`(1부터 시작하는 순번), 현재 `name`, `avatarUrl`과 요약의 `total`, `wins`, `losses`, `draws`, `winRate`를 제공한다. 완료 대국이 있는 비탈퇴 회원만 대상이며 0승 회원도 포함한다.

정렬은 승수 DESC, 총 판수 ASC, 회원 ID ASC다. 같은 승수에서는 표시 반올림 전의 정확한 승률을 우선한다. 0승에서도 총 판수/회원 ID 순으로 구분한다. 페이지 크기와 관계없이 전체 집계의 순번을 반환한다. `data.me`에는 페이지에 포함되지 않아도 본인의 동일한 순위 항목을 반환하며, 완료 대국이 없으면 null이다. 목록과 `me`는 현재 조회 시점의 집계이고 랭킹 페이지 사이에 새 대국이 끝나면 순번이 바뀔 수 있다.

### 저장과 배포

- V20.1은 기존 테이블/컬럼을 유지하고 `gomoku_game`만 추가한다. 구버전의 방/착수 INSERT에 새 필드가 필요하지 않다. 채팅 알림 호환 V20 다음에 적용하며, [#579](https://github.com/woowacourse-teams/2026-jarihana/pull/579)의 V21~V23보다 먼저 배포한다.
- 기록 기능이 있는 버전은 모든 대국 시작 시 기록을 생성한다. 수집을 끄는 설정이나 환경 변수는 없다.
- 기능 적용 이전 판을 복원하지 않는다. 방은 유지되며 기록 기능이 있는 버전에서 시작한 재대결부터 기록된다. 앱 롤백은 V20.1 스키마/기록을 지우지 않지만 기록 기능이 없는 구버전은 결과를 저장하지 못한다.
- 결과 확정과 방 변경은 기존 방 잠금/트랜잭션 안에서 처리한다. 만료 뒤 명령이 409여도 시간패 기록은 함께 커밋하며, 기록 저장 실패는 방 상태까지 롤백한다.
- 현재 Blue-Green 배포는 접속 전환 후 관찰과 연결 배출을 거쳐 이전 앱을 종료한다([배포 절차](../../../../../infra/blue-green-deploy/controller/deployment.md)). `GomokuExpiry`는 앱마다 만료 방을 조회하고 앱 종료 때 중단되며, 푸시 작업의 PAUSED/권한 인계에 참여하지 않는다. 따라서 기록 기능이 없는 이전 앱이 새 앱에서 시작한 판을 시간패로 종료하면 기록이 미완료로 남을 수 있다. 설정 제거만으로 최초 배포의 무누락을 보장하지 않는다.
- 최초 기능 도입 중의 기록 누락은 허용하며, 임시 DB 트리거나 기존 진행 판의 시작 기록 보완은 추가하지 않는다. 이후 배포와 롤백에서는 결과를 변경하는 모든 앱 버전이 기록 저장을 지원해야 한다.
- `GomokuHistoryAcceptanceTest`가 제거된 설정에 false가 남아 있어도 수집하는지와 재대결, 퇴장, 기권, 시간패, 무승부, 정상 승리/중복 요청, 동시 만료, 기록 실패 롤백, 인증, 커서와 집계를 검증한다. 서로 다른 앱 버전이 동시에 동작하는 배포 검증은 포함하지 않는다.
- `./gradlew gomokuCutoverTest`는 독립된 두 애플리케이션 JVM과 하나의 격리된 PostgreSQL 17을 실행한다. 실제 HTTP 요청 대상을 이전 서버에서 새 서버로 바꾸어 승리/재대결/재요청을 검증하고, 이전 JVM의 SIGTERM 종료 후 새 서버의 착수/시간패 기록을 검증한다. 양쪽 `GomokuExpiry`를 활성화한 상태에서 같은 방 잠금에 두 작업이 실제로 대기하는 것을 DB에서 확인한 뒤, 기록 한 건과 revision 한 번 증가를 검증한다. 별도 JVM/컨테이너 실행이 필요한 이 검사는 기본 `test`와 분리한다.
- 위 태스크의 Nginx 시나리오는 운영 [Nginx 템플릿](../../../../../infra/blue-green-deploy/nginx/nginx.conf.template)을 그대로 렌더링하고, 실제 upstream을 관측하는 테스트 전용 응답 헤더만 추가한다. digest로 고정한 Nginx 1.30.5 컨테이너에서 `nginx -t`, 설정 교체, reload, 3회 연속 upstream probe 확인을 수행한다. 같은 master PID를 유지하며 실제 게임 요청의 upstream 헤더와 접근 로그가 이전/새 JVM 포트로 전환되는지 검증한다. 이전 worker에 열린 SSE가 새 JVM의 승리 결과를 받는 경우와 worker 배출 뒤 이전 JVM을 종료하고 시간패/재대결 기록을 저장하는 경우를 포함한다. Nginx 시나리오만 실행하려면 `./gradlew gomokuCutoverTest --tests '*Nginx*'`를 사용한다. 두 JVM은 같은 기록 지원 빌드이며 운영 EC2/CloudFront 배포 파이프라인이나 서로 다른 릴리스 간 호환성은 검증하지 않는다.

## 게임방 채팅

참가자 채팅은 [별도 계약](gomoku-chat.md)과 [운영 가이드](../../../operations/gomoku-chat.md)를 따른다. 모임 채팅과 별개이며 기본 비활성이다.

## 공개 대국 관전

공개 대국 관전의 입장, 종료, participationId 조회/SSE와 spectatorCount 계약은 [관전 API](gomoku-observation.md)를 따른다.
