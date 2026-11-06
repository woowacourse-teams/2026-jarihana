import test from "node:test";
import assert from "node:assert/strict";
import {
  Renderer,
  beatTiming,
  spiralCue,
  turnIndicatorPoints
} from "../../../src/features/game/rhythm/render.mjs";
import { GameEngine } from "../../../src/features/game/rhythm/engine.mjs";
import { readFileSync } from "node:fs";

function timingFrame(delta, { showTiming = true, autoplay = false, poor = false } = {}) {
  const drawn = [];
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    canvas: { width: 900, height: 900 },
    ctx: { setTransform() {}, clearRect() {} },
    effects: [],
    hurtUntil: -1,
    showTiming,
    lastHit: { kind: poor ? "poor" : "hit", at: 1, delta },
    field() {},
    sprite() {},
    germ() {},
    harpoon() {},
    chordLinks() {},
    text(value) {
      drawn.push(value);
    }
  });
  renderer.draw(1.1, { autoplay, notes: [], loops: [{ start: 0 }] });
  return drawn;
}

test("manual timing feedback distinguishes early, late and centered inputs", () => {
  for (const [delta, label] of [
    [-0.048, "FAST 48ms"],
    [0.085, "SLOW 85ms"],
    [0, "JUST 0ms"],
    [-0.0004, "JUST 0ms"],
    [0.0004, "JUST 0ms"]
  ]) {
    const drawn = timingFrame(delta);
    assert(drawn.includes("HIT"));
    assert(drawn.includes(label));
  }
});

test("clay shading leaves all four judgment lines sharp and fixed throughout a beat", () => {
  const chart = JSON.parse(readFileSync(new URL("./fixtures/pre-climax-chart.json", import.meta.url)));
  const engine = new GameEngine(chart);
  const beat = 60 / chart.bpm;
  for (const reducedMotion of [false, true]) {
    for (const time of [engine.countInStart, engine.loops[0].start, engine.loops[0].start + beat * 0.2, engine.loops[0].start + beat * 0.6]) {
      const strokes = [], stack = [];
      let path;
      const ctx = {
        shadowBlur: 0, shadowColor: "transparent", shadowOffsetY: 0,
        angle: 0, strokeStyle: "", lineWidth: 1,
        save() { stack.push({ shadowBlur: this.shadowBlur, shadowColor: this.shadowColor, shadowOffsetY: this.shadowOffsetY, angle: this.angle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
        restore() { Object.assign(this, stack.pop()); },
        translate() {}, rotate(angle) { this.angle = angle; },
        fillRect() {}, fill() {}, roundRect() {}, arc() {}, closePath() {},
        createLinearGradient() { return { addColorStop() {} }; },
        beginPath() { path = []; },
        moveTo(x, y) { path.push([x, y]); },
        lineTo(x, y) { path.push([x, y]); },
        stroke() {
          if (this.strokeStyle === "#264f53" && this.lineWidth === 7)
            strokes.push({ path, angle: this.angle, blur: this.shadowBlur });
        }
      };
      const renderer = Object.assign(Object.create(Renderer.prototype), { ctx, reducedMotion, text() {} });
      renderer.field(time, engine);
      assert.deepEqual(strokes.map(stroke => stroke.angle), [Math.PI, Math.PI / 2, 0, -Math.PI / 2]);
      for (const stroke of strokes) {
        assert.deepEqual(stroke.path, [[242, -49], [242, 49]]);
        assert.equal(stroke.blur, 0);
      }
    }
  }
});

function chordFrame(lanes, states = []) {
  const segments = [];
  const arcs = [];
  let from;
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    stroke() {},
    moveTo(x, y) {
      from = [x, y];
    },
    lineTo(x, y) {
      segments.push([from, [x, y]]);
    },
    arc(...args) {
      arcs.push(args);
    }
  };
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx,
    reducedMotion: true,
    chordArcSides: new WeakMap(),
    nextChordArcSide: { horizontal: 1, vertical: -1 }
  });
  const group = { notes: [] };
  const notes = lanes.map((lane, index) => ({
    lane,
    group,
    state: states[index] || "waiting",
    at: 1,
    travelDuration: 1,
    step: 0
  }));
  group.notes = notes;
  renderer.chordLinks(notes, 0.5);
  return { segments, arcs, renderer, notes };
}

