import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GameEngine,
  LANES,
  CAPTURE_WINDOW,
  ATTACK_DURATION,
  POOR_PENALTY,
  rateForLoop,
  noteColor,
  simplifyChart
} from "../../../src/features/game/rhythm/engine.mjs";

const chart = JSON.parse(
  readFileSync(
    new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url),
    "utf8"
  )
);
const seed = () => {
  let value = 74931;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
};
const engine = (options) => new GameEngine(chart, { random: seed(), ...options });

test("inclusive 32/64/100/150ms boundaries stay fixed at normal and accelerated rates", () => {
  for (const loop of [1, 6, 10]) {
    for (const [milliseconds, kind] of [
      [0, "perfect"],
      [32, "perfect"],
      [32.001, "hit"],
      [64, "hit"],
      [64.001, "enough"],
      [100, "enough"],
      [100.001, "uhoh"],
      [150, "uhoh"]
    ]) {
      for (const sign of [-1, 1]) {
        const run = engine({ startLoop: loop });
        const note = run.notes[0];
        assert.equal(run.input(note.lane, note.at + (sign * milliseconds) / 1000).kind, kind);
        assert.equal(run.lives, 10);
      }
    }
  }
});

test("every successful judgment catches the germ, continues the combo and awards its score", () => {
  for (const [delta, kind, points] of [
    [0.025, "perfect", 1000],
    [0.05, "hit", 600],
    [0.08, "enough", 300],
    [0.125, "uhoh", 100]
  ]) {
    const run = engine();
    const note = run.notes[0];
    assert.equal(run.input(note.lane, note.at + delta).kind, kind);
    assert.equal(note.state, "caught");
    assert.equal(run.combo, 1);
    assert.equal(run.score, points);
    run.tick(note.at + CAPTURE_WINDOW + ATTACK_DURATION + 0.001);
    assert.equal(run.lives, 10);
    assert.equal(run.stats.miss, 0);
  }
});

test("150-200ms does not catch or penalize; 200ms and empty lanes are Poor", () => {
  for (const delta of [-0.199, -0.151, 0.151, 0.199]) {
    const run = engine();
    const note = run.notes[0];
    assert.equal(run.input(note.lane, note.at + delta).kind, "ignored");
    assert.equal(note.state, "waiting");
    assert.equal(run.score, 0);
  }
  for (const delta of [-0.2, 0.2]) {
    const run = engine();
    const note = run.notes[0];
    assert.equal(run.input(note.lane, note.at + delta).kind, "poor");
    assert.equal(run.score, -POOR_PENALTY);
    assert.equal(note.state, "waiting");
  }
  const empty = engine();
  assert.equal(empty.input("left", -10).kind, "poor");
});

test("formerly ignored 100-150ms inputs catch before a miss can start", () => {
  for (const loop of [1, 6, 10]) {
    for (const delta of [-0.15, -0.149, -0.125, 0.11, 0.125, 0.149, 0.15]) {
      const run = engine({ startLoop: loop });
      const note = run.notes[0];
      run.tick(note.at + delta);
      assert.equal(note.state, "waiting");
      assert.equal(run.input(note.lane, note.at + delta).kind, "uhoh");
      run.tick(note.at + CAPTURE_WINDOW + ATTACK_DURATION + 0.001);
      assert.equal(note.state, "caught");
      assert.equal(run.stats.miss, 0);
      assert.equal(run.lives, 10);
    }
  }
});

test("overlapping same-lane windows retain the nearest-note matching rule", () => {
  const fixture = {
    ...chart,
    sections: [{ startBar: 1, bars: 1, pattern: "basic" }],
    events: [0, 2, 4].map((step) => ({
      step,
      sample: step * chart.samplesPerSixteenth,
      keys: ["left"]
    }))
  };
  for (const loop of [1, 6, 10]) {
    const run = new GameEngine(fixture, { startLoop: loop, random: seed() });
    const [first, second, third] = run.notes;
    run.tick(first.at + 0.14);
    const result = run.input("left", first.at + 0.14);
    assert.equal(result.note, second);
    assert.equal(first.state, "waiting");
    assert.equal(second.state, "caught");
    assert.equal(third.state, "waiting");
    assert.equal(run.lives, 10);
  }
});

