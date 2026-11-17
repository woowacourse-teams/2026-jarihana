# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | 256 | 1024 | 480 | 45.99 | 135.42 / 146.36 | 124364 / 6540 / 5 / 6533 | 249.65 | 945.33 | 479.77 | 165.77 / 293 | 570.35 / 1022.44 / 1147.2 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 993.53 / 1315.55 |
| poll | 1 | large-spread | 256 | 1024 | 480 | 36.98 | 132.33 / 142.98 | 127727 / 7168 / 0 / 6608 | 220.82 | 984.55 | 479.95 | 96.45 / 224.26 | 556.67 / 1007.72 / 1070.03 | 0 / 0 / 48000 | 0 / 0 / 0 | 989.98 / 1061.22 |
