# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | recovery | A | 27.11 / 70.51 | 846.84 | 302.5 / 349.0 / 218.94 | 2.0 / 21.0 | 319.0 | 249.0 / 2.0 | 10.0 / 53.0 / 0.0 | 0 |
| notify | 1 | recovery | A | 16.27 / 38.44 | 837.81 | 316.0 / 384.0 / 219.25 | 1.0 / 11.0 | 156.0 | 215.0 / 2.0 | 1.0 / 0.0 / 0.0 | 0 |
