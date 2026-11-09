# 오목 게임방 채팅 운영

## 활성화

기본값은 `GOMOKU_CHAT_ENABLED=false`다. 프론트엔드는 비활성 응답을 받으면 패널을 숨긴다.
기존 모임 채팅과 WebSocket 설정에는 영향을 주지 않는다.

1. V21 스키마와 새 백엔드를 채팅 비활성으로 배포한다. 스키마는 신규 테이블과 기본값이 있는 좌석 컬럼만 추가한다. 기존 좌석에는 새 회차 UUID와 입장 순번 0을 부여한다.
2. 구버전 앱과 연결 drain이 모두 끝나고, 현재 앱이 모든 생성/입장에서 참가 회차와 시작 순번을 기록하는지 확인한다.
3. 새 프론트엔드를 배포한다. dev에서 두 계정으로 방 생성, 교체 입장, 재접속과 종료를 확인한다.
4. 대상 GitHub Environment의 `GOMOKU_CHAT_ENABLED`를 `true`로 설정해 백엔드를 재배포한다. 활성화 배포 중에는 직전 서버도 새 참가 회차 기록을 지원하는 버전이어야 한다.

dev Compose, 기존 prod Compose와 Blue-Green 앱 Compose가 이 변수를 전달한다. Blue-Green은 고정 `BLUE_GREEN_CONTROL_REF`의 제어 파일을 사용하므로 해당 릴리스에 새 Compose/변수 전달이 포함되어 있어야 한다. 이 코드 변경만으로 현재 고정 제어 릴리스를 갱신하지 않는다.
로컬은 `backend/.env`에 true를 설정한 뒤 기존 실행 절차로 재시작한다. 비활성 중에도 참가 회차는 계속 기록한다.

## 확인

- 두 계정이 다른 서버에 연결되어도 대화를 받고, 새로고침으로 누락분을 복구하는지 확인한다.
- 대기 손님 교체 시 남아 있는 방장은 과거 대화를 유지하고 새 손님에게는 입장 이후만 보이는지 확인한다.
- 채팅 전송 전후 판 revision/turnDeadline과 착수 흐름이 유지되는지 확인한다.
- 종료 시 `gomoku_chat_message`의 해당 room_id 행이 없어지는지 확인한다. 조회와 재시도로 활동 시각이 연장되지 않는지도 확인한다.
- HTTP 실패와 SSE 재연결은 기존 지표/오류 로그로 확인한다. 본문, 작성자 이름, UUID/쿠키를 추가 로그나 분석 이벤트로 보내지 않는다.

## 비활성화와 롤백

문제 발생 시 flag를 false로 재배포한다. 기존 연결은 배포 시 재연결하고 클라이언트는 비활성 응답에 따라 패널을 숨긴다. 실행 중 서버의 flag를 즉시 갱신하는 관리 API는 제공하지 않는다.
신규 테이블과 컬럼은 롤백 시에도 유지한다. 구버전 앱으로 롤백하기 전에는 채팅을 먼저 비활성화한다. 구버전은 방 종료 시 채팅 삭제를 알지 못하므로, 롤백 기간에 종료된 방의 남은 본문은 새 버전을 복구한 뒤 아래 쿼리로 확인하고 정리한다.

```sql
SELECT count(*)
FROM gomoku_chat_message m
JOIN gomoku_room r ON r.id = m.room_id
WHERE r.status = 'CLOSED';

DELETE FROM gomoku_chat_message m
USING gomoku_room r
WHERE r.id = m.room_id AND r.status = 'CLOSED';
```

방이 열려 있는 동안의 복구용 보관이다. 방 종료 후 조회와 채팅 백업 복원 기능은 제공하지 않는다. 애플리케이션 테이블의 물리 삭제가 DB 백업의 즉시 삭제를 의미하지는 않는다.

## 검증 명령

백엔드 디렉터리에서 `./gradlew test --no-daemon`과 `./gradlew gomokuCutoverTest --no-daemon`을 실행한다. 후자는 실제 두 앱 JVM, PostgreSQL과 Nginx를 사용하며 Docker가 필요하다.
프론트엔드는 `npm run lint`, `npm test`, `npm run build`, `npx playwright test tests/e2e/gomoku-chat.spec.js tests/e2e/gomoku.spec.js --workers=2`를 사용한다.
Playwright의 OAuth/API/SSE는 fixture이며, 실서버 두 계정 OAuth와 운영 프록시 검증을 대체하지 않는다.