test("four-way chords draw diamond edges and three-way chords draw an open V", () => {
  const r = 242 + (485 - 242) * 0.5;
  const up = [450, 450 - r],
    right = [450 + r, 450],
    down = [450, 450 + r],
    left = [450 - r, 450];
  assert.deepEqual(chordFrame(["left", "down", "right", "up"]).segments, [
    [up, right],
    [right, down],
    [down, left],
    [left, up]
  ]);
  assert.deepEqual(chordFrame(["left", "down", "up"]).segments, [
    [down, left],
    [left, up]
  ]);
  assert.deepEqual(chordFrame(["left", "up"]).segments, [[left, up]]);
});

test("opposite-lane doubles use semicircles instead of a line across the center", () => {
  const r = 242 + (485 - 242) * 0.5;
  const horizontal = chordFrame(["right", "left"]);
  assert.deepEqual(horizontal.segments, []);
  assert.deepEqual(horizontal.arcs, [[450, 450, r, Math.PI, Math.PI * 2, false]]);
  const vertical = chordFrame(["down", "up"]);
  assert.deepEqual(vertical.segments, []);
  assert.deepEqual(vertical.arcs, [[450, 450, r, -Math.PI / 2, Math.PI / 2, true]]);
});

test("successive arcs alternate sides and keep their side as notes enter or leave view", () => {
  const { renderer, notes, arcs } = chordFrame(["up", "down"]);
  const nextGroup = { notes: [] };
  const next = notes.map((note) => ({ ...note, at: 1.4, step: 4, group: nextGroup }));
  nextGroup.notes = next;
  arcs.length = 0;
  renderer.chordLinks([...notes, ...next], 0.6);
  assert.equal(arcs.length, 2);
  assert.equal(arcs[0][5], true);
  assert.equal(arcs[1][5], false);
  assert.notEqual(arcs[0][2], arcs[1][2]);
  arcs.length = 0;
  renderer.chordLinks(next, 0.7);
  assert.equal(arcs[0][5], false);
});

test("chord links exclude caught, attacking and unrelated notes", () => {
  assert.equal(chordFrame(["left", "right"], ["caught", "waiting"]).segments.length, 0);
  assert.equal(chordFrame(["left", "right"], ["attack", "waiting"]).segments.length, 0);
  const { renderer, notes, segments } = chordFrame(["left"]);
  const other = { ...notes[0], lane: "right", group: { notes: [{}, {}] } };
  renderer.chordLinks([...notes, other], 0.5);
  assert.equal(segments.length, 0);
});

test("target pulses follow four audible beats through count-in, practice offsets and accelerated loops", () => {
  const chart = JSON.parse(
    readFileSync(
      new URL("./fixtures/pre-climax-chart.json", import.meta.url),
      "utf8"
    )
  );
  for (const startLoop of [1, 6, 10]) {
    const run = new GameEngine(chart, { startLoop, startAt: 75, scrollSpeed: 3 });
    const loop = run.loops[0];
    const interval = 60 / chart.bpm / loop.rate;
    for (const index of [0, 1, 2, 3]) {
      const count = beatTiming(run.countInStart + index * interval, run);
      const music = beatTiming(loop.start + index * interval, run);
      assert.equal(count.beatIndex, index);
      assert.equal(music.beatIndex, index);
      assert(Math.abs(music.strength - [1, 0.45, 0.7, 0.45][index]) < 1e-6);
      assert.equal(beatTiming(loop.start + (index + 0.5) * interval, run).strength, 0);
    }
    assert.equal(beatTiming(loop.end, run).beatIndex, 0);
    assert.equal(beatTiming(loop.end, run).strength, 1);
  }
});

