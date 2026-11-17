# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | A | 251.47 / 658.08 | 993.5 | 358.69 / 384.0 / 220.29 | 44.0 / 179.0 | 5421.0 | 252.0 / 200.0 | 10.0 / 186.0 / 0.0 | 0 |
| poll-publish | 1 | large-spread | A | 259.72 / 648.96 | 977.81 | 356.11 / 384.0 / 219.52 | 45.0 / 166.0 | 5526.0 | 251.0 / 154.0 | 10.0 / 151.0 / 0.0 | 0 |
| poll | 1 | large-spread | A | 254.12 / 619.51 | 953.9 | 356.34 / 384.0 / 228.23 | 42.0 / 168.0 | 5517.0 | 250.0 / 98.0 | 10.0 / 169.0 / 0.0 | 0 |
