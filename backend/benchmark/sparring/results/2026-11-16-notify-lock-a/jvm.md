# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | A | 230.83 / 664.06 | 954.81 | 358.91 / 384.0 / 219.12 | 45.0 / 136.0 | 5479.0 | 249.0 / 129.0 | 10.0 / 164.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 258.61 / 579.44 | 956.12 | 356.85 / 384.0 / 219.88 | 45.0 / 206.0 | 5426.0 | 251.0 / 200.0 | 10.0 / 433.0 / 0.0 | 0 |
