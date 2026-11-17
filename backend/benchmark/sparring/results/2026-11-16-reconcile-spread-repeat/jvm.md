# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | A | 280.55 / 626.3 | 972.42 | 355.52 / 384.0 / 219.95 | 47.0 / 188.0 | 5533.0 | 251.0 / 200.0 | 10.0 / 413.0 / 0.0 | 0 |
| poll | 1 | large-spread | A | 281.73 / 651.24 | 942.2 | 344.52 / 384.0 / 219.98 | 42.0 / 166.0 | 5550.0 | 249.0 / 94.0 | 10.0 / 214.0 / 0.0 | 0 |
