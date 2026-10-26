# 채팅 운영

| 설정 | 기본값 | 의미 |
| --- | --- | --- |
| CHAT_ALLOWED_ORIGINS | FRONTEND_ORIGIN / http://localhost:5173 | 쉼표로 나눈 정확한 브라우저 Origin |
| CHAT_LISTENER_ENABLED | true | LISTEN 실행 여부; false면 readiness DOWN |
| CHAT_LISTENER_RECONNECT_DELAY_MS | 1000 | 재연결 대기, 최소 100ms |
| CHAT_LISTENER_APPLICATION_NAME | jarihana-chat-listener | pg_stat_activity에서 별도 연결 식별 |

LISTEN은 애플리케이션 pool과 별도의 JDBC 연결 하나를 사용하므로 서버 수만큼 DB 연결 예산을 추가한다.
연결 제한시간 5초, socketTimeout 15초, NOTIFY 대기 1초다.
prod/dev는 별도 management port의 /actuator/health/readiness에서 readinessState, db, chatListener를 확인한다.
공개 앱 포트의 actuator 보안 정책은 유지한다. REST가 살아 있어도 listener DOWN이면 새 배포 승격을 멈춘다.

프록시는 /api/ws/chat의 Upgrade를 전달해야 한다. 새 트래픽을 다음 서버로 전환한 후 제한된 drain 시간을 둔다.
SIGTERM 시 가장 높은 SmartLifecycle 단계에서 socket에 1001 GOING_AWAY를 보내고, 이후 웹 서버와 broker 및 listener를 종료한다.
기존 socket을 다른 서버로 옮기지 않으며 클라이언트가 새 handshake와 catch-up을 한다.
[인프라 ADR 목록](../../../infra/docs/adr/README.md)과 배포 스크립트가 실제 전환·롤백을 소유한다.

관측값:
- chat.message.write: 커밋/롤백별 DB 쓰기 시간과 개수
- chat.message.idempotent: 같은 요청 재확인
- chat.catchup.requests / messages: 복구 요청과 반환 메시지
- chat.fanout.members / skipped / published: 참여자 조회 결과와 로컬 필터 결과
- chat.socket.sessions / connected / expired / frames.sent / send.failure / close.failure
- chat.listener.connected gauge, connections counter, failure, dispatch.failure

메트릭 label에는 memberId/groupId를 넣지 않는다. 본문과 토큰은 로그에 남기지 않는다.
채널 thread pool은 2~4개, 작업 큐는 256개다. 송신 버퍼 256KiB/10초와 10,000 socket 상한은 초기 방어값이다.
이 값은 처리량 SLO를 의미하지 않는다. 정상 연결 p95 1초와 5분 부하 목표는 별도 실측이 필요하다.

Java21 검증 명령:
`./gradlew test --tests '*Chat*Test'`, `./gradlew test`, `./gradlew bootJar`.
테스트는 Testcontainers PostgreSQL17을 사용하며 외부 DB에 연결하지 않는다.
