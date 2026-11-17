#!/usr/bin/env python3
"""Run real Sparring API and SSE against disposable Docker containers."""
import argparse
from collections import Counter
import base64
import contextlib
import hashlib
import hmac
import json
from pathlib import Path
import selectors
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid

from notify_lock import analyze as analyze_notify_lock
from pool_timeline import analyze as analyze_pool_timeline

ROOT = Path(__file__).resolve().parent
KEY = "sparring-benchmark-isolated-test-key"
# Each active topic has subscribers on each server in both topologies.
CASES = {
    "quiet": (8, 32, 0.2, False),
    "idle-many": (48, 192, 0, False),
    "spread": (24, 96, 24, False),
    "one-hot": (24, 192, 60, True),
}
LARGE_CASES = {
    "large-idle": (512, 2048, 0, False),
    "large-spread": (256, 1024, 480, False),
    "large-one-hot": (128, 1024, 800, True),
}
ALL_CASES = CASES | LARGE_CASES | {"recovery": (64, 256, 0, False)}
MODES = ("poll", "poll-publish", "notify-only", "notify", "notify-1s", "notify-batch", "notify-batch-immediate")
BATCH_MODES = {"notify-batch", "notify-batch-immediate"}
NOTIFY_DRIVEN = ("notify-only", "notify", "notify-1s", "notify-batch", "notify-batch-immediate")


def docker(*args, input_text=None):
    return subprocess.run(["docker", *args], input=input_text, text=True,
                          check=True, stdout=subprocess.PIPE).stdout.strip()


def sql(db, statement):
    return docker("exec", "-i", db, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1",
                  "-U", "bench", "-d", "bench", input_text=statement)


def wait_until(probe, seconds):
    deadline = time.monotonic() + seconds
    while True:
        try:
            result = probe()
            if result:
                return result
        except (OSError, urllib.error.HTTPError, subprocess.CalledProcessError):
            pass
        if time.monotonic() > deadline:
            raise RuntimeError(f"Startup probe timed out after {seconds}s")
        time.sleep(0.25)


def request(url, authorized=False):
    headers = {}
    if authorized:
        issued = int(time.time())
        def encode(payload):
            return base64.urlsafe_b64encode(payload).rstrip(b"=")
        unsigned = b".".join(encode(json.dumps(part).encode()) for part in (
            {"alg": "HS256"}, {"sub": "1", "iat": issued, "exp": issued + 3600}))
        signature = encode(hmac.digest(KEY.encode(), unsigned, hashlib.sha256))
        headers["Cookie"] = "accessToken=" + b".".join((unsigned, signature)).decode()
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=3) as response:
        return response.read()


def request_json(url, authorized=False):
    return json.loads(request(url, authorized))


def metric(server, name, statistic):
    values = request_json(server + "/actuator/metrics/sparring.benchmark." + name, authorized=True)
    return next(int(field["value"]) for field in values["measurements"] if field["statistic"] == statistic)


def notification_count(server, mode, event):
    if mode == "poll":
        return 0
    return metric(server, f"notifications.{event}", "COUNT")


QUERIES = """
SELECT json_build_object(
    'all', coalesce(sum(calls) FILTER (WHERE toplevel), 0),
    'revision', coalesce(sum(calls) FILTER (
        WHERE toplevel AND query ~* '^select [^,]+[.]revision from sparring_topic '), 0),
    'reconcile_sql_ms', round(coalesce(sum(total_exec_time) FILTER (
        WHERE toplevel AND query ~* '^select [^,]+[.]id,[^,]+[.]revision from sparring_topic '), 0)::numeric, 3),
    'reconcile', coalesce(sum(calls) FILTER (
        WHERE toplevel AND query ~* '^select [^,]+[.]id,[^,]+[.]revision from sparring_topic '), 0),
    'post', coalesce(sum(calls) FILTER (
        WHERE toplevel AND query ~* '^select p[.]id, p[.]member_id '), 0),
    'notify_sql_ms', round(coalesce(sum(total_exec_time) FILTER (
        WHERE NOT toplevel AND query ~* '(^|[[:space:]])pg_notify[(]'), 0)::numeric, 3),
    'notify', coalesce(sum(calls) FILTER (
        WHERE NOT toplevel AND query ~* '(^|[[:space:]])pg_notify[(]'), 0)
)
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database());
"""