test("scroll multipliers change travel while preserving musical timing and loop rate", () => {
  for (const scrollSpeed of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
    const run = engine({ scrollSpeed, startLoop: 6 });
    const reference = engine({ startLoop: 6 });
    assert.equal(run.scrollSpeed, scrollSpeed);
    assert.equal(run.loops[0].rate, 1.05);
    assert.equal(run.loops[1].rate, 1.1);
    assert.equal(run.loops[0].duration, reference.loops[0].duration);
    const note = run.notes[0];
    assert(Math.abs(note.travelDuration - 1.25 / scrollSpeed / 1.05) < 0.000001);
    for (let index = 0; index < 30; index++) {
      const relative = run.notes[index].at - run.loops[0].start;
      const expected = reference.notes[index].at - reference.loops[0].start;
      assert(Math.abs(relative - expected) < 0.000001);
    }
    assert.equal(run.input(note.lane, note.at + CAPTURE_WINDOW).kind, "uhoh");
  }
  const a = engine({ scrollSpeed: 1.75 });
  const b = engine({ scrollSpeed: 2 });
  assert.equal(a.notes[0].at, b.notes[0].at);
  assert(b.notes[0].spawnAt > a.notes[0].spawnAt);
});

test("minimum scroll speed has enough approach time and four count-in beats", () => {
  const run = engine({ scrollSpeed: 1 });
  assert.equal(run.notes[0].spawnAt, 0.625);
  assert.equal(run.leadIn, 1.875);
  assert.equal(run.countInStart, 0);
  assert.equal(run.countInStart + (4 * 60) / chart.bpm, run.leadIn);
});

test("invalid scroll speeds are rejected before scheduling audio", () => {
  for (const scrollSpeed of [0, 0.5, 0.99, 1.1, 1.375, 2.51, 3.01, 3.25, Infinity, NaN, "1.25"]) {
    assert.throws(() => engine({ scrollSpeed }), RangeError);
  }
});

test("early or empty inputs deduct only score and preserve the approaching note", () => {
  const run = engine();
  const note = run.notes[0];
  assert.equal(run.input(note.lane, note.at - 0.201).kind, "poor");
  assert.equal(run.score, -POOR_PENALTY);
  assert.equal(note.state, "waiting");
  assert.equal(run.lives, 10);
  assert.equal(run.input(note.lane, note.at).kind, "perfect");
  assert.equal(run.score, 1000 - POOR_PENALTY);
  assert.equal(run.input(note.lane, note.at).kind, "poor");
  assert.equal(run.score, 1000 - POOR_PENALTY * 2);
});

test("late notes become uncatchable and a whole missed chord costs one life", () => {
  const run = engine({ startAt: 86.25 });
  const group = run.groups[0];
  assert.equal(group.notes.length, 4);
  run.tick(group.at + CAPTURE_WINDOW + 0.001);
  assert(group.notes.every((note) => note.state === "attack"));
  assert.equal(run.input(group.notes[0].lane, group.at + CAPTURE_WINDOW + 0.001).kind, "ignored");
  assert.equal(run.lives, 10);
  run.tick(group.at + CAPTURE_WINDOW + ATTACK_DURATION + 0.001);
  assert.equal(run.lives, 9);
  assert.equal(run.stats.miss, 4);
  run.tick(group.at + CAPTURE_WINDOW + ATTACK_DURATION + 0.02);
  assert.equal(run.lives, 9);
});

test("partially catching a chord still causes only one group damage", () => {
  const run = engine({ startAt: 86.25 });
  const group = run.groups[0];
  for (const note of group.notes.slice(0, 3)) run.input(note.lane, group.at);
  run.tick(group.at + CAPTURE_WINDOW + ATTACK_DURATION + 0.001);
  assert.equal(run.lives, 9);
  assert.equal(run.stats.miss, 1);
  assert.equal(run.stats.perfect, 3);
});

