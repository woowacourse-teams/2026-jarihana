# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | A | 314.12 / 637.67 | 942.68 | 348.18 / 384.0 / 221.62 | 46.0 / 232.0 | 5543.0 | 252.0 / 200.0 | 10.0 / 431.0 / 0.0 | 0 |
| notify-batch | 1 | large-spread | A | 279.0 / 650.83 | 958.89 | 360.51 / 384.0 / 220.15 | 42.0 / 187.0 | 5403.0 | 253.0 / 131.0 | 10.0 / 188.0 / 0.0 | 0 |
