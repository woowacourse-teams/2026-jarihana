# ADR 0025. Push claim은 index로 후보를 좁힌 뒤 JOIN한다

- 상태: **채택 — 구현·로컬 검증 완료 / PR review·dev 배포 대기**
- 날짜: 2026-10-16
- 결정 범위: Push worker의 `claimNextRow` query와 concurrency·execution plan 검증
- 관련 결정: [백엔드 ADR 0015 · 알림함과 Web Push 분리](0015-web-push-and-notification-inbox.md),
  [백엔드 ADR 0024 · JPA native bulk INSERT와 worker repository 전환](0024-jpa-native-bulk-notification-inserts.md)
- 구현과 검증: [PR #428](https://github.com/woowacourse-teams/2026-jarihana/pull/428), [백엔드 ADR 목록](README.md)

## 배경과 문제

dev에서 Push worker가 DB connection 한 개를 오래 사용하며 slow query가 반복됐다.
`pg_stat_activity`에서 claim query가 약 **19.5초째 실행 중**이고, `wait_event`가 `DataFileRead`,
blocking PID 목록이 비어 있는 것을 확인했다. JVM의 `scheduling-1`도 `claimNextRow`의 JDBC 응답을 기다리고 있었다.
확인한 병목은 claim query의 DB read이며, 이 관측만으로 connection leak이나 lock contention을 원인으로 볼 수는 없다.

당시 `notification_deliveries`의 `n_live_tup`은 약 **288만**, `notifications`는 약 **289만**이었다.
이는 PostgreSQL 통계 추정치다. `notification_deliveries`의 `pg_stats`에서 `PENDING` 비율은 약 99.56%였다.

기존 query는 다음 순서로 한 건을 claim했다.

1. `PENDING`/`RETRY`의 due 조건과 expired `IN_FLIGHT`의 lease 조건을 `OR`로 묶는다.
2. `notifications`, `push_subscriptions`를 JOIN해 다음 status를 계산한다.
3. `next_attempt_at`, `id` 순서로 정렬하고 `FOR UPDATE SKIP LOCKED LIMIT 1`을 적용한다.
4. 선택한 delivery를 `UPDATE ... RETURNING`으로 갱신한다.

다음 partial index는 이미 있었다.

| Index | Key | Predicate |
| --- | --- | --- |
| `idx_notification_deliveries_due` | `(next_attempt_at, id)` | `status IN ('PENDING', 'RETRY')` |
| `idx_notification_deliveries_expired_lease` | `(locked_until, id)` | `status = 'IN_FLIGHT'` |

그러나 실제 dev의 기존 query에 대한 `EXPLAIN`은 candidate를 선택하는 과정에서
`Seq Scan → Hash Join → Sort → LockRows → Limit`을 선택했다.
최종 UPDATE는 PK index를 사용했지만, **한 건을 고르기 전에 대량의 delivery와 notification을 읽고 정렬하는 비용**이 컸다.
`LIMIT 1`이나 index의 존재만으로 이 비용이 줄어들지는 않았다.

worker의 `fixedDelay=1000`은 이전부터 있던 설정이다. query가 오래 실행되면 connection을 오래 사용하고,
실행이 끝난 뒤 다음 polling에서도 같은 비용이 반복될 수 있다. polling 주기만으로 최근 현상을 설명하거나,
monitoring plugin 제거 또는 JPA 전환을 원인으로 단정하지 않는다.

## 결정

**JPA native query 안에서 due candidate와 expired candidate를 각각 최대 한 건 선택하고,
그중 최종 한 건만 notification·subscription과 JOIN한다. 기존 partial index를 사용하며 schema는 변경하지 않는다.**

| 단계 | 처리 |
| --- | --- |
| `due_candidate` | `PENDING`/`RETRY`에서 `next_attempt_at <= :now`인 후보를 `(next_attempt_at, id)` 순서로 선택한다. `FOR UPDATE OF d SKIP LOCKED LIMIT 1`을 적용한다 |
| `expired_candidate` | `IN_FLIGHT`에서 `locked_until <= :now`인 후보를 같은 순서로 선택한다. `FOR UPDATE OF d SKIP LOCKED LIMIT 1`을 적용한다 |
| `selected_candidate` | 두 candidate를 `UNION ALL`로 모으고 `(next_attempt_at, id)` 순서로 최종 한 건을 선택한다 |
| JOIN·UPDATE | 최종 candidate만 `notifications`, `push_subscriptions`와 JOIN해 다음 status를 계산하고 `UPDATE ... RETURNING`으로 claim한다 |

candidate를 제한하는 세 CTE에는 `MATERIALIZED`를 명시해, 후보를 먼저 좁히는 경계를 query에 드러낸다.
각 분기의 첫 candidate 중 더 앞선 것을 선택하면 두 분기에 걸친 기존 `(next_attempt_at, id)` 선택 순서를 유지할 수 있다.
due candidate를 무조건 우선하지 않으므로 expired lease recovery의 우선순위도 임의로 바꾸지 않는다.

`SKIP LOCKED`는 각 분기의 `LIMIT` 전에 적용한다. 다른 transaction이 첫 행을 lock한 경우에도
그 행을 건너뛰고 다음 candidate를 찾을 수 있어야 하기 때문이다.
동시 실행에서는 lock된 행을 건너뛰므로 strict FIFO를 보장하지 않는다.

## 선택 이유와 검토한 대안

이 방식은 **이미 존재하는 index로 후보를 먼저 제한하면서, 단일 SQL의 atomic claim과 기존 전송 정책을 유지한다.**
`OR`를 분리해 각 partial index에 맞는 조건을 제시하고, 대량 JOIN을 최종 한 건의 PK lookup으로 줄이는 것이 핵심이다.

| 대안 | 판단 |
| --- | --- |
| **분기별 candidate 제한 후 JOIN** | **채택.** 기존 index·JPA native query를 활용하며 선택 순서와 atomic UPDATE를 유지한다 |
| index만 추가 | 이미 due·expired lease용 index가 있다. 이번 실행계획에서 확인한 JOIN·Sort 이전의 candidate 제한 문제를 먼저 해결한다 |
| connection pool 확대 | 동시에 수행할 수 있는 작업은 늘지만, claim 한 번의 read·Sort 비용은 줄지 않는다 |
| polling 간격 확대 | 반복 빈도는 줄지만 한 번의 slow query와 connection 점유 시간은 남는다 |
| test data 정리 | backlog를 줄일 수 있지만 데이터가 다시 늘 때 같은 query 구조의 병목이 재발할 수 있다 |
| application에서 SELECT 후 UPDATE | row lock과 transaction을 별도로 관리해야 한다. 현재 단일 SQL로 유지할 수 있는 atomic claim을 분리할 이유가 없다 |
| message queue 도입 | 모델·운영 범위가 커진다. 현재 DB queue의 query 병목부터 개선한다 |

## 유지하는 정책과 감수하는 비용

- `CANCELLED`·`FAILED`·`IN_FLIGHT` 판정, attempt 증가, lease token·기한, retry·recovery 정책을 유지한다.
- claim은 기존의 짧은 transaction에서 처리하고, 외부 Push 요청은 transaction 밖에서 수행한다.
- 두 분기에 candidate가 모두 있으면 **최대 두 delivery를 lock하고 한 delivery만 UPDATE**한다.
  선택되지 않은 행도 transaction이 끝날 때까지 lock되므로 동시 worker 사이에서 추가적인 경합이 생길 수 있다.
- expired lease index는 `(locked_until, id)` 순서다. 기존 선택 순서인 `(next_attempt_at, id)`와 달라
  expired candidate 분기에는 Sort가 남을 수 있다. expired `IN_FLIGHT`가 대량으로 쌓이면 별도 측정과 index 검토가 필요하다.
- PostgreSQL CTE·partial index·`SKIP LOCKED`에 대한 의존성과 query 복잡도가 늘어난다.
  데이터 분포와 통계에 따라 execution plan은 달라질 수 있으므로 Index Scan을 모든 환경에서 보장한다고 보지 않는다.

## 검증 결과

### 동작과 execution plan

- repository의 실제 `@Query`를 사용한 2만 건 테스트에서 기존 due index와 notification PK lookup을 확인했다.
  같은 검증이 기존 query에서 실패하는 것도 확인했다. `EXPLAIN` 뒤 delivery 수가 유지되는지 검증한다.
- `PENDING`, `RETRY`, expired `IN_FLIGHT`가 섞인 선택 순서와 같은 시각의 ID 순서를 검증했다.
  future due와 아직 유효한 lease는 제외한다.
- 세 status 각각의 `SKIP LOCKED`, concurrent claim, rollback, stale lease 보호에 대한 회귀 테스트를 통과했다.
- 최신 `develop` 반영 후 `cd backend && ./gradlew test --no-daemon --console=plain`:
  **103개 suite, 851개 테스트 통과, failure·error·skip 0**.
- 실제 dev 데이터에서는 수정 query를 실행하지 않고 `EXPLAIN`만 확인했다.
  due·expired partial index와 candidate 제한 후 PK lookup을 확인했다.

### 로컬 대량 데이터 비교

PostgreSQL 17의 동일한 합성 데이터에서 delivery 2,883,146건, notification 2,883,146건,
subscription 1,006건으로 비교했다. delivery의 약 99.56%가 `PENDING`이며 expired `IN_FLIGHT` backlog는 없다.
`shared_buffers=90MB`, `work_mem=4MB`로 실행했고, PK와 관련 index를 구성했다.
일부 FK·추가 UNIQUE는 생략했으므로 dev 복제 환경은 아니다.

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`으로 실제 UPDATE를 실행한 뒤 매번 ROLLBACK했다.
Before·After를 교차해 각각 세 번 측정했으며 cache를 초기화하지 않았다.

| 항목 | Before | After |
| --- | --- | --- |
| Execution Time, 각 3회 | 6,906.295 / 3,157.775 / 3,070.818 ms | 116.127 / 0.266 / 0.264 ms |
| Execution Time 중앙값 | 3,157.775 ms | 0.266 ms |
| candidate 선택 과정 | 대량 Seq Scan·Hash Join·external merge Sort | due Index Scan 1행, expired Index Scan 0행 후 최종 candidate 선택 |
| Temporary blocks written, 각 실행 | 85,757 | 0 |

이는 합성 데이터와 cache 상태에 따른 로컬 결과다. **dev RDS의 개선 후 latency나 성능 보장값으로 사용하지 않는다.**

## 적용 상태와 후속 확인

2026-10-16 기준 구현은 [PR #428](https://github.com/woowacourse-teams/2026-jarihana/pull/428)에서 review 중이다.
dev worker는 문제 조사 중 중지했으며 수정 query는 dev에 배포하지 않았다.

merge·배포 후 worker를 재개할 때 claim latency, connection usage·pending, DB read와 실제 execution plan을 확인한다.
동시 worker에서 추가 candidate lock의 영향과 expired lease backlog도 함께 확인한다.
test subscription·backlog 정리는 별도 운영 작업으로 다룬다.

## 구현 위치

- [PushDeliveryWorkRepository](../../src/main/java/com/project/jarihana/notificationdelivery/command/repository/PushDeliveryWorkRepository.java)
- [PushDeliveryWorkRepositoryTest](../../src/test/java/com/project/jarihana/notificationdelivery/PushDeliveryWorkRepositoryTest.java)
- [PushDeliveryConcurrencyTest](../../src/test/java/com/project/jarihana/notificationdelivery/PushDeliveryConcurrencyTest.java)