WAIT_STATES = """
SELECT coalesce(json_agg(states), '[]')
FROM (
  SELECT state, wait_event_type AS type,
         CASE WHEN wait_event_type = 'Lock' AND wait_event = 'object' AND EXISTS (
                  SELECT 1 FROM pg_locks
                  WHERE pg_locks.pid = activity.pid AND NOT granted AND locktype = 'object'
                    AND classid = 'pg_database'::regclass AND objid = 0 AND objsubid = 0
                    AND mode = 'AccessExclusiveLock'
              ) THEN 'NotifyCommitLock' ELSE wait_event END AS event,
         CASE WHEN query ~* 'sparring_topic.*for (no key )?update' THEN 'topic_lock'
              WHEN query ~* '^commit' THEN 'commit'
              WHEN query ~* 'sparring_' THEN 'sparring_sql'
              ELSE 'other' END AS phase,
         count(*) AS sessions
  FROM pg_stat_activity activity
  WHERE datname = current_database() AND pid <> pg_backend_pid()
    AND backend_type = 'client backend' AND state <> 'idle'
  GROUP BY 1, 2, 3, 4
) states;
"""


def reconciliation_interval(mode, args):
    if mode == "notify-1s":
        return 1
    return args.reconcile_seconds if mode in {"notify", *BATCH_MODES} else 0


def jdbc_histogram(url):
    points = {}
    for line in request(url + "/actuator/prometheus", authorized=True).decode().splitlines():
        if line.startswith("sparring_benchmark_jdbc_seconds_"):
            labels, value = line.rsplit(None, 1)
            points[labels] = float(value)
    if not points:
        raise RuntimeError("JDBC benchmark timers are missing")
    return points


def jdbc_summary(before, after):
    import re
    groups = {}
    for sample, total in after.items():
        tags = dict(re.findall(r'(\w+)="([^"]+)"', sample))
        metric = sample.partition("{")[0].rsplit("_", 1)[-1]
        key = tags["operation"] + "/" + tags["stage"]
        group = groups.setdefault(key, {"buckets": {}})
        delta = total - before.get(sample, 0)
        if metric in ("count", "sum"):
            group[metric] = delta
        elif metric == "bucket":
            group["buckets"][float(tags["le"])] = delta

    results = {}
    for key, group in groups.items():
        n = int(group.get("count", 0))
        if n == 0:
            continue
        total = group["sum"]
        buckets = sorted(group["buckets"].items())

        def percentile(fraction):
            for bound, count in buckets:
                if count >= n * fraction:
                    return round(bound * 1000, 3) if bound != float("inf") else None
            return None

        results[key] = dict(count=n, total_ms=round(total * 1000, 2),
                            mean_ms=round(total * 1000 / n, 3),
                            p95_bucket_ms=percentile(.95), p99_bucket_ms=percentile(.99))
    return results


def db_memory(container):
    # Capture the whole database cgroup, including workers and shared memory.
    lines = docker("exec", container, "sh", "-c",
                   "cat /sys/fs/cgroup/memory.current; "
                   "awk '/^(anon|file|shmem) / {print $1, $2}' /sys/fs/cgroup/memory.stat").splitlines()
    stats = dict(line.split() for line in lines[1:])
    return {key: int(value) / 1048576 for key, value in dict(current=lines[0], **stats).items()}


def resources(container):
    # Docker Desktop, like modern Docker Linux hosts, runs these containers on cgroup v2.
    lines = docker("exec", container, "sh", "-c",
                   "cat /sys/fs/cgroup/cpu.stat; awk '/^VmRSS:/{print \"rss_kib\", $2}' /proc/1/status").splitlines()
    fields = {k: int(v) for k, v in (line.split() for line in lines)}
    return time.monotonic(), fields["usage_usec"], fields["rss_kib"]


