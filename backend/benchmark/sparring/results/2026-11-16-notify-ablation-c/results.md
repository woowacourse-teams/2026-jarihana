# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-only | 1 | large-spread | 256 | 1024 | 480 | 55.29 | 138.68 / 148.75 | 120089 / 6042 / 0 / 5943 | 320.49 | 1002.93 | 479.94 | 2365.43 / 2799.01 | 851.57 / 3028.39 / 3616.64 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1522.11 / 2868.37 |
| notify | 1 | large-spread | 256 | 1024 | 480 | 54.09 | 135.23 / 145.57 | 123043 / 6386 / 5 / 6351 | 278.1 | 971.07 | 474.62 | 1086.24 / 1533.46 | 675.8 / 1678.43 / 2294.76 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1292.58 / 2114.86 |
