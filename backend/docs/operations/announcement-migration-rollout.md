# 모임 공지 마이그레이션 적용

## 일반 적용: 기존 V10 DB에서 V11 추가

모임 제안 V10이 이미 적용된 DB에 공지 V9를 나중에 추가하면 기본 Flyway 검증이
`Detected resolved migration not applied to database: 9`로 실패한다. 공지는
`V11__group_announcements.sql`로 추가한다. V9는 비어 있어도 정상이며,
애플리케이션의 `out-of-order` 설정을 켜거나 검증을 생략하지 않는다.

V11의 SQL 내용은 이 PR에서 사용했던 공지 V9와 동일하다. 공지 V9를 적용하지 않은
DB에는 기존 마이그레이션 이력을 수정하지 않고 일반 배포로 V11만 추가한다.
공유 개발·운영에 공지 V9를 별도로 적용했다면 아래 로컬 절차를 그대로 실행하지 말고,
대상 DB·스키마·체크섬과 적용 시점을 확인한 별도의 이력 정정 계획을 검토한다.

`FlywayBaselineTest.addAnnouncementsAfterExistingV10`은 실제 PostgreSQL에 기존
마이그레이션 집합(V1~V10, 공지 V9 제외)을 먼저 적용한 뒤 V11을 추가한다. 기존 회원과
제안 데이터·이력 보존, V11 적용, 기본 설정의 validate 및 재실행 0건을 확인한다.

## 공유 배포 경로 확인

2026-10-28 기준 공지 최초 커밋 `0f0ee011`은 원격 develop·main에 포함되지 않았고,
두 브랜치의 운영 migration 디렉터리에도 공지 V9가 없다. 최근 성공한 push 배포는
개발 `a063514d`([실행](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/40503842679)),
운영 `5b9a3461`([실행](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/40476742678))다.
따라서 정상 배포 경로로 공지 V9가 공유 DB에 도달한 상태는 아니다. DB 이력 자체를
조회하거나 별도 수동 적용 유무까지 검증한 것은 아니다.

## 촬영용 로컬 DB에 공지 V9가 이미 있는 경우

이번 작업에서 생성한 컨테이너 `jarihana-announcements-preview-db`의
`jarihana_preview.public`에는 공지 V9가 적용돼 있다. 아래 절차의 대상은 이 DB 하나다.
기존 공지나 DB 볼륨을 삭제하지 않는다. 화면 촬영 중인 서버는 이 절차 때문에
자동 재시작하지 않으며, V11 코드로 다시 실행하기 전에 수행한다.

1. 해당 로컬 서버를 중지하고 DB 이름, 기존 이력과 공지 행을 기록한다.
2. 성공한 공지 이력이 V9, script `V9__group_announcements.sql`, description
   `group announcements`, checksum `-1253084773`인지 확인한다.
3. 다음 트랜잭션으로 이름과 버전만 바꾼다. DB 이름·기존 이력·체크섬이 다르거나
   V11이 이미 있으면 중단한다. 체크섬이나 실제 공지 데이터를 덮어쓰지 않는다.

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
       IF EXISTS (SELECT 1 FROM public.flyway_schema_history WHERE version = '11') THEN
           RAISE EXCEPTION 'V11 이력이 이미 존재합니다. 자동 정정하지 않습니다.';
       END IF;
       UPDATE public.flyway_schema_history
       SET version = '11', script = 'V11__group_announcements.sql'
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

4. 이름이 바뀐 리소스가 남지 않도록 `./gradlew clean classes` 후 local 프로필로 실행한다.
   기본 Flyway 검증 통과와 기존 공지·모임·회원 보존을 확인한다. 전역 `repair`나
   `out-of-order` 설정 변경은 사용하지 않는다.

`FlywayBaselineTest.reconcilePreviewAnnouncementV9WithoutLosingData`는 기존 V9 집합으로
만든 격리 DB에서 같은 체크섬 조건의 정정을 수행하고 공지와 나머지 이력 보존,
기본 설정의 validate 및 재실행 0건을 검증한다.

이 문서는 마이그레이션 순서만 다룬다. 신규 알림 저장 데이터의 구버전 해석과
애플리케이션 롤백 가능 여부는 별도의 호환성 전환을 완료한 뒤 판단한다.
