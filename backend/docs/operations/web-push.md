# 웹푸시 실행·배포·검증

구조와 선택 이유는 [백엔드 ADR 0015](../adr/0015-web-push-and-notification-inbox.md)와
[백엔드 ADR 0027 · 비동기 전송](../adr/0027-bounded-async-push-delivery.md),
[프론트엔드 ADR 0002](../../../frontend/docs/adr/0002-notification-inbox-and-service-worker.md),
API는 [알림함·웹푸시 계약](../context/api/endpoints/notifications.md), 화면 동작은
[프론트 연결 계약](../../../frontend/docs/IMPLEMENTATION_MAP.md#웹푸시알림함-구현)을 따른다.

## 로컬에서 재현하기

Node24, Java21, 실행 중인 Docker, 설치된 프론트 npm 의존성과 Playwright Chromium이 필요하다.
실제 외부 제공자 수신 검증에는 PC의 Google Chrome과 인터넷 연결도 필요하다.
`55436`(임시 PostgreSQL), `8086`(백엔드), `4176`(프론트) 포트가 비어 있어야 한다.

```bash
cd frontend
JAVA_HOME=/path/to/jdk-21 npm run test:push:local
# 실제 Chrome·외부 푸시 제공자 수신까지 확인
JAVA_HOME=/path/to/jdk-21 npm run test:push:local -- --real-provider
```

실행 스크립트는 별도 PostgreSQL17 컨테이너·임시 VAPID/JWT/초대 암호화 키·회원 세 명을 생성한다.
기존 `.env`의 DB와 인증값을 사용하지 않고 실제 Spring 서버와 동일 출처 API 프록시를 실행한다.
생성한 회원의 유효한 테스트 쿠키로 인증하며, GitHub OAuth 로그인은 이 검증 대상에 포함하지 않는다.
로컬 프로필이 스키마를 생성한다. 수동 SQL 적용·재적용·validate는 백엔드 테스트에서 따로 검증한다.
종료 시 직접 생성한 서버·DB·임시 키·Chrome 프로필을 정리한다.

기본 실행은 실제 업무 API의 알림 생성·읽음·삭제·클릭 경로·로그아웃과 PWA 파일 응답을 검증한다.
기본 실행에서는 전송 워커를 끄고 테스트용 구독으로 새 모임 알림의 수신 대상·알림함·상세 이동을 검증한다. 외부 푸시 제공자에는 전송하지 않는다.
`--real-provider`는 임시 일반 Chrome 프로필에 알림 권한을 미리 허용하고 실제 구독을 만든다.
신청 사건을 외부 제공자에 전송해 SW가 받아 알림을 생성했는지 `getNotifications()`로 확인한 뒤
현재 브라우저 로그아웃·서버 구독 비활성·브라우저 구독 해제를 검증한다.
기본 자동화는 권한 팝업의 수동 선택과 OS 알림 센터 클릭을 검증하지 않는다. 사용자가 알림을 직접 클릭하는 `WEB_PUSH_NATIVE_CLICK=1` 실행은 [초대 운영 가이드](invitations.md)를 따른다. 초대장 확인 뒤 임시 Chrome을 자동 종료한다.

생성한 JWT/VAPID 키와 endpoint를 출력·커밋하지 않는다. 실패 trace에는 테스트 쿠키가 포함될 수 있으므로
`frontend/test-results/`는 로컬 검증 산출물로 유지한다. 테스트 도중 강제 종료한 경우 직접 생성된
`jarihana-push-test-*` 컨테이너와 해당 실행의 임시 폴더만 확인해 정리한다.

## 실행 설정

기본값은 `PUSH_ENABLED=false`입니다. 활성화하려면 동일한 VAPID 키 쌍과 연락처를 환경 변수로 전달합니다.
공개키는 브라우저 구독에 사용하는 P-256 비압축 공개키 65바이트의 Base64URL 문자열이고,
비밀키는 P-256 개인 스칼라 32바이트의 Base64URL 문자열입니다. 패딩 없는 문자열을 권장합니다.
키 쌍이 일치하지 않거나 연락처가 잘못되면 기동을 거절합니다.

| 환경 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `PUSH_ENABLED` | `false` | 공개 설정·새 구독 등록·전송 활성화 |
| `PUSH_WORKER_ENABLED` | `true` | 활성화된 환경에서 자동 워커 실행 여부 |
| `PUSH_WORKER_START_PAUSED` | `false` | worker의 초기 상태를 대기로 설정. DB 제어 모드에서는 항상 대기로 시작 |
| `PUSH_WORKER_CONTROL_ENABLED` | `false` | DB 권한 제어 모드. 활성화하면 시작 대기 설정과 무관하게 PAUSED로 기동 |
| `PUSH_WORKER_HOST_ID` | 빈 값 | 제어 모드의 고정 호스트 ID. 예: `prod-a`, `prod-b` |
| `PUSH_WORKER_ENVIRONMENT` | 빈 값 | DB 권한을 공유할 환경 ID. prod A/B는 같은 `prod` 값 사용 |
| `PUSH_VAPID_PUBLIC_KEY` | 빈 값 | 브라우저에 제공할 공개키 |
| `PUSH_VAPID_PRIVATE_KEY` | 빈 값 | 서버 서명용 비밀키. 저장소·로그에 남기지 않음 |
| `PUSH_VAPID_SUBJECT` | 빈 값 | `mailto:담당자주소` 또는 HTTPS 연락처 |
| `PUSH_ALLOWED_HOSTS` | `fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com` | 정확한 제공자 호스트 목록 |
| `PUSH_BATCH_SIZE` | `50` | 한 번의 선점·전송 시작 루프가 처리할 최대 작업 수, 1~100. 동시에 50건을 미리 선점하지 않음 |
| `PUSH_POLL_DELAY` | `1000` | 실행이 끝난 뒤 다음 실행까지 기다리는 밀리초 |
| `PUSH_LEASE_DURATION` | `PT1M` | 워커 선점 유효기간 |
| `PUSH_REQUEST_TIMEOUT` | `PT10S` | 외부 HTTP 요청의 전체 제한시간 |
| `PUSH_CONNECT_TIMEOUT` | `PT5S` | DNS·TCP·TLS 연결 제한시간 |
| `PUSH_RETRY_DELAY` | `PT5S` | 재시도 간격의 시작값 |
| `PUSH_MAX_IN_FLIGHT` | `4` | 선점부터 개별 결과 저장까지 동시에 처리할 최대 작업 수 |
| `PUSH_HTTP_IO_THREADS` | `1` | 비동기 HTTP 이벤트 루프 스레드 수 |
| `PUSH_DNS_THREADS` | `2` | DNS·암호화 준비 스레드 수 |
| `PUSH_DNS_QUEUE_CAPACITY` | `4` | 준비 작업 대기열 상한 |
| `PUSH_HTTP_MAX_CONNECTIONS_PER_ROUTE` | `4` | 대상 route별 HTTP 연결 상한 |
| `PUSH_HTTP_MAX_CONNECTIONS` | `12` | 전체 HTTP 연결 상한. 필요한 연결만 생성 |
| `PUSH_HTTP_POOL_WAIT_TIMEOUT` | `PT1S` | 풀에서 연결을 기다리는 최대 시간 |
| `PUSH_HTTP_IDLE_TIMEOUT` | `PT1M` | 유휴 연결 정리 기준 |
| `PUSH_HTTP_CONNECTION_TTL` | `PT5M` | 연결 최대 수명 |
| `PUSH_SHUTDOWN_TIMEOUT` | `PT15S` | 새 선점을 멈춘 뒤 진행 중인 결과 저장을 기다리는 시간 |

`PUSH_WORKER_ENABLED=false`는 scheduler를 생성하지 않는 설정이고,
`PUSH_WORKER_START_PAUSED=true`는 worker가 호출되어도 새 작업을 선점하지 않게 한다.
앱 내부의 `WorkerAdmissionController`로 실행 중 pause/resume을 제어한다.
pause는 신규 처리 허가를 막고, 이미 허가한 작업을 중단시키지 않는다. 진행 중 허가가 있으면
`DRAINING`, 모두 반환되면 `PAUSED`이며, `DRAINING` 동안 resume은 거부한다.
worker는 빈 슬롯별 처리 허가를 확보한 뒤 그 수만큼 배치 선점하므로 다음 배치에도 중단을 반영한다.
시작 설정은 초기화에만 쓰므로 대기 후보도 재시작 없이 재개할 수 있다.

`drainStatus()`는 상태·진행 중 허가 수(`inFlight`)·불명확한 결과 수(`unresolved`)를 한 번에 조회한다.
`isDrained()`는 PAUSED이고 두 수가 모두 0일 때만 참이다. 작업 허가는 claim 직전부터
배치 prepare·비동기 외부 send·개별 finish 트랜잭션 커밋이 끝나 프록시 호출이 반환될 때까지 유지한다.
HTTP future가 완료되어도 결과 저장 executor의 finish가 끝나기 전에는 허가를 반환하지 않는다.
빈 조회·전송하지 않은 작업도 정상 반환되면 허가를 반환한다. 대기열이 비었다는 뜻은 아니다.

선점·준비·결과 저장 중 예외가 발생하면 `BLOCKED`로 전환하여 신규 처리와 resume을 차단한다.
finish 갱신이 0건일 때도 DB에 기존 취소가 확정되어 있으면 정상 종료하지만,
lease 만료·교체 등으로 결과 저장을 확인하지 못하면 차단한다.
다른 작업이 정상 완료하거나 pause를 반복해도 불명확한 결과를 지우지 않는다.
외부 전송 오류가 기존 정책대로 RETRY/FAILED로 정상 저장된 경우에는 차단하지 않는다.

차단 시 DB 작업 상태·lease와 발송 기록을 확인해야 한다. 현재 강제 해제 API는 없으며
배포 자동화는 이 상태를 성공으로 간주하거나 기존 EC2를 자동 중지해서는 안 된다.
로컬 BLOCKED·작업 개수는 메모리에만 있다. 재시작을 불명확한 결과의 해결로 취급하지 않는다.
제어 모드의 DB owner는 이전 boot ID를 유지하므로 새 프로세스가 대신 인계할 수 없다.
worker의 drain만으로 HTTP 요청까지 종료되었거나 EC2를 중지해도 된다는 뜻은 아니다.
A/B 처리 권한 제어는 아래 내부 서비스와 [관리 포트의 worker 제어 API](../../../infra/blue-green-deploy/controller/architecture.md#worker-제어-api)를 사용한다.
Actions·Compose 연동과 운영 적용 전 검증은 [인프라 ADR 0005](../../../infra/docs/adr/0005-nginx-ec2-blue-green-deployment.md)를 따른다.
기존 환경의 초기 기본 동작은 `false`로 유지한다.

### DB 기반 worker 처리 권한

`PUSH_WORKER_CONTROL_ENABLED=true`이면 host ID와 environment가 필수다.
두 값은 영문·숫자로 시작하고 영문·숫자·`_`·`-`로 구성한 1~64자여야 한다.
boot ID는 JVM 기동 시 새 UUID로 생성하며 파일이나 환경 변수에서 복원하지 않는다.
제어 모드에서는 일반 `resume()`으로 활성화할 수 없다.
제어 모드를 끈 기존 앱은 이 DB fencing을 사용하지 않으므로, 구형 앱과의 최초 이관은 별도 검토가 필요하다.

Flyway `V7__worker_authority.sql`의 `worker_authority`는 환경당 한 행을 둔다.
마이그레이션 적용과 이력 충돌 처리는 [DB 변경 규칙](../../../docs/database-changes.md)을 따른다.
이미 공유 환경에 적용한 파일은 수정하거나 다시 번호를 매기지 않는다.
배포 ID·epoch·phase·명령 revision과 worker owner(host/boot)·authority revision을 같은 행에 저장하여
배포 명령과 선점을 같은 행 잠금으로 직렬화한다. epoch와 authority revision은 별개다.
새 배포 시작·명령 deadline 만료가 정상 운영 중인 worker의 권한을 만료시키지는 않는다.

내부 `WorkerAuthorityService`의 정상 인계 순서는 다음과 같다. 자동화의 호출 계약은 [worker 제어 API](../../../infra/blue-green-deploy/controller/architecture.md#worker-제어-api)를 따른다.

```text
begin: 새 배포 PREPARE (기존 worker 권한 유지)
  → HANDOFF 단계
  → A pause: 신규 허가 차단 + DB owner를 DRAINING으로 표시
  → A의 로컬 작업 완료 확인
  → A release: 같은 host/boot의 PAUSED·inFlight0·unresolved0 확인 후 owner 반납
  → B activate: owner 없음·B 대기 확인 → DB 커밋 → B 로컬 활성화
  → OBSERVE → COMPLETE (B의 처리 권한은 유지)
```

초기 owner가 없을 때의 명시적 활성화도 지원하지만, legacy worker의 종료 확인을 대신하지 않는다.
명령은 deployment ID·epoch·command ID·대상 host/boot·expected phase·deadline·expected revision을 포함한다.
행 잠금을 얻은 뒤에도 deadline과 현재 상태를 확인한다. 같은 마지막 명령의 정확한 재요청은
부작용 없이 반환하고, 이전 revision/phase/epoch의 지연 요청은 거부한다.
활성화 재요청으로 pause를 취소하지 않으며 동일 command ID의 다른 내용도 거부한다.

실제 배치 `claimNext` 트랜잭션은 권한 행을 잠근 상태에서 owner host/boot·ACTIVE를 확인하고 작업을 선점한다.
외부 푸시 전송까지 이 행 잠금을 유지하지 않는다. A에서 이미 허가된 작업은 로컬 in-flight로 추적하므로
DB 신규 선점을 막았다는 사실만으로 B를 활성화하지 않는다. DB 전체 IN_FLIGHT 수를 A의 작업 수로 쓰지 않는다.

이전 프로세스가 사라지거나 BLOCKED여서 완료 증명을 얻지 못하면 owner를 자동 탈취하지 않는다.
재시작한 같은 호스트도 이전 boot를 대신해 pause/release할 수 없다. 미완료 배포를 시간 경과만으로
덮어쓰지 않는다. 배포 자동화는 불명확한 후보의 HTTP 트래픽만 이전 서버로 복구하고,
worker 재개는 보류한 채 GitHub Actions 실패 결과·실행 요약으로 확인을 요청한다.
현재 DB phase는 worker 인계를 위한 단계이며 Nginx 전환·15분 관찰·EC2 중지 자체를 실행하거나 증명하지 않는다.

DNS·암호화 준비는 기본 두 건, 대기열은 최대 네 건으로 제한합니다. JVM의 DNS 캐시를 그대로 사용하므로
조회 함수 호출이 매번 실제 DNS 통신을 뜻하지는 않습니다. 공개 주소를 검사한 뒤 해당 주소에
연결하며, 원래 호스트의 TLS 인증서 검증을 유지합니다. redirect와 HTTP 클라이언트 자체 재시도는 끕니다.
선점 시간은 HTTP 제한시간과 연결 제한시간 두 번의 합보다 커야 하며, 네트워크 제한시간은 최소 1ms입니다.
비밀키·구독 endpoint·암호화 키·원격 응답 본문은 운영 로그에 남기지 않습니다.

워커는 빈 슬롯만큼 선점·전송 준비를 배치 처리하고 HTTP 응답 대기를 겹칩니다.
`transport.send`는 future를 반환하며 호출자는 HTTP 응답을 기다리지 않습니다.
먼저 끝난 요청의 완료 콜백은 별도 결과 저장 executor에 개별 finish를 넘깁니다.
결과 저장 트랜잭션이 커밋된 뒤 해당 슬롯과 처리 허가를 반환하고 빈 슬롯을 바로 채웁니다.
I/O·DNS 스레드 외에 결과 저장(최대 2개)과 타이머·연결 관리 스레드가 있습니다.
제한시간 내 종료되지 못하거나 강제로 종료된 작업은 기존 lease 만료 후 복구합니다.
외부 수락 직후 DB 저장 전에 종료되면 중복 전송이 발생할 수 있습니다.

## 배포 설정

GitHub Environments `dev`, `prod`에 실행 설정과 같은 이름으로 값을 등록한다.
`PUSH_ENABLED`, `PUSH_WORKER_ENABLED`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_SUBJECT`는 Variables,
`PUSH_VAPID_PRIVATE_KEY`는 Secrets를 사용한다. 기본값과 값의 의미는 위 실행 설정 표를 따른다.
현재 workflow·Compose는 이 다섯 값을 연결한다. 나머지 실행 설정은 백엔드 기본값을 사용하며,
배포 환경에서 조정하려면 workflow·Compose의 환경 변수 연결도 함께 수정한다.

배포 workflow → Compose → 백엔드 환경 변수로 전달한다. 개인키는 프론트에 전달하지 않는다.
VAPID 키는 환경별로 유지하며 배포마다 새로 만들지 않는다. 공개키를 교체하면 기존 브라우저의
구독 키도 달라지므로 재연결 검증을 함께 해야 한다.

백엔드·프론트 배포 workflow는 독립적으로 실행된다. 최초 반영 전에 다음 순서를 맞춘다.

1. 대상 DB에서 [알림 SQL](../../db/migrations/2026-10-03-notification.sql)을 검토·적용한다. 공유·운영은 자동 적용하지 않는다. 기존 `member`를 참조하는 세 테이블·조회 인덱스·DB 제약을 추가하며 기존 업무 데이터는 수정하지 않는다. 이미 적용한 환경에서도 갱신된 SQL을 다시 적용해 구독 목록·구독별 미완료 작업 취소 인덱스를 추가할 수 있다.
2. 푸시가 비활성인 상태로 새 백엔드를 배포하고 스키마 validate와 기존 API를 확인한다.
3. 프론트와 PWA 파일을 배포하고 CDN 경로·응답 헤더를 확인한다.
4. VAPID 설정을 준비한 뒤 테스트 환경부터 푸시를 활성화해 구독·수신·로그아웃을 확인한다.

## 새 모임 등록 알림 배포

기존 알림 테이블이 준비된 DB에 [새 모임 사건 허용 SQL](../../db/migrations/2026-10-08-group-created-notification.sql)을 먼저 적용한다. 기존 알림·구독 데이터는 유지하고 `GROUP_CREATED` 사건을 CHECK 제약에 추가한다. 공유·운영 DB에는 자동 적용하지 않는다.
프론트와 SW를 먼저 배포·활성화한 뒤 백엔드를 배포한다. 이전 SW는 새 사건을 일반 안내로 표시하고, 이전 프론트는 모집 식별자가 없는 새 알림을 해석하지 못하므로 배포 후 기존 탭도 새로고침한다.
서로 다른 두 계정으로 한쪽에서 푸시를 켜고 다른 쪽에서 모임을 생성하여 수신·상세 이동을 확인한다. 모임 생성자와 구독 해제 회원은 수신 대상에서 제외된다.

## SW와 CDN 경로

프론트 workflow는 산출물을 확인한 뒤 기존 S3 sync를 수행하고, SW·manifest·아이콘을 별도 업로드해
Content-Type과 `no-cache, max-age=0, must-revalidate`를 지정한다. 파일 내용이 같아도 메타데이터를
갱신하기 위한 별도 업로드다. 실제 S3 업로드와 CloudFront 정책 변경은 로컬 검증이 수행하지 않는다.

| 경로 | 필요한 응답 |
| --- | --- |
| `/sw.js` | JavaScript, SPA HTML로 치환 금지, 장기 immutable 캐시 금지 |
| `/manifest.webmanifest` | `application/manifest+json` |
| `/icons/pwa-192.png`, `/icons/pwa-512.png` | `image/png` |
| `/notifications/open/:id` | 프론트 SPA 셸, 인증 복귀 경로 유지 |
| `/api/notifications/*`, `/api/push-subscriptions*`, `/api/push-config` | 백엔드 응답 유지, 인증 쿠키·쿼리와 변경 요청의 CSRF 헤더 전달, 공유 캐시 금지 |

CloudFront의 SW 캐시 정책은 Minimum TTL을 0으로 확인해야 한다. Minimum TTL이 양수이면 origin의
no-cache/no-store 헤더보다 우선할 수 있다. 초기 적용 시 기존 SW·manifest 캐시도 갱신해야 한다.
[AWS 캐시 정책 설명](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html)

기존 viewer-request 함수는 SW·정적 파일·API를 유지하고 알림 클릭 경로만 index.html로 연결한다.
이 동작은 저장소 함수 코드로 검증했다. 실제 배포판의 함수 연결·캐시 정책·응답은 별도 확인한다.
새 SW는 기존 탭을 닫은 후 활성화한다. 메시지 protocol과 IndexedDB 형식을 바꾸면 이전 탭·SW와의
호환성도 함께 검증한다.

## 구현과 검증 상태

지정 초대의 알림·전송 대기는 기존 커밋 전 기록과 워커를 재사용한다. 업무 내용은 사건 종류에 따라 groupId·invitationId를 제공하며 저장·조회·전송 참조의 버전은 1을 유지한다.
초대 알림의 DB 적용 순서·프론트/SW 연결과 배포 경계는 [초대 운영 가이드](invitations.md)를 따른다. 초대 작업에서 격리 서버와 임시 PC Chrome으로 INVITATION_RECEIVED의 실제 외부 수신·사건 ID·문구·로그아웃 해제를 별도로 확인했다. 사용자 수동 OS 알림 클릭 후 초대장·수락 버튼 표시도 통과했다. Safari/iOS 결과는 포함하지 않는다.

알림 저장·알림함·브라우저 구독 API·푸시 워커·화면·Service Worker 연결을 구현했다.
알림함은 현재 모임 이름과 사건 내용을 표시하고, 알림을 클릭하면 본인 알림과 목적지 접근 가능 여부를
확인한 뒤 읽음 처리하고 사건별 관리 화면 또는 마이페이지의 해당 참여 모임·미승인 신청으로 이동한다. 승인·미승인은 모임 개별 조회가 필요 없다. 구체적인 동작 계약은 연결된 API·화면 문서를 따른다.

로컬 자동화에서 실제 Spring API·PostgreSQL과 PC Chrome의 외부 푸시 수신·브라우저 알림 생성·
현재 브라우저 로그아웃 해제를 확인했다. 이 결과가 모든 지원 환경과 실제 배포의 완료를 뜻하지는 않는다.
아래 항목은 아직 확인하지 않았다.

- Safari와 iPhone·iPad 홈 화면 앱의 구독·수신·로그아웃
- Chrome의 실제 권한 팝업 선택과 초대 이외 사건의 OS 알림 센터 클릭
- 공유·운영 DB SQL 적용, GitHub 환경 값 등록, 실제 S3/CDN 응답과 배포 리허설

## 실기기에서 확인할 항목

PC Chrome 로컬 수신 결과를 Safari와 모바일 결과로 대신하지 않는다. 휴대폰은 PC의 localhost에
접속할 수 없으므로 접근 가능한 HTTPS 테스트 환경이 필요하다. iPhone·iPad는 홈 화면에 추가한 앱에서
권한을 요청한다. [WebKit 설명](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

- 권한 허용·거절 후 안내, 푸시 켜기·끄기와 브라우저별 독립 구독
- 앱을 닫은 상태의 수신, OS 알림 클릭 후 로그인 복귀·관련 화면 이동
- 로그아웃·다른 계정 로그인 뒤 이전 상세 내용 미표시, 다른 브라우저 구독 유지
- 삭제되거나 권한이 바뀐 대상의 안전한 안내, 전체 읽음 유지·삭제 성공 시 퇴장
- SW 업데이트 후 구독 상태 확인, 배포 파일의 실제 MIME·캐시 헤더

## 장애 확인과 일시 중단

`jarihana.push.requests` 카운터는 외부 요청 결과를 `ACCEPTED`, `RETRY`, `GONE`, `FAILED`로 구분합니다.
`jarihana.push.request.duration`은 DNS·암호화 준비를 포함한 전송 완료까지의 시간이며 결과 저장 시간은 제외합니다.
`jarihana.push.inflight`는 선점·준비·전송·결과 저장 중인 작업 수입니다. 요청시간의 count/sum과
전송 결과 카운터는 저장 완료 여부와 구별해서 읽습니다. 배포 후 동일 대상 수·제공자 분포에서 처리량,
생성부터 수락까지 지연, 요청시간, 재시도율과 DB 쿼리 수·시간을 비교할 예정입니다.
외부 수락은 실제 기기 표시·사용자 읽음과 다릅니다. `push.request.failed` 로그에는 전송 작업 ID와
제한된 오류 코드만, `push.worker.failed`에는 예외 타입만 남깁니다. 재시도·만료 선점이 쌓이는지는
다음 조회로 확인할 수 있습니다. DB 연결의 시간대와 무관하게 서버의 서울 기준 시각과 비교합니다.
개인 수신 주소·키를 조회하는 쿼리는 운영 확인에 필요하지 않습니다.

```sql
SELECT status, count(*) FROM notification_deliveries GROUP BY status;
SELECT count(*) FROM notification_deliveries
WHERE status IN ('PENDING', 'RETRY') AND next_attempt_at <= timezone('Asia/Seoul', now());
SELECT count(*) FROM notification_deliveries
WHERE status = 'IN_FLIGHT' AND locked_until <= timezone('Asia/Seoul', now());
```

전송 대기의 유효기간은 `jarihana.notification.delivery-ttl`로 설정하며 기본값은 24시간이다.
유효기간과 선점 만료를 함께 확인한다. 쿠키·알림 본문도 로그와 장애 공유 자료에 포함하지 않는다.

외부 전송만 잠시 멈추려면 `PUSH_WORKER_ENABLED=false`로 재배포한다. 이때 기존 대기는 유효기간 안에서
재개 후 처리될 수 있다. 새 푸시 사용까지 중단하려면 `PUSH_ENABLED=false`로 재배포한다.
워커 중단이나 기능 비활성은 모든 기존 브라우저 구독을 삭제하는 동작이 아니며 알림함은 유지한다.

초대 사건의 상태 변경·모임 삭제와 미완료 전송 취소, DB 적용 순서는 [초대 운영 가이드](invitations.md)를 따른다. 모임 삭제 뒤에도 수신자의 알림함은 유지하며 알림 클릭 시 현재 초대의 부재를 확인한다. 외부 제공자 수락·실제 OS 수신/클릭은 서버 대역 테스트나 Chromium의 SW 검증과 구분해 기록한다.
