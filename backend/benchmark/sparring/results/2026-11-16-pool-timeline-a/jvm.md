# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| poll | 1 | large-spread | A | 264.31 / 668.94 | 942.86 | 359.94 / 384.0 / 221.82 | 46.0 / 204.0 | 5583.0 | 250.0 / 200.0 | 10.0 / 433.0 / 0.0 | 0 |
| poll-publish | 1 | large-spread | A | 228.26 / 636.7 | 988.06 | 355.24 / 384.0 / 228.28 | 40.0 / 133.0 | 5511.0 | 251.0 / 64.0 | 10.0 / 250.0 / 0.0 | 0 |
| notify | 1 | large-spread | A | 290.58 / 606.28 | 976.83 | 360.45 / 384.0 / 218.01 | 46.0 / 256.0 | 5463.0 | 252.0 / 200.0 | 10.0 / 442.0 / 0.0 | 0 |
