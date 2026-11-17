# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | A | 249.65 / 662.38 | 945.33 | 360.54 / 384.0 / 219.93 | 42.0 / 152.0 | 5505.0 | 251.0 / 99.0 | 10.0 / 141.0 / 0.0 | 0 |
| poll | 1 | large-spread | A | 220.82 / 647.85 | 984.55 | 358.31 / 384.0 / 221.58 | 43.0 / 128.0 | 5571.0 | 249.0 / 53.0 | 10.0 / 227.0 / 0.0 | 0 |
