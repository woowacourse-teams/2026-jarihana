# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify-batch-immediate | 1 | large-spread | A | 257.22 / 626.49 | 991.84 | 360.5 / 384.0 / 224.66 | 43.0 / 184.0 | 5514.0 | 253.0 / 59.0 | 10.0 / 244.0 / 0.0 | 0 |
| notify-batch | 1 | large-spread | A | 246.87 / 665.65 | 947.59 | 356.32 / 384.0 / 225.28 | 49.0 / 203.0 | 5454.0 | 253.0 / 67.0 | 10.0 / 199.0 / 0.0 | 0 |
