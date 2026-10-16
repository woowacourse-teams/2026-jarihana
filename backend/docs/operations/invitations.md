# 초대 실행·배포·검증

> 상태: 저장·발급·조회·취소·수락·삭제와 프론트 연결을 로컬 PostgreSQL·HTTP·브라우저에서 검증했다.
> 실제 PC Chrome의 초대 푸시 수신과 사용자의 OS 알림 클릭 후 초대장 이동을 확인했다. Safari/iOS 실기기·공유/운영 환경 적용은 미검증이다.

API는 [초대 계약](../context/api/endpoints/invitations.md)과
[초대 알림 응답](../context/api/endpoints/notifications.md#초대-알림-응답-확장-계약),
화면은 [프론트 연결 계약](../../../frontend/docs/IMPLEMENTATION_MAP.md#초대-기능-설계-계약)을 따른다.
기존 푸시 설정·전송 운영은 [웹푸시 운영 가이드](web-push.md)를 따른다.

## 로컬에서 재현하기

Java 21과 실행 중인 Docker가 필요하다. 백엔드에서 다음 명령을 실행한다.

```bash
./gradlew test --tests '*Invitation*Test' --tests '*RegistrationTest' --tests '*RegistrationCommandServiceTest'
# 초대 출처와 일반 모집의 정원·조회 회귀
./gradlew test --tests '*RecruitmentCapacityIntegrationTest'
# 발급·검색·수신·재시도·암복호화·알림·전송 실패·증분 DDL
./gradlew test --tests '*Invitation*Test' --tests '*Notification*Test' --tests '*PushDeliveryWorkerTest'
# 상세·목록·공개 미리보기·수락·대기 신청 연결·동시 승인/수락/취소/종료·롤백
./gradlew test --tests '*InvitationIssuanceAcceptanceTest' --tests '*InvitationTest' --tests '*InvitationStatusTest'
```

PostgreSQL 17 Testcontainers에서 저장 유일성과 실제 수동 DDL을 확인한다.
마이그레이션 테스트는 격리 스키마에 기존 신청 세 상태의 데이터를 복사하고 새 테이블·승인 출처가 없는 상태에서
DDL 적용·기존 승인 보존·기본값·제약·재적용·Hibernate validate를 검증한다.

## 저장 DDL 적용 순서

모델 선택은 [ADR 0018](../adr/0018-separate-invitation-acceptance-history.md), 실제 SQL은
[통합 초대 마이그레이션](../../db/migrations/2026-10-11-invitation.sql)을 따른다.
운영 프로필은 validate이므로 스키마 변경 후 애플리케이션을 배포한다.

아직 공유·운영 DB에 적용하지 않은 초대 마이그레이션 6개를 최초 배포용 파일 하나로 통합했다.
기존 웹푸시·새 모임 알림 DDL은 별도로 유지한다. 실제 배포 이후의 스키마 변경은 새 증분 파일로 추가한다.

1. 대상 DB·백업을 확인하고 기존 신청의 상태별 개수와 모집별 APPROVED 개수를 기록한다.
2. 기존 스키마와 SQL의 전제가 맞는지 확인한다. 많은 신청을 보정하는 작업은 테이블 잠금을 고려해 적용 시간을 정한다.
3. 저장소 루트에서 대상 DB 연결 변수를 설정하고 아래 명령으로 수동 적용한다.
4. 상태별 데이터와 기존 승인 집계를 비교하고 새 모델의 validate 기동을 확인한다.

```bash
psql "$INVITATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/2026-10-11-invitation.sql
```

연결 값은 로그·검증 자료에 기록하지 않는다. 신청 출처·버전·초대/수락 테이블·상태·공유 링크 보정·알림 제약을 하나의 트랜잭션으로 적용하며, 중간 실패 시 전체를 롤백한다.
기존 신청의 null 출처만 RECRUITMENT로 보정한다. DB 기본값도 RECRUITMENT여서 구 애플리케이션의 일반 신청 저장을 지원한다.
최초 적용은 메시지 컬럼 없이 상태·버전을 포함한 최종 초대 스키마를 생성한다. CHECK 제약의 재생성도 같은 트랜잭션 안에서 수행한다. 재적용은 검증했지만 IF NOT EXISTS가 임의로 다른 기존 테이블의 구조까지 교정하지는 않는다.

```sql
SELECT status, approval_origin, count(*)
FROM registration GROUP BY status, approval_origin;
SELECT recruitment_id, count(*) FROM registration
WHERE status = 'APPROVED' AND approval_origin = 'RECRUITMENT'
GROUP BY recruitment_id;
SELECT count(*) FROM registration WHERE approval_origin IS NULL;
```

최초 적용에서 과거 신청은 모든 상태가 RECRUITMENT이며 마지막 조회는 0이어야 한다.
재적용 시 이미 기록된 INVITATION은 보존한다. 3단계에서 일반 모집 출처만 집계하도록 변경했다. 실제 초대 수락 연결은 6단계에서 구현했고,
그룹 삭제는 기존 모임 삭제 트랜잭션에서 수락 이력 → 초대 → 기존 연관 데이터 → 그룹 순서로 정리한다. 삭제 FK에 추가 cascade DDL은 필요하지 않으며 위 저장 스키마를 유지한다.

알림 테이블이 없는 DB에서는 기존 [알림 DDL](../../db/migrations/2026-10-03-notification.sql)을 먼저 적용한다.
새 모임 알림 확장이 필요하면 [새 모임 알림 DDL](../../db/migrations/2026-10-08-group-created-notification.sql)을 통합 초대 DDL보다 먼저 적용한다. 통합 초대 DDL은 `GROUP_CREATED`와 기존 신청 사건을 유지한 채 `INVITATION_RECEIVED`를 허용한다. 초대 알림이 저장된 뒤 앞선 새 모임 DDL을 다시 실행하면 제약에서 초대 사건이 빠지므로 이 순서를 바꾸지 않는다.
통합 DDL의 알림 확장은 기존 알림 사건 CHECK를 갱신하고 INVITATION_RECEIVED를 추가한다. 기존 알림·버전·전송 데이터는 수정하지 않는다.
수동 DDL의 ck_notifications_event_type과 Hibernate가 만든 notifications_event_type_check 이름을 처리한다.
다른 이름의 사용자 정의 event_type 제약이 있으면 적용 전에 확인해야 한다. 적용·재적용·기존 알림 보존·새 사건 저장·validate를 격리 스키마에서 검증했다.

## 공유 토큰 설정과 키 교체

저장 방식은 [백엔드 ADR 0019](../adr/0019-encrypted-invitation-token-storage.md)을 따른다.
키는 32바이트 난수를 일반 Base64로 인코딩한 서버 비밀값이다. VAPID·JWT 키와 따로 관리하고 저장소·로그·프론트에 전달하지 않는다.

| 환경 변수 | 기본값 | 용도 |
| --- | --- | --- |
| INVITATION_TOKEN_ACTIVE_KEY_ID | primary | 새 LINK 발급에 사용할 키 ID |
| INVITATION_TOKEN_KEY_PRIMARY | 빈 값 | ID primary의 AES-256 키 |
| INVITATION_TOKEN_KEY_PREVIOUS | 빈 값 | ID previous의 추가 키 슬롯 |

키가 없거나 잘못된 경우 애플리케이션은 기동하되 공유 링크 발급·복원은 INVITATION_UNAVAILABLE(503)로 거절한다.
지정 초대는 암호화 키를 사용하지 않는다. 키 ID는 영문·숫자·밑줄·하이픈 1–32자다.
추가 ID는 외부 설정의 jarihana.invitation.token.keys 맵에 넣고 활성 ID를 지정할 수 있다.
backend dev/prod 배포 workflow와 두 Compose 파일에 위 세 변수를 연결했다. GitHub Environment별 Variables의 `INVITATION_TOKEN_ACTIVE_KEY_ID`(미설정 시 primary)와 Secrets의 `INVITATION_TOKEN_KEY_PRIMARY`, `INVITATION_TOKEN_KEY_PREVIOUS`가 서버로 전달된다. dev는 job env를 사용하므로 배포와 롤백에 동일한 키 구성이 적용되고 prod는 Compose 배포 step env를 사용한다. 실제 GitHub 값 등록이나 배포는 수행하지 않았다.

키는 32바이트 난수를 Base64로 인코딩한 값이다. 예를 들어 `openssl rand -base64 32`로 생성해 해당 환경의 Secrets에 보관한다. 출력·키 원문을 커밋·로그·검증 자료에 남기지 않는다. 개발과 운영의 키를 분리하고 DB 백업과 기존 암호문을 복원할 키의 보관 정책을 함께 정한다. 검증은 가짜 키로 Compose의 빈 설정·두 키 슬롯 설정과 workflow의 Variables/Secrets 연결을 확인했다.

1. 기존 키와 ID를 그대로 보관하면서 다른 ID의 새 키를 추가한다. primary로 발급했다면 그 키를 previous로 옮기거나 같은 ID의 값을 덮어쓰지 않는다.
2. 기존 암호문 복원과 새 키 발급을 확인하고 active-key-id만 새 ID로 바꾼다. 여러 서버가 있다면 모두 이전 키와 새 키를 읽을 수 있어야 한다.
3. 기존 링크가 같은 경로로 복원되는지 재검증한다. 이전 암호문은 자동으로 새 키로 재암호화되지 않는다.
4. 이전 키 제거는 해당 ID의 암호문 보존 정책과 함께 정한다. 만료 후에도 링크 재조회가 가능하므로 72시간 경과만으로 키를 제거하지 않는다.

해시는 링크 조회에 쓰고 암호문은 동일 링크 재복사에 쓴다. 암호문 인증과 복원 토큰의 해시 일치 검증이 모두 통과해야 경로를 반환한다.
키를 잃거나 DB와 키가 함께 노출된 상황은 별도 복구·취소 계획이 필요하다. 운영 키 교체는 이번 로컬 검증에서 수행하지 않았다.

## 복구 제한

모임당 공유 링크 단일화 DDL은 현재 유효한 링크가 여러 개이면 최초 createdAt·id의 링크를 남기고 나머지를 CANCELED로 보정한다. 기존 초대·수락 이력은 삭제하지 않는다. 적용 전 유지할 링크와 취소할 링크를 확인하고 기존 발급 서버를 중단한 상태에서 DDL과 새 서버 전환을 진행한다. 보정 과정은 DB의 LOCALTIMESTAMP를 사용하므로 서비스 시간대 Asia/Seoul과 일치하는 세션 시간대를 먼저 확인한다. 공유·운영 DB에는 적용하지 않았다.

적용 중 실패하면 트랜잭션을 롤백하고 원인을 확인한다. 애플리케이션만 되돌릴 때는 추가 스키마를 유지할 수 있다.
초대 사용 이후 테이블·승인 출처를 삭제하면 합류 이력과 링크 복원 정보를 잃는다.
INVITATION을 RECRUITMENT로 바꾸면 모집 집계 의미도 달라진다. 실제 데이터와 백업을 확인한 복구 계획 없이 스키마를 제거하지 않는다.
암복호화·키 교체와 발급 재시도의 링크 복원은 로컬에서 검증했다. 공유 초대 상세의 재복사는 모든 현재 모임원이 이용할 수 있다. 다른 모임원이 재복사해도 최초 발급자·만료·취소 권한은 바뀌지 않는다.
초대 알림이 저장된 뒤 구 백엔드로 되돌리면 새 eventType을 읽을 수 없다. 새 사건을 읽을 수 있는 백엔드를 유지하거나 데이터를 보존하는 별도 복구안을 먼저 확인한다.

## 로그와 민감정보 확인

- 서버 HTTP 로그는 라우트 템플릿과 허용된 식별자만 기록한다. 잘못된 토큰·인증 실패·서버 오류에서도 원본 토큰과 쿼리를 기록하지 않는 테스트를 갖춘다. 프록시/CDN의 실제 access log 설정은 출시 환경에서 별도로 확인한다.
- 공유 초대 페이지에서는 자동 수집·녹화를 차단하고, 정제한 명시적 사건만 수집한다. 회원 DB ID로 사건을 연결하며 원본 URL·토큰·프로필은 보내지 않는다. 계약과 개인정보 후속 이슈는 [프론트 분석 문서](../../../frontend/docs/analytics.md)를 따른다.
- 인증 복귀용 초대 경로를 보관하더라도 분석으로 전송하지 않는다. 초대에는 개인 메시지가 없다.
- 정상 조회·수락뿐 아니라 잘못된 토큰·인증 실패·서버 오류 경로에서도 원본이 남지 않는지 확인한다.
- 검증 자료에는 원본 토큰·인증 쿠키·푸시 구독 비밀값을 기록하지 않는다.

## 배포 전에 확인할 항목

- 애플리케이션의 토큰 차단 테스트와 별도로 프록시/CDN의 실제 로그에도 원본 초대 경로·토큰이 남지 않는지 확인한다.
- 위 DDL 적용·기존 데이터 보정·validate 결과를 대상 DB에서도 확인한다.
- 알림의 저장 데이터와 실제 전송 데이터의 버전 연결을 확인한다. 신규 사건과 기존 사건을 모두 처리하도록 서버·프론트·SW 호환성을 검증한다.
- 구 SW가 신규 초대 사건을 누락하지 않는지 확인하고 SW 갱신·배포 순서를 확정한다.
- 이미 전송된 푸시의 회수를 보장하지 않는다. 취소·발급자 이탈·모임 종료에 따른 미전송 작업 차단과 클릭 후 현재 상태 확인을 별도로 검증한다.

## 구현과 검증 상태

저장·발급·검색·수신·알림 저장과 구독별 워커 전송은 로컬 PostgreSQL·HTTP 및 외부 전송 대역으로 확인했다.
상세·발급 목록·비회원 공개 미리보기·만료·취소는 실제 HTTP·DB에서 검증했다. 공개 조회는 합류하지 않고 재복사는 만료를 연장하지 않는다.
취소는 모임 잠금 후 현재 소속과 유형별 권한을 검사하고 초대 취소 및 미전송 푸시 취소를 같은 트랜잭션에 저장한다. 이미 외부 전송을 시작한 푸시의 회수는 보장하지 않는다.
초대 화면·인증 복귀·알림 클릭은 7단계에서 구현했고 10단계에서 기존 그룹 삭제에 초대/수락 이력 정리를 연결했다. 삭제·권한 거부·수락 경쟁·마지막 삭제 실패 시 전체 롤백을 PostgreSQL·HTTP 테스트로 확인했다. 백엔드 전체 746개·build, 프론트 Jest 698개·lint·build와 Chromium 회귀 62개가 통과했다.
격리 DB·실제 Spring API·production 프론트로 다수 지정 초대, 알림함 이동·수락, 비회원 공유 미리보기, 공유 합류·중복, 모임 삭제 후 남은 알림 안내를 확인했다. 임시 PC Chrome 프로필에서 외부 제공자를 거친 초대 푸시 수신과 사건 ID·title·body도 확인했다. 프론트 알림 schema는 초대 target을 처리하며 SW는 초대 전용 문구를 표시한다.
실제 GitHub 제공자 인증은 대역으로 검증했다. 공유·운영 DB 적용·Secrets 등록·배포와 Safari/iOS 홈 화면 앱은 아직 확인하지 않았다. 자동 UI 제어로는 macOS 알림 센터 클릭을 확인하지 못했으나, 사용자가 수동으로 알림을 클릭한 실행에서 초대장·수락 버튼 캡처와 테스트 통과 결과를 확인했다.

### 격리된 서버와 브라우저로 재현

`frontend/`에서 Java 21의 `JAVA_HOME`과 프로젝트 Node 실행 환경을 설정한 뒤 실행한다. 테스트는 임시 PostgreSQL 컨테이너와 55436·8086·4176 포트를 사용하며 기존 로컬 DB·회원·키를 사용하지 않는다. 초대 암호화 키와 JWT·VAPID 키는 실행마다 생성하고 종료 시 임시 환경을 정리한다. 공유 토큰·쿠키가 담길 수 있는 trace와 자동 실패 스크린샷은 수집하지 않는다.

```bash
npm run test:push:local
npm run test:push:local -- --real-provider
```

첫 명령은 실제 DB·API와 브라우저 흐름을 검증하고 외부 제공자 수신은 생략한다. 두 번째 명령은 설치된 Chrome의 임시 프로필로 실제 푸시 수신과 로그아웃 구독 해제를 추가 확인한다. 공유·운영 적용이나 모든 기기의 수신 결과로 해석하지 않는다.

OS 클릭까지 수동 확인하려면 `WEB_PUSH_NATIVE_CLICK=1 npm run test:push:local -- --real-provider`로 실행하고 `INVITATION_NATIVE_CLICK_READY`가 출력된 뒤 90초 안에 테스트 초대 알림을 클릭한다. 초대장과 수락 버튼을 확인한 경우에만 통과하며 결과 화면은 `frontend/test-results/integration/invitation-native-click.png`에 저장한다. 이후 로그아웃·구독 해제를 검증하고 임시 Chrome을 자동 종료하므로 직접 화면을 읽기 전에 창이 닫힐 수 있다. 이동 결과는 저장한 캡처와 최종 테스트 결과로 확인한다. 알림 클릭을 합성하거나 수신 확인으로 클릭을 대신하지 않는다.

### 이전 로컬 초대 스키마 보정

[통합 초대 DDL](../../db/migrations/2026-10-11-invitation.sql)은 이전 로컬 초대 테이블에도 적용할 수 있다. 개인 메시지 컬럼과 기존 텍스트는 제거하지만 초대 식별자·토큰·수락 이력은 보존한다. 상태가 없는 기존 행은 VALID로 시작하고, 취소 시각이 있으면 CANCELED로 보정한다. 중간 로컬 버전의 declined_at이 있으면 REJECTED로 이전한 뒤 해당 컬럼을 제거한다. 재적용 시 기존 승인 출처·상태와 증가한 버전을 보존한다.

사용 가능한 공유 링크가 여러 개 남아 있으면 가장 오래된 한 개를 유지하고 나머지는 취소 상태로 보정한다. 만료·이탈·종료로 이미 사용할 수 없는 링크와 과거 수락 이력은 삭제하지 않는다. 신규 테이블에는 보정할 이전 데이터가 없다.

message 컬럼을 참조하거나 거절 상태를 검사하지 않는 구 백엔드로 되돌리면 호환되지 않으므로 현재 초대 계약을 처리하는 백엔드를 유지한다. 통합 DDL은 격리된 테스트 DB에서 검증하며 공유·운영 DB에는 적용하지 않았다.

## 초대 수락과 원자성 확인

수락은 지정 대상 또는 공유 토큰을 확인한 뒤 기존 구성원에게 200과 기존 소속을 반환한다. 신규 합류는 201이며 소속·수락 이력·모든 기존 PENDING 승인은 같은 트랜잭션에서 처리한다. 일반 승인 알림은 추가하지 않는다. 모집 마감·정원은 초대 합류를 제한하지 않는다.

동시성 방식은 [백엔드 ADR 0020](../adr/0020-optimistic-invitation-acceptance.md)를 따른다. 정상 수락은 모임의 배타적 잠금을 잡거나 모임 버전을 증가시키지 않는다. 공유 링크 수락은 초대 버전도 증가시키지 않는다. 지정 초대 수락은 초대 버전을 증가시켜 대상 회원의 거절과 경쟁할 때 충돌을 감지한다. 소속·수락 unique 제약 및 신청·초대·모임 버전 충돌은 전체 롤백 후 새 트랜잭션에서 다시 판단한다. 최초 요청을 포함해 최대 세 번 시도하며 계속 충돌하면 CONCURRENT_MODIFICATION(409)을 반환한다. 그 외 저장 실패는 재시도하지 않는다.

일반 모집의 정원 보호를 위한 모집 잠금과 대기 신청의 중복 방지를 위한 신청 생성의 기존 모임 잠금은 유지한다. 수락과 일반 승인에서는 신청 변경을 소속 저장 전에 flush하여 버전 충돌을 먼저 확인하고, 소속 저장 이후 PENDING을 다시 조회해 그 사이에 생성된 신청도 승인한다. 확인 처리·철회·모임 종료도 관련 버전 충돌을 새 트랜잭션에서 재판단한다.

[통합 초대 DDL](../../db/migrations/2026-10-11-invitation.sql)은 Group·Invitation·Registration의 버전도 준비한다. 기존 행의 버전은 0으로 시작하고 재적용 시 이미 증가한 버전을 보존한다. 직접 SQL로 모임·초대·신청의 상태를 변경한다면 version도 증가시켜야 수락의 상태 검증이 이를 감지한다. 구 백엔드와 새 백엔드가 동시에 상태를 변경하면 이 규칙을 보장할 수 없으므로 상태 변경을 처리하는 백엔드를 함께 전환한다. 실제 공유·운영 DB에는 적용하지 않았다.

그룹 삭제의 초대 FK 정리는 아래 절차를 따른다.

## 모임 삭제와 남은 알림

기존의 ACTIVE·모임장·생성 후 24시간 조건을 확인한 뒤 삭제한다. 삭제 명령은 모임 행을 잠가 발급과 신청 생성이 정리 중에 새 데이터를 만들지 않게 조정한다. 정상 초대 수락에는 배타적 모임 잠금을 추가하지 않는다.

같은 트랜잭션에서 해당 모임의 INVITATION_RECEIVED 전송 중 PENDING·RETRY·IN_FLIGHT를 CANCELLED로 바꾸고 lease를 제거한다. ACCEPTED·FAILED 이력과 수신자의 알림함은 유지한다. 이어서 수락 이력·초대와 기존 신청/모집/소속·그룹을 정리한다. 어느 단계에서든 실패하면 전송 취소까지 모두 롤백한다. 이미 외부 전송을 시작한 푸시나 OS 알림의 회수는 보장하지 않는다.

삭제된 초대의 ID 상세·공유 미리보기·수락은 INVITATION_NOT_FOUND(404)다. 남은 알림의 내용 조회는 가능하며 프론트는 클릭 후 현재 대상 부재를 확인해 안전한 오류 안내와 알림함 복귀를 제공한다. tombstone이나 삭제 사유별 초대 상태를 추가하지 않는다. 삭제 직전 상태를 확인한 수락이 FK 저장에서 실패하면 전체 롤백 이후 초대 부재를 확인해 같은 404를 반환한다. 초대가 남은 무결성 오류는 일반 실패로 처리한다.

```bash
./gradlew test --tests '*InvitationIssuanceAcceptanceTest.groupDeletion*' --tests '*InvitationIssuanceAcceptanceTest.rejectedGroupDeletion*'
./gradlew test --tests '*GroupCommandServiceTest' --tests '*GroupCommandControllerTest'
./gradlew test build
```

## 지정 초대 거절과 상태

[통합 초대 DDL](../../db/migrations/2026-10-11-invitation.sql)에서 VALID·REJECTED·CANCELED 상태와 제약을 준비한다. 이전 로컬 데이터의 변환은 위 보정 절차를 따른다.

지정 대상만 거절할 수 있으며 REJECTED 초대는 다시 수락할 수 없다. 알림은 유지하고 미전송 푸시는 취소하지만 모임장에게 거절 알림을 보내지 않는다. 공유 링크에는 거절 상태를 적용하지 않는다. 알림의 일반 삭제도 거절로 처리하지 않는다.

배포 시 백엔드·프론트에서 VALID·REJECTED·CANCELED 계약을 함께 적용한다. 상태 컬럼이 없는 구 백엔드는 거절 여부를 검사하지 않으므로 새 거절이 발생한 이후 구 백엔드로 되돌리지 않는다. 공유·운영 DB에 이 DDL을 적용하지 않았다.
