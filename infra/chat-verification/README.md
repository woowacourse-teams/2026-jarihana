# 로컬 채팅 통합 검증

실제 PostgreSQL과 두 Spring 서버, 실제 production 프론트 빌드를 사용한다.
외부 서비스나 운영 DB에 연결하는 검증이 아니다. 고정 테스트 JWT 키와 합성 회원은 로컬 전용이다.
Node 24, Java 21, Docker, 설치된 frontend 의존성/Playwright Chromium이 필요하다.

## 준비

로컬 `jarihana-postgres` 컨테이너의 `jarihana` 사용자로 전용 DB `jarihana_chat_realtime`을 만든다.
이미 존재하면 재사용하며 다른 DB를 수정하지 않는다.

```sh
docker exec jarihana-postgres createdb -U jarihana jarihana_chat_realtime
cd backend
./gradlew bootJar
cd ../frontend
npm ci
npm run build
cd ..
cp backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar /tmp/jarihana-chat-verification.jar
```

실행 중인 jar를 다시 빌드해 덮어쓰면 지연 로딩하는 클래스가 손상될 수 있으므로 복사본을 실행한다.
두 터미널에서 아래 명령을 실행한다. 두 번째는 port 8096, origin 5177,
listener application name `jarihana-chat-listener-green`으로 바꾼다.

```sh
DB_URL=jdbc:postgresql://127.0.0.1:5432/jarihana_chat_realtime \
DB_USERNAME=jarihana DB_PASSWORD=jarihana \
ACCESS_TOKEN_SECRET=local-chat-verification-secret-not-for-production-20261025 \
GITHUB_OAUTH_CLIENT_ID=local-chat-fixture GITHUB_OAUTH_CLIENT_SECRET=local-chat-fixture \
AWS_EC2_METADATA_DISABLED=true FRONTEND_ORIGIN=http://127.0.0.1:5176 \
CHAT_ALLOWED_ORIGINS=http://127.0.0.1:5176,http://127.0.0.1:5177 \
CHAT_LISTENER_APPLICATION_NAME=jarihana-chat-listener-blue \
PUSH_ENABLED=false PUSH_WORKER_ENABLED=false SENTRY_BACKEND_DSN= \
java -Xmx384m -jar /tmp/jarihana-chat-verification.jar \
  --spring.profiles.active=local --server.port=8095 --spring.jpa.show-sql=false
```

첫 실행의 Flyway 완료 후 fixture를 넣는다. 회원 105명과 모임 10개를 만든다.
100명은 모든 검증 모임에 참여하며 나머지 회원은 권한 거절 확인용이다.

```sh
docker exec -i jarihana-postgres psql -U jarihana -d jarihana_chat_realtime \
  -v ON_ERROR_STOP=1 < infra/chat-verification/seed.sql
```

각각 별도 터미널에서 production 정적 파일과 HTTP/WS proxy를 실행한다.

```sh
CHAT_UI_PORT=5176 CHAT_BACKEND_PORT=8095 node infra/chat-verification/local-runtime.mjs
CHAT_UI_PORT=5177 CHAT_BACKEND_PORT=8096 node infra/chat-verification/local-runtime.mjs
```

이 서버는 loopback에만 바인딩한다. OAuth fixture 값은 로그인 기능용이 아니다.
브라우저 검증은 고정 키로 서명한 합성 회원 쿠키를 격리된 Playwright context에 넣는다.

## 실행

### 직접 채팅 테스트