test("timely timestamp can recover a note after a delayed animation frame", () => {
  const run = engine();
  const note = run.notes[0];
  run.tick(note.at + CAPTURE_WINDOW + 0.02);
  assert.equal(note.state, "attack");
  assert.equal(run.input(note.lane, note.at + 0.02).kind, "perfect");
  run.tick(note.at + CAPTURE_WINDOW + ATTACK_DURATION + 0.02);
  assert.equal(run.lives, 10);
  assert.equal(run.stats.miss, 0);
});

test("difficulty charts use source timings, correct lives and progressively more notes", () => {
  const keysByStep = new Map(chart.events.map((event) => [event.step, event.keys]));
  const counts = [];
  for (const [level, lives] of [
    ["easy", 10],
    ["medium", 8],
    ["hard", 8],
    ["hardest", 10]
  ]) {
    const selected = simplifyChart(chart, level);
    assert.equal(engine({ level }).lives, lives);
    assert.equal(engine({ level }).maxLives, lives);
    const cap = level === "hardest" ? 4 : level === "hard" ? 2 : 1;
    for (const event of selected) {
      assert(event.keys.length > 0 && event.keys.length <= cap);
      assert.equal(event.sample, event.step * chart.samplesPerSixteenth);
      const bar = Math.floor(event.step / 16) + 1;
      const replaced =
        (["hard", "hardest"].includes(level) && [41, 42].includes(bar)) ||
        (level === "hardest" && [32, 45].includes(bar));
      if (!replaced) assert(keysByStep.has(event.step));
      assert(
        event.keys.every((key) =>
          level === "hard" || replaced
            ? LANES.includes(key)
            : keysByStep.get(event.step).includes(key)
        )
      );
    }
    counts.push(selected.reduce((sum, event) => sum + event.keys.length, 0));
  }
  assert(counts.every((value, i) => i === 0 || value > counts[i - 1]));
  const unchanged = (event) => ![32, 41, 42, 45].includes(Math.floor(event.step / 16) + 1);
  assert.deepEqual(
    simplifyChart(chart, "hardest")
      .filter(unchanged)
      .map((e) => [e.step, [...e.keys].sort()]),
    chart.events.filter(unchanged).map((e) => [e.step, [...e.keys].sort()])
  );
});

test("Medium and Hard keep quarter-note gaps except the dedicated Hard trill", () => {
  for (const level of ["medium", "hard"]) {
    const last = new Map();
    for (const event of simplifyChart(chart, level)) {
      for (const key of event.keys) {
        const inTrill = (step) => step >= 640 && step < 672;
        const gap = level === "hard" && (inTrill(event.step) || inTrill(last.get(key))) ? 2 : 4;
        if (last.has(key))
          assert(event.step - last.get(key) >= gap, level + " repeats " + key + " too soon");
        last.set(key, event.step);
      }
    }
  }
});

test("Medium keeps the beat while removing eighth-note axes across bar boundaries", () => {
  const selected = simplifyChart(chart, "medium");
  assert.equal(selected.length, 199);
  assert.deepEqual(
    selected.filter((event) => event.step >= 128 && event.step < 160).map((event) => event.step),
    [128, 132, 136, 140, 144, 148, 152, 156]
  );
  const fixture = {
    sections: [{ startBar: 1, bars: 2, pattern: "basic" }],
    events: [
      [12, ["left"]],
      [14, ["left"]],
      [16, ["left"]],
      [18, ["right"]],
      [20, ["left"]]
    ].map(([step, keys]) => ({ step, sample: step * 5625, keys }))
  };
  assert.deepEqual(
    simplifyChart(fixture, "medium").map((event) => event.step),
    [12, 16, 18, 20]
  );
  assert(selected.every((event) => event.keys.length === 1 && event.step % 2 === 0));
});

