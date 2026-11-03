# 게임방과 1:1 오목 API

오목은 모임 소속과 독립된 가입 완료 회원 두 명의 게임이다. 일반 요청은 기존
`ApiResponse`와 accessToken 쿠키를 사용하고 변경 요청에는 CSRF 헤더가 필요하다.
규칙: [오목 모델](../../domain/model/gomoku.md).
통신 결정: [백엔드 ADR 0029](../../../adr/0029-gomoku-http-and-sse.md).

## 엔드포인트

기본 경로는 `/api/games/gomoku`다.

| 메서드와 경로 | 권한 | 요청과 결과 |
| --- | --- | --- |
| `GET /rooms` | 공개 | `cursor`, `size`(기본20, 1~100), `keyword`(선택, 최대50자). 크루 이름 부분 검색. 공개/빈자리/미만료 대기방의 snapshot 목록, `nextCursor`, `hasNext` |
| `GET /rooms/me` | 회원 | `{roomId}` 또는 `{roomId:null}` |
| `POST /rooms` | 회원 | `{visibility:PUBLIC\|PRIVATE,rule:RENJU\|FREESTYLE}`. 201 `{roomId}` |
| `POST /rooms/{id}/join` | 회원 | `{}` 또는 `{token}`. 초대 전용 방에는 유효한 토큰 필수. 200 `{roomId}` |
| `GET /rooms/{id}` | 참가자 | 현재 snapshot |
| `PUT /rooms/{id}/ready` | 참가자 | `{ready:boolean,gameNumber}`. 다음 판 번호로 요청. 200 `{roomId}` |
| `POST /rooms/{id}/start` | 방장 | `{gameNumber}`. 다음 판 번호로 요청. 두 사람 모두 준비했을 때만 시작. 200 `{roomId}` |
| `POST /rooms/{id}/moves` | 참가자 | `{gameNumber,expectedPly,x,y,requestId}`. 좌표0~14, UUID 요청 번호. 200 `{roomId}` |
| `POST /rooms/{id}/resign` | 참가자 | `{gameNumber}`. 현재 판 기권. 200 `{roomId}` |
| `POST /rooms/{id}/leave` | 참가자 | 방 나가기. 200 `{roomId}` |
| `POST /rooms/{id}/invite` | 대기방 참가자 | 200 `{token}`. 복사할 때 새 링크를 발급하며 이전 링크 무효화 |
| `GET /invitations/{token}` | 공개 | 제한된 미리보기 `id,hostName,guestName,visibility,rule,status` |
| `GET /rooms/{id}/events` | 참가자 | `text/event-stream`, 아래 SSE 계약 |

목록은 `createdAt DESC,id DESC` DB 커서를 사용한다. `keyword`는 앞뒤 공백을 제거하고 대소문자 구분 없이 방장 크루 이름에 포함되는지 검사한다. 빈 문자열은 전체 목록이며 %, _는 와일드카드로 처리하지 않는다. 검색과 공개/빈자리/미만료 조건을 DB limit 전에 적용한다. 같은 검색어로 다음 커서를 요청하고 검색어 변경 시 cursor를 생략한다. 상세와 실시간 판은 참가자에게만
제공한다. 비참가자의 공개 방 입장도 `join` 명령을 거쳐야 하며 GET으로 참가하지 않는다.
초대 토큰은 32바이트 난수를 URL-safe base64로 표현한 43자 문자열이고 DB에는
SHA-256 해시만 저장한다. 원문은 발급 응답에서만 제공하며 다시 복사하면 회전한다.
방이 닫혔거나 이미 두 명이면 링크가 있어도 참가할 수 없다.

## Snapshot

`id,hostMemberId,hostName,hostAvatarUrl,guestMemberId,guestName,guestAvatarUrl,visibility,rule,status,hostReady,guestReady,
gameNumber,blackMemberId,board,ply,lastX,lastY,winnerMemberId,endReason,revision,serverNow,turnDeadline`.

- `hostAvatarUrl`, `guestAvatarUrl`: 회원의 GitHub 프로필 이미지 URL. 빈 자리 또는 회원 정보 부재 시 null. 상세와 SSE, 대기방 목록에 포함하며 회원 데이터를 한 번의 조인으로 조회한다. 외부 GitHub API 호출이나 별도 이미지 저장은 하지 않는다.
- `board`: 행 우선 225자리 문자열. `0` 빈자리, `1` 흑, `2` 백. 외형 정보는 포함하지 않는다.
- `gameNumber`: 시작 전0, 시작할 때마다 증가. `blackMemberId`: 시작 전0.
- `status`: `WAITING`, `PLAYING`, `FINISHED`, `CLOSED`.
- `endReason`: `FIVE`, `DRAW`, `TIMEOUT`, `RESIGN` 또는 null.
- `guestMemberId,guestName,lastX,lastY,winnerMemberId,turnDeadline`은 부재 시 null.
- `serverNow`, `turnDeadline`은 Unix epoch 밀리초. 내부 시각은 주입한 `Clock`과
  `LocalDateTime`을 사용하고 전송 경계에서 epoch로 변환한다.
