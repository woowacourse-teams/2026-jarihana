# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-only | 1 | large-spread | A | 320.49 / 573.0 | 1002.93 | 346.7 / 384.0 / 217.32 | 51.0 / 335.0 | 5377.0 | 250.0 / 200.0 | 10.0 / 403.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 278.1 / 663.31 | 971.07 | 358.6 / 384.0 / 224.86 | 42.0 / 208.0 | 5406.0 | 251.0 / 200.0 | 10.0 / 283.0 / 0.0 | 0 |
