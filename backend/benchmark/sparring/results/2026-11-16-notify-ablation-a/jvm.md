# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | A | 277.32 / 653.83 | 977.68 | 360.02 / 384.0 / 220.34 | 45.0 / 198.0 | 5499.0 | 249.0 / 141.0 | 10.0 / 180.0 / 0.0 | 0 |
| poll-publish | 1 | large-spread | A | 247.44 / 651.53 | 959.88 | 360.62 / 384.0 / 227.95 | 43.0 / 146.0 | 5485.0 | 250.0 / 134.0 | 10.0 / 130.0 / 0.0 | 0 |
| notify-only | 1 | large-spread | A | 241.26 / 634.64 | 976.11 | 354.79 / 384.0 / 220.17 | 42.0 / 141.0 | 5386.0 | 250.0 / 129.0 | 10.0 / 150.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 246.16 / 636.96 | 943.27 | 350.69 / 384.0 / 225.29 | 42.0 / 147.0 | 5483.0 | 251.0 / 69.0 | 10.0 / 249.0 / 0.0 | 0 |
