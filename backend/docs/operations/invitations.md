# 초대 실행·배포·검증

> 상태: 저장·발급·조회·공개 미리보기·취소·알림의 로컬 PostgreSQL·HTTP 검증 완료.
> 수락·합류·낙관적 충돌 처리도 로컬 검증 완료. 프론트·로그 마스킹·배포 호환성은 후속 단계다.

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

모델 선택은 [ADR 0017](../adr/0017-separate-invitation-acceptance-history.md), 실제 SQL은
[초대 저장 마이그레이션](../../db/migrations/2026-10-11-invitation.sql)을 따른다.
운영 프로필은 validate이므로 스키마 변경 후 애플리케이션을 배포한다.

1. 대상 DB·백업을 확인하고 기존 신청의 상태별 개수와 모집별 APPROVED 개수를 기록한다.
2. 기존 스키마와 SQL의 전제가 맞는지 확인한다. 많은 신청을 보정하는 작업은 테이블 잠금을 고려해 적용 시간을 정한다.
3. 저장소 루트에서 대상 DB 연결 변수를 설정하고 아래 명령으로 수동 적용한다.
4. 상태별 데이터와 기존 승인 집계를 비교하고 새 모델의 validate 기동을 확인한다.

```bash
psql "$INVITATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/2026-10-11-invitation.sql
psql "$INVITATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/2026-10-11-invitation-notification.sql
psql "$INVITATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/2026-10-11-invitation-message-removal.sql
psql "$INVITATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/2026-10-11-invitation-optimistic-locking.sql
```

연결 값은 로그·검증 자료에 기록하지 않는다. SQL은 하나의 트랜잭션으로 적용되며
기존 null 출처만 RECRUITMENT로 보정한다. DB 기본값도 RECRUITMENT여서 구 애플리케이션의 일반 신청 저장을 지원한다.
CHECK 제약의 재생성도 같은 트랜잭션 안에서 수행한다. 재적용은 검증했지만 IF NOT EXISTS가 임의로 다른 기존 테이블의 구조까지 교정하지는 않는다.

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
그룹 삭제 시 수락 → 초대 → 그룹 정리는 10단계에서 구현하므로 저장 단계만으로 기능을 출시하지 않는다.

알림 테이블이 없는 DB에서는 기존 [알림 DDL](../../db/migrations/2026-10-03-notification.sql)을 먼저 적용한다.
초대 알림 증분 DDL은 기존 알림 사건 CHECK를 갱신하고 INVITATION_RECEIVED를 추가한다. 기존 알림·버전·전송 데이터는 수정하지 않는다.
수동 DDL의 ck_notifications_event_type과 Hibernate가 만든 notifications_event_type_check 이름을 처리한다.
다른 이름의 사용자 정의 event_type 제약이 있으면 적용 전에 확인해야 한다. 적용·재적용·기존 알림 보존·새 사건 저장·validate를 격리 스키마에서 검증했다.

## 공유 토큰 설정과 키 교체

저장 방식은 [백엔드 ADR 0018](../adr/0018-encrypted-invitation-token-storage.md)을 따른다.
키는 32바이트 난수를 일반 Base64로 인코딩한 서버 비밀값이다. VAPID·JWT 키와 따로 관리하고 저장소·로그·프론트에 전달하지 않는다.

| 환경 변수 | 기본값 | 용도 |
| --- | --- | --- |
| INVITATION_TOKEN_ACTIVE_KEY_ID | primary | 새 LINK 발급에 사용할 키 ID |
| INVITATION_TOKEN_KEY_PRIMARY | 빈 값 | ID primary의 AES-256 키 |
| INVITATION_TOKEN_KEY_PREVIOUS | 빈 값 | ID previous의 추가 키 슬롯 |

키가 없거나 잘못된 경우 애플리케이션은 기동하되 공유 링크 발급·복원은 INVITATION_UNAVAILABLE(503)로 거절한다.
지정 초대는 암호화 키를 사용하지 않는다. 키 ID는 영문·숫자·밑줄·하이픈 1–32자다.
추가 ID는 외부 설정의 jarihana.invitation.token.keys 맵에 넣고 활성 ID를 지정할 수 있다.
현재 배포 workflow·Compose에는 이 환경 변수를 아직 연결하지 않았다. 10단계에서 전달 경로를 준비한 뒤 공유 초대를 출시한다.

