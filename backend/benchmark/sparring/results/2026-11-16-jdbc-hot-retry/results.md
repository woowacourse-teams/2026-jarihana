# Sparring SSE benchmark

| mode | servers | scenario | rooms | clients | target TPS | DB CPU % | DB memory avg / peak MiB | queries / revision / reconcile / post | app CPU % | app peak RSS MiB | write TPS | write p95 / p99 ms | SSE p50 / p95 / p99 ms | missing / duplicate / expected | NOTIFY emitted / received / dropped | ACK to SSE p99 / max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-one-hot | 128 | 1024 | 800 | 18.09 | 127.23 / 150.71 | 35580 / 562 / 4 / 495 | 123.91 | 920.74 | 136.69 | 8921.28 / 9808.9 | 5825.36 / 9027.05 / 10121.17 | 648 / 0 / 37808 | 5207 / 14013 / 0 | 1629.86 / 2811.5 |
| notify-1s | 1 | large-one-hot | 128 | 1024 | 800 | 9.77 | 124.16 / 147.73 | 9962 / 166 / 4 / 121 | 79.8 | 904.82 | 41.33 | 5152.14 / 6605.95 | 3594.37 / 6803.66 / 6967.61 | 568 / 0 / 11032 | 1456 / 10058 / 0 | 3289.84 / 3853.87 |
| poll | 1 | large-one-hot | 128 | 1024 | 800 | 7.62 | 121.66 / 144.93 | 14058 / 767 / 0 / 165 | 67.64 | 901.95 | 43.24 | 6154.17 / 6357.77 | 5065.14 / 7458.26 / 7547.18 | 16 / 0 / 12312 | 0 / 0 / 0 | 2457.6 / 26351.89 |