test("Hard keeps its offbeat rhythms while easing opening chords", () => {
  const selected = simplifyChart(chart, "hard");
  const density = Array.from({ length: 48 }, (_, bar) =>
    selected
      .filter((event) => Math.floor(event.step / 16) === bar)
      .map((event) => event.keys.length)
      .join("")
  );
  assert.deepEqual(density, [
    "1111",
    "11",
    "1111",
    "1111",
    "11",
    "1111",
    "1111",
    "11",
    "1111",
    "1111",
    "111111",
    "1111",
    "11111111",
    "11111111",
    "11",
    "1111111",
    "11",
    "111",
    "1111",
    "111",
    "11",
    "11",
    "111111",
    "111111",
    "1111",
    "1212",
    "111111",
    "111111",
    "2222",
    "21211",
    "11111111",
    "11111111",
    "111111",
    "111111",
    "211",
    "211",
    "2222",
    "2222",
    "2121",
    "21211",
    "1111111111111111",
    "1111111111111111",
    "11111111",
    "11111111",
    "1222",
    "21211",
    "211111",
    ""
  ]);
  assert.equal(selected.length, 240);
  assert.equal(
    selected.reduce((sum, event) => sum + event.keys.length, 0),
    268
  );
  assert.equal(selected.filter((event) => event.keys.length === 2).length, 28);
  assert.equal(selected.filter((event) => event.step % 4 !== 0).length, 119);
  assert.equal(selected.filter((event) => event.step % 2 !== 0).length, 37);
  assert.deepEqual(
    selected.filter((event) => Math.floor(event.step / 16) === 23).map((event) => event.step % 16),
    [2, 6, 7, 9, 10, 14]
  );
});

test("Hard uses singles throughout bars 1-13 and retains later chords", () => {
  const selected = simplifyChart(chart, "hard");
  assert(
    selected.filter((event) => event.step < 13 * 16).every((event) => event.keys.length === 1)
  );
  assert(selected.some((event) => event.step >= 13 * 16 && event.keys.length === 2));
});

test("bar 16 follows the musical pickups while simpler levels retain the main beats", () => {
  for (const [level, columns] of [
    ["easy", [0, 4, 8, 12]],
    ["medium", [0, 4, 8, 12, 14]],
    ["hard", [0, 3, 4, 7, 8, 12, 14]],
    ["hardest", [0, 3, 4, 7, 8, 12, 14]]
  ]) {
    const hits = simplifyChart(chart, level).filter(
      (event) => event.step >= 240 && event.step < 256
    );
    assert.deepEqual(
      hits.map((event) => event.step - 240),
      columns
    );
    assert(hits.every((event) => event.keys.length === 1));
  }
  assert.equal(chart.sections.find((section) => section.startBar === 16).pattern, "bridge");
  for (const [bar, count] of [
    [15, 2],
    [17, 2],
    [18, 3]
  ]) {
    assert.equal(
      simplifyChart(chart, "hardest").filter((event) => Math.floor(event.step / 16) + 1 === bar)
        .length,
      count
    );
  }
});

test("Hard staircases are uninterrupted eighth-note singles with no reversal between bars", () => {
  const selected = simplifyChart(chart, "hard");
  for (const [first, cycle] of [
    [31, ["right", "up", "left", "down"]],
    [43, ["down", "right", "up", "left"]]
  ]) {
    const start = (first - 1) * 16;
    const hits = selected.filter((event) => event.step >= start && event.step < start + 32);
    assert.equal(hits.length, 16);
    for (const [index, event] of hits.entries()) {
      assert.equal(event.step, start + index * 2);
      assert.deepEqual(event.keys, [cycle[index % 4]]);
    }
  }
});

test("Hardest first staircase continues one direction and preserves the second staircase", () => {
  const selected = simplifyChart(chart, "hardest");
  const first = selected.filter((event) => event.step >= 480 && event.step < 512);
  assert.equal(first.length, 32);
  for (const [index, event] of first.entries()) {
    assert.equal(event.step, 480 + index);
    assert.deepEqual(event.keys, [["right", "up", "left", "down"][index % 4]]);
  }
  const second = (event) => event.step >= 672 && event.step < 704;
  const musical = ({ step, sample, keys }) => ({ step, sample, keys });
  assert.deepEqual(selected.filter(second).map(musical), chart.events.filter(second).map(musical));
});