def jvm_metrics(url):
    metrics = {
        "heap_used_bytes": ("jvm_memory_used_bytes", 'area="heap"'),
        "heap_committed_bytes": ("jvm_memory_committed_bytes", 'area="heap"'),
        "non_heap_used_bytes": ("jvm_memory_used_bytes", 'area="nonheap"'),
        "gc_pauses": ("jvm_gc_pause_seconds_count", ""),
        "gc_pause_seconds": ("jvm_gc_pause_seconds_sum", ""),
        "allocated_bytes": ("jvm_gc_memory_allocated_bytes_total", ""),
        "live_threads": ("jvm_threads_live_threads", ""),
        "jdbc_active": ("hikaricp_connections_active", ""),
        "jdbc_pending": ("hikaricp_connections_pending", ""),
        "jdbc_timeout": ("hikaricp_connections_timeout_total", ""),
        "http_busy": ("tomcat_threads_busy_threads", ""),
    }
    samples = {}
    for line in request(url + "/actuator/prometheus", authorized=True).decode().splitlines():
        if not line or line.startswith("#"):
            continue
        sample, value = line.rsplit(None, 1)
        name = sample.partition("{")[0]
        samples.setdefault(name, []).append((sample, value))
    result = {}
    for key, (name, label) in metrics.items():
        values = [float(value) for sample, value in samples.get(name, []) if label in sample]
        # Micrometer emits pause timers only after the first GC, and JDBC timeout is a counter.
        result[key] = sum(values) if values else (0 if key in {"gc_pauses", "gc_pause_seconds", "jdbc_timeout"} else None)
    return result


def sample_app(name, url, epoch):
    at, usage_usec, rss_kib = resources(name)
    try:
        jvm = jvm_metrics(url)
    except (OSError, urllib.error.HTTPError):
        jvm = None
    return dict(elapsed_seconds=round(at - epoch, 3), usage_usec=usage_usec,
                rss_mib=round(rss_kib / 1024, 2), jvm=jvm)


def jvm_summary(series):
    good = [sample["jvm"] for sample in series if sample["jvm"] is not None]
    start, end = series[0]["jvm"], series[-1]["jvm"]

    def peak(key, divisor=1):
        values = [item[key] for item in good if item[key] is not None]
        return round(max(values) / divisor, 2) if values else None

    def delta(key, multiplier=1):
        if start is None or end is None or start[key] is None or end[key] is None:
            return None
        return round((end[key] - start[key]) * multiplier, 2)

    cpu_intervals = [
        (b["usage_usec"] - a["usage_usec"]) / ((b["elapsed_seconds"] - a["elapsed_seconds"]) * 10000)
        for a, b in zip(series, series[1:]) if b["elapsed_seconds"] - a["elapsed_seconds"] >= 0.5
    ]
    return dict(peak_cpu_pct=round(max(cpu_intervals), 2) if cpu_intervals else None,
                peak_heap_mib=peak("heap_used_bytes", 1024**2),
                peak_committed_heap_mib=peak("heap_committed_bytes", 1024**2),
                peak_non_heap_mib=peak("non_heap_used_bytes", 1024**2),
                gc_count=delta("gc_pauses"), gc_pause_ms=delta("gc_pause_seconds", 1000),
                allocated_mib=delta("allocated_bytes", 1 / 1024**2),
                peak_live_threads=peak("live_threads"), peak_jdbc_active=peak("jdbc_active"),
                peak_jdbc_pending=peak("jdbc_pending"), jdbc_timeouts=delta("jdbc_timeout"),
                peak_http_busy=peak("http_busy"), missed_jvm_samples=len(series) - len(good))


def seed(db, rooms):
    # Include the same number of unsubscribed open topics to exercise active-room filtering.
    rows = sql(db, f"""
        WITH new_topics AS (
            INSERT INTO sparring_topic (created_at, updated_at, title, claim_a, claim_b,
                description, revision, creator_id, closes_at)
            SELECT now(), now(), 'benchmark ' || n, 'claim a', 'claim b',
                'benchmark fixture', 1, 1, timestamp '2099-01-01'
            FROM generate_series(1, {rooms * 2}) AS n
            RETURNING id
        ), voted AS (
            INSERT INTO sparring_vote (created_at, updated_at, topic_id, member_id, side)
            SELECT now(), now(), id, 1, 'MINT' FROM new_topics
        )
        SELECT id FROM new_topics ORDER BY id LIMIT {rooms};
    """).splitlines()
    return [int(row) for row in rows]


