# 모임 공지 마이그레이션 적용

## 일반 적용: V10 DB에서 V11~V13 순서로 적용

공지 스키마는 `V13__group_announcements.sql`로 추가한다. 순서는 회원 소속 확장 #481의 V11, 호환 선배포 #490의 V12 구독 지원 버전, 이 PR의 V13 공지 스키마다. #481 브랜치에는 #484가 이미 병합되어 있다. 애플리케이션의 `out-of-order`를 켜거나 검증을 생략하지 않는다.

V10 DB에서 세 migration을 새로 적용하면 V11, V12, V13 순서로 진행된다. V11과 V12가 이미 적용된 DB에서는 V13만 적용한다. V13 SQL은 이전 공지 V9와 내용이 같아 checksum `-1253084773`을 유지한다. 공지 V9 또는 이전 버전의 공지 V12를 공유 DB에 수동 적용한 이력이 있다면 자동으로 진행하지 말고 DB·스키마·script·checksum·적용 시점을 확인한다.

`FlywayBaselineTest.addAnnouncementsAfterExistingV10`은 V1~V10 이력에 후속 migration을 적용해 회원·제안 데이터와 기존 이력을 보존하는지 확인한다. #481 파일이 없는 독립 실행에서는 V12·V13 두 건, #481이 합쳐진 실행에서는 V11~V13 세 건을 확인한다.

## 선행 병합·배포 순서

1. #481을 먼저 병합한다. 현재 #484는 #481 브랜치에 포함되어 있다.
2. #490을 병합하고 개발 환경에서 호환 백엔드·프론트와 V12 적용 성공을 확인한다.
3. 같은 순서로 운영 환경에 호환 버전을 배포하고 성공 SHA·이미지 태그를 기록한다.
4. 직전 성공 이미지가 #490 호환 버전인지 확인한 뒤 #459를 배포한다. PR 병합만으로 배포 완료라고 판단하지 않는다.

이 문서는 순서와 로컬 검증 절차를 정리한다. 공유 DB의 Flyway 이력이나 실제 배포 상태를 확인했다는 뜻은 아니므로, 배포 전 실제 이력과 성공 SHA를 따로 확인한다.

## 촬영용 로컬 DB에 공지 V9가 이미 있는 경우

공지 V9가 적용된 촬영용 로컬 DB만 대상으로 한다. 실제 적용 전 DB 이름, 기존 Flyway 이력과 공지 행을 기록한다. 기존 공지나 DB 볼륨을 삭제하지 않는다.

1. 로컬 서버를 중지하고 V9 SQL을 보존한 임시 Flyway 리소스 집합(V1~V10, 공지 V9 포함)을 준비한다.
2. 그 집합에 #481의 `V11__member_affiliation.sql`(아직 적용되지 않았을 때)과 #490의 `V12__push_subscription_client_version.sql`을 추가하고 일회성 migrate를 실행한다. V13 공지 SQL은 이 집합에 넣지 않는다. V11·V12가 이미 성공 이력에 있으면 다시 실행되지 않아야 한다.
3. 공지 이력이 V9, script `V9__group_announcements.sql`, description `group announcements`, checksum `-1253084773`인지 확인한다. V11 회원 소속과 V12 구독 지원 migration도 script 이름과 성공 상태를 확인한다.
4. 아래 트랜잭션으로 공지 이력의 버전과 script만 V13으로 정정한다. DB 이름·기존 이력·checksum이 다르거나 V13 이력이 있으면 중단한다. checksum이나 공지 데이터를 덮어쓰지 않는다.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.flyway_schema_history IN EXCLUSIVE MODE;

DO $$
DECLARE
    corrected integer;
BEGIN
    IF current_database() <> 'jarihana_preview' THEN
        RAISE EXCEPTION '이 절차는 촬영용 jarihana_preview DB 전용입니다.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.flyway_schema_history
                   WHERE version = '11' AND script = 'V11__member_affiliation.sql' AND success) THEN
        RAISE EXCEPTION '회원 소속 V11을 먼저 적용해야 합니다.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.flyway_schema_history
                   WHERE version = '12' AND script = 'V12__push_subscription_client_version.sql' AND success) THEN
        RAISE EXCEPTION '구독 지원 버전 V12를 먼저 적용해야 합니다.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.flyway_schema_history WHERE version = '13') THEN
        RAISE EXCEPTION 'V13 이력이 이미 존재합니다. 자동 정정하지 않습니다.';
    END IF;
    UPDATE public.flyway_schema_history
    SET version = '13', script = 'V13__group_announcements.sql'
    WHERE version = '9'
      AND script = 'V9__group_announcements.sql'
      AND description = 'group announcements'
      AND checksum = -1253084773
      AND type = 'SQL'
      AND success;
    GET DIAGNOSTICS corrected = ROW_COUNT;
    IF corrected <> 1 THEN
        RAISE EXCEPTION '예상한 공지 V9 이력 한 건과 일치하지 않습니다.';
    END IF;
END $$;
COMMIT;
```

5. `./gradlew clean classes` 후 local 프로필로 실행해 기본 Flyway 검증과 기존 공지·모임·회원 보존을 확인한다. 전역 `repair`나 `out-of-order` 변경은 사용하지 않는다.

`FlywayBaselineTest.reconcilePreviewAnnouncementV9WithoutLosingData`는 격리 DB에서 V9 공지 이력에 V11·V12를 먼저 적용하고, 같은 checksum 조건으로 V13 이력을 정정한 뒤 공지·나머지 이력 보존, 기본 설정의 validate 및 재실행 0건을 확인한다.

이 절차는 촬영용 로컬 DB를 위한 것이다. 공유 개발·운영 DB에 실행하지 않으며, 실제 기기나 배포 이미지를 검증하지 않는다.
