# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-one-hot | A | 123.91 / 380.75 | 920.74 | 284.0 / 384.0 / 223.6 | — / — | — | 251.0 / 200.0 | 10.0 / 218.0 / — | 7 |
| notify-1s | 1 | large-one-hot | A | 79.8 / 394.2 | 904.82 | 316.43 / 384.0 / 215.24 | — / — | — | 251.0 / 200.0 | 10.0 / 234.0 / — | 7 |
| poll | 1 | large-one-hot | A | 67.64 / 321.65 | 901.95 | 256.79 / 384.0 / 216.1 | — / — | — | 247.0 / 1.0 | 10.0 / 15.0 / — | 7 |
