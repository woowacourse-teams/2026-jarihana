# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-idle | 512 | 2048 | 0 | 13.2 | 116.64 / 117.21 | 71764 / 14336 / 0 / 0 | 51.25 | 905.66 | 0 | — / — | — / — / — | 0 / 0 / 0 | 0 / 0 / 0 | — / — |
| notify | 1 | large-idle | 512 | 2048 | 0 | 2.49 | 117.8 / 118.23 | 91 / 0 / 6 / 0 | 15.51 | 846.44 | 0 | — / — | — / — / — | 0 / 0 / 0 | 0 / 0 / 0 | — / — |
| notify-batch | 1 | large-idle | 512 | 2048 | 0 | 2.61 | 117.92 / 118.37 | 89 / 0 / 5 / 0 | 14.34 | 838.14 | 0 | — / — | — / — / — | 0 / 0 / 0 | 0 / 0 / 0 | — / — |
