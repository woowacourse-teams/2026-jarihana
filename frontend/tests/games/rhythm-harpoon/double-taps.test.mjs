import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { GameEngine, LANES, simplifyChart } from "../../../src/features/game/rhythm/engine.mjs";

const chart = JSON.parse(readFileSync(new URL("./fixtures/pre-climax-chart.json", import.meta.url)));
const phrases = chart.sections.filter((section) => section.pattern === "doubleTap");
const hitsAt = (level, bar) => simplifyChart(chart, level).filter((event) => event.step >= (bar - 1) * 16 && event.step < bar * 16);

test("Hardest introduces the supplied two-lane doubles then plays the full travelling variation", () => {
  assert.deepEqual(phrases.map(({ startBar, bars }) => [startBar, bars]), [[29, 1], [37, 2]]);
  const expected = [
    [29, ["up", "down", "up", "down", "left", "right", "left", "right"]],
    [37, ["left", "down", "right", "up", "left", "down", "right", "up"]],
    [38, ["right", "down", "left", "down", "right", "up", "right", "down"]]
  ];
  for (const [bar, pairs] of expected) {
    const hits = hitsAt("hardest", bar);
    assert.deepEqual(hits.map((event) => event.keys), pairs.flatMap((lane) => [[lane], [lane]]));
    assert.deepEqual(hits.map((event) => event.step % 16), Array.from({ length: 16 }, (_, i) => i));
  }
  assert.equal(chart.bars, 48);
  assert.equal(chart.durationSeconds, 90);
});

test("all difficulties fill the new phrases with sample-aligned single notes", () => {
  for (const [level, columns] of [
    ["easy", [0, 4, 8, 12]],
    ["medium", [0, 2, 4, 6, 8, 10, 12, 14]],
    ["hard", [0, 2, 4, 6, 8, 10, 12, 13, 14, 15]],
    ["hardest", Array.from({ length: 16 }, (_, i) => i)]
  ]) {
    for (const bar of [29, 37, 38]) {
      const hits = hitsAt(level, bar);
      assert.deepEqual(hits.map((event) => event.step % 16), columns);
      assert(hits.every((event) => event.keys.length === 1 && LANES.includes(event.keys[0])));
      for (const event of hits) assert.equal(event.sample, event.step * 5625);
    }
  }
});

test("Medium alternates two keys per half-bar and Hard ends each new bar with a four-note trill", () => {
  for (const bar of [29, 37, 38]) {
    const medium = hitsAt("medium", bar).map((event) => event.keys[0]);
    for (const offset of [0, 4]) {
      assert.notEqual(medium[offset], medium[offset + 1]);
      assert.equal(medium[offset], medium[offset + 2]);
      assert.equal(medium[offset + 1], medium[offset + 3]);
    }
    const tail = hitsAt("hard", bar).slice(-4).map((event) => event.keys[0]);
    assert.notEqual(tail[0], tail[1]);
    assert.deepEqual(tail, [tail[0], tail[1], tail[0], tail[1]]);
  }
});

function permutations(items) {
  return items.length ? items.flatMap((item) => permutations(items.filter((other) => other !== item)).map((rest) => [item, ...rest])) : [[]];
}

test("every random lane mapping preserves doubles and avoids a third immediate press at phrase boundaries", () => {
  for (const map of permutations(LANES)) {
    const run = new GameEngine(chart, { level: "hardest" });
    run.appendLoop(3, 200, 0, map);
    const notes = run.notes.filter((note) => note.loop === 3);
    for (const section of phrases) {
      const start = (section.startBar - 1) * 16;
      const end = start + section.bars * 16;
      const phrase = notes.filter((note) => note.step >= start && note.step < end);
      for (let index = 0; index < phrase.length; index += 2) {
        assert.equal(phrase[index].lane, phrase[index + 1].lane);
        if (index + 2 < phrase.length) assert.notEqual(phrase[index + 1].lane, phrase[index + 2].lane);
        assert.equal(phrase[index].lane, map[LANES.indexOf(phrase[index].original)]);
      }
      assert(!notes.some((note) => note.step === start - 1 && note.lane === phrase[0].lane));
      assert(!notes.some((note) => note.step === end && note.lane === phrase.at(-1).lane));
    }
  }
});

test("one physical input catches one member of a double and a second input is required", () => {
  for (const startLoop of [1, 6, 10]) {
    const run = new GameEngine(chart, { level: "hardest", startLoop, startAt: 52.5 });
    const [first, second] = run.notes;
    assert.equal(first.lane, second.lane);
    assert.equal(run.input(first.lane, first.at).kind, "perfect");
    assert.equal(second.state, "waiting");
    assert.equal(run.input(second.lane, second.at).kind, "perfect");
    assert.equal(run.combo, 2);
    assert.equal(run.lives, 10);
  }
});

test("shipped audio follows the same climax order and contains a continuous low arpeggio", () => {
  const live = JSON.parse(readFileSync(new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url)));
  const report = JSON.parse(readFileSync(new URL("../../../docs/rhythm-double-tap-mix.json", import.meta.url)));
  const audio = readFileSync(new URL("../../../public/game-assets/rhythm-harpoon/assets/pixel-circuit.ogg", import.meta.url));
  assert.equal(report.outputOggSha256, createHash("sha256").update(audio).digest("hex"));
  assert.equal(report.mixVersion, "spiral-melody-5");
  assert.equal(report.arrangementVersion, live.arrangementVersion);
  assert.deepEqual(report.playbackBarOrder, live.playbackBarOrder);
  assert.equal(report.frames, 4320000);
  assert.equal(report.durationSeconds, 90);
  assert(report.decodedPeak < 1);
  assert.deepEqual(report.sections.map(s => [s.startBar, s.bars]), [[29, 1], [43, 2]]);
  for (const section of report.sections) {
    const start = (section.startBar - 1) * 16;
    assert.deepEqual(section.onsets.map(n => n.step), Array.from({length: section.bars * 16}, (_, i) => start + i));
    assert(section.onsets.every(n => n.sample === n.step * 5625));
  }
  const reprise = report.sections.find(section => section.startBar === 43);
  assert.deepEqual(reprise.melodySourceBars, [39, 40]);
  assert(reprise.melodyGainDb <= 0);
  assert.deepEqual(reprise.onsets.map(note => note.sourceStep), Array.from({length: 32}, (_, i) => 608 + i));
  const arp = report.lowArpeggio;
  assert.equal(arp.onsets.length, 160);
  assert.deepEqual(arp.chords, ["G", "D", "Em", "B", "G", "D", "Em", "C", "G", "B"]);
  for (const [i, note] of arp.onsets.entries()) {
    assert.equal(note.step, 608 + i);
    assert.equal(note.sample, note.step * 5625);
    assert(note.midi >= 47 && note.midi <= 64);
  }
  assert.equal(arp.onsets.at(-1).sample + 5625, report.frames);
});