test("spiral cues announce two beats early and follow actual randomized lanes and reversals", () => {
  const chart = JSON.parse(
    readFileSync(
      new URL("./fixtures/pre-climax-chart.json", import.meta.url),
      "utf8"
    )
  );
  for (const level of ["hard", "hardest"]) {
    const run = new GameEngine(chart, { level, startLoop: 6 });
    for (const loop of run.loops) {
      const first = run.notes.find((note) => note.loop === loop.number && note.step === 480);
      const beat = 60 / chart.bpm / loop.rate;
      assert.equal(spiralCue(first.at - beat * 2 - 0.001, run), null);
      const cue = spiralCue(first.at - beat, run);
      assert.equal(cue.firstLane, first.lane);
      assert.equal(cue.direction, -1);
      const next = run.notes.find(
        (note) => note.loop === loop.number && note.step === (level === "hard" ? 482 : 481)
      );
      assert.deepEqual(spiralCue(next.at, run), cue);
      if (level === "hardest") {
        const reverse = run.notes.find((note) => note.loop === loop.number && note.step === 688);
        assert.equal(spiralCue(reverse.at, run).direction, 1);
        assert.equal(spiralCue(reverse.at, run).firstLane, reverse.lane);
      }
      const after = run.notes.find((note) => note.loop === loop.number && note.step === 704);
      assert.equal(spiralCue(after.at + 0.001, run), null);
    }
  }
});

test("the curve starts on the indicated lane and turns three quarters in the actual direction", () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const direction of [-1, 1]) {
      const points = turnIndicatorPoints(angle, direction);
      assert(Math.abs(points[0].x - (740 + 94 * Math.cos(angle))) < 1e-6);
      assert(Math.abs(points[0].y - (230 + 94 * Math.sin(angle))) < 1e-6);
      assert(
        points.every((point) => point.x > 610 && point.x < 870 && point.y > 100 && point.y < 370)
      );
      let winding = 0;
      for (let index = 1; index < points.length; index++) {
        const a = Math.atan2(points[index - 1].y - 230, points[index - 1].x - 740);
        const b = Math.atan2(points[index].y - 230, points[index].x - 740);
        winding += Math.atan2(Math.sin(b - a), Math.cos(b - a));
      }
      assert(Math.abs(winding - direction * 1.5 * Math.PI) < 1e-6);
    }
  }
});

test("reversal previews start two musical beats early without replacing the current direction", () => {
  const chart = JSON.parse(
    readFileSync(
      new URL("./fixtures/pre-climax-chart.json", import.meta.url),
      "utf8"
    )
  );
  for (const startLoop of [1, 6, 10, 40]) {
    const run = new GameEngine(chart, { level: "hardest", startLoop, startAt: 78.75 });
    for (const loop of run.loops) {
      const current = run.notes.find((note) => note.loop === loop.number && note.step === 672);
      const reverse = run.notes.find((note) => note.loop === loop.number && note.step === 688);
      const beat = 60 / chart.bpm / loop.rate;
      assert.equal(spiralCue(reverse.at - beat * 2 - 0.001, run).next, undefined);
      const preview = spiralCue(reverse.at - beat * 2, run);
      assert.equal(preview.firstLane, current.lane);
      assert.equal(preview.direction, -1);
      assert.equal(preview.next.firstLane, reverse.lane);
      assert.equal(preview.next.direction, 1);
      assert.equal(preview.next.beatsUntil, 2);
      assert.equal(spiralCue(reverse.at - beat, run).next.beatsUntil, 1);
      const changed = spiralCue(reverse.at, run);
      assert.equal(changed.direction, 1);
      assert.equal(changed.firstLane, reverse.lane);
      assert.equal(changed.next, undefined);
    }
  }
  const hard = new GameEngine(chart, { level: "hard", startAt: 78.75 });
  const next = hard.notes.find((note) => note.step === 688);
  assert.equal(spiralCue(next.at - 0.5, hard).next, undefined);
});

