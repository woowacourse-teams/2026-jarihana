import { LANES, CAPTURE_WINDOW, ATTACK_DURATION, JUDGMENTS, POOR_PENALTY } from "./engine.mjs";

const ATLAS = [
  [53, 70, 252, 251],
  [357, 70, 248, 251],
  [656, 70, 251, 251],
  [953, 68, 255, 256],
  [41, 368, 271, 257],
  [343, 369, 276, 256],
  [647, 369, 276, 255],
  [953, 368, 279, 255],
  [113, 666, 148, 261],
  [423, 670, 146, 260],
  [726, 666, 149, 264],
  [1027, 667, 151, 262],
  [37, 1025, 296, 119],
  [365, 975, 233, 222],
  [654, 982, 255, 217],
  [964, 984, 257, 215]
];
const ANGLES = { left: Math.PI, down: Math.PI / 2, right: 0, up: -Math.PI / 2 };
const VECTOR = { left: [-1, 0], down: [0, 1], right: [1, 0], up: [0, -1] };
const CENTER = 450;
const TARGET = 242;
const SPAWN = 485;
const COMPASS = ["up", "right", "down", "left"];
const FEEDBACK_COLORS = {
  perfect: "#14532d",
  hit: "#153eaa",
  enough: "#854d0e",
  uhoh: "#9a3412",
  poor: "#991b1b"
};

export function beatTiming(time, engine) {
  if (!engine) return { beatIndex: 0, phase: 0, pulse: 0, strength: 0 };
  const loop = engine.currentLoop(time);
  const counting = time < engine.loops[0].start;
  if (counting && time < engine.countInStart)
    return { beatIndex: 0, phase: 0, pulse: 0, strength: 0 };
  const songTime = counting
    ? (time - engine.countInStart) * engine.loops[0].rate
    : (time - loop.start) * loop.rate + loop.offset;
  const beat = (songTime * engine.chart.bpm) / 60;
  const whole = Math.floor(beat + 0.00000001);
  const phase = Math.max(0, beat - whole);
  const beatIndex = ((whole % 4) + 4) % 4;
  const pulse = Math.max(0, 1 - phase / 0.38);
  return { beatIndex, phase, pulse, strength: pulse * [1, 0.45, 0.7, 0.45][beatIndex] };
}

export function spiralCue(time, engine) {
  if (!engine?.chart || !engine.notes.length) return null;
  const loop = engine.currentLoop(time);
  const barDuration = (60 / engine.chart.bpm) * 4;
  const lead = (60 / engine.chart.bpm / loop.rate) * 2;
  for (const section of engine.chart.sections.filter((section) => section.pattern === "roll")) {
    const start = loop.start + ((section.startBar - 1) * barDuration - loop.offset) / loop.rate;
    const end = start + (section.bars * barDuration) / loop.rate;
    if (time < start - lead || time >= end) continue;
    const songTime = (time - loop.start) * loop.rate + loop.offset;
    const bar = Math.max(section.startBar, Math.floor(songTime / barDuration + 0.00000001) + 1);
    const cueAtBar = (targetBar) => {
      const firstStep = (targetBar - 1) * 16;
      const notes = engine.notes
        .filter(
          (note) =>
            note.loop === loop.number && note.step >= firstStep && note.step < firstStep + 16
        )
        .sort((a, b) => a.step - b.step);
      if (notes.length < 4) return null;
      const indices = notes.slice(0, 4).map((note) => LANES.indexOf(note.lane));
      const delta = (indices[1] - indices[0] + 4) % 4;
      if (
        ![1, 3].includes(delta) ||
        indices.slice(1).some((value, index) => (value - indices[index] + 4) % 4 !== delta)
      )
        return null;
      return {
        firstLane: notes[0].lane,
        noteColor: notes[0].color,
        direction: delta === 1 ? -1 : 1
      };
    };
    const cue = cueAtBar(bar);
    if (!cue) return null;
    if (bar + 1 < section.startBar + section.bars) {
      const next = cueAtBar(bar + 1);
      const changeAt = loop.start + (bar * barDuration - loop.offset) / loop.rate;
      if (
        next &&
        next.direction !== cue.direction &&
        time >= changeAt - lead - 1e-8 &&
        time < changeAt
      ) {
        cue.next = {
          ...next,
          beatsUntil: Math.max(1, Math.ceil((changeAt - time) / (lead / 2) - 1e-8))
        };
      }
    }
    return cue;
  }
  return null;
}

