# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | 256 | 1024 | 480 | 41.41 | 132.43 / 142.82 | 127713 / 7168 / 0 / 6597 | 232.95 | 999.96 | 479.87 | 112.41 / 224.05 | 563.39 / 1009.22 / 1091.13 | 0 / 0 / 48000 | 0 / 0 / 0 | 1013.96 / 1127.74 |
| notify | 1 | large-spread | 256 | 1024 | 480 | 53.62 | 135.59 / 146.62 | 124256 / 6521 / 5 / 6521 | 268.45 | 961.79 | 479.94 | 176.11 / 266.5 | 584.02 / 1036.12 / 1211.48 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1060.9 / 1286.13 |
| notify-batch | 1 | large-spread | 256 | 1024 | 480 | 40.79 | 134.27 / 144.87 | 122857 / 6395 / 5 / 6256 | 231.73 | 956.01 | 479.9 | 116.53 / 259.53 | 594.24 / 1074.4 / 1905.37 | 0 / 0 / 48000 | 6395 / 6395 / 0 | 1825.83 / 2173.03 |