1. 기존 키와 ID를 그대로 보관하면서 다른 ID의 새 키를 추가한다. primary로 발급했다면 그 키를 previous로 옮기거나 같은 ID의 값을 덮어쓰지 않는다.
2. 기존 암호문 복원과 새 키 발급을 확인하고 active-key-id만 새 ID로 바꾼다. 여러 서버가 있다면 모두 이전 키와 새 키를 읽을 수 있어야 한다.
3. 기존 링크가 같은 경로로 복원되는지 재검증한다. 이전 암호문은 자동으로 새 키로 재암호화되지 않는다.
4. 이전 키 제거는 해당 ID의 암호문 보존 정책과 함께 정한다. 만료 후에도 링크 재조회가 가능하므로 72시간 경과만으로 키를 제거하지 않는다.

해시는 링크 조회에 쓰고 암호문은 동일 링크 재복사에 쓴다. 암호문 인증과 복원 토큰의 해시 일치 검증이 모두 통과해야 경로를 반환한다.
키를 잃거나 DB와 키가 함께 노출된 상황은 별도 복구·취소 계획이 필요하다. 운영 키 교체는 이번 로컬 검증에서 수행하지 않았다.

## 복구 제한

적용 중 실패하면 트랜잭션을 롤백하고 원인을 확인한다. 애플리케이션만 되돌릴 때는 추가 스키마를 유지할 수 있다.
초대 사용 이후 테이블·승인 출처를 삭제하면 합류 이력과 링크 복원 정보를 잃는다.
INVITATION을 RECRUITMENT로 바꾸면 모집 집계 의미도 달라진다. 실제 데이터와 백업을 확인한 복구 계획 없이 스키마를 제거하지 않는다.
암복호화·키 교체와 발급 재시도의 링크 복원은 로컬에서 검증했다. 공유 초대 상세의 재복사는 모든 현재 모임원이 이용할 수 있다. 다른 모임원이 재복사해도 최초 발급자·만료·취소 권한은 바뀌지 않는다.
초대 알림이 저장된 뒤 구 백엔드로 되돌리면 새 eventType을 읽을 수 없다. 새 사건을 읽을 수 있는 백엔드를 유지하거나 데이터를 보존하는 별도 복구안을 먼저 확인한다.

## 로그와 민감정보 확인

- 원본 공유 토큰을 access log·API 오류·분석·세션 녹화에 남기지 않도록 서버·프록시 경로 마스킹과 프론트 수집 제외를 구현한다.
- 인증 복귀용 초대 경로를 보관하더라도 분석으로 전송하지 않는다. 초대에는 개인 메시지가 없다.
- 정상 조회·수락뿐 아니라 잘못된 토큰·인증 실패·서버 오류 경로에서도 원본이 남지 않는지 확인한다.
- 검증 자료에는 원본 토큰·인증 쿠키·푸시 구독 비밀값을 기록하지 않는다.

## 배포 전에 확인할 항목

- 로그·분석의 원본 토큰 차단을 구현하고 검증한 뒤 공유 초대 API를 외부에 출시한다.
- 위 DDL 적용·기존 데이터 보정·validate 결과를 대상 DB에서도 확인한다.
- 알림의 저장 데이터와 실제 전송 데이터의 버전 연결을 확인한다. 신규 사건과 기존 사건을 모두 처리하도록 서버·프론트·SW 호환성을 검증한다.
- 구 SW가 신규 초대 사건을 누락하지 않는지 확인하고 SW 갱신·배포 순서를 확정한다.
- 이미 전송된 푸시의 회수를 보장하지 않는다. 취소·발급자 이탈·모임 종료에 따른 미전송 작업 차단과 클릭 후 현재 상태 확인을 별도로 검증한다.

## 구현과 검증 상태

