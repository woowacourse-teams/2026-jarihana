# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | A | 307.06 / 680.3 | 993.04 | 356.62 / 384.0 / 220.33 | 44.0 / 237.0 | 5510.0 | 250.0 / 190.0 | 10.0 / 204.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 264.92 / 648.16 | 954.49 | 319.06 / 384.0 / 218.94 | 46.0 / 214.0 | 5577.0 | 252.0 / 200.0 | 10.0 / 189.0 / 0.0 | 0 |
| notify-batch | 1 | large-spread | A | 226.6 / 644.28 | 961.25 | 352.23 / 384.0 / 227.19 | 41.0 / 144.0 | 5482.0 | 253.0 / 66.0 | 10.0 / 225.0 / 0.0 | 0 |
| notify-batch-immediate | 1 | large-spread | A | 288.74 / 696.0 | 952.49 | 351.96 / 384.0 / 222.94 | 46.0 / 205.0 | 5566.0 | 253.0 / 200.0 | 10.0 / 291.0 / 0.0 | 0 |
