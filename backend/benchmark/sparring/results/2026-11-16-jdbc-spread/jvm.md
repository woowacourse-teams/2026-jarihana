# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | A | 300.72 / 604.93 | 951.32 | 353.36 / 384.0 / 221.67 | 47.0 / 253.0 | 5548.0 | 249.0 / 200.0 | 10.0 / 443.0 / 0.0 | 0 |
| notify-1s | 1 | large-spread | A | 290.23 / 610.3 | 948.8 | 357.01 / 384.0 / 218.27 | 49.0 / 261.0 | 5533.0 | 251.0 / 200.0 | 10.0 / 429.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 265.46 / 639.17 | 970.86 | 343.11 / 384.0 / 220.43 | 42.0 / 184.0 | 5571.0 | 251.0 / 80.0 | 10.0 / 105.0 / 0.0 | 0 |
