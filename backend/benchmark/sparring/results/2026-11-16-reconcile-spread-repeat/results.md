# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | 256 | 1024 | 480 | 50.87 | 135.35 / 145.44 | 123336 / 6422 / 5 / 6388 | 280.55 | 972.42 | 479.92 | 523.4 / 960.61 | 617.71 / 1252.84 / 1853.19 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1239.74 / 1867.67 |
| poll | 1 | large-spread | 256 | 1024 | 480 | 47.28 | 132.93 / 143.18 | 127708 / 7168 / 0 / 6603 | 281.73 | 942.2 | 479.95 | 215.47 / 396.86 | 574.04 / 1024.08 / 1134.73 | 0 / 0 / 48000 | 0 / 0 / 0 | 1008.96 / 1308.16 |
