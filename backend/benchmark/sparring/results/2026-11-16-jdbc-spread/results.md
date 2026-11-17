# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | 256 | 1024 | 480 | 51.26 | 133.47 / 143.09 | 127514 / 7166 / 0 / 6535 | 300.72 | 951.32 | 479.82 | 783.45 / 1250.32 | 640.93 / 1325.56 / 1934.86 | 0 / 0 / 48000 | 0 / 0 / 0 | 1030.32 / 1779.04 |
| notify-1s | 1 | large-spread | 256 | 1024 | 480 | 54.86 | 137.17 / 146.66 | 121963 / 6260 / 27 / 6186 | 290.23 | 948.8 | 479.94 | 1275.41 / 1811.11 | 710.28 / 1919.07 / 2514.43 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1352.74 / 2058.68 |
| notify | 1 | large-spread | 256 | 1024 | 480 | 52.74 | 135.51 / 145.67 | 124562 / 6561 / 5 / 6557 | 265.46 | 970.86 | 479.83 | 177.13 / 311.16 | 579.15 / 1030.85 / 1105.34 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 996.03 / 1299.02 |