test("Hardest bars 41-42 exactly match the supplied four alternating trill pairs", () => {
  const hits = simplifyChart(chart, "hardest").filter(
    (event) => event.step >= 640 && event.step < 672
  );
  const pairs = [
    ["up", "down"],
    ["left", "right"],
    ["down", "up"],
    ["left", "right"]
  ];
  assert.equal(hits.length, 32);
  for (const [index, event] of hits.entries()) {
    assert.equal(event.step, 640 + index);
    assert.equal(event.sample, (640 + index) * 5625);
    assert.deepEqual(event.keys, [pairs[Math.floor(index / 8)][index % 2]]);
  }
});

test("Hard holds each alternating pair for 16 notes and avoids entry and exit jacks", () => {
  const hits = simplifyChart(chart, "hard").filter(
    (event) => event.step >= 640 && event.step < 672
  );
  const pairs = [
    ["up", "down"],
    ["left", "right"]
  ];
  assert.equal(hits.length, 32);
  for (const [index, event] of hits.entries()) {
    assert.equal(event.step, 640 + index);
    assert.equal(event.sample, (640 + index) * 5625);
    assert.deepEqual(event.keys, [pairs[Math.floor(index / 16)][index % 2]]);
  }
  const run = engine({ level: "hard" });
  for (const loop of run.loops) {
    const notes = run.notes.filter((note) => note.loop === loop.number);
    assert.notEqual(
      notes.find((note) => note.step === 639).lane,
      notes.find((note) => note.step === 640).lane
    );
    assert.notEqual(
      notes.find((note) => note.step === 671).lane,
      notes.find((note) => note.step === 672).lane
    );
  }
});

test("the first hit after the final staircase is a single on a different lane in every loop", () => {
  const run = engine();
  for (const loop of run.loops) {
    const last = run.notes.filter((note) => note.loop === loop.number && note.step === 703);
    const next = run.notes.filter((note) => note.loop === loop.number && note.step === 704);
    assert.equal(last.length, 1);
    assert.equal(next.length, 1);
    assert.equal(next[0].original, "up");
    assert.notEqual(last[0].lane, next[0].lane);
  }
});

test("difficulty adjustments preserve intro and breathing rhythms", () => {
  const quiet = (event) => event.step < 128 || (event.step >= 224 && event.step < 352);
  const hardestQuiet = chart.events.filter(quiet).map((event) => event.step);
  const hardQuiet = simplifyChart(chart, "hard")
    .filter(quiet)
    .map((event) => event.step);
  assert.deepEqual(
    hardQuiet,
    hardestQuiet.filter((step) => step !== 304)
  );
  const mediumQuiet = simplifyChart(chart, "medium").filter(quiet);
  assert.deepEqual(
    mediumQuiet.map((event) => event.step),
    hardestQuiet.filter((step) => step % 2 === 0)
  );
  assert.deepEqual(
    simplifyChart(chart, "easy").filter((event) => event.step < 128),
    simplifyChart(chart, "hardest").filter((event) => event.step < 128 && event.step % 8 === 0)
  );
});

test("Hard removes the repeated member of a chord across a bar boundary", () => {
  const fixture = {
    sections: [{ startBar: 17, bars: 2, pattern: "mixed" }],
    events: [
      [12, ["left", "right"]],
      [14, ["left"]],
      [15, ["right", "up"]],
      [16, ["left", "up"]],
      [17, ["right"]],
      [18, ["up"]],
      [20, ["left", "down"]]
    ].map(([step, keys]) => ({ step: step + 256, sample: (step + 256) * 5625, keys }))
  };
  const result = simplifyChart(fixture, "hard");
  assert.deepEqual(
    result.map((event) => [event.step - 256, event.keys]),
    [
      [12, ["left", "right"]],
      [15, ["up"]],
      [16, ["left"]],
      [17, ["right"]],
      [20, ["left", "down"]]
    ]
  );
  assert.deepEqual(simplifyChart(fixture, "hardest"), fixture.events);
});

