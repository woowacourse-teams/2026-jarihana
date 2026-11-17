# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | 256 | 1024 | 480 | 39.22 | 133.19 / 143.27 | 127625 / 7168 / 0 / 6575 | 230.83 | 954.81 | 479.93 | 127.01 / 383.04 | 567.94 / 1012.11 / 1079.62 | 0 / 0 / 48000 | 0 / 0 / 0 | 998.24 / 1085.91 |
| notify | 1 | large-spread | 256 | 1024 | 480 | 46.09 | 135.38 / 145.93 | 123191 / 6401 / 5 / 6374 | 258.61 | 956.12 | 479.89 | 555.04 / 955.74 | 630.53 / 1238.45 / 1789.93 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1247.35 / 2217.88 |