def launch_app(scope, name, args, network, db, mode):
    tag = f"{scope}-{name}"
    host_port = args.host_port_base + (name == "b") if args.host_port_base else ""
    docker("run", "-d", "--pull=never", "--name", tag, "--network", network,
           "-p", f"127.0.0.1:{host_port}:8080", "--mount", f"type=bind,src={args.jar},dst=/app.jar,readonly",
           "-e", f"ACCESS_TOKEN_SECRET={KEY}", "-e", f"DB_URL=jdbc:postgresql://{db}:5432/bench",
           "-e", "GITHUB_OAUTH_CLIENT_ID=benchmark-placeholder",
           "-e", "GITHUB_OAUTH_CLIENT_SECRET=benchmark-placeholder",
           "-e", "IMAGE_S3_PUBLIC_BASE_URL=https://example.test/api/images",
           "-e", "IMAGE_CDN_DELIVERY_BASE_URL=https://example.test/images",
           "-e", "DB_USERNAME=bench", "-e", "DB_PASSWORD=bench", args.java_image,
           "java", "-Xms192m", f"-Xmx{args.heap_mib}m", "-Xlog:gc:file=/tmp/sparring-gc.log:uptimemillis,level,tags",
           "-jar", "/app.jar",
           "--management.endpoints.web.exposure.include=health,metrics,prometheus",
           "--server.tomcat.mbeanregistry.enabled=true",
           "--chat.listener.enabled=false", "--jarihana.push.enabled=false",
           "--spring.datasource.hikari.maximum-pool-size=10",
           "--sparring.benchmark.metrics=true",
           f"--sparring.benchmark.notify={str(mode in NOTIFY_DRIVEN).lower()}",
           f"--sparring.benchmark.listen={str(mode != 'poll').lower()}",
           f"--sparring.benchmark.reconcile-seconds={reconciliation_interval(mode, args)}",
           f"--sparring.benchmark.batch-publish={str(mode in BATCH_MODES).lower()}",
           f"--sparring.benchmark.immediate-delivery={str(mode == 'notify-batch-immediate').lower()}",
           f"--sparring.benchmark.jdbc={str(args.jdbc).lower()}",
           f"--sparring.benchmark.jdbc-timeline={str(args.pool_timeline).lower()}",
           f"--sparring.benchmark.drop-revision={'2' if args.case == ['recovery'] else ''}")
    port = docker("port", tag, "8080/tcp").rsplit(":", 1)[1]
    url = "http://127.0.0.1:" + port + "/api"
    try:
        wait_until(lambda: request_json(url + "/groups?size=1"), 90)
    except RuntimeError:
        print(docker("logs", "--tail", "50", tag), flush=True)
        raise
    return tag, url


