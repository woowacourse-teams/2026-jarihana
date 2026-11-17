# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-idle | A | 57.28 / 123.25 | 931.93 | 369.32 / 384.0 / 210.12 | 46.0 / 256.0 | 966.0 | 249.0 / 1.0 | 10.0 / 340.0 / 0.0 | 0 |
| poll | 1 | large-spread | A | 233.72 / 617.43 | 1012.19 | 360.2 / 384.0 / 220.26 | 41.0 / 156.0 | 5469.0 | 249.0 / 120.0 | 10.0 / 190.0 / 0.0 | 0 |
| poll | 1 | large-one-hot | A | 147.83 / 192.89 | 1003.98 | 354.47 / 384.0 / 206.62 | 79.0 / 339.0 | 7408.0 | 249.0 / 200.0 | 10.0 / 317.0 / 0.0 | 2 |
| notify | 1 | large-idle | A | 14.65 / 53.95 | 853.92 | 367.6 / 384.0 / 207.22 | 6.0 / 33.0 | 113.0 | 251.0 / 1.0 | 0.0 / 0.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 273.09 / 601.96 | 1022.68 | 355.0 / 384.0 / 205.54 | 47.0 / 213.0 | 5476.0 | 251.0 / 200.0 | 10.0 / 225.0 / 0.0 | 0 |
| notify | 1 | large-one-hot | A | 162.3 / 243.15 | 1050.68 | 361.0 / 384.0 / 190.43 | 121.0 / 550.0 | 7367.0 | 251.0 / 200.0 | 10.0 / 268.0 / 0.0 | 5 |
