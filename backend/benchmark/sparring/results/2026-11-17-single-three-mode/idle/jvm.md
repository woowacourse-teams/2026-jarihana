# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-idle | A | 51.25 / 217.26 | 905.66 | 359.66 / 384.0 / 200.76 | 34.0 / 233.0 | 953.0 | 249.0 / 1.0 | 10.0 / 229.0 / 0.0 | 0 |
| notify | 1 | large-idle | A | 15.51 / 140.26 | 846.44 | 362.44 / 384.0 / 212.5 | 8.0 / 135.0 | 131.0 | 251.0 / 1.0 | 0.0 / 0.0 / 0.0 | 0 |
| notify-batch | 1 | large-idle | A | 14.34 / 159.37 | 838.14 | 368.65 / 384.0 / 212.87 | 8.0 / 134.0 | 124.0 | 252.0 / 1.0 | 0.0 / 0.0 / 0.0 | 0 |