def run_trial(args, db, mode, machines, case):
    room_count, client_count, rate, hot = ALL_CASES[case]
    urls = [url for _, url in machines]
    names = [name for name, _ in machines]
    tag = f"{mode}-{len(names)}-{case}"
    topics = seed(db, room_count)
    config = args.output / (tag + ".input.json")
    config.write_text(json.dumps(dict(servers=urls, topics=topics, clients=client_count,
                                      rate=rate, seconds=args.seconds, hot=hot, member=1, key=KEY,
                                      recovery=case == "recovery",
                                      drainMs=1000 * (args.reconcile_seconds + 3)
                                      if case == "recovery" else 2200,
                                      verifyCommitted=args.verify_committed,
                                      notifyLock=args.notify_lock)))
    print("Running " + tag, flush=True)

    # Keep a bounded wait before the measurement starts. TextIO buffering after the sole
    # ready line is harmless because the worker waits for an explicit start signal.
    with subprocess.Popen(["node", ROOT / "load.mjs", config], text=True,
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE) as load:
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(load.stdout, selectors.EVENT_READ)
                if not selector.select(timeout=55) or load.stdout.readline().strip() != "ready":
                    raise RuntimeError("Load generator did not bring all subscriptions online")
            time.sleep(2)
            events = ("received", "dropped", "published", "batches") if mode in BATCH_MODES else ("received", "dropped")
            notices_before = {event: [notification_count(url, mode, event) for url in urls]
                              for event in events}
            db_samples = [db_memory(db)]
            jdbc_before = [jdbc_histogram(url) for url in urls] if args.jdbc else []
            db_wait_samples = []
            queries_before = json.loads(sql(db, QUERIES))
            before = {name: resources(name) for name in [db, *names]}
            epoch = time.monotonic()
            series = {name: [sample_app(name, url, epoch)] for name, url in machines}
            load.stdin.write("start\n")
            load.stdin.flush()
            stop_sampler = threading.Event()

            def sample():
                while not stop_sampler.wait(1):
                    db_samples.append(db_memory(db))
                    if args.jdbc:
                        db_wait_samples.append(dict(elapsed_seconds=round(time.monotonic()-epoch, 3),
                                                    states=json.loads(sql(db, WAIT_STATES))))
                    for name, url in machines:
                        try:
                            series[name].append(sample_app(name, url, epoch))
                        except subprocess.CalledProcessError:
                            return

            sampler = threading.Thread(target=sample)
            sampler.start()
            try:
                response, _ = load.communicate(timeout=args.seconds + 22)
            finally:
                stop_sampler.set()
                sampler.join()
            after = {name: resources(name) for name in [db, *names]}
            for name, url in machines:
                series[name].append(sample_app(name, url, epoch))
            queries_after = json.loads(sql(db, QUERIES))
            jdbc_after = [wait_until(lambda: jdbc_histogram(url), 20) for url in urls] if args.jdbc else []
            db_samples.append(db_memory(db))
            notices_after = {event: [] for event in events}
            for event in events:
                for url in urls:
                    try:
                        notices_after[event].append(notification_count(url, mode, event))
                    except OSError:
                        notices_after[event].append(None)
            if load.returncode != 0:
                raise RuntimeError(f"Load generator exited with {load.returncode}: {response}")
        finally:
            if load.poll() is None:
                load.kill()
            config.unlink(missing_ok=True)

    def cpu(name):
        start, baseline, _ = before[name]
        end, cumulative, _ = after[name]
        return round((cumulative - baseline) / ((end - start) * 10000), 2)

    result = json.loads(response)
    topic_list = ",".join(map(str, topics))
    if args.verify_committed:
        delivered = dict(result.pop("committed_observations"))
        committed = sql(db, f"SELECT id, topic_id FROM sparring_post WHERE topic_id IN ({topic_list});")
        clients_per_topic = Counter(topics[index % len(topics)] for index in range(client_count))
        expected = missing = duplicates = actual_db_posts = 0
        for row in committed.splitlines():
            post_id, topic = map(int, row.split("|"))
            receivers, repetitions = delivered.get(post_id, (0, 0))
            expected += clients_per_topic[topic]
            missing += clients_per_topic[topic] - receivers
            duplicates += repetitions
            actual_db_posts += 1
        result["sse_by_committed_posts"] = dict(expected=expected, missing=missing, duplicates=duplicates)
    else:
        actual_db_posts = int(sql(db, f"SELECT count(*) FROM sparring_post WHERE topic_id IN ({topic_list});"))
    if args.notify_lock:
        transactions = dict(
            tuple(map(int, line.split("|"))) for line in
            sql(db, f"SELECT id, xmin::text FROM sparring_post WHERE topic_id IN ({topic_list});").splitlines()
        )
        pg_log = subprocess.run(["docker", "logs", db], check=True, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20).stdout
        request_timings = result.pop("request_timings")
        if args.pool_timeline:
            timeline = docker("exec", names[0], "cat", "/tmp/sparring-jdbc-timeline.csv")
            post_requests = {}
            for line in sql(db, f"SELECT id, request_id FROM sparring_post WHERE topic_id IN ({topic_list});").splitlines():
                post_id, request = line.split("|")
                post_requests[int(post_id)] = request
            (args.output / (tag + "-pool-timeline.csv")).write_text(timeline + "\n")
            result["pool_timeline"] = analyze_pool_timeline(
                timeline, pg_log, request_timings, post_requests, 10)
        result["notify_lock_trace"] = analyze_notify_lock(
            request_timings, transactions, pg_log,
            args.output / (tag + "-notify-lock.csv"),
        )
    query_deltas = {key: queries_after[key] - value for key, value in queries_before.items()}
    if mode in BATCH_MODES:
        query_deltas["notify"] = sum(end - start for start, end in
                                    zip(notices_before["published"], notices_after["published"]))
    result.update(
        mode=mode, case=case, servers=len(names), rooms=room_count, clients=client_count,
        target_rate=room_count / args.seconds if case == "recovery" else rate, seconds=args.seconds, db_posts=actual_db_posts, db_cpu_pct=cpu(db),
        db_queries=query_deltas,
        app_cpu_pct=[cpu(name) for name in names],
        app_peak_rss_mib=[max(sample["rss_mib"] for sample in series[name]) for name in names],
        app_jvm=[jvm_summary(series[name]) for name in names],
        app_samples=[series[name] for name in names],
        db_memory_mib={key: dict(avg=round(sum(row[key] for row in db_samples) / len(db_samples), 2),
                                 peak=round(max(row[key] for row in db_samples), 2))
                       for key in db_samples[0]},
        db_memory_samples=db_samples,
        reconcile_seconds=reconciliation_interval(mode, args), heap_mib=args.heap_mib,
        jdbc_operations=[jdbc_summary(start, end) for start, end in zip(jdbc_before, jdbc_after)],
        db_wait_samples=db_wait_samples,
        **{f"notify_{event}": [end - start if end is not None else None
                              for start, end in zip(notices_before[event], notices_after[event])]
           for event in events},
    )
    (args.output / (tag + ".json")).write_text(json.dumps(result, indent=2) + "\n")
    return result


