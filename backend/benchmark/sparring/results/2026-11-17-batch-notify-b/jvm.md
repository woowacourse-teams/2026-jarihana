# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-batch | 1 | large-spread | A | 269.8 / 647.89 | 932.09 | 355.61 / 384.0 / 220.33 | 54.0 / 238.0 | 5526.0 | 253.0 / 200.0 | 10.0 / 271.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 303.39 / 640.76 | 975.56 | 344.52 / 384.0 / 225.01 | 45.0 / 200.0 | 5475.0 | 252.0 / 200.0 | 10.0 / 189.0 / 0.0 | 0 |