- `revision`은 방의 상태 변경마다 증가한다. 클라이언트는 낮은 버전으로 되돌리지 않는다.

## 명령과 동시성

회원 행 잠금으로 방 생성/참가의 좌석 확인을 직렬화한다. `gomoku_seat`의 회원 PK가
동시에 한 방만 참여하는 불변식을 보장한다. 좌석은 일시적인 참가 주장으로, 방을 나가거나
닫으면 삭제하며 방과 착수 이력은 보존한다. 다른 방에 새로 참여한 뒤 이전 닫힌 방에
나가기 요청을 재전송해도 새 방의 좌석은 삭제하지 않는다.

준비는 준비 상태만 변경한다. 두 사람이 모두 준비해도 대국과 타이머는 시작하지 않는다. 방장의 start 명령이 첫 흑백을 배정하거나 재대국 흑백을 교환하고 60초 타이머를 시작한다. 손님의 시작은 403, 미준비 또는 중복 시작은 409로 거절한다.

방 행 잠금으로 입장, 준비, 시작, 착수, 기권과 만료를 직렬화한다. 착수는 판 번호와 예상 수순을
검증하며 같은 판/회원/UUID와 같은 내용은 중복 적용 없이 200으로 확인한다. 같은 UUID의
다른 내용, 이전 판의 요청, 다른 차례, 이미 놓인 자리는 거절한다. 처음과 다른 판의 준비
요청도 거절한다. 시간 경계는 `now >= deadline`이면 시간패이며 서버가 판정한다.
만료 직후 명령을 거절하더라도 만료 상태 자체는 커밋한다.

## SSE

이벤트 이름은 `snapshot`, `id`는 방의 revision 10진수 문자열이며 `data`는 봉투 없이
위 Snapshot JSON이다. 최초 연결과 재연결은 항상 현재 snapshot을 보내므로 과거 이벤트
재생이나 `Last-Event-ID` 기반 누락 복구에 의존하지 않는다. 연결이 끊긴 뒤 API로 판을
조회하고 쿠키 인증 갱신을 거쳐 다시 연결한다. 로그아웃/계정 변경/방 이동 때 연결을 정리한다.

구독 중인 방마다 서버가 500ms 간격으로 DB 상태를 조회하고, 같은 방의 연결들은 이 조회를
공유한다. 다른 서버가 커밋한 변경도 별도 메시지 서버 없이 발견한다. 연결별 쓰기는 직렬화하며
누락된 중간 버전은 다음 전체 snapshot으로 복구한다. 서버당500연결, 회원당6연결로 제한한다.
연결 수명은 최대120초와 access token 만료 중 더 이른 시각이며, 조용할 때15초 heartbeat를
전송한다. 참가 자격이 없어지면 닫고, CLOSED snapshot을 보낸 후에도 닫는다.

최초 요청은 쿠키 인증과 참가 권한을 검증한다. 스트림이 열리기 전 오류는 요청의 Accept가 text/event-stream이어도 application/json 오류 봉투와 원래 HTTP 상태로 반환한다. 이미 열린 SSE를 완료하는 내부 ASYNC
디스패치만 해당 SSE 경로에 한해 허용한다. 일반 HTTP 요청의 인증/권한은 완화하지 않는다.

## 오류

| 상황 | HTTP / 코드 |
| --- | --- |
| 인증 없음 | 401 `UNAUTHENTICATED` |
| 비참가자 조회/명령/SSE 또는 초대 토큰 없는 비공개 참가 | 403 `ACCESS_DENIED` |
| 방 또는 초대 없음 | 404 `GOMOKU_NOT_FOUND` |
| 정원/차례/판 번호/수순/만료/중복 내용 충돌 | 409 `GOMOKU_CONFLICT` |
| 렌주 금수 | 422 `GOMOKU_FORBIDDEN_MOVE` |
| 형식과 좌표 오류 | 400 `INVALID_PARAMETER` |
| 연결 한도 또는 서버 종료 중 | 503 `GOMOKU_STREAM_BUSY` |

## 검증

`GomokuAcceptanceTest`, `GomokuRealtimeIntegrationTest`는 PostgreSQL과 실제 HTTP SSE로
권한, 동시 참가, 중복 착수, 만료와 재연결을 검증한다. 공유 DB를 직접 갱신해 로컬 이벤트
발행 없이 수신되는 것도 확인한다. 이 테스트는 실제 두 서버 배포 검증과 구분한다.
