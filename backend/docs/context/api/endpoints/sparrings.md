# 스파링

계약: [OpenAPI](../../../openapi/sparring.yaml) · [도메인](../../domain/model/sparring.md)
공통 접두사는 `/api`, JSON 응답은 공통 `ApiResponse` 봉투를 따른다.

| 메서드 | 경로 | 권한 | 결과 |
| --- | --- | --- | --- |
| GET | `/sparrings` | PUBLIC | 주제 커서 목록 |
| POST | `/sparrings` | MEMBER + CSRF | 201 `{id}` |
| GET | `/sparrings/{topicId}` | PUBLIC | 주장·표수·내 편·글 수·revision |
| POST | `/sparrings/{topicId}/votes` | MEMBER + CSRF | 204, 본문 없음 |
| GET | `/sparrings/{topicId}/posts` | PUBLIC | 저장된 의견과 받아치기 원문 |
| POST | `/sparrings/{topicId}/posts` | MEMBER + CSRF | 201 `{id}` |
| GET | `/sparrings/{topicId}/events` | PUBLIC | `text/event-stream`, 메시지 스냅샷·추가분 및 공개 집계 |

목록: `size` 1..100(기본20), `keyword` 제목 부분 검색(80자),
`filter=all|active|mine|open|closed|open_active|closed_active`(기본all), `cursor`. active는 의견이 한 개 이상 있는 주제,
mine은 내가 투표한 주제이며 로그인해야 조회할 수 있다. open은 마감이 없거나 마감 전인 주제, closed는 마감 시각에 도달한 주제다. open_active와 closed_active는 각각 해당 상태 중 의견이 있는 주제다. 생성 시각/ID 내림차순이다.

의견: `size` 1..100(기본20), `cursor`, `mine`(기본false).
이전 대화는 ID 내림차순, 재접속 복구 `afterId=0..`는 ID 오름차순이다.
`afterId`는 `cursor` 또는 `mine=true`와 병용할 수 없다.
응답은 `{items, nextCursor, hasNext}`, 더 없으면 nextCursor는 null이다.
원문 `replyTo`에는 ID/작성자ID/이름/회원유형/진영/내용이 포함되어,
부모 글이 현재 페이지 밖에 있어도 두 주장을 함께 표시할 수 있다.

등록 입력: title 1..80자, a/b 각 1..32자, description 선택 0..240자.
대표사진은 선택이다. 기존 `POST /api/image-uploads`로 업로드 정보를 받고 파일 전송을 마친 뒤,
반환된 `imageKey`를 `representativeImageKey`(최대 255자)로 전달한다. URL을 전달하지 않는다.
업로더 본인의 만료 전 임시 이미지와 실제 파일만 연결할 수 있으며, 없거나 다른 회원·그룹·토론의
이미지이면 `IMAGE_NOT_FOUND`(400)로 생성 전체를 취소한다. 목록·상세의 `representativeImageUrl`은
안정적인 공개 접근 주소이며, 대표사진 없이 생성한 경우 null이다.
토론 생성 시 `closesAt`은 필수이며 미래의 ISO 8601 오프셋 포함 일시다. 기존에 마감 없이 생성된 토론은 그대로 유지된다.
목록·상세 응답은 `closesAt`을 +09:00 오프셋으로 반환한다.
마감 시각부터 새 투표·의견은 `SPARRING_CLOSED`(409)로 거절한다. 읽기는 유지하며 저장된 의견의 동일 requestId 재시도는 기존 ID를 반환한다.
공백을 제거한 a/b는 대소문자 무시 기준 서로 달라야 한다.
의견 입력: text 1..160자, replyToId(선택), requestId(UUID, 필수).
같은 회원/주제/requestId의 재시도는 같은 ID를 반환한다. 내용이나 부모가 달라지면 400이다.
투표 없이 의견을 보내면 `SPARRING_VOTE_REQUIRED`(409), 없는 주제는
`SPARRING_NOT_FOUND`(404), 잘못된 입력/다른 주제의 부모 글은 `INVALID_PARAMETER`(400)다.

SSE는 JSON 봉투 없이 다음 이벤트를 보낸다. 두 이벤트의 필드는 동일하며 `posts` 원소는
의견 HTTP 응답과 같은 ID·작성자·본문·작성 시각·원문(`replyTo`) 계약이다.

```text
id:12
event:snapshot
retry:2000
data:{"revision":12,"votesA":3,"votesB":2,"postCount":0,"posts":[]}

id:13
event:update
retry:2000
data:{"revision":13,"votesA":4,"votesB":2,"postCount":0,"posts":[]}
```

- `snapshot`: 최초 연결과 모든 재연결에 최신 의견 최대 30개와 공개 집계를 보낸다.
  `Last-Event-ID` 값과 무관하게 현재 상태로 초기화하며 과거 누락분을 전부 재전송하지 않는다.
- `update`: 직전 조회 이후 추가된 의견 전체와 현재 집계를 보낸다. 추가 의견의 전송 건수
  상한은 없으며 HTTP 목록 API의 `size <= 100` 제한을 적용하지 않는다. 의견은 ID 오름차순이다.
  투표만 변경되면 `posts`는 빈 배열이다.
- `mySide` 같은 회원별 상태는 공개 SSE에 포함하지 않는다. 초기 상세 조회 및 본인의 투표 후
  HTTP 상세 조회에서 얻는다.
- 브라우저는 스냅샷에서 발사를 생략하고, 갱신마다 리플레이 목록은 최근 30개로 유지하며 새 메시지는 건수 제한 없이 발사 대상으로
  전달한다. 캡슐 자리가 부족하면 대기 후 발사하며 내 메시지는 다음 빈자리에서 우선 발사한다.
  직접 보낸 메시지는 최근 30개에서 밀려나도 별도로 보관하고 도착·표시 후 8초까지 목록에 유지한다.
  메시지 수신 때 요약·의견 HTTP를 반복 호출하지 않는다. 저장 응답은 ID만 반환하므로
  작성자 연출 확인에는 저장한 의견 한 건을 HTTP로 조회한다.

활성 주제당 1초 간격 DB revision 조회를 공유한다. 변경 시 집계와 추가 의견을 같은
REPEATABLE READ 스냅샷에서 읽고 조회 커서를 전진시킨다. 주제별 명령은 주제 잠금 이후
의견 ID를 할당하므로 커밋되지 않은 낮은 ID가 나중에 누락되지 않는다. 네트워크 전송은 DB
트랜잭션 밖에서 연결별 큐 순서대로 수행하며, 전송 중 다음 갱신을 버리지 않는다.
변화가 없으면 약 15초마다 heartbeat를 보내고, 120초 연결 교체·종료·오류 시 대기 큐를 비운다.

구형 브라우저 호환을 위해 각 `snapshot`/`update` 뒤에 `{ "revision": 13 }` 형태의 기존
`revision` 이벤트도 유지한다. 새 브라우저는 이 이벤트를 사용하지 않는다. 배포할 때는
새 SSE 이벤트를 제공하는 백엔드를 먼저 반영한 뒤 프론트를 반영한다.
프로세스당 500연결을 넘으면 `SPARRING_STREAM_BUSY`(503)다.
이 수치는 운영 용량 측정 결과가 아닌 초기 보호 상한이다.
쓰기 실패/종료/시간 초과 시 구독을 해제한다. 이미 시작한 스트림 종료에 JSON 오류를 쓰지 않는다.

프록시는 SSE 버퍼링을 끄고 15초 heartbeat를 통과시켜야 한다.
현재 Nginx/ALB/CloudFront 환경에서의 실제 연결 유지와 대규모 성능은 별도 검증 대상이다.
