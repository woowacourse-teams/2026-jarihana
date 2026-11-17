# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | 256 | 1024 | 480 | 62.64 | 136.83 / 146.04 | 122850 / 6367 / 5 / 6311 | 314.12 | 942.68 | 479.95 | 779.31 / 1150.01 | 694.72 / 1531.46 / 1858.45 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1321.55 / 1749.14 |
| notify-batch | 1 | large-spread | 256 | 1024 | 480 | 47.18 | 135.04 / 145.28 | 121786 / 6249 / 5 / 6144 | 279.0 | 958.89 | 479.9 | 242.19 / 454.31 | 614.35 / 1161.61 / 2156.85 | 0 / 0 / 48000 | 6249 / 6249 / 0 | 1818.51 / 2355.67 |
