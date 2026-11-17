# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-1s | 1 | large-spread | 256 | 1024 | 480 | 49.64 | 135.78 / 146.4 | 123962 / 6482 / 28 / 6480 | 254.11 | 978.98 | 479.97 | 175.21 / 317.95 | 584.1 / 1033.84 / 1230.43 | 0 / 0 / 48000 | 12000 / 12000 / 0 | 1011.21 / 1190.5 |
| poll | 1 | large-spread | 256 | 1024 | 480 | 41.46 | 132.47 / 142.82 | 127679 / 7168 / 0 / 6585 | 237.4 | 970.68 | 479.84 | 129.49 / 289.68 | 562.81 / 1013 / 1076.49 | 0 / 0 / 48000 | 0 / 0 / 0 | 992.55 / 1206.69 |
