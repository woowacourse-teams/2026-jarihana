# Backend JVM and process metrics

| mode | servers | scenario | app | CPU mean / peak % | RSS peak MiB | heap used / committed / non-heap peak MiB | GC count / pause ms | allocated MiB | JVM threads / HTTP busy peak | JDBC active / pending peak / timeout count | missed samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notify | 1 | large-spread | A | 278.06 / 619.69 | 981.59 | 359.32 / 384.0 / 224.38 | 48.0 / 205.0 | 5403.0 | 251.0 / 200.0 | 10.0 / 416.0 / 0.0 | 0 |
| notify-only | 1 | large-spread | A | 246.03 / 633.08 | 960.32 | 356.2 / 384.0 / 220.5 | 43.0 / 159.0 | 5523.0 | 250.0 / 143.0 | 10.0 / 150.0 / 0.0 | 0 |
| poll-publish | 1 | large-spread | A | 245.75 / 618.22 | 932.91 | 358.36 / 384.0 / 228.26 | 41.0 / 153.0 | 5477.0 | 250.0 / 57.0 | 10.0 / 243.0 / 0.0 | 0 |
| poll | 1 | large-spread | A | 417.73 / 555.69 | 931.61 | 356.03 / 384.0 / 217.33 | 111.0 / 989.0 | 5476.0 | 249.0 / 200.0 | 9.0 / 438.0 / 0.0 | 3 |
