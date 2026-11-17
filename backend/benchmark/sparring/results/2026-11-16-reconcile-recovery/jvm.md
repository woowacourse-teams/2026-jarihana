# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | recovery | A | 22.28 / 54.17 | 799.29 | 280.88 / 321.0 / 218.53 | 3.0 / 24.0 | 377.0 | 186.0 / 1.0 | 2.0 / 0.0 / 0.0 | 0 |
| notify | 1 | recovery | A | 12.3 / 39.78 | 826.62 | 294.46 / 384.0 / 215.99 | 0.0 / 0.0 | 0.0 | 218.0 / 2.0 | 1.0 / 0.0 / 0.0 | 0 |
