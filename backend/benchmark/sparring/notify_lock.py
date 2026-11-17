"""Correlate PostgreSQL notification commit-lock logs with benchmark requests."""

from collections import defaultdict
import csv
import math
import re

# PostgreSQL 17 PreCommit_Notify: LockSharedObject(DatabaseRelationId, InvalidOid, 0, ...).
LOCK_ACQUIRED = re.compile(
    r"notifytrace pid=(\d+) xid=(\d+) .*?process \1 acquired AccessExclusiveLock "
    r"on object 0 of class 1262 of database 0 after ([\d.]+) ms"
)
LOCK_STARTED = re.compile(
    r"notifytrace pid=(\d+) xid=(\d+) .*?process \1 still waiting for AccessExclusiveLock "
    r"on object 0 of class 1262 of database 0 after [\d.]+ ms"
)


def percentile(values, fraction):
    ordered = sorted(values)
    return round(ordered[math.ceil(len(ordered) * fraction) - 1], 3) if ordered else None


def analyze(requests, transactions, log, output):
    waits = defaultdict(list)
    started = set()
    for line in log.splitlines():
        if match := LOCK_ACQUIRED.search(line):
            waits[int(match[2])].append(float(match[3]))
        elif match := LOCK_STARTED.search(line):
            started.add(int(match[2]))

    pairs = {"storage": [], "sse": []}
    matched = observed_waits = 0
    with output.open("w", newline="") as trace:
        rows = csv.writer(trace)
        rows.writerow(["index", "post_id", "xid", "notify_lock_ms", "storage_ms", "sse_ms"])
        for index, post_id, storage, deliveries in requests:
            xid = transactions.get(post_id)
            if xid is None:
                continue
            matched += 1
            times = waits.get(xid)
            lock = sum(times) if times else 0
            observed_waits += bool(times)
            rows.writerow([index, post_id, xid, lock if times else "", storage,
                           ";".join(str(value) for value in deliveries)])
            pairs["storage"].append((storage, lock))
            pairs["sse"].extend((delivery, lock) for delivery in deliveries)

    metrics = {}
    for name, samples in pairs.items():
        cut = percentile((latency for latency, _ in samples), 0.99)
        if cut is None:
            continue
        tail = [lock for latency, lock in samples if round(latency, 3) >= cut]
        metrics[name] = {
            "samples": len(samples),
            "p99_ms": cut,
            "p99_minus_observed_lock_ms": percentile(
                (max(0, latency - lock) for latency, lock in samples), 0.99),
            "tail_with_logged_wait": sum(lock > 0 for lock in tail),
            "tail_samples": len(tail),
            "tail_mean_logged_wait_ms": round(sum(tail) / len(tail), 3),
            "tail_max_logged_wait_ms": max(tail),
        }

    xids = set(transactions.values())
    return dict(matched_requests=matched, unmatched_requests=len(requests) - matched,
                requests_with_logged_wait=observed_waits, db_lock_wait_xids=len(waits),
                unmatched_lock_xids=len(set(waits) - xids),
                started_without_acquisition=len(started - waits.keys()),
                logged_wait_p99_ms=percentile((sum(times) for times in waits.values()), 0.99),
                logged_wait_max_ms=max(map(sum, waits.values()), default=None),
                logged_wait_total_ms=round(sum(map(sum, waits.values())), 3),
                log_threshold_ms=1, **metrics)