export function turnIndicatorPoints(
  angle,
  direction,
  { x = 740, y = 230, radius = 94, inset = 12 } = {}
) {
  return Array.from({ length: 73 }, (_, index) => {
    const phase = index / 72;
    const distance = radius - inset * phase;
    const theta = angle + direction * Math.PI * 1.5 * phase;
    return { x: x + distance * Math.cos(theta), y: y + distance * Math.sin(theta) };
  });
}

export class Renderer {
  constructor(canvas, sprites) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sprites = sprites;
    this.effects = [];
    this.lastHit = null;
    this.showTiming = true;
    this.chordArcSides = new WeakMap();
    this.nextChordArcSide = { horizontal: 1, vertical: -1 };
    this.hurtUntil = -1;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(canvas);
    this.resizeCanvas();
  }

  resizeCanvas() {
    const width = this.canvas.getBoundingClientRect().width;
    const pixels = Math.max(1, Math.round(width * Math.min(devicePixelRatio || 1, 2)));
    if (this.canvas.width !== pixels) {
      this.canvas.width = pixels;
      this.canvas.height = pixels;
    }
  }

  sprite(index, x, y, width, height = width, angle = 0, alpha = 1) {
    const ctx = this.ctx;
    const source = ATLAS[index];
    const scale = Math.min(width / source[2], height / source[3]);
    const w = source[2] * scale;
    const h = source[3] * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha *= alpha;
    ctx.drawImage(this.sprites, ...source, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  receive(effects) {
    for (const effect of effects) {
      this.effects.push(effect);
      if (effect.kind === "damage") this.hurtUntil = effect.at + 0.45;
      else if (effect.note || effect.kind === "poor") this.lastHit = effect;
    }
  }

  text(value, x, y, size = 18, color = "#47645d", align = "center", emphasis = false) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = (emphasis ? "800 " : "600 ") + size + 'px "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    if (emphasis) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeText(value, x, y);
    }
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  field(time, engine) {
    const ctx = this.ctx;
    ctx.fillStyle = "#eaf1e8";
    ctx.fillRect(0, 0, 900, 900);
    ctx.fillStyle = "#d7e3d4";
    for (let x = 35; x < 900; x += 38) {
      for (let y = 100; y < 825; y += 38) {
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const { beatIndex, phase, pulse, strength } = beatTiming(time, engine);
    for (const lane of LANES) {
      ctx.save();
      ctx.translate(CENTER, CENTER);
      ctx.rotate(ANGLES[lane]);
      ctx.fillStyle = "#f7f9f1";
      ctx.strokeStyle = "#5e786b";
      ctx.lineWidth = 2;
      ctx.fillRect(55, -43, 155, 86);
      ctx.strokeRect(55, -43, 155, 86);
      ctx.fillStyle = "#e0ecda";
      ctx.fillRect(210, -43, 64, 86);
      ctx.setLineDash([7, 6]);
      ctx.strokeRect(210, -43, 64, 86);
      ctx.setLineDash([]);
      if (strength > 0) {
        ctx.strokeStyle = "rgba(48,129,125," + strength * 0.65 + ")";
        ctx.lineWidth = this.reducedMotion ? 4 : 3 + strength * 2;
        ctx.beginPath();
        ctx.arc(TARGET, 0, this.reducedMotion ? 33 : 29 + phase * 60, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(73,155,145," + strength * 0.22 + ")";
        ctx.fillRect(TARGET - 9, -51, 18, 102);
      }
      ctx.lineCap = "round";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(TARGET, -49);
      ctx.lineTo(TARGET, 49);
      ctx.stroke();
      ctx.strokeStyle = "#264f53";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(TARGET, 0, 24, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#264f53";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(TARGET, side * 43);
        ctx.lineTo(TARGET - 8, side * 56);
        ctx.lineTo(TARGET + 8, side * 56);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(TARGET, 0, 27, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const vector = VECTOR[lane];
      this.text(
        { left: "←", down: "↓", right: "→", up: "↑" }[lane],
        CENTER + vector[0] * 146,
        CENTER + vector[1] * 146,
        28,
        "#718777"
      );
      this.text(
        "판정",
        CENTER + vector[0] * TARGET + (vector[1] ? 76 : 0),
        CENTER + vector[1] * TARGET + (vector[0] ? -68 : 0),
        16,
        "#264f53"
      );
    }
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, TARGET, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(38,94,98,0.4)";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 77 + pulse * 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(162,195,142," + (0.12 + strength * 0.1) + ")";
    ctx.fill();
    for (let index = 0; index < 4; index++) {
      ctx.beginPath();
      ctx.arc(417 + index * 22, 805, index === beatIndex ? 4.7 : 3, 0, Math.PI * 2);
      ctx.fillStyle = index === beatIndex ? "#3f684a" : "#b2c4ae";
      ctx.fill();
    }
    this.text("세균 중심을 굵은 판정선에 맞춰요", 450, 765, 17, "#446458");
  }

  harpoon(lane, age, caught) {
    const ctx = this.ctx;
    const duration = caught ? 0.18 : 0.12;
    if (age < 0 || age > duration) return;
    const phase =
      age < 0.025
        ? 1 - Math.pow(1 - age / 0.025, 3)
        : Math.max(0, 1 - (age - 0.025) / (duration - 0.025));
    const distance = 74 + (caught ? 185 : 112) * phase;
    ctx.save();
    ctx.translate(CENTER, CENTER);
    ctx.rotate(ANGLES[lane]);
    ctx.strokeStyle = caught ? "#263c3e" : "#8c9991";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(53, 0);
    ctx.lineTo(distance - 9, 0);
    ctx.stroke();
    this.sprite(12, distance - 35, 0, 82, 34, 0, caught ? 1 : 0.65);
    ctx.restore();
  }

  germPosition(note, time) {
    const vector = VECTOR[note.lane];
    let radius;
    if (note.state === "attack") {
      const travel = Math.max(0, Math.min(1, (time - note.at - CAPTURE_WINDOW) / ATTACK_DURATION));
      radius = TARGET + (65 - TARGET) * Math.pow(travel, 0.65);
    } else {
      const remaining = (note.at - time) / note.travelDuration;
      radius = TARGET + (SPAWN - TARGET) * remaining;
    }
    const bob = this.reducedMotion ? 0 : Math.sin((time + note.step) * 5) * 1.3;
    return {
      x: CENTER + vector[0] * radius + (vector[1] ? bob : 0),
      y: CENTER + vector[1] * radius + (vector[0] ? bob : 0),
      radius
    };
  }

  turnSignal(time, engine) {
    const cue = spiralCue(time, engine);
    if (!cue) return;
    this.turnIndicator(cue);
    if (cue.next) {
      this.turnIndicator(cue.next, true);
      this.text(cue.next.beatsUntil + "박 뒤 반전", 570, 366, 20, "#925316", "center", true);
    }
  }

  turnIndicator(cue, preview = false) {
    const ctx = this.ctx;
    const points = turnIndicatorPoints(
      ANGLES[cue.firstLane],
      cue.direction,
      preview ? { x: 570, y: 280, radius: 46, inset: 6 } : {}
    );
    const start = points[0];
    const end = points.at(-1);
    const before = points.at(-2);
    const angle = Math.atan2(end.y - before.y, end.x - before.x);
    ctx.save();
    ctx.strokeStyle = preview ? "#b76a13" : "#159b48";
    ctx.fillStyle = preview ? "#b76a13" : "#159b48";
    ctx.lineWidth = preview ? 3.5 : 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.beginPath();
    points.forEach((point, index) =>
      index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    const head = preview ? 14 : 22;
    ctx.lineTo(end.x - head * Math.cos(angle - 0.5), end.y - head * Math.sin(angle - 0.5));
    ctx.lineTo(end.x - head * Math.cos(angle + 0.5), end.y - head * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f7faf2";
    ctx.lineWidth = preview ? 3 : 4;
    ctx.beginPath();
    ctx.arc(start.x, start.y, preview ? 17 : 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.sprite(4 + cue.noteColor, start.x, start.y, preview ? 28 : 36, preview ? 28 : 36);
    ctx.restore();
  }

  chordLinks(notes, time) {
    const groups = new Map();
    for (const note of notes) {
      if (note.state !== "waiting" || !note.group || note.group.notes.length < 2) continue;
      if (!groups.has(note.group)) groups.set(note.group, []);
      groups.get(note.group).push(note);
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(132,146,136,0.38)";
    ctx.lineWidth = 1.75;
    ctx.lineCap = "round";
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const positions = new Map(members.map((note) => [note.lane, this.germPosition(note, time)]));
      const opposed =
        members.length === 2 &&
        (positions.has("left") && positions.has("right")
          ? "horizontal"
          : positions.has("up") && positions.has("down")
            ? "vertical"
            : null);
      if (opposed) {
        const group = members[0].group;
        if (!this.chordArcSides.has(group)) {
          this.chordArcSides.set(group, this.nextChordArcSide[opposed]);
          this.nextChordArcSide[opposed] *= -1;
        }
        const a = positions.get(opposed === "horizontal" ? "left" : "up");
        const b = positions.get(opposed === "horizontal" ? "right" : "down");
        const centerX = (a.x + b.x) / 2;
        const centerY = (a.y + b.y) / 2;
        const radius = Math.hypot(b.x - a.x, b.y - a.y) / 2;
        const angle = Math.atan2(a.y - centerY, a.x - centerX);
        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          radius,
          angle,
          angle + Math.PI,
          this.chordArcSides.get(group) < 0
        );
        ctx.stroke();
        continue;
      }
      const segments =
        members.length === 2
          ? [[members[0].lane, members[1].lane]]
          : COMPASS.map((lane, index) => [lane, COMPASS[(index + 1) % 4]]);
      ctx.beginPath();
      for (const [from, to] of segments) {
        if (!positions.has(from) || !positions.has(to)) continue;
        const a = positions.get(from);
        const b = positions.get(to);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  germ(note, time) {
    const ctx = this.ctx;
    const vector = VECTOR[note.lane];
    const { x, y, radius } = this.germPosition(note, time);
    if (note.state === "attack") {
      ctx.save();
      ctx.strokeStyle = "#e54d45";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(CENTER + vector[0] * (radius + 30), CENTER + vector[1] * (radius + 30));
      ctx.lineTo(CENTER + vector[0] * (radius + 65), CENTER + vector[1] * (radius + 65));
      ctx.stroke();
      ctx.restore();
    }
    if (x < -45 || x > 945 || y < -45 || y > 945) return;
    this.sprite(4 + note.color, x, y, 38, 38);
  }

  draw(time, engine) {
    const ctx = this.ctx;
    ctx.setTransform(this.canvas.width / 900, 0, 0, this.canvas.height / 900, 0, 0);
    ctx.clearRect(0, 0, 900, 900);
    this.field(time, engine);
    if (engine) {
      const visible = engine.notes.filter(
        (note) => note.spawnAt <= time && (note.state === "waiting" || note.state === "attack")
      );
      visible.sort((a, b) => b.at - a.at);
      this.chordLinks(visible, time);
      for (const note of visible) this.germ(note, time);
    }
    this.turnSignal(time, engine);
    this.effects = this.effects.filter((effect) => time - effect.at < 0.65);
    for (const effect of this.effects) {
      const age = time - effect.at;
      if (effect.kind === "poor") this.harpoon(effect.lane, age, false);
      if (!effect.note) continue;
      this.harpoon(effect.note.lane, age, true);
      if (age >= 0 && age < 0.27) {
        const vector = VECTOR[effect.note.lane];
        const x = CENTER + vector[0] * TARGET;
        const y = CENTER + vector[1] * TARGET;
        const angle =
          effect.note.lane === "left"
            ? 0
            : effect.note.lane === "right"
              ? Math.PI
              : effect.note.lane === "up"
                ? Math.PI / 2
                : -Math.PI / 2;
        this.sprite(8 + effect.note.color, x, y, 40, 51, angle, 1 - age / 0.27);
        if (age < 0.14)
          this.sprite(13, x - vector[0] * 20, y - vector[1] * 20, 28, 28, age * 2, 1 - age / 0.14);
      }
    }
    let expression = 0;
    if (time < this.hurtUntil) expression = 3;
    else if (this.lastHit && time - this.lastHit.at < 0.23 && this.lastHit.kind !== "poor")
      expression = 2;
    const shake = expression === 3 && !this.reducedMotion ? Math.sin(time * 90) * 3 : 0;
    this.sprite(expression, CENTER + shake, CENTER, 132, 132);
    if (this.lastHit && time - this.lastHit.at < 0.48) {
      const effect = this.lastHit;
      const poor = effect.kind === "poor";
      const judgment = JUDGMENTS.find((item) => item.kind === effect.kind);
      const label = poor ? "헛공격 -" + POOR_PENALTY.toLocaleString("ko-KR") : judgment.label;
      this.text(label, 450, 566, poor ? 30 : 36, FEEDBACK_COLORS[effect.kind], "center", true);
      if (this.showTiming && !poor && !engine?.autoplay) {
        const error = Math.round(effect.delta * 1000);
        const timing = error === 0 ? "JUST" : error < 0 ? "FAST" : "SLOW";
        const color = error === 0 ? "#154734" : error < 0 ? "#1742c8" : "#b42318";
        this.text(timing + " " + Math.abs(error) + "ms", 450, 608, 28, color, "center", true);
      }
    }
    if (engine && time < engine.loops[0].start) {
      const remaining = engine.loops[0].start - time;
      const interval = 60 / engine.chart.bpm / engine.loops[0].rate;
      const label =
        time < engine.countInStart
          ? "준비"
          : String(Math.min(4, Math.max(1, Math.ceil(remaining / interval))));
      this.text(label, 450, 280, 42, "#345342");
    }
    if (engine?.autoplay) this.text("AUTO", 450, 104, 15, "#547c5e");
  }
}
