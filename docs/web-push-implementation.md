# 웹푸시·알림함 구현 단계

관련 결정: [백엔드 ADR 0015](../backend/docs/adr/0015-web-push-and-notification-inbox.md).
기능은 아래 순서로 구현한다. **각 단계의 변경과 검증을 마친 뒤 사용자에게 커밋 허락을 받고,
커밋한 다음 다음 단계로 넘어간다.** 커밋 승인은 그 단계에만 적용한다.

이 문서는 구현 중 사용하는 진행표다. **6단계 구현·검증과 결과 기록을 마치면 이 파일을 삭제한다.**
삭제할 때 이 파일로 연결된 ADR 등 문서의 링크도 함께 제거한다. 팀이 계속 참고할 구조·결정 이유와
DB·API·화면 계약은 ADR과 각 상세 문서에 남긴다. 최종 검증 결과는 별도 결과 기록에 남기며,
단계별 작업·검증 이력은 도메인 모델 문서에 넣지 않는다.

| 단계 | 범위 | 완료 증거 | 커밋 제목 |
| --- | --- | --- | --- |
| 1 | ADR, DB 모델, Markdown API 계약, 화면 연결 계약 | 문서 링크·내부 참조·API 계약 일치 확인. 아직 구현되지 않은 계약 명시 | `docs(notification): 웹푸시와 알림함 구현 계약을 정리한다` |
| 2 | 알림함·구독·전송 대기 엔티티, Repository, SQL 마이그레이션 | 도메인 테스트, DB 제약·중복·조회 통합 테스트, SQL 적용 후 validate, truncate 격리 | `feat(notification): 알림과 구독별 전송 데이터 모델을 추가한다` |
| 3 | 기존 업무 사건 발행, 동기 저장, 알림함 조회·읽음·삭제 API | 기존 정책 회귀, 동일 TX rollback, 구독0개 기록, RestAssured, 전체읽음/삭제 경합 | `feat(notification): 업무 알림과 알림함 API를 구현한다` |
| 4 | 구독 API, 현재 브라우저 로그아웃 연결 해제, 푸시 워커·외부 어댑터 | 소유권·CSRF·expired-access logout, 선점·lease·부분 실패·재시도 상한, Java21 연동 | `feat(push): 브라우저 구독과 푸시 전송 워커를 구현한다` |
| 5 | 종 버튼·알림함 UI, 읽음·삭제, 이 기기 설정, 설치 안내·SW·클릭 복귀 | lint, 관련 Jest, build, 직접 브라우저·키보드·접근성·모션·계정 전환 확인 | `feat(push): 알림함 UI와 PWA 웹푸시를 연결한다` |
| 6 | 전체 회귀, 실기기, SQL·CDN·SW 배포 경로, 운영 설정·관측 문서, 완료 후 진행표·참조 링크 삭제 | backend 전체 test, frontend lint/typecheck/test/build/core e2e, 지원 환경 실제 수신·클릭, 배포 리허설, 결과 기록·문서 링크 검증 | `test(push): 웹푸시 통합 동작과 배포 경로를 검증한다` |

## 현재 진행 상태

