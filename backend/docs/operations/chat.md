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

## 전송·읽음 혼합 부하 확인 — 2026-10-26

PR #454의 동일 모임 행 잠금 경쟁을 실제 서비스와 PostgreSQL에서 확인했다.
측정 대상은 `ChatCommandService.sendMessage`와 `markRead`의 트랜잭션 완료까지다.

### 조건과 재현 순서

- macOS 로컬 Java 21, Docker PostgreSQL 17 테스트 컨테이너, Hikari 최대 40개 연결
- 같은 모임에 33명 가입, 각 측정 단계는 새 모임과 기존 메시지 30개로 시작
- 전송만 있는 A: 매 라운드 서로 다른 3명이 동시에 전송
- 혼합 B: 같은 3명 전송과 다른 30명의 읽음 갱신을 동시에 시작
- 읽음 순번은 해당 라운드 시작 전 마지막으로 저장된 순번
- latch로 요청을 동시에 시작하고, 모든 요청이 끝나면 다음 라운드 진행
- A·B 각각 15라운드 준비 실행 후 A → B → B → A 순서로 각각 100라운드 측정
- 서비스 호출 전후 단조 시계로 지연 측정, 정렬한 표본의 ceil(N × p) 번째 값으로 백분위 계산
- 별도 작업에서 `pg_stat_activity`의 현재 DB `wait_event_type = 'Lock'` 개수를 약 5ms 간격으로 조회
- LISTEN 처리 비활성화. HTTP·WebSocket 전달·화면 렌더링은 측정에서 제외

동일 라운드의 30개 읽음은 병렬 요청이다. 라운드가 끝나야 다음 요청을 시작하는 방식이므로
지속적으로 유입되는 요청의 처리 한계나 운영 응답시간은 별도로 측정해야 한다.

### 결과

지연 단위는 ms이며 준비 실행은 아래 표에서 제외했다.

| 단계 | 전송 / 읽음 요청 수 | 전송 p95 | 전송 p99 | 읽음 p95 | 읽음 p99 | 최대 잠금 대기 연결 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 · 전송 | 300 / 0 | 19.095 | 26.067 | — | — | 2 |
| B1 · 혼합 | 300 / 3,000 | 108.578 | 120.564 | 106.209 | 120.414 | 32 |
| B2 · 혼합 | 300 / 3,000 | 120.988 | 230.903 | 125.608 | 182.736 | 32 |
| A2 · 전송 | 300 / 0 | 30.997 | 64.232 | — | — | 2 |

측정 구간의 전송 1,200건·읽음 6,000건이 오류 없이 완료됐다. 단계별 메시지 수,
고유 순번 수, 마지막 순번과 각 읽음 응답의 순번 범위를 확인했다.
잠금 대기가 관측된 표본은 B1에서 1,651/1,717, B2에서 1,758/1,821이었다.
이는 샘플 시점에 대기 연결이 존재한 비율이며, 요청별 잠금 대기 시간은 아니다.

읽음이 함께 몰리는 조건에서는 전송 지연과 잠금 대기가 증가했다.
이번 변경에서는 종료·가입·메시지 저장의 순서를 유지하기 위해 잠금을 그대로 둔다.
읽음 경로를 분리할 때는 현재 소속 확인, 탈퇴·삭제와의 경합, 마지막 순번과 미확인 수의
일관성을 함께 검증해야 한다. 읽음 요청 합치기는 여러 창과 재연결 때의 재시도까지 포함해 검토한다.