test("reversal rendering shows a separate next start note and a countdown label", () => {
  const chart = JSON.parse(
    readFileSync(
      new URL("./fixtures/pre-climax-chart.json", import.meta.url),
      "utf8"
    )
  );
  const run = new GameEngine(chart, { startAt: 78.75 });
  const at = run.notes.find((note) => note.step === 688).at;
  const icons = [],
    labels = [],
    triangles = [];
  let path, closed;
  const ctx = {
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {
      path = [];
      closed = false;
    },
    moveTo(x, y) {
      path.push([x, y]);
    },
    lineTo(x, y) {
      path.push([x, y]);
    },
    stroke() {},
    arc() {},
    closePath() {
      closed = true;
    },
    fill() {
      if (closed) triangles.push(path);
    }
  };
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx,
    sprite(...args) {
      icons.push(args);
    },
    text(value) {
      labels.push(value);
    }
  });
  renderer.turnSignal(at - 0.6, run);
  assert.equal(icons.length, 2);
  assert.equal(icons[0][3], 36);
  assert.equal(icons[1][3], 28);
  assert.equal(triangles.length, 2);
  assert.deepEqual(labels, ["2박 뒤 반전"]);
});

test("the start note and curved arrow stay fixed while the pattern plays", () => {
  const chart = JSON.parse(
    readFileSync(
      new URL("./fixtures/pre-climax-chart.json", import.meta.url),
      "utf8"
    )
  );
  const run = new GameEngine(chart, { startAt: 56.25 });
  for (const reducedMotion of [true, false]) {
    const paths = [];
    let path;
    const ctx = {
      globalAlpha: 1,
      save() {},
      restore() {},
      setLineDash() {},
      beginPath() {
        path = [];
      },
      moveTo(x, y) {
        path.push([x, y]);
      },
      lineTo(x, y) {
        path.push([x, y]);
      },
      stroke() {
        if (path.length) paths.push(path);
      },
      closePath() {},
      fill() {},
      arc() {}
    };
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      ctx,
      reducedMotion,
      text() {},
      sprite() {}
    });
    renderer.turnSignal(run.loops[0].start + 0.1, run);
    renderer.turnSignal(run.loops[0].start + 0.2, run);
    assert.deepEqual(paths[0], paths[1]);
  }
});

test("the indicator draws one start note and one arrowhead without a text panel", () => {
  const chart = JSON.parse(
    readFileSync(
      new URL("./fixtures/pre-climax-chart.json", import.meta.url),
      "utf8"
    )
  );
  const run = new GameEngine(chart, { startAt: 56.25 });
  const icons = [],
    fills = [],
    circles = [];
  let path, closed;
  const ctx = {
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {
      path = [];
      closed = false;
    },
    moveTo(x, y) {
      path.push([x, y]);
    },
    lineTo(x, y) {
      path.push([x, y]);
    },
    stroke() {},
    closePath() {
      closed = true;
    },
    fill() {
      fills.push({ path, closed });
    },
    arc(...args) {
      circles.push(args);
    },
    fillRect() {
      assert.fail("unexpected panel");
    },
    strokeRect() {
      assert.fail("unexpected panel");
    }
  };
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx,
    text() {
      assert.fail("unexpected label");
    },
    sprite(...args) {
      icons.push(args);
    }
  });
  renderer.turnSignal(run.loops[0].start - 0.3, run);
  assert.equal(icons.length, 1);
  assert.deepEqual(icons[0], [4, 834, 230, 36, 36]);
  assert.equal(circles.length, 1);
  assert.equal(fills.filter((fill) => fill.closed && fill.path.length === 3).length, 1);
});

test("timing feedback respects the setting and hides on autoplay or empty inputs", () => {
  for (const options of [{ showTiming: false }, { autoplay: true }, { poor: true }]) {
    assert(
      timingFrame(-0.048, options).every(
        (text) =>
          !text.startsWith("FAST ") && !text.startsWith("SLOW ") && !text.startsWith("JUST ")
      )
    );
  }
  assert(timingFrame(-0.048, { showTiming: false }).includes("HIT"));
});
