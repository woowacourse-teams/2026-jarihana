# 웹푸시 실행·배포·검증

구조와 선택 이유는 [백엔드 ADR 0015](../adr/0015-web-push-and-notification-inbox.md)와
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

실행 스크립트는 별도 PostgreSQL17 컨테이너·임시 VAPID/JWT 키·회원 두 명을 생성한다.
기존 `.env`의 DB와 인증값을 사용하지 않고 실제 Spring 서버와 동일 출처 API 프록시를 실행한다.
생성한 회원의 유효한 테스트 쿠키로 인증하며, GitHub OAuth 로그인은 이 검증 대상에 포함하지 않는다.
로컬 프로필이 스키마를 생성한다. 수동 SQL 적용·재적용·validate는 백엔드 테스트에서 따로 검증한다.
종료 시 직접 생성한 서버·DB·임시 키·Chrome 프로필을 정리한다.

기본 실행은 실제 업무 API의 알림 생성·읽음·삭제·클릭 경로·로그아웃과 PWA 파일 응답을 검증한다.
`--real-provider`는 임시 일반 Chrome 프로필에 알림 권한을 미리 허용하고 실제 구독을 만든다.
신청 사건을 외부 제공자에 전송해 SW가 받아 알림을 생성했는지 `getNotifications()`로 확인한 뒤
현재 브라우저 로그아웃·서버 구독 비활성·브라우저 구독 해제를 검증한다.
권한 팝업의 수동 선택과 OS 알림 센터에서 실제 클릭하는 동작은 이 자동화가 검증하지 않는다.

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
| `PUSH_VAPID_PUBLIC_KEY` | 빈 값 | 브라우저에 제공할 공개키 |
| `PUSH_VAPID_PRIVATE_KEY` | 빈 값 | 서버 서명용 비밀키. 저장소·로그에 남기지 않음 |
| `PUSH_VAPID_SUBJECT` | 빈 값 | `mailto:담당자주소` 또는 HTTPS 연락처 |
| `PUSH_ALLOWED_HOSTS` | `fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com` | 정확한 제공자 호스트 목록 |
| `PUSH_BATCH_SIZE` | `50` | 한 실행에서 처리할 최대 작업 수, 1~100 |
| `PUSH_POLL_DELAY` | `1000` | 실행이 끝난 뒤 다음 실행까지 기다리는 밀리초 |
| `PUSH_LEASE_DURATION` | `PT1M` | 워커 선점 유효기간 |
| `PUSH_REQUEST_TIMEOUT` | `PT10S` | 외부 HTTP 요청의 전체 제한시간 |
| `PUSH_CONNECT_TIMEOUT` | `PT5S` | DNS·TCP·TLS 연결 제한시간 |
| `PUSH_RETRY_DELAY` | `PT5S` | 재시도 간격의 시작값 |

DNS는 최대 두 건만 동시에 조회하고 기다리는 요청을 쌓지 않습니다. 공개 주소를 검사한 뒤 해당 주소에
연결하며, 원래 호스트의 TLS 인증서 검증을 유지합니다. redirect와 HTTP 클라이언트 자체 재시도는 끕니다.
선점 시간은 HTTP 제한시간과 연결 제한시간 두 번의 합보다 커야 하며, 네트워크 제한시간은 최소 1ms입니다.
비밀키·구독 endpoint·암호화 키·원격 응답 본문은 운영 로그에 남기지 않습니다.

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

알림 저장·알림함·브라우저 구독 API·푸시 워커·화면·Service Worker 연결을 구현했다.
알림함은 현재 모임 이름과 사건 내용을 표시하고, 알림을 클릭하면 본인 알림과 목적지 접근 가능 여부를
확인한 뒤 읽음 처리하고 사건별 관리 화면 또는 마이페이지의 해당 참여 모임·미승인 신청으로 이동한다. 승인·미승인은 모임 개별 조회가 필요 없다. 구체적인 동작 계약은 연결된 API·화면 문서를 따른다.

로컬 자동화에서 실제 Spring API·PostgreSQL과 PC Chrome의 외부 푸시 수신·브라우저 알림 생성·
현재 브라우저 로그아웃 해제를 확인했다. 이 결과가 모든 지원 환경과 실제 배포의 완료를 뜻하지는 않는다.
아래 항목은 아직 확인하지 않았다.

- Safari와 iPhone·iPad 홈 화면 앱의 구독·수신·로그아웃
- Chrome의 실제 권한 팝업 선택과 OS 알림 센터 클릭
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

완료 전 실행별 결과는 [검증 결과](../../../docs/verification/web-push-2026-10-05.md)에 기록한다.
검증 결과와 [구현 진행표](../../../docs/web-push-implementation.md)는 모든 구현·필수 검증이 끝났을 때 삭제한다.
