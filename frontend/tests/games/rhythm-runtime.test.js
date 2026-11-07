/** @jest-environment node */
import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

it("runs the migrated game engine, music, rendering, calibration and scoring regression suite", () => {
  const directory = path.resolve(process.cwd(), "tests/games/rhythm-harpoon");
  const tests = readdirSync(directory).filter(name => name.endsWith(".test.mjs")).map(name => path.join(directory, name));
  const result = spawnSync(process.execPath, ["--test", ...tests], { encoding: "utf8", timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stdout + result.stderr);
}, 65000);