- 1단계: 완료, `7fb90d7a` 커밋.
- 2단계: 완료, `53bb4c13` 커밋. 전체 백엔드 테스트 468건 통과(새 테스트 30건).
  SQL 직접 적용 후 validate·DB 제약·인덱스·truncate 격리도 확인했다.
  상세 결과는 아래 [2단계 구현과 검증](#2단계-구현과-검증)에 기록했다.
- 3단계: 완료, `307ce947` 커밋. 전체 백엔드 테스트 532건 통과(이번 단계 새 테스트 64건).
  상세 결과는 아래 [3단계 구현과 검증](#3단계-구현과-검증)에 기록했다.
- 4단계: 완료, `61b50973` 커밋. 전체 백엔드 테스트 624건 통과(이번 단계 새 테스트 92건).
  상세 결과는 아래 [4단계 구현과 검증](#4단계-구현과-검증)에 기록했다.
- 5단계: 구현·검증 완료, 사용자 커밋 승인 완료. Jest 618건·핵심 브라우저 테스트 19건 통과.
- 6단계: 대기. 실제 제공자·실기기·배포와 전체 회귀 결과를 확인한다.

## 2단계 구현과 검증

- 엔티티는 기존 불변 모델을 따라 읽음·삭제·구독 해제·재연결·전송 취소 시 새 객체를 반환한다.
- 알림 payload는 업무 식별자와 `reasonCode`만 가진 값 객체를 JSONB에 저장한다. 새 알림은 버전 1이며,
  읽음·삭제는 저장된 payload 버전을 유지한다.
- 사건 재처리는 `INSERT ... ON CONFLICT DO NOTHING`의 삽입 건수로 새 알림 생성 여부를 구분한다.
  충돌로 트랜잭션을 실패시키지 않으며 기존 행은 삭제 여부와 무관하게 의미키·회원으로 찾는다.
- 구독 키는 Base64URL 디코딩 길이와 P-256 공개키 점을 검증한다. padding 차이는 같은 키로 취급한다.
  endpoint 원문은 유지하고 UTF-8 바이트 길이와 HTTPS 주소 형식을 검사한다.
  허용 push 서비스 호스트·내부 주소·redirect 검증은 4단계 외부 전송 경계에서 연결한다.
- [수동 SQL](../backend/db/migrations/2026-10-03-notification.sql)은 세 테이블과 유일키·외래키·CHECK·partial index를 추가한다.
  애플리케이션이 자동 적용하지 않으므로 공유 개발·운영 배포 전에 별도로 적용한다.
- [Repository 통합 테스트](../backend/src/test/java/com/project/jarihana/notification/repository/NotificationPersistenceTest.java)는
  PostgreSQL 17에서 중복·동시 등록·회원별 커서 조회·구독 버전 복사·롤백·공통 truncate 격리를 검증한다.
- [SQL 검증 테스트](../backend/src/test/java/com/project/jarihana/notification/repository/NotificationSchemaMigrationTest.java)는
  같은 테스트 DB의 별도 스키마에서 새 테이블을 제거하고 SQL을 직접 적용한 뒤 Hibernate `validate`를 실행한다.
  CHECK·외래키·유일키·인덱스는 별도의 실제 DB 쓰기와 카탈로그 조회로 확인한다.
  테스트 스키마는 종료 시 제거하며 공유 개발·운영 DB는 사용하지 않는다.
- 전송을 시도하기 전에 유효기간이 끝난 작업도 `FAILED`로 종료할 수 있도록 시도 횟수 0을 허용한다.
  기존 실패 횟수 1~5는 유지하며, 음수·6회 이상과 전송 중·수락 상태의 시도 횟수 0은 계속 거절한다.

2026-10-03 검증: `backend/`에서 `./gradlew test`를 실행해 전체 468건이 통과했다
(실패·오류·생략 0건). 이 중 새 도메인·Repository·SQL 검증은 30건이다.
수동 SQL 검증은 테스트 DB에서 수행했으며 공유 개발·운영 DB 적용과 실제 푸시 수신은 아직 수행하지 않았다.

## 3단계 구현과 검증

- 신청 생성·수동 결정·재모집·그룹 종료 서비스가 실제 업무 변경 뒤 값으로 구성한 신청 사건을 발행한다.
  사건에는 영속 엔티티·신청 본문·미승인 사유 문장을 담지 않는다.
- 동기 BEFORE_COMMIT 리스너가 알림과 당시 활성 구독별 전송 대기를 같은 TX에 기록한다.
  중복 사건은 유일키 충돌을 정상 처리하고 삭제한 알림을 복원하거나 과거 전송을 추가하지 않는다.
  전송 대기의 유효기간은 `jarihana.notification.delivery-ttl`이며 기본값은 24시간이다.
- 알림함 API 6개를 구현했다. 목록·개별 조회·안 읽은 수·개별 읽음·전체 읽음·삭제이며,
  인증 회원 소유권, 존재하는 가입 회원, CSRF, 커서·size·식별자와 no-store 응답을 검증한다.
- 개별 읽음·삭제는 기존 상태를 조건으로 UPDATE한다. 최초 읽은 시각을 보존하고 삭제한 행을 복원하지 않는다.
  전체 읽음은 단일 PostgreSQL UPDATE의 statement snapshot을 기준으로 처리한다.
  삭제는 같은 TX에서 미완료 전송을 취소하고 선점 정보를 정리하며 완료된 전송 상태는 유지한다.
- [업무 알림 통합 테스트](../backend/src/test/java/com/project/jarihana/notification/NotificationBusinessEventTest.java)는
  실제 신청·결정·재모집·종료의 수신자, 구독0개·활성 구독 선택, 정원 마감 시 대기 신청 유지,
  알림/전송 저장 실패 시 업무 롤백과 원 업무 데이터 삭제 후 알림 보존을 확인한다.
- [사건 리스너 테스트](../backend/src/test/java/com/project/jarihana/notification/NotificationEventListenerTest.java)는
  동일 TX의 커밋 전 처리, 트랜잭션 밖/롤백 사건 무시, 동시 중복과 삭제 후 재처리,
  구독 generation 복사와 뒤늦은 구독의 과거 전송 미생성을 확인한다.
- [RestAssured 인수 테스트](../backend/src/test/java/com/project/jarihana/notification/NotificationInboxAcceptanceTest.java)는
  실제 HTTP로 6개 API의 응답·소유권·인증·CSRF·커서·읽음·삭제와 전송 상태별 취소를 확인한다.
- [동시 처리 테스트](../backend/src/test/java/com/project/jarihana/notification/NotificationConcurrencyTest.java)는
  실제 PostgreSQL 행 잠금과 커밋 순서를 제어한다. 전체 읽음 시작 뒤 커밋된 낮은 ID/새 알림은 미읽음으로 남고,
  개별·전체 읽음과 삭제가 어느 순서로 경합해도 삭제 상태를 되돌리지 않는다.
- [내부 사건 오류 인수 테스트](../backend/src/test/java/com/project/jarihana/notification/NotificationEventFailureAcceptanceTest.java)는
  대기 신청을 결정 사건으로 처리하는 서버 오류를 팩토리·리스너에서 각각 재현한다.
  `IllegalStateException`으로 500을 반환하고 업무 변경·알림·전송 기록이 함께 롤백되는지 확인한다.

2026-10-03 검증: `backend/`에서 `./gradlew test`를 실행해 전체 532건이 통과했다
(실패·오류·생략 0건). 이번 단계 새 테스트는 업무 10건, 리스너 4건, API 43건, 동시 처리 5건, 내부 오류 2건이다.
브라우저 구독 API·푸시 내용 조회·로그아웃 확장·외부 푸시 전송과 알림함 UI는 후속 단계에서 구현한다.

## 4단계 구현과 검증

- 구독 공개 설정·목록·등록·해제와 푸시 내용 조회 API 5개를 구현했다. 소유권·CSRF·no-store,
  UTF-8 주소 길이·허용 호스트·암호화 키·커서·필수 값과 비활성 기능 응답을 실제 HTTP로 확인했다.
- 동일 회원의 동시 구독 등록은 행 한 개·동일 버전으로 끝난다. 다른 회원의 동시 등록은 한 회원만
  성공하며 나머지는 409다. 키 교체·해제·재연결은 버전을 증가시키고 과거 연결의 미완료 작업을 취소한다.
- 선택적 JSON 로그아웃 본문으로 현재 브라우저만 해제한다. 기존 빈 본문·가입 세션·만료된 Access Token과
  저장된 만료 Refresh Token의 로그아웃 의미를 유지한다. 소유권·버전·Access/Refresh 회원 불일치를 검증하고,
  실제 DB 취소 오류를 발생시켜 구독·전송·Refresh Token이 함께 롤백되는지 확인했다.
- 워커는 한 작업씩 SKIP LOCKED로 선점한다. 선점·전송 준비·결과 반영은 짧은 TX이며 HTTP는 TX 밖이다.
  만료 lease 복구, 부분 실패, 최초 포함 5회 상한, 유효기간, Retry-After와 404/410 구독 해제를 검증했다.
- 실제 PostgreSQL 행 잠금과 두 워커를 사용해 선점 중복과 잠긴 작업 건너뛰기를 확인했다.
  전송 중 알림 삭제·로그아웃·키 교체, lease 교체 후 늦은 응답이 취소·새 연결·새 담당자의 결과를 덮어쓰지 않는다.
- Java 21에서 로컬 HTTP 서버가 받은 암호문을 브라우저 테스트 키로 복호화하고 VAPID 서명을 확인했다.
  실제 제공자 주소를 로컬 fixture로 연결하는 부분은 테스트 경계이며 실제 제공자 인증 성공을 뜻하지 않는다.
- 허용 호스트·공개 DNS 주소·실제 연결 주소 고정·redirect 차단·전체 HTTP 제한시간을 검증했다.
  느리게 헤더를 보내는 서버의 절대 제한시간과 취소에 반응하지 않는 DNS 작업의 동시 수 제한도 재현했다.
- SQL 직접 적용·재적용과 validate를 확인했다. 1만 건 fixture의 PostgreSQL EXPLAIN에서 구독 목록과
  구독별 미완료 전송 취소가 새 인덱스를 사용하는지 확인했다. 실제 운영 DB에는 적용하지 않았다.
- 자동 실행은 기능과 워커가 모두 활성일 때만 켜진다. 실패한 실행 뒤에도 다음 실행을 계속하며,
  요청 결과 카운터와 민감값을 제외한 실패 로그를 남긴다. 환경 변수는 백엔드 README와 `.env.example`에 기록했다.

2026-10-05 검증: `backend/`에서 `./gradlew test`로 전체 624건 통과(실패·오류·생략 0건).
새 테스트는 API 37건, 동시 구독 2건, 워커·경합 15건, 암호화·HTTP·DNS 33건, 설정·스케줄 5건이다.
큰 Retry-After도 임의로 줄이지 않으며, 남은 유효기간과 먼저 비교해 날짜 overflow 없이 실패로 종료한다.
독립 코드 리뷰 APPROVE, 구조 리뷰 CLEAR를 확인했다. 실제 Push Service 수락·브라우저 수신·클릭·화면·배포는
5~6단계에서 확인한다. 4단계 커밋은 사용자 승인을 받았다.

## 5단계 구현과 검증

- 프로필 옆 종 버튼·공통 Drawer·`/notifications` 페이지와 안 읽은 수 표시를 연결했다.
- 전체 읽음은 서버 결과를 재조회하고 행을 유지한다. 삭제는 성공 뒤에만 슬라이드하며 실패하면 행을 유지한다.
  키보드 삭제 후 다음 항목·마지막 항목의 빈 상태, reduced-motion과 정상 모션을 확인했다.
- 회원 ID·세션 버전별 조회 캐시와 AbortSignal을 연결하고 계정 변경·로그아웃 때 이전 조회를 정리했다.
- 명시적인 푸시 켜기·끄기, 권한 거절·미지원·서버 비활성·설치 안내와 실패 재시도를 제공한다.
- SW·192/512 아이콘·manifest를 배포 산출물에 포함했다. SW는 IDB의 연결 버전과 활성 상태를 조회 전후에
  확인하고 비공개 내용 조회 실패 시 일반 안내를 표시한다. 앱·API·알림 본문을 오프라인 캐시하지 않는다.
- 로그아웃은 SW 중단 응답 뒤 서버 요청을 보내고 실패 시 로그인 상태를 유지한다. 구독 generation 경합 시
  소유 구독 목록으로 현재 버전을 확인해 재시도한다. 구독 교체도 먼저 중단한 뒤 새 연결을 등록한다.
- 알림 클릭은 인증 복귀·대상 조회·읽음 처리 후 내부 화면으로 이동한다. 403/404는 읽음 처리하지 않고 안내한다.
- [프론트엔드 ADR 0002](../frontend/docs/adr/0002-notification-inbox-and-service-worker.md)에 구조와 이유를 기록했다.

2026-10-05 Node24.19.0 검증: `frontend/`에서 lint·typecheck(ESLint warnings=0), Jest 59개 suite/618건,
production build와 Chromium 핵심 브라우저 테스트 19건 통과. 이번 단계 알림함·푸시 브라우저 테스트는 10건이다.
360/768/1440px 화면·키보드 포커스·overflow·페이지/Drawer axe 접근성과 실제 SW 등록·IndexedDB·다른 탭
중단·새로고침 후 상태 유지·늦은 연결 거절을 확인했다. SW push 이벤트와 로그아웃 경합은 Jest fixture로 재현했다.

전체 브라우저 테스트는 변경 중간 시점 50건 중 40건 통과·10건 실패했다. 변경 이전 `61b50973`를
별도 임시 디렉터리에서 같은 Node24/Chromium으로 실행해 기존 43건 중 33건 통과·같은 10건 실패를 재현했다.
기존 모집 이력 텍스트·모집 기간 UI selector·홈 탐색 테스트의 실패이며 이번 변경과 분리해 남긴다.
빌드는 기존 큰 asset/entrypoint 경고가 남는다. React Doctor는 오류 0·경고 109건이며 성능 점수를 확인한 것은 아니다.
실제 Push Service 전송·Chrome/Safari 실기기 수신·홈 화면 앱·운영 배포는 6단계에 남긴다.
5단계 커밋은 사용자 승인을 받았다. push·운영 DB 적용·배포는 하지 않았다. 진행표는 6단계 완료 후 삭제한다.

## 고정 동작

- 기존 코드가 실제 수행하는 신청·승인·미승인만 알린다. 정원 마감 때 대기 신청을 유지한다.
- 푸시 구독이 없어도 알림함에 저장한다. 같은 사건은 수신 회원당 한 건이다.
- 모든 활성 브라우저 구독에 각각 전송한다. 부분 실패는 실패한 구독만 제한적으로 재시도한다.
- 전체 읽음은 목록을 유지한다. 삭제 성공 때만 해당 행이 슬라이드 퇴장한다.
- 알림 조회·변경·푸시 클릭은 서버에서 현재 회원의 소유권을 확인한다.
- 알림과 업무·전송 대기는 같은 TX에 저장하고, 외부 HTTP는 커밋 뒤 수행한다.
- 실제 Push Service 수락·기기 표시·사용자 읽음을 서로 다른 상태로 취급한다.

## 실행과 검증 경계

백엔드는 기존 Java21·Spring·PostgreSQL과 TDD/RestAssured/Testcontainers 규칙을 따른다.
프론트는 기존 JS/JSX·React·Webpack·공통 API client를 사용하고 별도 에이전트 QA를 하지 않는다.
Markdown API 계약을 Controller·요청/응답 DTO·ErrorCode에 반영하고, 해당 API의
RestAssured 테스트와 함께 이 기능 PR에서 완성한다.

테스트 환경의 create-drop과 실제 운영 SQL 적용은 각각 검증한다. 현재 수동 SQL 적용 방식을
유지하며, 배포는 additive SQL → 호환 backend → frontend 순서로 리허설한다.
운영 배포·병합·push는 단계 커밋 허락과 별개의 요청이다.

실기기·외부 push·운영 자격 증명이 없는 검증은 미검증으로 남긴다.
그 항목을 mock 테스트로 통과했다고 표시하거나 전체 기능 완료로 보고하지 않는다.

## 계약 문서

- [알림·구독·전송 모델](../backend/docs/context/domain/model/notification.md)
- [알림함·웹푸시 API](../backend/docs/context/api/endpoints/notifications.md)
- [프론트 연결 계약](../frontend/docs/IMPLEMENTATION_MAP.md#웹푸시알림함-구현)
