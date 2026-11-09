import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  createPracticeRun,
  summarizePracticeRun
} from "../../../src/features/game/rhythm/practice-session.mjs";

const chart = JSON.parse(
  readFileSync(
    new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url),
    "utf8"
  )
);

test("service practice always begins at the first loop without autoplay or practice offsets", () => {
  for (const level of ["easy", "medium", "hard", "hardest"]) {
    const run = createPracticeRun(chart, { level, scrollSpeed: 2.25 });
    assert.equal(run.mode, "practice");
    assert.equal(run.verification, "unverified");
    assert.equal(run.engine.startAt, 0);
    assert.equal(run.engine.startLoop, 1);
    assert.equal(run.engine.autoplay, false);
    assert.equal(run.engine.scrollSpeed, 2.25);
  }
});

test("prototype shortcuts and caller-supplied ranking claims are not service settings", () => {
  for (const settings of [
    { autoplay: true },
    { startAt: 86.25 },
    { startLoop: 10 },
    { mode: "ranked" },
    { verification: "verified" },
    { score: 999999 },
    { seed: 123 },
    { random: () => 0.5 }
  ]) {
    assert.throws(() => createPracticeRun(chart, settings), TypeError);
  }
});

test("even a modified local score remains an unverified practice summary, never a record proof", () => {
  const run = createPracticeRun(chart);
  run.engine.score = 99999999;
  const result = summarizePracticeRun(run);
  assert.equal(result.mode, "practice");
  assert.equal(result.verification, "unverified");
  assert(Object.isFrozen(result));
  assert(!("memberId" in result));
  assert(!("serverSessionId" in result));
});

test("public game assets contain no standalone prototype entry or executable controls", () => {
  const files = readdirSync(
    new URL("../../../public/game-assets/rhythm-harpoon/", import.meta.url)
  );
  assert.deepEqual(files, ["assets"]);
});
