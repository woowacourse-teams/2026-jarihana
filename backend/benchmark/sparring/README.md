# 토론해요 SSE 스트림 비교

## 비교할 때 사용하는 이름과 주기

활성 방은 해당 서버에 SSE 구독자가 한 명 이상 연결된 방이다.
`revision`은 글 저장 또는 투표 변경이 커밋될 때 증가하는 방의 변경 번호다.
보완 조회는 활성 방의 변경 번호를 한 SQL로 조회하고, 서버가 알고 있는 번호보다
큰 방만 다시 읽어 알림 유실을 복구하는 작업이다.

| 표의 이름 | 러너 모드 | NOTIFY 발행 시점 | 메시지 조회·SSE 전송 시작 | 보완 조회 |
| --- | --- | --- | --- | --- |
| 서버 폴링 | `poll` | 사용하지 않음 | 활성 방마다 약 1초 주기 | 폴링으로 확인 |
| 노티파이 5초 | `notify` | 글·투표 변경 트랜잭션마다 | 수신 신호를 모아 약 1초 주기 | 5초 |
| 노티파이 1초 | `notify-batch` | 변경 방을 모아 약 1초 주기 | 수신 신호를 모아 약 1초 주기 | 5초 |
| 노티파이 1초 즉시 전송 | `notify-batch-immediate` | 변경 방을 모아 약 1초 주기 | 수신 직후 비동기 조회 요청 | 5초 |

위 이름의 5초는 보완 조회 간격이고, 1초는 방별 발행 배치 간격이다.
발행 스케줄러는 이전 실행 종료 후 1초를 기다리는 fixed delay 방식이므로
DB·커넥션 풀 대기가 길면 실제 발행 간격도 길어진다. 동일 방의 조회가 진행 중이면
후속 변경 신호를 병합하며, 즉시 전송 모드에서는 조회 종료 직후 다시 확인한다.
초기 스냅샷과 keepalive는 공통 주기 작업에서 처리한다.

[동일 회차 무채팅·480 TPS 비교](results/2026-11-17-single-three-mode/comparison.md)와
[수신 직후 전송 변경 전후 2회 비교](results/2026-11-17-immediate-delivery/comparison.md)에
DB·백엔드 CPU와 메모리, GC, 저장·SSE p99, 실패·누락·중복을 기록했다.
성능 측정 당시 JAR 해시는 각 결과의 `environment.json`에 있다. 이후 PR 준비에서
최신 develop을 반영했으므로 체크아웃을 다시 빌드한 JAR은 당시 해시와 달라질 수 있다.

GC 표는 Micrometer의 `jvm_gc_pause_seconds` 계기 차이를 사용한다.
로그의 모든 G1 단계나 전체 JVM safepoint STW를 합산한 값과는 범위가 다르다.

## 기본 폴링과 알림 수신 동작

활성 토론방은 해당 JVM에 SSE 구독자가 한 명 이상 있는 방이다. 두 모드 모두 JVM마다 1초 틱을 돌고, 동시에 실행하는 조회는 방마다 하나로 제한한다. 새 구독은 방이 존재하는지 확인한 뒤 다음 틱에서 스냅샷을 받는다. 초기 조회는 최신 30개, 이후에는 기존 커서보다 큰 ID를 가진 글 전체를 ID 오름차순으로 읽는다. 투표 수와 메시지 조회는 같은 `REPEATABLE READ` 트랜잭션에서 실행한다. 두 모드가 같은 조회 서비스와 `snapshot`, `update`, 호환용 `revision`, keepalive 전송 경로를 사용한다.

