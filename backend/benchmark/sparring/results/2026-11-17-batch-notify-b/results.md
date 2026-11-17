# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-batch | 1 | large-spread | 256 | 1024 | 480 | 45.96 | 134.01 / 144.43 | 121844 / 6243 / 6 / 6173 | 269.8 | 932.09 | 479.91 | 299.44 / 786.12 | 611.21 / 1296.69 / 2313.23 | 0 / 0 / 48000 | 6241 / 6241 / 0 | 1949.6 / 2288.94 |
| notify | 1 | large-spread | 256 | 1024 | 480 | 60.71 | 136.11 / 146.05 | 123253 / 6406 / 5 / 6381 | 303.39 | 975.56 | 479.92 | 574.81 / 955.29 | 657.1 / 1263.92 / 1720.65 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1268.31 / 1893.98 |
