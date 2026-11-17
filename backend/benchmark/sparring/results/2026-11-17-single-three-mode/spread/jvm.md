# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | A | 232.95 / 650.05 | 999.96 | 359.59 / 384.0 / 221.66 | 42.0 / 165.0 | 5528.0 | 250.0 / 57.0 | 10.0 / 132.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 268.45 / 680.83 | 961.79 | 358.76 / 384.0 / 221.53 | 49.0 / 236.0 | 5498.0 | 252.0 / 89.0 | 10.0 / 187.0 / 0.0 | 0 |
| notify-batch | 1 | large-spread | A | 231.73 / 649.38 | 956.01 | 357.8 / 384.0 / 220.71 | 43.0 / 147.0 | 5498.0 | 253.0 / 55.0 | 10.0 / 238.0 / 0.0 | 0 |
