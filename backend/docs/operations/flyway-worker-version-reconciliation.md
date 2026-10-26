# Worker 마이그레이션 버전 충돌 정리

## 정규 마이그레이션 순서

이미 develop에서 사용하는 SQL을 원본 그대로 유지하고 worker 변경을 뒤에 추가한다.

| 버전 | 변경 |
| --- | --- |
| V1 | baseline |
| V2 | 활동 기록 댓글과 반응 |
| V3 | 하트 반응 제약 |
| V4 | 이미지 생명주기 |
| V6 | 활동 기록 상호작용 알림 |
| V7 | worker 처리 권한 |

V5가 비어 있어도 정상이다. 빈 번호를 채우기 위해 이미 적용된 파일을 다시 매기지 않는다.
새 변경을 추가하기 전에 최신 develop/main과 관련 작업 브랜치의 migration 파일을 확인하고,
병합 직전에도 번호 중복을 확인한다. 이미 공유 환경에 적용된 파일의 내용은 수정하지 않는다.

## 시험 DB의 예외적인 이력 정정

블루그린 시험에서 `jarihana-db`의 `jarihana_dev`에는 worker SQL이 V4로 먼저 적용됐다.
반면 기존 dev 서버가 사용하는 `jarihana-db-temporal`의 같은 DB에는 이미지 V4와 알림 V6가
적용되어 있었다. 따라서 파일 이름만 V7로 바꾸면 시험 DB의 Flyway 검증은 실패한다.

이 정정은 해당 시험 DB 한 곳에만 적용한다. 운영 DB나 temporal DB에 동일한 정정을
실행하지 않는다. 기존 worker 테이블을 삭제하거나 재생성하지 않으며, 실제로 실행한
worker SQL의 체크섬과 설명도 유지한다.

1. 접속 호스트와 DB 이름을 확인하고 현재 이력·스키마 메타데이터·테이블별 행 수를 기록한다.
2. worker를 PAUSED로 유지하고 실행 중 작업과 처리 권한이 없음을 확인한다.
3. 이력이 V1 baseline, V2, V3, worker V4뿐이며 모두 성공 상태인지 확인한다.
4. 트랜잭션에서 이력 테이블을 잠그고, 다음 조건과 일치하는 행 **한 개만** 정정한다.

   ```sql
   UPDATE public.flyway_schema_history
   SET version = '7', script = 'V7__worker_authority.sql'
   WHERE installed_rank = 4
     AND version = '4'
     AND description = 'worker authority'
     AND script = 'V4__worker_authority.sql'
     AND checksum = 1532855250
     AND type = 'SQL'
     AND success;
   ```

5. 정정한 SQL과 파일의 체크섬이 같은지 확인한다. 기존 성공 이력을 지우거나 체크섬을
   이미지 V4의 체크섬으로 덮어쓰지 않는다.
6. **이번 복구 실행에만** Flyway의 `outOfOrder(true)`를 사용해 빠진 이미지 V4와 알림 V6를
   적용한다. 이미 실행된 worker V7은 다시 실행하지 않는다.
7. `outOfOrder(false)`인 일반 설정으로 `validate()`를 실행하고, 재실행할 migration이 없음을
   확인한다. 애플리케이션의 기본 설정에는 out-of-order 옵션을 추가하지 않는다.
8. 기존 테이블의 행 수와 worker 테이블 보존을 확인하고 새 파일들이 포함된 이미지로 B의
   readiness와 PAUSED 상태를 확인한다. 옛 worker V4 이미지를 다시 배포하지 않는다.

원본 이력과 실행 결과는 비밀값 없이 `local-plans/blue-green-deployment/artifacts/`에 기록한다.
오류가 발생하면 성공한 스키마 변경까지 되돌아갔다고 가정하지 않고 실제 이력을 다시 확인한다.

`repair`는 실제 스키마를 올바른 V4로 바꿔 주는 명령이 아니다. 이 경우에는 서로 다른 SQL이
같은 버전을 사용했으므로 전체 이력을 일괄 정리하는 용도로 사용하지 않는다.
관련 동작은 [Flyway repair 문서](https://documentation.red-gate.com/flyway/reference/commands/repair)를 따른다.

## 회귀 검증

`FlywayBaselineTest`에서 빈 DB, 기존 스키마 baseline, 기존 V6에서 V7 추가, 잘못된 worker V4의
번호 정정 후 V4·V6 적용을 실제 PostgreSQL로 검증한다. 기존 V6 이력과 회원 데이터 보존,
시험 worker 행 보존, 정상 설정의 validate와 재실행 0건을 확인한다.
