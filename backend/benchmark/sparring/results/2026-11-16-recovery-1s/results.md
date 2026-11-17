# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | recovery | 64 | 256 | 1.8285714285714285 | 3.26 | 116.75 / 119.36 | 13141 / 2496 / 0 / 64 | 27.11 | 846.84 | 1.83 | 37.8 / 175.02 | 544.72 / 989.32 / 1206.02 | 0 / 0 / 256 | 0 / 0 / 0 | 1031.01 / 1031.12 |
| notify | 1 | recovery | 64 | 256 | 1.8285714285714285 | 1.26 | 117.99 / 120.57 | 1022 / 64 / 39 / 64 | 16.27 | 837.81 | 1.83 | 37.63 / 158.96 | 1385.51 / 1848.69 / 1936.95 | 0 / 0 / 256 | 64 / 64 / 64 | 1921.53 / 1922.09 |