test("Hardest survives nine missed events and ends on the tenth", () => {
  const run = engine();
  const groups = run.groups.slice(0, 10);
  assert.equal(run.maxLives, 10);
  for (const [index, group] of groups.entries()) {
    run.tick(group.at + CAPTURE_WINDOW + ATTACK_DURATION + 0.001);
    assert.equal(run.lives, 9 - index);
    assert.equal(run.dead, index === 9);
  }
});

test("pure random uses one bijection outside staircases and rotations inside them", () => {
  const run = engine();
  const second = run.loops[1];
  assert.deepEqual([...second.map].sort(), [...LANES].sort());
  assert.notDeepEqual(second.map, run.loops[0].map);
  for (const note of run.notes.filter((n) => n.loop === second.number)) {
    const staircase = second.stairRotations.find(
      (rotation) => note.step >= rotation.start && note.step < rotation.end
    );
    const expected = staircase
      ? LANES[(LANES.indexOf(note.original) + staircase.shift) % 4]
      : second.map[LANES.indexOf(note.original)];
    assert.equal(note.lane, expected);
    assert.equal(note.color, noteColor(note.step));
  }
});

test("all 24 random maps preserve staircase direction and avoid boundary jacks", () => {
  const permutations = (lanes) =>
    lanes.length
      ? lanes.flatMap((lane, index) =>
          permutations(lanes.filter((_, i) => i !== index)).map((rest) => [lane, ...rest])
        )
      : [[]];
  for (const level of ["hard", "hardest"]) {
    const starts = new Set();
    for (const map of permutations(LANES)) {
      const run = engine({ level });
      run.appendLoop(3, 200, 0, map);
      const notes = run.notes.filter((note) => note.loop === 3);
      for (const section of chart.sections.filter((section) => section.pattern === "roll")) {
        const start = (section.startBar - 1) * 16;
        const stairs = notes.filter(
          (note) => note.step >= start && note.step < start + section.bars * 16
        );
        const shifts = new Set(
          stairs.map((note) => (LANES.indexOf(note.lane) - LANES.indexOf(note.original) + 4) % 4)
        );
        assert.equal(shifts.size, 1);
        starts.add(stairs[0].lane);
      }
      if (level === "hard") {
        const last = new Map();
        for (const note of notes) {
          const previous = last.get(note.lane) ?? -Infinity;
          const inTrill = (step) => step >= 640 && step < 672;
          assert(note.step - previous >= (inTrill(note.step) || inTrill(previous) ? 2 : 4));
          last.set(note.lane, note.step);
        }
      }
      assert.notEqual(
        notes.find((note) => note.step === 703)?.lane,
        notes.find((note) => note.step === 704).lane
      );
    }
    assert(starts.size > 1);
  }
});

test("five normal loops then additive rate and exact scheduled loop boundaries", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 10].map((loop) => rateForLoop(loop)),
    [1, 1, 1, 1, 1, 1.05, 1.1, 1.25]
  );
  const run = engine({ startLoop: 5, startAt: 86.25 });
  const first = run.loops[0];
  const second = run.loops[1];
  assert.equal(first.duration, 3.75);
  assert.equal(second.start, first.end);
  assert.equal(second.duration, 90 / 1.05);
  const note = run.notes.find((n) => n.loop === 6 && n.step === 0);
  assert.equal(note.at, second.start);
  assert.equal(run.currentLoop(second.start).number, 6);
});

test("NOTE palette follows absolute grid position and includes other quantizations", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 6, 12, 13, 0.5, 4 / 3].map(noteColor),
    [0, 2, 1, 2, 0, 1, 0, 2, 3, 3]
  );
});

test("autoplay survives accelerated loop boundaries without misses", () => {
  const run = engine({ autoplay: true, startLoop: 5, startAt: 86.25 });
  for (let time = 0; time < 100; time += 0.02) run.tick(time);
  assert.equal(run.dead, false);
  assert.equal(run.lives, 10);
  assert.equal(run.stats.miss, 0);
  assert(run.stats.perfect > 400);
  assert(run.currentLoop().number >= 7);
});
