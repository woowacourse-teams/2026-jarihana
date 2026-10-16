# dev 푸시 선점 쿼리 개선: 구현·검증 결과

## 상태와 진행 순서

- 2026-10-16, `fix/push-delivery-claim-index` 작업 브랜치에서 로컬 코드 수정·검증 완료.
- [Before 조사와 사진](2026-10-16-dev-push-worker-before.md)은 그대로 보존한다.
- dev의 워커는 중지 상태로 유지했다. dev 데이터 정리·수정 쿼리 배포·워커 재개는 하지 않았다.
- 실제 dev 데이터에서는 `EXPLAIN`만 수행했다. UPDATE를 실행하거나 `EXPLAIN ANALYZE`를 수행하지 않았다.

| 단계 | 결과 |
| --- | --- |
| 1. 기존 규칙·테스트 확인 | 선점·lease 복구·상태 판단·예정 시각/ID 정렬 확인 |
| 2. 문제 재현과 쿼리 수정 | 2만 건 계획 테스트가 기존 코드에서 실패함을 확인 후 수정 |
| 3. 회귀 검증 | 최신 develop 반영 후 백엔드 전체 103개 suite·851개 테스트 통과, 실패·오류·생략 0 |
| 4. 대량 데이터 비교 | 실제 dev 계획 확인과 별도 로컬 288만 건 실행시간 비교 완료 |
| 5. 배포와 실환경 확인 | 미실행. 검토 후 dev 배포 및 재개 여부 결정 필요 |

## 문제 → 해결

기존 쿼리는 일반 대기와 만료된 선점을 OR로 묶고 알림·구독을 조인한 뒤 정렬했다. 실제 dev에서 후보 처리 계획은 약 287만 행을 예상하며 전체 스캔·Hash Join·Sort를 선택했다.

수정 쿼리는 다음 순서로 처리한다.

1. `due_candidate`: PENDING/RETRY에서 예정 시각·ID 순으로 잠기지 않은 후보 최대 1건을 찾는다.
2. `expired_candidate`: 만료된 IN_FLIGHT에서 기존과 같은 예정 시각·ID 순으로 잠기지 않은 후보 최대 1건을 찾는다.
3. 두 후보를 예정 시각·ID 순서로 비교해 최종 1건을 고른다.
4. 그 후보의 알림과 구독만 조회해 기존 취소·실패·선점 상태를 결정한다.
5. 기존 `UPDATE ... RETURNING`, lease 토큰·기한과 트랜잭션 경계를 유지한다.

후보 CTE를 `MATERIALIZED`로 두어 후보 제한 후 조인하는 경계를 명시했다. 두 분기에서 `FOR UPDATE SKIP LOCKED`를 유지한다.

새 인덱스나 스키마 변경은 없다. 기존 `idx_notification_deliveries_due`와 `idx_notification_deliveries_expired_lease`를 이용한다.

### 유지하는 동작과 주의할 차이

- 일반 대기·재시도와 만료된 작업을 같은 예정 시각·ID 기준으로 비교한다.
- 미래의 발송 대기와 유효한 IN_FLIGHT lease는 선점하지 않는다.
- 삭제된 알림, 비활성 구독, 세대 불일치, 만료·시도 상한의 기존 판단은 유지한다.
- 일반 대기와 만료 작업이 모두 있으면 한 트랜잭션에서 각 분기의 후보, 최대 2개 행을 잠글 수 있다. 실제 갱신은 최종 1개이며 나머지 잠금도 짧은 선점 트랜잭션 종료 시 해제된다.
- 만료된 IN_FLIGHT 후보 분기는 기존 전역 순서를 유지하기 위해 만료 대상 안에서 정렬할 수 있다. 만료 IN_FLIGHT 자체가 대량으로 누적된 별도 상황까지 상수 비용이라고 보장하지 않는다.

## 실제 dev 데이터의 실행계획 비교

워커 비활성화 설정을 확인한 뒤, 읽기 전용 연결에서 개선 쿼리를 실행하지 않고 `EXPLAIN`만 수행했다.

```text
Before
  전송 대기 Seq Scan
  알림 Seq Scan
  구독 Seq Scan
  Hash Join → Sort → Limit 1

After 계획
  due_candidate: idx_notification_deliveries_due → Limit 1
  expired_candidate: idx_notification_deliveries_expired_lease → Limit 1
  두 후보만 정렬 → Limit 1
  선택한 전송 대기·알림·구독은 각각 PK Index Scan
```

수정된 실제 dev 계획에는 대량 테이블 Seq Scan·Hash Join이 없었다. 단, 이것은 계획 확인이며 dev에서의 개선 후 실행시간 측정 결과는 아니다.

## 같은 로컬 데이터에서 실행시간 비교

[측정 수치와 실행계획 노드 원본 요약](assets/dev-push-worker-2026-10-16/local-query-benchmark.json)

### 조건