저장·발급·검색·수신·알림 저장과 구독별 워커 전송은 로컬 PostgreSQL·HTTP 및 외부 전송 대역으로 확인했다.
상세·발급 목록·비회원 공개 미리보기·만료·취소는 실제 HTTP·DB에서 검증했다. 공개 조회는 합류하지 않고 재복사는 만료를 연장하지 않는다.
취소는 모임 잠금 후 현재 소속과 유형별 권한을 검사하고 초대 취소 및 미전송 푸시 취소를 같은 트랜잭션에 저장한다. 이미 외부 전송을 시작한 푸시의 회수는 보장하지 않는다.
초대 화면·삭제 연계는 아직 미구현이므로 현재 단계만 배포하지 않는다. 기존 그룹 삭제는 초대 FK 정리 없이는 실패할 수 있으며 10단계에서 연결한다.
현 프론트 알림 schema는 초대 target을 처리하지 못하고, 기존 SW는 새 사건에 일반 알림 문구로 대응한다. 7단계에서 전용 문구·클릭·조회와 호환 검증을 구현한다.
공유·운영 DB 적용, 실제 초대 외부 푸시 수신, OS 알림 클릭과 배포는 아직 수행하지 않았다.
로컬 검증과 실제 운영 검증의 결과를 구분해 후속 단계에서 갱신한다.

### 개인 메시지 제거 증분 DDL

[메시지 제거 DDL](../../db/migrations/2026-10-11-invitation-message-removal.sql)은 기존 초대 DDL 이후 적용하며 재적용할 수 있다. 개인 메시지 컬럼과 기존 텍스트는 삭제하고 초대 식별자·토큰·수락 이력은 보존한다. 적용 후에는 message 컬럼을 참조하는 구 백엔드로 되돌릴 수 없으므로 메시지를 제거한 백엔드를 유지한다. 이 DDL은 격리된 테스트 DB에서만 검증했으며 공유·운영 DB에는 적용하지 않았다.

## 초대 수락과 원자성 확인

수락은 지정 대상 또는 공유 토큰을 확인한 뒤 기존 구성원에게 200과 기존 소속을 반환한다. 신규 합류는 201이며 소속·수락 이력·모든 기존 PENDING 승인은 같은 트랜잭션에서 처리한다. 일반 승인 알림은 추가하지 않는다. 모집 마감·정원은 초대 합류를 제한하지 않는다.

동시성 방식은 [백엔드 ADR 0019](../adr/0019-optimistic-invitation-acceptance.md)를 따른다. 정상 수락은 모임의 배타적 잠금을 잡거나 모임·초대 버전을 증가시키지 않는다. 소속·수락 유일 제약 및 신청·초대·모임 버전 충돌은 전체 롤백 후 새 트랜잭션에서 다시 판단한다. 최초 요청을 포함해 최대 세 번 시도하며 계속 충돌하면 CONCURRENT_MODIFICATION(409)을 반환한다. 그 외 저장 실패는 재시도하지 않는다.

일반 모집의 정원 보호를 위한 모집 잠금과 대기 신청의 중복 방지를 위한 신청 생성의 기존 모임 잠금은 유지한다. 수락과 일반 승인에서는 신청 변경을 소속 저장 전에 flush하여 버전 충돌을 먼저 확인하고, 소속 저장 이후 PENDING을 다시 조회해 그 사이에 생성된 신청도 승인한다. 확인 처리·철회·모임 종료도 관련 버전 충돌을 새 트랜잭션에서 재판단한다.

[버전 추가 DDL](../../db/migrations/2026-10-11-invitation-optimistic-locking.sql)은 기존 초대 DDL 이후 적용한다. 기존 행의 버전은 0으로 시작하고 재적용 시 이미 증가한 버전을 보존한다. 직접 SQL로 모임·초대·신청의 상태를 변경한다면 version도 증가시켜야 수락의 상태 검증이 이를 감지한다. 구 백엔드와 새 백엔드가 동시에 상태를 변경하면 이 규칙을 보장할 수 없으므로 상태 변경을 처리하는 백엔드를 함께 전환한다. 실제 공유·운영 DB에는 적용하지 않았다.

그룹 삭제의 초대 FK 정리는 10단계에서 구현한다. 동시성 변경만으로 삭제 연계가 완료된 것은 아니다.