- **Poll**은 모든 활성 방에서 매 틱 revision을 조회한다.
- **Notify**는 `sparring_topic.revision`이 바뀔 때 방 ID와 revision을 트랜잭션 안에서 발행한다. 기존 글 쓰기와 표 변경은 방 잠금을 잡고 revision을 한 번 증가시킨다. 동일 요청 ID로 성공한 저장을 재시도하면 기존 글을 반환한다. DB 트리거는 구독 여부와 무관하게 발행한다. 앱 서버마다 PostgreSQL 전용 연결 하나가 알림을 읽고, 로컬에 구독자가 있는 방만 다음 틱 조회 대상으로 표시한다. 같은 틱에 여러 신호가 와도 방은 한 번 조회한다. LISTEN 재연결이 커밋된 뒤 모든 로컬 활성 방을 다시 표시해 연결 단절 중 커밋된 상태를 따라잡는다. [PostgreSQL LISTEN](https://www.postgresql.org/docs/17/sql-listen.html), [PostgreSQL NOTIFY](https://www.postgresql.org/docs/17/sql-notify.html)

기본 설정은 Poll이다. `notify.sql`은 Flyway 경로 밖에 있으며 실험용 PostgreSQL에만 설치한다. `sparring.benchmark.notify=true`와 트리거를 함께 사용한다. 배치 간격은 1초이며, 진행 중인 조회·DB 부하·SSE 큐 대기로 실제 전달은 1초보다 길어질 수 있다.

## 재현

Java 21, Docker Engine과 cgroup v2, Python 3.11 이상, Node 22가 필요하다. 로컬에 `postgres:17`, `amazoncorretto:21` 이미지가 있어야 한다. 저장소 루트에서 아래 명령을 실행한다.

```bash
(cd backend && ./gradlew bootJar test --tests '*SparringStreamsTest' --tests '*SparringBenchmarkListenerTest' --tests '*SparringAcceptanceTest')
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --output /tmp/sparring-results --seconds 15
```

실험마다 임시 Docker 네트워크와 DB를 사용한다. 각 토폴로지에는 아래 4개 시나리오를 동일하게 적용한다. 두 JVM에서는 모든 활성 방을 두 서버에 구독시키고 쓰기를 교대로 보낸다. 실제 HTTP 쓰기 API가 지나는 투표·방 잠금·멱등성·커밋 경로와 실제 HTTP SSE를 사용한다. 실제 무중단 배포의 프록시 전환과 클라이언트 재연결은 별도 검증 대상이다. 기존 SSE 재연결은 최신 30개 스냅샷을 보낸다.

| 시나리오 | 활성 방 | 전체 SSE 연결 | 목표 글/초 | 분포 |
| --- | ---: | ---: | ---: | --- |
| quiet | 8 | 32 | 0.2 | 분산 |
| idle-many | 48 | 192 | 0 | 글 없음 |
| spread | 24 | 96 | 24 | 방별 고르게 |
| one-hot | 24 | 192 | 60 | 한 방에 약 90% |

DB 쿼리와 발행 수는 `pg_stat_statements` 호출 수 차이, 수신 수는 각 앱 인스턴스의 Micrometer 카운터 차이를 사용한다. CPU의 100%는 논리 CPU 한 개 사용에 해당하고, 메모리는 앱 프로세스의 표본 최대 RSS이다. 저장 지연은 HTTP 요청을 보내고 성공 응답을 읽을 때까지, SSE 지연은 같은 요청을 보낸 시점부터 구독자가 결과 메시지를 파싱할 때까지다. CPU·쿼리 집계에는 마지막 메시지를 받기 위한 2.2초 대기 구간도 포함된다. 글 쓰기에는 동일한 테스트 계정 1개를 사용한다. 성공한 글이 해당 방의 구독 연결별로 몇 번 도착했는지 ID로 집계한다. 호환용 `revision` 이벤트는 메시지로 세지 않는다. 글이 없는 케이스에는 지연 표본이 없다.

결과 디렉터리에는 `results.md` 비교표, 환경 및 JAR 해시, 케이스별 JSON, 컨테이너 로그가 나온다. JSON에는 실제 DB 글 수, HTTP 에러, SSE 연결 종료, 부하 생성기 지연도 포함한다. 짧은 로컬 실험은 이 환경의 상대적인 차이를 보여 주며 최대 처리량이나 운영의 꼬리 지연을 확정하는 데 필요한 반복·장시간 표본은 별도로 확보해야 한다.

[2026-11-16 실측 결과 및 분석](results/2026-11-16/results.md)

## 대규모 부하와 백엔드 자원 계측

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --case large-idle large-spread large-one-hot \
  --seconds 25 --output /tmp/sparring-large
```

| 시나리오 | 활성 방 | 전체 SSE 연결 | 목표 글/초 | 분포 |
| --- | ---: | ---: | ---: | --- |
| large-idle | 512 | 2,048 | 0 | 글 없음 |
| large-spread | 256 | 1,024 | 480 | 방별 고르게 |
| large-one-hot | 128 | 1,024 | 800 | 한 방에 약 90% |

`jvm.md`에는 서버별 평균 CPU와 표본 구간 최대 CPU, 최대 RSS와 JVM 힙 사용·확보 및 비힙 메모리, GC 정지 횟수와 누적 정지 시간, 힙 할당량, JVM·Tomcat 스레드 및 JDBC 풀 사용·대기·타임아웃을 기록한다. 케이스별 JSON의 `app_samples`에서 약 1초 간격의 원본 표본을 볼 수 있다. GC 로그 파일은 JVM 시작 시점부터 쌓이며 `jvm.md`의 GC 수치는 각 측정 구간의 누적 계기 차이다. `-Xmx384m`와 JDBC 풀 최대 10개를 양쪽에 동일하게 적용한다.

저장 TPS와 지연에는 HTTP 성공 응답을 기준으로 집계하고 DB에 실제로 저장된 건수도 함께 남긴다. SSE 누락은 성공 응답을 확인한 메시지를 기준으로, 쓰기 완료 뒤 2.2초까지의 관측 안에서 계산한다. 초과 지연과 영구 누락을 구분하려면 별도의 장시간 관측이 필요하다.

HTTP 응답을 받지 못한 요청까지 검사하려면 `--verify-committed`를 추가한다. SSE 관측을 종료한 뒤 DB에서 읽은 글 ID를 각 구독 연결이 관측한 결과와 대조해 `sse_by_committed_posts`에 기록한다. 이 대조에는 SSE 관측 종료와 DB 조회 사이에 커밋된 글도 포함될 수 있다. 두 서버의 집중 부하만 재실행하려면 `--case large-one-hot --servers 2`를 함께 지정한다.

[대규모 실측 결과 및 JVM 메트릭](results/2026-11-16-large/results.md)

## 단일 인스턴스 보완 조회 실험

러너는 기본적으로 Notify 모드에서 활성 방의 ID와 revision을 5초 간격으로
한 쿼리에 읽는다. 차이가 있는 방만 기존 1초 SSE 처리에 넘긴다.
`--reconcile-seconds 0`으로 보완 조회를 끈 Notify를 실행할 수 있다.
애플리케이션 기본값은 기존 Poll이며, 보완 조회와 의도적 누락도 기본 설정에서 꺼져 있다.

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-idle large-spread large-one-hot --seconds 25 \
  --reconcile-seconds 5 --verify-committed --output /tmp/sparring-reconcile-large
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case recovery --seconds 35 \
  --reconcile-seconds 5 --verify-committed --output /tmp/sparring-reconcile-recovery
```

복구 실험은 활성 방 64개와 구독 256개를 열고 방마다 글을 한 건씩 쓴다.
Notify 리스너는 연결을 유지하며 revision 2 알림을 수신 직후 버린다. 다음 글이나
리스너 재접속 없이 보완 조회로 복구한다. 양쪽 모두 쓰기 종료 후 8초 동안 SSE를
관측한다(보완 주기 5초 기준). 복구 지연은 HTTP 성공 응답에서 SSE 파싱까지이며,
일반 SSE 지연은 HTTP 요청 시작에서 SSE 파싱까지다.

DB 메모리는 PostgreSQL 컨테이너 전체 cgroup의 `memory.current` 표본 평균과
최대값이며 파일 캐시와 공유 메모리를 포함한다. 케이스별 JSON에는 `memory.stat`의
anon, file, shmem도 기록한다. shmem은 file에 포함된다. DB CPU 100%는 논리 코어
하나 사용을 뜻한다.

[단일 인스턴스 대규모 실측](results/2026-11-16-reconcile-large/results.md) ·
[백엔드 JVM 및 GC](results/2026-11-16-reconcile-large/jvm.md) ·
[알림 누락 복구](results/2026-11-16-reconcile-recovery/results.md) ·
[분산 부하에서 실행 순서를 뒤집은 재측정](results/2026-11-16-reconcile-spread-repeat/results.md)

## 발행과 보완 조회 비용 분리

480 TPS 분산 부하에서 한 JVM과 구독 1,024개를 사용한다. 모드마다 새 DB와
앱 컨테이너를 띄운다. 발행을 켠 모드는 같은 트리거와 LISTEN 연결을 사용한다.

| 러너 모드 | 트리거 발행 및 수신 | 일반 SSE 조회 | 5초 일괄 보완 |
| --- | --- | --- | --- |
| poll | 꺼짐 | 활성 방 전체 폴링 | 꺼짐 |
| poll-publish | 켜짐 | 활성 방 전체 폴링 | 꺼짐 |
| notify-only | 켜짐 | 신호를 받은 방만 조회 | 꺼짐 |
| notify | 켜짐 | 신호를 받은 방만 조회 | 켜짐 |

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --verify-committed \
  --mode poll poll-publish notify-only notify --output /tmp/sparring-ablation-a
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --verify-committed \
  --mode notify notify-only poll-publish poll --output /tmp/sparring-ablation-b
```

`poll`과 `poll-publish`의 차이에는 트리거 발행, PostgreSQL 알림 큐 처리,
리스너 수신이 함께 포함된다. `notify-only`와 `notify`는 보완 조회만 다르다.
JSON의 `db_queries.notify_sql_ms`는 중첩 `pg_notify` SQL 실행 시간의 합계이며
트랜잭션 커밋 경로의 알림 큐 대기 시간은 별도로 계측하지 않는다.

3회차는 같은 설정에서 `--mode notify-only notify`를 사용했다.
`db_queries.reconcile_sql_ms`는 보완 revision SQL 실행 시간의 합계다.

[1회차 실측](results/2026-11-16-notify-ablation-a/results.md) ·
[2회차 역순 실측](results/2026-11-16-notify-ablation-b/results.md) ·
[3회차 추가 계측](results/2026-11-16-notify-ablation-c/results.md)

## JDBC 커넥션 대기와 점유 계측

`--jdbc`를 켜면 동일 HikariCP 풀에서 글 저장(`write`), SSE 메시지·revision 조회
(`read`), 일괄 revision 보완 조회(`reconcile`)를 나눠 기록한다. 각 작업에서
`DataSource.getConnection()` 요청부터 반환까지(`acquire`), 커넥션을 받은 뒤
`close()`로 반환할 때까지(`hold`), JDBC `commit()`, 저장의 방 잠금 SELECT
실행 시간(`topic_lock`)을 측정한다. 잠금 SELECT 시간에는 쿼리 실행과 네트워크도
포함된다. JSON의 p95·p99는 히스토그램 구간의 상한이다. `db_wait_samples`는
PostgreSQL 활성 세션의 간헐적 표본이고 누적 평생 대기 시간은 아니다.
`notify-1s`의 보완 주기는 1초이며 `notify`는 `--reconcile-seconds`를 따른다.

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --mode poll notify-1s notify --servers 1 --case large-spread \
  --seconds 25 --jdbc --verify-committed --output /tmp/sparring-jdbc-spread
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --mode notify notify-1s poll --servers 1 --case large-one-hot \
  --seconds 25 --jdbc --verify-committed --output /tmp/sparring-jdbc-hot
```

집중 800 TPS 계측은 기존 힙 한도 384 MiB에서 HTTP 타임아웃과 메트릭 수집
실패가 발생했다. `--heap-mib 768 --mode poll notify-1s`로 힙 한도를 동일하게
높인 추가 실험을 실행했다. 집중 실험의 p99는 응답 또는 SSE를 관측한 표본의
값이며, 종료 시점까지 관측하지 못한 전달은 케이스 JSON의
`sse_by_committed_posts`에서 확인한다.

[분산 부하](results/2026-11-16-jdbc-spread/results.md) ·
[분산 부하 역순 재측정](results/2026-11-16-jdbc-spread-repeat/results.md) ·
[집중 부하 384 MiB](results/2026-11-16-jdbc-hot-retry/results.md) ·
[집중 부하 768 MiB](results/2026-11-16-jdbc-hot-768m/results.md) ·
[1초 보완 조회 복구](results/2026-11-16-recovery-1s/results.md)

## 요청별 NOTIFY 커밋 락 대기

`--notify-lock`을 켜면 실험 DB에 `log_lock_waits=on`과
`deadlock_timeout=1ms`를 설정한다. PostgreSQL 17이 NOTIFY 큐를 직렬화하는
`AccessExclusiveLock`의 획득 로그만 읽고, 로그의 트랜잭션 ID와 저장된 글의
`xmin`을 연결한다. 같은 글의 HTTP 성공 응답 및 구독 연결별 SSE 소요 시간을
`*-notify-lock.csv`에 기록한다. 각 요청의 락 대기 열이 비어 있으면 해당 락의
획득 로그가 없다는 뜻이다. 문턱 미만의 짧은 대기는 이 방법으로 볼 수 없다.

JSON의 `p99_minus_observed_lock_ms`는 각 지연 표본에서 그 요청에 기록된
락 대기를 뺀 뒤 순위를 다시 매긴 값이다. 이 계산은 그 요청에서 관측된 직접
대기만 보며, 락이 후속 요청의 풀 대기에 미친 파급 효과는 포함하지 않는다.

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --reconcile-seconds 5 \
  --verify-committed --notify-lock --mode poll notify --output /tmp/sparring-notify-lock
```

[요청별 락 계측 1회차](results/2026-11-16-notify-lock-a/results.md) ·
[역순 2회차](results/2026-11-16-notify-lock-b/results.md)

## NOTIFY 큐 락과 JDBC 풀 대기 타임라인

`--pool-timeline`은 `--jdbc`와 `--notify-lock`을 함께 켠다.
같은 Docker VM에서 DB 로그의 락 획득 시각과 대기 시간을 JDBC 연결의
PostgreSQL 백엔드 PID, 획득 시각, 반납 시각에 연결한다.
저장은 REST 요청 UUID를 저장된 글에 연결한다. SSE 조회는 풀에서 기다린
구간을 작업 단위로 집계한다. 조회 한 건이 여러 메시지를 가져올 수 있다.

JSON의 `pool_timeline.operations`에는 10개 커넥션이 사용 중이고
그중 하나 이상이 NOTIFY 커밋 락 대기 중인 시간과 각 획득 대기가 겹친
길이를 기록한다. 이는 같은 시간에 발생한 대기다. 락이 빠졌을 때 다른
커넥션에 작업이 배정되는 순서까지 재현하는 값은 아니다.
`http_p99_minus_pool_wait_ms`는 각 저장 HTTP 응답 시간에서 그 요청의
실제 JDBC 획득 시간을 빼고 순위를 다시 매긴 값이다.

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --pool-timeline --verify-committed \
  --mode poll poll-publish notify --output /tmp/sparring-pool-timeline
```

`poll-publish`는 1초 폴링을 유지하면서 NOTIFY 발행과 수신만 켠 대조군이다.

[타임라인 종합](results/2026-11-16-pool-timeline-a/comparison.md) ·
[타임라인 1회차](results/2026-11-16-pool-timeline-a/results.md) ·
[역순 2회차](results/2026-11-16-pool-timeline-b/results.md)

## 방별 1초 NOTIFY 발행

`notify`는 글·투표 트랜잭션에서 revision 변경당 트리거로 직접 발행한다.
`notify-batch`는 트리거를 설치하지 않고, 저장 커밋 후 메모리의 변경 방 집합에
방 ID를 기록한다. 전용 스케줄러가 약 1초마다 이 집합을 가져와 변경된 방당
알림 한 건을 단일 DB 트랜잭션으로 발행한다. 배치 실행이 실패하면 해당 방을
집합으로 되돌린다. 커밋과 발행 사이에 프로세스가 재시작하면 5초 revision
보완 조회가 누락된 신호를 복구한다. SSE 전송 주기와 조회 경로는 양쪽에서
같다. 방을 모으는 발행 틱과 SSE 전송 틱은 별도로 실행한다.

`notify-batch`의 알림 발행 건수는 성공한 발행 작업의 Micrometer 카운터이며
`notify_batches`는 성공한 배치 트랜잭션 수이다. `notify`는 트리거 내부
`pg_notify` 호출 수를 사용한다. 락 대기는 두 방식에서 같은 1ms 로그 문턱으로
기록한다.

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --verify-committed --pool-timeline \
  --reconcile-seconds 5 --mode notify notify-batch --output /tmp/sparring-notify-batch-a
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --verify-committed --pool-timeline \
  --reconcile-seconds 5 --mode notify-batch notify --output /tmp/sparring-notify-batch-b
```

[방별 발행 비교표](results/2026-11-17-batch-notify-a/comparison.md)

## 배치 발행 후 즉시 SSE 전달 비교

`notify-batch-immediate`는 기존 `notify-batch`와 같은 방별 1초 발행을 사용한다.
알림을 받은 활성 방은 바로 기존 조회·SSE 전송 작업을 시작한다. 조회 중 도착한
알림은 방별로 병합한 뒤 조회가 끝나면 즉시 처리한다. 5초 보완 조회와 LISTEN
재연결로 발견한 변경도 즉시 조회한다. 초기 구독과 keepalive는 기존 주기로 처리한다.

```bash
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --verify-committed \
  --jdbc --notify-lock --pool-timeline \
  --mode poll notify notify-batch notify-batch-immediate \
  --output /tmp/sparring-immediate-a
python3 backend/benchmark/sparring/run.py \
  --jar backend/build/libs/jarihana-0.0.1-SNAPSHOT.jar \
  --servers 1 --case large-spread --seconds 25 --verify-committed \
  --jdbc --notify-lock --pool-timeline \
  --mode notify-batch-immediate notify-batch \
  --output /tmp/sparring-immediate-b
```


## 결과 파일 보관

저장소에는 실행 환경과 JSON 원본 표본, Markdown 결과표를 보관한다.
DB·JVM 로그와 요청별 CSV는 로컬 결과 디렉터리에 남기며, 재실행하면 같은 형식으로
생성된다. PostgreSQL 로그의 1ms 이상 대기 표본과 짧은 로컬 실험 결과로
운영 환경의 p99 또는 유실 복구 상한을 보장할 수는 없다.
