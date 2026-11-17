# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-one-hot | 128 | 1024 | 800 | 29.63 | 130.55 / 149.66 | 72428 / 2821 / 0 / 926 | 146.47 | 1283.11 | 173.5 | 9975.3 / 9986.18 | 8204 / 10471.3 / 10761.11 | 0 / 0 / 48568 | 0 / 0 / 0 | 1605.93 / 2308.6 |
| notify-1s | 1 | large-one-hot | 128 | 1024 | 800 | 57.86 | 135.37 / 153.23 | 136789 / 2442 / 27 / 1968 | 201.01 | 1308.88 | 317.55 | 9945.17 / 9986.53 | 9575.98 / 10677.93 / 11156.09 | 0 / 0 / 88912 | 19764 / 19771 / 0 | 1361.39 / 2199.8 |