def run_mode(args, mode):
    scope = "sparring-bench-" + uuid.uuid4().hex[:8]
    network, db = scope + "-net", scope + "-db"
    machines = []
    docker("network", "create", network)
    try:
        lock_logging = []
        if args.notify_lock:
            lock_logging = ["-c", "log_lock_waits=on", "-c", "deadlock_timeout=1ms",
                            "-c", "log_line_prefix=%m notifytrace pid=%p xid=%x "]
        docker("run", "-d", "--pull=never", "--name", db, "--network", network,
               "-e", "POSTGRES_USER=bench", "-e", "POSTGRES_PASSWORD=bench",
               "-e", "POSTGRES_DB=bench", args.pg_image,
               "-c", "shared_preload_libraries=pg_stat_statements",
               "-c", "pg_stat_statements.track=all", *lock_logging)
        wait_until(lambda: docker("exec", db, "pg_isready", "-h", "127.0.0.1", "-U", "bench", "-d", "bench"), 45)
        docker("exec", "-i", db, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1", "-U", "bench", "-d", "bench",
               input_text="CREATE EXTENSION pg_stat_statements;")
        machines.append(launch_app(scope, "a", args, network, db, mode))
        sql(db, """
            INSERT INTO member (id, created_at, updated_at, github_id, crew_name, member_type)
            VALUES (1, now(), now(), 'sparring-benchmark', '벤치', 'MEMBER');
        """)
        if mode not in {"poll", *BATCH_MODES}:
            sql(db, args.trigger.read_text())
        for count in sorted(set(args.servers)):
            if count == 2:
                machines.append(launch_app(scope, "b", args, network, db, mode))
            if mode != "poll":
                wait_until(lambda: int(sql(db, """
                    SELECT count(*) FROM pg_stat_activity
                    WHERE application_name = 'sparring-benchmark-listener'
                      AND query = 'LISTEN sparring_benchmark_revision' AND state = 'idle';
                """)) == len(machines), 15)
                for _, url in machines:
                    wait_until(lambda: notification_count(url, mode, "received") >= 0, 10)
            for case in args.case:
                # A disconnected TCP stream may remain registered until its next heartbeat
                # fails. Avoid counting earlier trials' room queries in the next baseline.
                wait_until(lambda: all(metric(url, "active.rooms", "VALUE") == 0 for _, url in machines), 130)
                yield run_trial(args, db, mode, machines, case)
    finally:
        for name in [scope + "-b", scope + "-a", db]:
            with contextlib.suppress(subprocess.CalledProcessError):
                with (args.output / (mode + "-" + name.rsplit("-", 1)[-1] + ".log")).open("w") as log:
                    subprocess.run(["docker", "logs", name], stdout=log, stderr=log, timeout=15)
                if name != db:
                    gc_log = args.output / (mode + "-" + name.rsplit("-", 1)[-1] + "-gc.log")
                    subprocess.run(["docker", "cp", name + ":/tmp/sparring-gc.log", gc_log],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
                subprocess.run(["docker", "rm", "-f", "-v", name], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, check=True, timeout=30)
        docker("network", "rm", network)


def report(results, output):
    headers = ("mode", "servers", "scenario", "rooms", "clients", "target TPS", "DB CPU %",
               "DB memory avg / peak MiB", "queries / revision / reconcile / post", "app CPU %", "app peak RSS MiB", "write TPS",
               "write p95 / p99 ms", "SSE p50 / p95 / p99 ms", "missing / duplicate / expected",
               "NOTIFY emitted / received / dropped", "ACK to SSE p99 / max ms")
    lines = ["# Sparring SSE benchmark", "", "| " + " | ".join(headers) + " |",
             "| " + " | ".join("---" for _ in headers) + " |"]

    def display(*values):
        return " / ".join("—" if value is None else str(value) for value in values)

    for row in results:
        queries = row["db_queries"]
        values = [row[key] for key in ("mode", "servers", "case", "rooms", "clients", "target_rate", "db_cpu_pct")]
        values.extend([
            display(row["db_memory_mib"]["current"]["avg"], row["db_memory_mib"]["current"]["peak"]),
            display(queries["all"], queries["revision"], queries["reconcile"], queries["post"]),
            display(*row["app_cpu_pct"]), display(*row["app_peak_rss_mib"]),
            round(row["storage_tps"], 2), display(row["storage_p95_ms"], row["storage_p99_ms"]),
            display(row["sse_p50_ms"], row["sse_p95_ms"], row["sse_p99_ms"]),
            display(row["sse_missing"], row["sse_duplicates"], row["sse_expected"]),
            str(queries["notify"]) + " / " + " + ".join("—" if value is None else str(value)
                                                    for value in row["notify_received"]) + " / " + display(*row["notify_dropped"]),
            display(row["sse_from_ack_p99_ms"], row["sse_from_ack_max_ms"]),
        ])
        lines.append("| " + " | ".join(map(str, values)) + " |")
    output.write_text("\n".join(lines) + "\n")


def jvm_report(results, output):
    headers = ("mode", "servers", "scenario", "app", "CPU mean / peak %", "RSS peak MiB",
               "heap used / committed / non-heap peak MiB", "GC count / pause ms", "allocated MiB",
               "JVM threads / HTTP busy peak", "JDBC active / pending peak / timeout count",
               "missed samples")
    lines = ["# Backend JVM and process metrics", "", "| " + " | ".join(headers) + " |",
             "| " + " | ".join("---" for _ in headers) + " |"]

    def display(*values):
        return " / ".join("—" if value is None else str(value) for value in values)

    for row in results:
        for index, jvm in enumerate(row["app_jvm"]):
            values = [row["mode"], row["servers"], row["case"], chr(ord("A") + index),
                      display(row["app_cpu_pct"][index], jvm["peak_cpu_pct"]),
                      row["app_peak_rss_mib"][index],
                      display(jvm["peak_heap_mib"], jvm["peak_committed_heap_mib"], jvm["peak_non_heap_mib"]),
                      display(jvm["gc_count"], jvm["gc_pause_ms"]), display(jvm["allocated_mib"]),
                      display(jvm["peak_live_threads"], jvm["peak_http_busy"]),
                      display(jvm["peak_jdbc_active"], jvm["peak_jdbc_pending"], jvm["jdbc_timeouts"]),
                      jvm["missed_jvm_samples"]]
            lines.append("| " + " | ".join(map(str, values)) + " |")
    output.write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jar", required=True, type=lambda path: Path(path).resolve())
    parser.add_argument("--trigger", default=ROOT / "notify.sql", type=Path)
    parser.add_argument("--output", required=True, type=lambda path: Path(path).resolve())
    parser.add_argument("--host-port-base", type=int, default=0,
                        help="Optional first loopback port (the second app uses the next port)")
    parser.add_argument("--verify-committed", action="store_true",
                        help="Reconcile all committed post IDs with SSE, including HTTP timeouts")
    parser.add_argument("--seconds", default=15, type=int)
    parser.add_argument("--case", nargs="+", choices=ALL_CASES, default=list(CASES))
    parser.add_argument("--servers", nargs="+", type=int, choices=[1, 2], default=[1, 2])
    parser.add_argument("--mode", nargs="+", choices=MODES, default=["poll", "notify"])
    parser.add_argument("--pg-image", default="postgres:17")
    parser.add_argument("--java-image", default="amazoncorretto:21")
    parser.add_argument("--reconcile-seconds", type=int, default=5)
    parser.add_argument("--heap-mib", type=int, default=384)
    parser.add_argument("--jdbc", action="store_true", help="Measure JDBC acquisition, lease, commit and topic-lock query by operation")
    parser.add_argument("--notify-lock", action="store_true",
                        help="Join request timings with PostgreSQL's NOTIFY commit-lock logs")
    parser.add_argument("--pool-timeline", action="store_true",
                        help="Correlate timed JDBC acquisitions and leases with NOTIFY lock logs")
    args = parser.parse_args()
    if args.pool_timeline:
        args.notify_lock = args.jdbc = True
    if args.notify_lock and (args.servers != [1] or len(args.case) != 1):
        parser.error("--notify-lock requires one server and one case per run")
    if args.heap_mib < 192:
        parser.error("--heap-mib must be at least 192")
    if not 0 <= args.reconcile_seconds <= 15:
        parser.error("--reconcile-seconds must be between 0 and 15")
    if "recovery" in args.case and (args.case != ["recovery"] or not args.reconcile_seconds
                                    or set(args.mode) - {"poll", "notify"}):
        parser.error("run recovery separately with reconciliation enabled")
    if not 0 <= args.host_port_base < 65535:
        parser.error("--host-port-base must be between 0 and 65534")
    if not 5 <= args.seconds <= 75:
        parser.error("--seconds must be between 5 and 75 (SSE emitter times out at 120s)")
    if not args.jar.is_file():
        parser.error("--jar must point to the application bootJar")
    if set(args.mode) - {"poll"} and not args.trigger.is_file():
        parser.error("--trigger must point to the benchmark trigger SQL")
    args.output.mkdir(parents=True, exist_ok=True)
    environment = {
        "docker": json.loads(docker("info", "--format",
                                    '{"version":"{{.ServerVersion}}","arch":"{{.Architecture}}",'
                                    '"cpus":{{.NCPU}},"memory_bytes":{{.MemTotal}}}')),
        "pg_image": docker("image", "inspect", args.pg_image, "--format", "{{.Id}}"),
        "java_image": docker("image", "inspect", args.java_image, "--format", "{{.Id}}"),
        "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    }
    with tempfile.TemporaryDirectory(prefix="bootjar-", dir=args.output) as directory:
        jar = Path(directory) / "app.jar"
        shutil.copyfile(args.jar, jar)
        with jar.open("rb") as artifact:
            environment["jar_sha256"] = hashlib.file_digest(artifact, "sha256").hexdigest()
        (args.output / "environment.json").write_text(json.dumps(environment, indent=2) + "\n")
        args.jar = jar
        results = []
        for mode in args.mode:
            print(f"Starting {mode} environment", flush=True)
            for row in run_mode(args, mode):
                results.append(row)
                report(results, args.output / "results.md")
                jvm_report(results, args.output / "jvm.md")


if __name__ == "__main__":
    main()
