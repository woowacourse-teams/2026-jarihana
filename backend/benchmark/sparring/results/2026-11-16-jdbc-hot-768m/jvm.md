# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-one-hot | A | 146.47 / 380.93 | 1283.11 | 420.0 / 507.0 / 228.88 | — / — | — | 249.0 / 200.0 | 10.0 / 317.0 / — | 8 |
| notify-1s | 1 | large-one-hot | A | 201.01 / 374.9 | 1308.88 | 536.24 / 734.0 / 226.99 | 39.0 / 254.0 | 7455.0 | 251.0 / 200.0 | 10.0 / 236.0 / 0.0 | 7 |
