# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | 256 | 1024 | 480 | 47.86 | 135.65 / 146.08 | 123266 / 6399 / 5 / 6395 | 251.47 | 993.5 | 479.99 | 386.91 / 829.61 | 600.32 / 1079.3 / 1539.01 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1015.85 / 1681.19 |
| poll-publish | 1 | large-spread | 256 | 1024 | 480 | 52.72 | 135.64 / 146.54 | 127643 / 7168 / 0 / 6574 | 259.72 | 977.81 | 479.91 | 282.35 / 595.97 | 593.88 / 1050.85 / 1192.36 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1022.38 / 1248.32 |
| poll | 1 | large-spread | 256 | 1024 | 480 | 46.17 | 132.4 / 142.64 | 127734 / 7168 / 0 / 6604 | 254.12 | 953.9 | 479.92 | 174.18 / 328.16 | 578.27 / 1024.9 / 1115.78 | 0 / 0 / 48000 | 0 / 0 / 0 | 989.43 / 1123.04 |
