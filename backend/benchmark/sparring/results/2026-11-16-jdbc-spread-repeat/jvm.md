# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-1s | 1 | large-spread | A | 254.11 / 636.79 | 978.98 | 337.66 / 384.0 / 226.23 | 41.0 / 161.0 | 5516.0 | 251.0 / 62.0 | 10.0 / 229.0 / 0.0 | 0 |
| poll | 1 | large-spread | A | 237.4 / 667.34 | 970.68 | 356.34 / 384.0 / 226.73 | 41.0 / 139.0 | 5411.0 | 249.0 / 14.0 | 10.0 / 247.0 / 0.0 | 0 |
