# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | recovery | 64 | 256 | 1.8285714285714285 | 2.74 | 116.91 / 119.09 | 14429 / 2752 / 0 / 64 | 22.28 | 799.29 | 1.83 | 25.69 / 154.47 | 541.54 / 997.23 / 1003.72 | 0 / 0 / 256 | 0 / 0 / 0 | 990.25 / 990.37 |
| notify | 1 | recovery | 64 | 256 | 1.8285714285714285 | 0.97 | 118.2 / 120.43 | 997 / 64 / 8 / 64 | 12.3 | 826.62 | 1.83 | 23.48 / 153.38 | 3500.54 / 5767.06 / 5949.78 | 0 / 0 / 256 | 64 / 64 / 64 | 5935.36 / 5936.41 |
