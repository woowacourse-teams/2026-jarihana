# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-batch-immediate | 1 | large-spread | 256 | 1024 | 480 | 46.91 | 134.37 / 145.05 | 130793 / 7669 / 5 / 6778 | 257.22 | 991.84 | 479.94 | 160.24 / 306.91 | 557.54 / 1041.97 / 1293.51 | 0 / 0 / 48000 | 6389 / 6389 / 0 | 1051.26 / 1299.43 |
| notify-batch | 1 | large-spread | 256 | 1024 | 480 | 41.74 | 134.42 / 145.16 | 121487 / 6232 / 5 / 6071 | 246.87 | 947.59 | 479.92 | 146.1 / 312.8 | 619.21 / 1373.93 / 1988.32 | 0 / 0 / 48000 | 6372 / 6372 / 0 | 1836.83 / 2011 |
