"""Join physical JDBC leases, commit-lock wait intervals, and HTTP write timings."""

from bisect import bisect_right
from collections import defaultdict
import csv
from datetime import datetime, timezone
from io import StringIO

from notify_lock import LOCK_ACQUIRED, percentile


def analyze(timeline, pg_log, requests, post_requests, pool_size):
    leases = []
    for row in csv.DictReader(StringIO(timeline)):
        op = row["operation"]
        pid, asked, got, end = (int(row[k]) for k in
                               ("pid", "requested_us", "acquired_us", "closed_us"))
        leases.append((op, pid, row["request_id"], asked, got, end))
    writes = [lease for lease in leases if lease[0] == "write"]
    if not writes or any(not lease[1] for lease in leases):
        raise RuntimeError("Missing JDBC write leases or database backend PIDs")
    window_start = min(lease[3] for lease in writes)
    window_end = max(lease[5] for lease in writes)

    by_pid = defaultdict(list)
    changes = defaultdict(lambda: [0, 0])
    for op, pid, _, _, got, end in leases:
        changes[got][0] += 1
        changes[end][0] -= 1
        if op == "write":
            by_pid[pid].append((got, end))
    for items in by_pid.values():
        items.sort()

    found = matched = 0
    for line in pg_log.splitlines():
        match = LOCK_ACQUIRED.search(line)
        if not match:
            continue
        found += 1
        stamp = line[:line.index(" UTC notifytrace")]
        end = round(datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc).timestamp() * 1e6)
        start = end - round(float(match[3]) * 1000)
        intervals = by_pid[int(match[1])]
        pos = bisect_right(intervals, (end, float("inf")))
        if pos == 0:
            continue
        got, closed = intervals[pos - 1]
        # PostgreSQL's log timestamp has millisecond precision. Clip to the actual lease.
        start, end = max(start, got), min(end, closed)
        if start >= end:
            continue
        matched += 1
        changes[start][1] += 1
        changes[end][1] -= 1

    checkpoints = sorted(changes)
    held = locked = 0
    any_lock = [0]
    full_and_locked = [0]
    full = [0]
    lock_slots = [0]
    for left, right in zip(checkpoints, checkpoints[1:]):
        held += changes[left][0]
        locked += changes[left][1]
        width = right - left
        any_lock.append(any_lock[-1] + width * (locked > 0))
        full_and_locked.append(full_and_locked[-1] + width * (held >= pool_size and locked > 0))
        full.append(full[-1] + width * (held >= pool_size))
        lock_slots.append(lock_slots[-1] + width * locked)

    def integral(time, series):
        pos = max(0, min(bisect_right(checkpoints, time) - 1, len(checkpoints) - 2))
        left, right = checkpoints[pos:pos + 2]
        elapsed = min(max(time - left, 0), right - left)
        return series[pos] + (series[pos + 1] - series[pos]) * elapsed / (right - left)

    def busy(asked, got, series):
        return (integral(got, series) - integral(asked, series)) / 1000

    by_operation = defaultdict(list)
    write_wait_by_id = defaultdict(float)
    for op, _, request, asked, got, _ in leases:
        if not window_start <= asked <= window_end:
            continue
        wait = (got - asked) / 1000
        by_operation[op].append((wait, busy(asked, got, any_lock), busy(asked, got, full_and_locked)))
        if op == "write":
            write_wait_by_id[request] += wait

    operation_metrics = {}
    for op, rows in by_operation.items():
        wait, overlap, saturated = map(sum, zip(*rows))
        p99 = percentile((r[0] for r in rows), .99)
        tails = [row for row in rows if round(row[0], 3) >= p99]
        operation_metrics[op] = dict(
            connections=len(rows), acquire_p99_ms=p99, total_acquire_ms=round(wait, 3),
            lock_overlap_ms=round(overlap, 3), full_pool_lock_overlap_ms=round(saturated, 3),
            full_pool_lock_overlap_pct=round(100 * saturated / wait, 2) if wait else 0,
            requests_overlapping_full_pool_and_lock=sum(row[2] > 0 for row in rows),
            p99_tail_overlapping_full_pool_and_lock=sum(row[2] > 0 for row in tails),
            p99_tail_count=len(tails),
        )

    http = []
    for _, post_id, storage, _ in requests:
        key = post_requests.get(post_id)
        if key in write_wait_by_id:
            http.append((storage, write_wait_by_id[key]))
    http_p99 = percentile((latency for latency, _ in http), .99)
    return dict(
        db_waits=found, db_waits_matched_to_lease=matched, leases=len(leases),
        all_pool_full_ms=round(busy(window_start, window_end, full), 3),
        pool_full_with_notify_lock_ms=round(busy(window_start, window_end, full_and_locked), 3),
        notify_lock_connection_ms=round(busy(window_start, window_end, lock_slots), 3),
        operations=operation_metrics,
        matched_http_writes=len(http), http_p99_ms=http_p99,
        http_p99_minus_pool_wait_ms=percentile((max(0, a - b) for a, b in http), .99),
    )
