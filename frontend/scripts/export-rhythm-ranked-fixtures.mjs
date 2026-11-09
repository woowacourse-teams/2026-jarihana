import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  GOLDEN_REPLAYS_PATH,
  SERVER_CHART_PATH,
  buildGoldenReplays,
  buildRankedChart,
  readChart,
  serialize
} from "./rhythm-ranked-fixtures.mjs";

// 채보나 판정 규칙을 바꾼 뒤 실행한다: node scripts/export-rhythm-ranked-fixtures.mjs
const chart = readChart();
for (const [file, value] of [
  [SERVER_CHART_PATH, buildRankedChart(chart)],
  [GOLDEN_REPLAYS_PATH, buildGoldenReplays(chart)]
]) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serialize(value));
  process.stdout.write("wrote " + path.relative(process.cwd(), file) + "\n");
}
