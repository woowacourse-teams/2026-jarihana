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
| GET | `/sparrings/{topicId}/events` | PUBLIC | `text/event-stream`, revision 알림 |

목록: `size` 1..100(기본20), `keyword` 제목 부분 검색(80자),
`filter=all|active|mine`(기본all), `cursor`. active는 의견이 한 개 이상 있는 주제,
mine은 내가 투표한 주제이며 로그인해야 조회할 수 있다. 생성 시각/ID 내림차순이다.

의견: `size` 1..100(기본20), `cursor`, `mine`(기본false).
이전 대화는 ID 내림차순, 재접속 복구 `afterId=0..`는 ID 오름차순이다.
`afterId`는 `cursor` 또는 `mine=true`와 병용할 수 없다.
응답은 `{items, nextCursor, hasNext}`, 더 없으면 nextCursor는 null이다.
원문 `replyTo`에는 ID/작성자ID/이름/회원유형/진영/내용이 포함되어,
부모 글이 현재 페이지 밖에 있어도 두 주장을 함께 표시할 수 있다.

등록 입력: title 1..80자, a/b 각 1..32자, description 선택 0..240자.
공백을 제거한 a/b는 대소문자 무시 기준 서로 달라야 한다.
의견 입력: text 1..160자, replyToId(선택), requestId(UUID, 필수).
같은 회원/주제/requestId의 재시도는 같은 ID를 반환한다. 내용이나 부모가 달라지면 400이다.
투표 없이 의견을 보내면 `SPARRING_VOTE_REQUIRED`(409), 없는 주제는
`SPARRING_NOT_FOUND`(404), 잘못된 입력/다른 주제의 부모 글은 `INVALID_PARAMETER`(400)다.

SSE 이벤트 예시:

```text
id:12
event:revision
retry:2000
data:{"revision":12}
```

활성 주제당 1초 간격 DB revision 조회를 공유하고, 변화가 없으면 15초마다 heartbeat를 보낸다.
120초마다 연결을 교체하며 브라우저 EventSource가 재연결한다.
연결마다 현재 revision을 보내므로 Last-Event-ID 이벤트 로그에 의존하지 않는다.
클라이언트는 revision 변경/재연결 시 요약 + 마지막 의견 ID 이후 HTTP 조회로 복구한다.
SSE는 도메인 글 본문을 보내지 않는다. 기존 공통 API client가 HTTP 응답을 검증한다.
프로세스당 500연결을 넘으면 `SPARRING_STREAM_BUSY`(503)다.
이 수치는 운영 용량 측정 결과가 아닌 초기 보호 상한이다.
쓰기 실패/종료/시간 초과 시 구독을 해제한다. 이미 시작한 스트림 종료에 JSON 오류를 쓰지 않는다.

프록시는 SSE 버퍼링을 끄고 15초 heartbeat를 통과시켜야 한다.
현재 Nginx/ALB/CloudFront 환경에서의 실제 연결 유지와 대규모 성능은 별도 검증 대상이다.