현재 로컬 실행에서는 [테스트 계정 선택](http://localhost:5176/_preview/chat)을 연다.
일반 창에서 **하루**, 시크릿 창이나 다른 브라우저에서 같은 주소를 열어 **모아**를 선택한다.
같은 브라우저의 일반 창끼리는 쿠키를 공유하므로 서로 다른 계정으로 사용할 수 없다.
계정 선택 시 해당 창의 로그인 계정이 바뀌며, 1시간 후에는 선택 화면에서 다시 시작한다.

점심 모임, 리액트 스터디, 종료된 산책 모임을 준비한다. 두 테스트 계정과 실행 시점에
가입된 실제 회원을 세 모임에 참여시킨다. 종료된 산책 모임은 읽기 전용이다.
다음 seed는 전용 로컬 DB 이름을 검사하며 재실행해도 기존 메시지를 덮어쓰지 않는다.

```sh
docker exec -i jarihana-postgres psql -U jarihana -d jarihana_chat_realtime \
  -v ON_ERROR_STOP=1 < infra/chat-verification/demo-seed.sql
```

계정 선택은 로컬 프록시에서 명시적으로 켰을 때만 제공한다. 실행 중인 백엔드와 동일한
`ACCESS_TOKEN_SECRET`을 사용해야 한다. 저장소 루트에서 다음과 같이 실행한다.

```sh
set -a
source backend/.env
set +a
DB_URL=jdbc:postgresql://127.0.0.1:5432/jarihana_chat_realtime \
CHAT_DEMO_ENABLED=true CHAT_UI_PORT=5176 CHAT_BACKEND_PORT=8095 \
node infra/chat-verification/local-runtime.mjs
```

`localhost` 호스트와 위 전용 DB에서만 허용하며, 운영 모드에서는 활성화할 수 없다.
프로덕션 앱에 테스트 로그인 엔드포인트를 추가하지 않는다.
실제 두 계정 로그인·양방향 전송·새로고침 이력·종료 읽기 전용 검증:

```sh
node infra/chat-verification/demo-browser.mjs
```

### 자동 통합 검증

```sh
node infra/chat-verification/verify.mjs
node infra/chat-verification/browser.mjs
node infra/chat-verification/verify.mjs --load
CHAT_TEST_JAR=/tmp/jarihana-chat-verification.jar node infra/chat-verification/continuity.mjs
```

- `verify.mjs`: 두 서버/여러 창 전송, 비참여자 차단, 20개 동시 멱등 요청, 잘못된 구독·CSRF·SEND 거절,
  토큰 만료, 읽음 단조 증가, 100개 동시 쓰기와 커서 페이지, 종료 후 읽기와 삭제 전파.
  기존 모임 정책에 맞춰 새 종료 검증 모임의 생성일만 전용 DB에서 25시간 전으로 설정한다.
  삭제는 별도의 새 모임으로 검증한다. fixture 이름은 실행마다 달라 재실행할 수 있다.
- `browser.mjs`: 두 사용자 실제 전송, IME, 네트워크 실패 재전송, 오프라인 복구, 목록 너비 조절,
  underline 입력, 1440/768/360px, axe WCAG A/AA, 과거 이력 스크롤, 종료 읽기 전용과 로그아웃.
  먼저 기능 검증을 실행해야 한다. 이미지/로그는 `CHAT_EVIDENCE_DIR` 또는 임시 디렉터리에 저장한다.
- `--load`: 두 서버에 100개 소켓, 10개 모임, 초당 10건을 300초 보낸다. 저장된 3,000건과
  각 소켓 수신을 대조한다. 지연은 HTTP 저장 응답 완료부터 WS 수신까지이며 먼저 받은 이벤트는 0ms다.
  DB commit 시점 측정이나 운영 환경 성능 보증이 아니다. `CHAT_LOAD_SECONDS`로 시간을 바꿀 수 있다.
- `continuity.mjs`: 8097에 자체 서버를 만들고 해당 listener 연결만 강제 종료한다. 재연결의
  RESYNC와 REST 복구를 확인한다. 임시 nginx에서 실제 앱 Blue→Green 전환 중 100건을 보내며
  기존 소켓 유지, SIGTERM 정상 종료 코드 1001, 새 소켓/REST 병합과 재시작 후 영속성을 확인한다.
  종료 시 자신이 만든 서버·컨테이너만 정리한다. 기존 8095/8096 서버와 DB는 유지한다.

부하 시험 중에는 다른 검증이나 빌드를 겹치지 않는 것이 재현성에 좋다.
검증은 합성 메시지를 전용 DB에 남긴다. 전용 DB의 삭제는 사용자가 필요 없다고 판단한 뒤 별도로 한다.
`proxy-fixture.mjs`는 이 검증에서만 사용하는 임시 nginx 설정이다. 배포 구성은 [기존 배포 문서](../deploy/README.md)에서 관리한다.
