# 초대 실행·배포·검증

> 상태: 저장 기반의 로컬 PostgreSQL 검증 완료. 초대 API·로그 마스킹·배포 호환성은 아직 미구현·미검증이다.

API는 [초대 계약](../context/api/endpoints/invitations.md)과
[초대 알림 응답](../context/api/endpoints/notifications.md#초대-알림-응답-확장-계약),
화면은 [프론트 연결 계약](../../../frontend/docs/IMPLEMENTATION_MAP.md#초대-기능-설계-계약)을 따른다.
기존 푸시 설정·전송 운영은 [웹푸시 운영 가이드](web-push.md)를 따른다.

## 로컬에서 재현하기

Java 21과 실행 중인 Docker가 필요하다. 백엔드에서 다음 명령을 실행한다.

```bash
./gradlew test --tests '*Invitation*Test' --tests '*RegistrationTest' --tests '*RegistrationCommandServiceTest'
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
재적용 시 이미 기록된 INVITATION은 보존한다. 정원 조회 변경은 3단계, 실제 초대 수락 연결은 6단계,
그룹 삭제 시 수락 → 초대 → 그룹 정리는 10단계에서 구현하므로 저장 단계만으로 기능을 출시하지 않는다.

## 복구 제한

적용 중 실패하면 트랜잭션을 롤백하고 원인을 확인한다. 애플리케이션만 되돌릴 때는 추가 스키마를 유지할 수 있다.
초대 사용 이후 테이블·승인 출처를 삭제하면 합류 이력과 링크 복원 정보를 잃는다.
INVITATION을 RECRUITMENT로 바꾸면 모집 집계 의미도 달라진다. 실제 데이터와 백업을 확인한 복구 계획 없이 스키마를 제거하지 않는다.
공유 토큰 암복호화·키 관리·권한 있는 재복사는 발급·조회 단계에서 구현하고 배포 전 별도로 검증한다.

## 로그와 민감정보 확인

- 원본 공유 토큰을 access log·API 오류·분석·세션 녹화에 남기지 않도록 서버·프록시 경로 마스킹과 프론트 수집 제외를 구현한다.
- 인증 복귀용 초대 경로를 보관하더라도 분석으로 전송하지 않는다. 개인 초대 메시지도 분석과 장애 공유 자료에서 제외한다.
- 정상 조회·수락뿐 아니라 잘못된 토큰·인증 실패·서버 오류 경로에서도 원본이 남지 않는지 확인한다.
- 검증 자료에는 원본 토큰·인증 쿠키·푸시 구독 비밀값을 기록하지 않는다.

## 배포 전에 확인할 항목

- 로그·분석의 원본 토큰 차단을 구현하고 검증한 뒤 공유 초대 API를 외부에 출시한다.
- 위 DDL 적용·기존 데이터 보정·validate 결과를 대상 DB에서도 확인한다.
- 알림의 저장 데이터와 실제 전송 데이터의 버전 연결을 확인한다. 신규 사건과 기존 사건을 모두 처리하도록 서버·프론트·SW 호환성을 검증한다.
- 구 SW가 신규 초대 사건을 누락하지 않는지 확인하고 SW 갱신·배포 순서를 확정한다.
- 이미 전송된 푸시의 회수를 보장하지 않는다. 취소·발급자 이탈·모임 종료에 따른 미전송 작업 차단과 클릭 후 현재 상태 확인을 별도로 검증한다.

## 구현과 검증 상태

저장 기반은 로컬 격리 PostgreSQL에서 확인했다. 공유·운영 DB 적용, 실제 외부 푸시 수신, OS 알림 클릭과 배포는 아직 수행하지 않았다.
로컬 검증과 실제 운영 검증의 결과를 구분해 후속 단계에서 갱신한다.