- dev와 분리된 로컬 `postgres:17` 임시 컨테이너, 외부 네트워크·호스트 포트 없음.
- 전송 대기와 알림 각각 2,883,146행, 구독 1,006행.
- 전송 대기 상태는 PENDING 2,870,474행, FAILED 12,672행. 만료 IN_FLIGHT 적체가 없는 대량 대기 시나리오다.
- V1의 관련 세 테이블 컬럼·CHECK 정의, PK, 관련 `CREATE INDEX`를 사용했다. 나머지 테이블·FK·별도 UNIQUE 제약은 생략한 합성 데이터이므로 실제 dev 복제본은 아니다.
- `shared_buffers=90MB`, `work_mem=4MB`. 관계 테이블과 대기 테이블을 ANALYZE한 뒤 비교했다.
- Before는 머지 커밋 `850eb7cf0da5b7a5a17cee997b231614690dfaf4`의 선점 SQL, After는 수정된 동일 저장소 메서드의 SQL이다.
- 시간·토큰을 동일하게 바인딩해 실제 UPDATE에 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`을 수행했다. 각 실행은 별도 BEGIN/ROLLBACK으로 되돌렸다.
- 측정 순서는 Before → After → After → Before → Before → After였다. 별도 캐시 초기화는 하지 않았다.
- 외부 푸시는 호출하지 않았고, 임시 컨테이너는 측정 후 제거했다.

### 수치

| 측정 순서 | SQL | 실행시간 |
| --- | --- | ---: |
| 1 | Before | 6,906.295 ms |
| 2 | After | 116.127 ms |
| 3 | After | 0.266 ms |
| 4 | Before | 3,157.775 ms |
| 5 | Before | 3,070.818 ms |
| 6 | After | 0.264 ms |

| 비교 항목 | Before | After |
| --- | --- | --- |
| 3회 실행시간 중앙값 | 3,157.775 ms | 0.266 ms |
| 전송 대기 읽기 | Seq Scan, 실제 약 287만 행 | due 인덱스에서 1행 |
| 알림 읽기 | Seq Scan, 실제 약 288만 행 | PK 인덱스에서 1행 |
| 대량 정렬 | external merge | 대량 정렬 없음 |
| 임시 블록 쓰기 | 매 실행 85,757 blocks | 0 |
| 공유 버퍼 read blocks | 약 99,700~99,800 | 0~3 |

버퍼 read는 PostgreSQL 공유 버퍼로 읽은 블록이며 OS 캐시를 고려한 물리 디스크 읽기 횟수와 동일하지 않다. 첫 실행과 캐시가 준비된 실행의 차이가 크고 표본도 각 3회다. **위 수치를 dev의 지연시간이나 동일한 개선 배수로 일반화하지 않는다.** 다만 같은 대량 데이터에서 전체 스캔·대량 정렬을 제거한 효과는 실행계획과 읽기량으로 확인됐다.

## 기능·동시성 검증

```bash
cd backend
./gradlew test --no-daemon --console=plain
```

- 최신 develop (`345257f266fee5ea3bd68b7429861f280d69af0d`) 반영 후 103개 suite, 851개 테스트, 실패·오류·생략 0.
- 대량 대기 2만 건에서 due 인덱스·알림 PK 인덱스 사용을 검증한다. 테스트의 EXPLAIN은 작업을 실제 갱신하지 않으며 PENDING 2만 행이 그대로임도 확인한다.
- PENDING·RETRY·만료 IN_FLIGHT의 전역 정렬, 같은 시각의 ID 순서, 미래 작업·유효 lease 제외를 확인한다.
- 다른 트랜잭션이 잠근 PENDING·RETRY·만료 IN_FLIGHT를 각각 건너뛰는 테스트를 통과했다.
- 기존 동시 워커의 중복 선점 방지, 롤백, 최대 재시도, 만료 lease 복구, 구독 변경·알림 삭제와 늦은 응답 처리 테스트를 포함한다.
- 로컬 Java LSP는 설치돼 있지 않아 LSP 진단 대신 Gradle 컴파일과 실제 테스트로 검증했다.

## 다음 단계

1. 코드와 위 검증 결과를 검토한다.
2. 검토 후 수정본의 dev 배포 및 워커 재개 범위를 결정한다. 데이터가 보존된 상태의 실제 실행시간·풀 사용시간·오류를 확인한다.
3. Before와 동일한 Grafana 환경·측정 구간에서 After 사진을 기록한다. 워커를 끈 상태의 0 사용량을 쿼리 개선 결과로 쓰지 않는다.
4. 테스트 전송 대기는 정확한 대상·건수를 확인한 뒤 별도 조치한다. 데이터 정리 효과와 쿼리 개선 효과를 섞지 않는다.

이번 변경 파일:

- [선점 쿼리](../../../backend/src/main/java/com/project/jarihana/notificationdelivery/command/repository/PushDeliveryWorkRepository.java)
- [실행계획·정렬 회귀 테스트](../../../backend/src/test/java/com/project/jarihana/notificationdelivery/PushDeliveryWorkRepositoryTest.java)
- [상태별 잠금 건너뛰기 테스트](../../../backend/src/test/java/com/project/jarihana/notificationdelivery/PushDeliveryConcurrencyTest.java)
