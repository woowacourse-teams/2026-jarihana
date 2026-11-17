# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 2 | large-one-hot | A | 160.45 / 302.42 | 915.14 | 206.9 / 384.0 / 209.3 | — / — | — | 249.0 / 200.0 | 10.0 / 286.0 / — | 6 |
| poll | 2 | large-one-hot | B | 145.59 / 186.96 | 914.64 | 175.35 / 384.0 / 208.42 | — / — | — | 248.0 / 1.0 | 0.0 / 0.0 / — | 7 |
| notify | 2 | large-one-hot | A | 155.4 / 242.79 | 927.94 | 252.84 / 384.0 / 222.69 | — / — | — | 250.0 / 200.0 | 10.0 / 227.0 / — | 6 |
| notify | 2 | large-one-hot | B | 143.18 / 181.21 | 921.7 | 149.3 / 384.0 / 202.82 | — / — | — | 249.0 / 1.0 | 0.0 / 0.0 / — | 7 |
