# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | 256 | 1024 | 480 | 46.62 | 132.94 / 143.19 | 127675 / 7164 / 0 / 6591 | 264.31 | 942.86 | 479.76 | 421.36 / 821.25 | 586.39 / 1056.32 / 1381.38 | 0 / 0 / 48000 | 0 / 0 / 0 | 992.67 / 1652.74 |
| poll-publish | 1 | large-spread | 256 | 1024 | 480 | 44.15 | 135.56 / 146.32 | 127736 / 7168 / 0 / 6604 | 228.26 | 988.06 | 479.97 | 103.15 / 196.97 | 562.78 / 1011.77 / 1091.1 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 994.63 / 1148.59 |
| notify | 1 | large-spread | 256 | 1024 | 480 | 58.01 | 136.16 / 146.64 | 122201 / 6304 / 5 / 6201 | 290.58 | 976.83 | 479.91 | 983.69 / 1360.57 | 773.58 / 1682.23 / 2163.85 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1296.77 / 2039.66 |
