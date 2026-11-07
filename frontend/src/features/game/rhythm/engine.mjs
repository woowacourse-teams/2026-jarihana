export const LANES = ["left", "down", "right", "up"];
export const PERFECT_WINDOW = 0.032;
export const HIT_WINDOW = 0.064;
export const CAPTURE_WINDOW = 0.15;
export const POOR_WINDOW = 0.18;
// 일찍 누른 입력은 200ms까지 판정(Uh oh 포함)을 받고, 그 뒤 30ms는 무시하며 230ms부터 헛공격이다.
export const EARLY_CAPTURE_WINDOW = 0.2;
export const EARLY_POOR_WINDOW = 0.23;
export const POOR_PENALTY = 1000;
export const JUDGMENTS = [
  { kind: "perfect", label: "PERFECT", window: PERFECT_WINDOW, score: 1000, color: "#416d36" },
  { kind: "hit", label: "HIT", window: HIT_WINDOW, score: 600, color: "#41687c" },
  // 일찍 누른 입력은 120ms까지 잡는다. 늦게 누른 입력은 100ms를 넘기면 놓친다.
  { kind: "enough", label: "ENOUGH", window: 0.1, earlyWindow: 0.12, score: 300, color: "#87702e" },
  // ENOUGH 범위를 벗어나 누르면 세균을 놓친다. 판정은 받지만 점수 없이 콤보가 끊기고 세균이 돌진한다.
  {
    kind: "uhoh",
    label: "Uh oh",
    window: CAPTURE_WINDOW,
    earlyWindow: EARLY_CAPTURE_WINDOW,
    score: 0,
    color: "#8a5d45",
    whiff: true
  }
];
export const ATTACK_DURATION = 0.18;
export const APPROACH_SECONDS = 1.25;
export const LEVELS = {
  easy: { name: "Easy", lives: 10, loopHeal: 3, description: "정박 위주의 단타로 리듬을 익혀요." },
  medium: {
    name: "Medium",
    lives: 8,
    loopHeal: 3,
    description: "한 박 간격의 축연타와 8분 엇박 단타가 나와요."
  },
  hard: {
    name: "Hard",
    lives: 8,
    loopHeal: 3,
    description: "2키 동시타와 16분 엇박, 박을 넘나드는 리듬에 도전해요."
  },
  hardest: { name: "Hardest", lives: 10, loopHeal: 5, description: "라이프 10개, 자신 있게 드립니다!" }
};

export function rateForLoop(loopNumber) {
  return Math.round((1 + Math.max(0, loopNumber - 5) * 0.05) * 100) / 100;
}

export function noteColor(step) {
  const nearInteger = (value) => Math.abs(value - Math.round(value)) < 0.000001;
  if (nearInteger(step / 4)) return 0;
  if (nearInteger(step / 2)) return 1;
  if (nearInteger(step)) return 2;
  return 3;
}

export function shuffleLanes(previous, random = Math.random) {
  let map;
  do {
    map = LANES.slice();
    for (let index = map.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [map[index], map[target]] = [map[target], map[index]];
    }
  } while (previous && map.every((lane, index) => lane === previous[index]));
  return map;
}

function staircaseRotations(chart, events, level, map) {
  if (level !== "hard" && level !== "hardest") return [];
  const gap = level === "hard" ? 4 : 2;
  return chart.sections
    .filter((section) => section.pattern === "roll")
    .map((section) => {
      const start = (section.startBar - 1) * 16;
      const end = start + section.bars * 16;
      const stairs = events.filter((event) => event.step >= start && event.step < end);
      const neighbors = events.filter(
        (event) =>
          (event.step < start && event.step >= start - gap) ||
          (event.step >= end && event.step < end + gap)
      );
      const preferred = LANES.indexOf(map[0]);
      const rotations = Array.from({ length: 4 }, (_, index) => (preferred + index) % 4);
      const shift = rotations.find((rotation) =>
        stairs.every((event) =>
          event.keys.every((key) =>
            neighbors.every(
              (neighbor) =>
                Math.abs(neighbor.step - event.step) >=
                  (level === "hard" && chart.sections.some((item) =>
                    (item.role === "alternatingTrill" || (!chart.playbackBarOrder && item.startBar === 41 && item.pattern === "offbeat")) &&
                    neighbor.step >= (item.startBar - 1) * 16 && neighbor.step < (item.startBar - 1 + item.bars) * 16
                  ) ? 2 : gap) ||
                !neighbor.keys
                  .map((key) => map[LANES.indexOf(key)])
                  .includes(LANES[(LANES.indexOf(key) + rotation) % 4])
            )
          )
        )
      );
      if (shift === undefined) throw new Error("계단 구간의 랜덤 배치를 만들 수 없어요.");
      return { start, end, shift };
    });
}

const HARD_RHYTHMS = {
  basic: [[0, 6, 8, 14]],
  mixed: [
    [0, 2, 6, 8, 10, 14],
    [0, 6, 8, 14]
  ],
  syncopatedA: [[0, 2, 6, 7, 10, 12]],
  syncopatedB: [[2, 6, 7, 9, 10, 14]],
  trill: [[0, 6, 8, 13, 15]]
};

function thinMediumRepeats(events) {
  const quarterSteps = new Map(LANES.map((lane) => [lane, new Set()]));
  for (const event of events) {
    if (event.step % 4 === 0) {
      for (const lane of event.keys) quarterSteps.get(lane).add(event.step);
    }
  }
  // Prefer the beat over a nearby offbeat, including at the next bar's start.
  return events.filter((event) =>
    event.keys.every(
      (lane) =>
        !quarterSteps.get(lane).has(event.step - 2) && !quarterSteps.get(lane).has(event.step + 2)
    )
  );
}

function syncopateHardChart(events, chart, patterns) {
  const source = new Map(chart.events.map((event) => [event.step, event]));
  const bars = new Map();
  for (const event of events) {
    const bar = Math.floor(event.step / 16);
    if (!bars.has(bar)) bars.set(bar, []);
    bars.get(bar).push(event);
  }
  const result = [];
  const lastSteps = new Map();
  for (const [bar, hits] of bars) {
    // Keep each bar's event count and chord sizes, using existing musical onsets.
    const choices = (HARD_RHYTHMS[patterns.get(bar)] || []).filter(
      (columns) =>
        columns.length === hits.length && columns.every((column) => source.has(bar * 16 + column))
    );
    const columns = choices.length ? choices[bar % choices.length] : null;
    for (const [index, event] of hits.entries()) {
      const step = columns ? bar * 16 + columns[index] : event.step;
      const sourceKeys = source.get(step).keys;
      const rotation = (bar + index) % LANES.length;
      const fallback = LANES.slice(rotation).concat(LANES.slice(0, rotation));
      const preferred = columns ? [...sourceKeys, ...event.keys] : [...event.keys, ...sourceKeys];
      const candidates = [...new Set([...preferred, ...fallback])];
      const keys = candidates
        .filter((key) => step - (lastSteps.get(key) ?? -Infinity) >= 4)
        .slice(0, event.keys.length);
      if (keys.length !== event.keys.length) throw new Error("Hard rhythm exceeds lane capacity");
      for (const key of keys) lastSteps.set(key, step);
      result.push({ step, sample: source.get(step).sample, keys });
    }
  }
  return result;
}

function easeHardOpeningChords(events) {
  return events.map((event) => {
    const bar = Math.floor(event.step / 16) + 1;
    if (bar < 14 && event.keys.length > 1) {
      return { ...event, keys: event.keys.slice(0, 1) };
    }
    return event;
  });
}

function straightStaircases(events, chart, level) {
  const sections = chart.sections.filter((section) => section.pattern === "roll");
  const targets = level === "hard" ? sections : sections.slice(0, 1);
  let result = events;
  for (const section of targets) {
    const start = (section.startBar - 1) * 16;
    const end = start + section.bars * 16;
    const source = chart.events.filter((event) => event.step >= start && event.step < end);
    const cycle = source.slice(0, 4).map((event) => event.keys[0]);
    const stride = level === "hard" ? 2 : 1;
    const stairs = source
      .filter((event) => (event.step - start) % stride === 0)
      .map((event, index) => ({
        step: event.step,
        sample: event.sample,
        keys: [cycle[index % 4]]
      }));
    result = result.filter((event) => event.step < start || event.step >= end).concat(stairs);
  }
  return result.sort((a, b) => a.step - b.step);
}

function trillChart(events, chart, level) {
  if (!chart.sections.some((section) => section.startBar === 41 && section.pattern === "offbeat"))
    return events;
  const start = 40 * 16;
  const pairs =
    level === "hard"
      ? [
          ["up", "down"],
          ["left", "right"]
        ]
      : [
          ["up", "down"],
          ["left", "right"],
          ["down", "up"],
          ["left", "right"]
        ];
  const block = level === "hard" ? 16 : 8;
  const trill = Array.from({ length: 32 }, (_, index) => ({
    step: start + index,
    sample: (start + index) * chart.samplesPerSixteenth,
    keys: [pairs[Math.floor(index / block)][index % 2]]
  }));
  return events
    .filter((event) => event.step < start || event.step >= start + 32)
    .concat(trill)
    .map((event) =>
      level === "hard" && event.step === 639
        ? { ...event, keys: ["left"] }
        : level === "hardest" && event.step === 44 * 16
          ? { ...event, keys: ["up"] }
          : event
    )
    .sort((a, b) => a.step - b.step);
}

function doubleTapChart(events, chart, level) {
  if (level === "hardest") return events;
  let result = events;
  for (const section of chart.sections.filter((item) => item.pattern === "doubleTap")) {
    const start = (section.startBar - 1) * 16;
    const end = start + section.bars * 16;
    const source = new Map(chart.events.map((event) => [event.step, event]));
    const columns =
      level === "easy"
        ? [0, 4, 8, 12]
        : level === "medium"
          ? [0, 2, 4, 6, 8, 10, 12, 14]
          : [0, 2, 4, 6, 8, 10, 12, 13, 14, 15];
    const phrase = [];
    for (let bar = 0; bar < section.bars; bar++) {
      for (const column of columns) {
        const step = start + bar * 16 + column;
        const keys =
          level === "hard" && column >= 12
            ? [section.hardTrillPairs[bar][(column - 12) % 2]]
            : level === "medium"
              ? [section.mediumPairs[bar * 2 + Math.floor(column / 8)][(column / 2) % 2]]
              : source.get(step).keys.slice();
        phrase.push({ step, sample: step * chart.samplesPerSixteenth, keys });
      }
    }
    result = result.filter((event) => event.step < start || event.step >= end).concat(phrase);
  }
  return result.sort((a, b) => a.step - b.step);
}

function simplifySourceChart(chart, level) {
  if (!LEVELS[level]) throw new Error("Unknown difficulty");
  const patterns = new Map();
  for (const section of chart.sections) {
    for (let bar = section.startBar - 1; bar < section.startBar - 1 + section.bars; bar++) {
      patterns.set(bar, section.pattern);
    }
  }
  const bars = new Map();
  for (const event of chart.events) {
    const bar = Math.floor(event.step / 16);
    if (!bars.has(bar)) bars.set(bar, []);
    bars.get(bar).push(event);
  }
  const selected = [];
  const lastRepeatSteps = new Map();
  for (const [bar, events] of bars) {
    let hits = events;
    if (level === "easy") {
      hits = events.filter((event) => event.step % (patterns.get(bar) === "bridge" ? 4 : 8) === 0);
      if (!hits.length)
        hits = events.filter((event) => event.step % 16 === 2 || event.step % 16 === 10);
      if (!hits.length) hits = [events[0]];
    } else if (level === "medium") {
      hits = events.filter((event) => event.step % 2 === 0);
    } else if (level === "hard" && patterns.get(bar) === "roll") {
      hits = events.filter((event) => event.step % 2 === 0);
    }
    for (const event of hits) {
      const maxKeys = level === "hardest" ? 4 : level === "hard" ? 2 : 1;
      const sourceKeys = event.keys.slice();
      const rotation = Math.floor(bar / 2) % sourceKeys.length;
      let keys = sourceKeys.slice(rotation).concat(sourceKeys.slice(0, rotation)).slice(0, maxKeys);
      if (level === "hard") {
        // Leave a full beat between same-lane presses, including across bar boundaries.
        keys = keys.filter((key) => event.step - (lastRepeatSteps.get(key) ?? -Infinity) >= 4);
        for (const key of keys) lastRepeatSteps.set(key, event.step);
      }
      if (!keys.length) continue;
      selected.push({ step: event.step, sample: event.sample, keys });
    }
  }
  selected.sort((a, b) => a.step - b.step);
  if (level === "medium") return doubleTapChart(thinMediumRepeats(selected), chart, level);
  if (level === "hard")
    return doubleTapChart(
      trillChart(
        easeHardOpeningChords(
          straightStaircases(syncopateHardChart(selected, chart, patterns), chart, level)
        ),
        chart,
        level
      ),
      chart,
      level
    );
  if (level === "hardest")
    return trillChart(straightStaircases(selected, chart, level), chart, level);
  return doubleTapChart(selected, chart, level);
}

export function playbackStep(chart, step) {
  if (!chart.playbackBarOrder) return step;
  return chart.playbackBarOrder.indexOf(Math.floor(step / 16) + 1) * 16 + step % 16;
}

export function playbackSections(chart) {
  if (!chart.playbackBarOrder) return chart.sections;
  return chart.sections.map((section) => ({
    ...section,
    startBar: chart.playbackBarOrder.indexOf(section.startBar) + 1
  })).sort((a, b) => a.startBar - b.startBar);
}

export function simplifyChart(chart, level) {
  const events = simplifySourceChart(chart, level);
  const playbackEvents = !chart.playbackBarOrder ? events : events.map((event) => {
    const step = playbackStep(chart, event.step);
    const keys = ["hard", "hardest"].includes(level) && step === 640 ? ["up"]
      : level === "hard" && [671, 704].includes(step) ? ["up"] : event.keys.slice();
    return { ...event, step, sample: step * chart.samplesPerSixteenth, keys };
  }).sort((a, b) => a.step - b.step);
  const overrides = chart.playbackOverrides?.[level];
  if (!overrides?.length) return playbackEvents;
  const replacedBars = new Set(overrides.map(({ bar }) => bar));
  return playbackEvents
    .filter((event) => !replacedBars.has(Math.floor(event.step / 16) + 1))
    .concat(overrides.flatMap(({ bar, events: replacements }) =>
      replacements.map(({ column, keys }) => {
        const step = (bar - 1) * 16 + column;
        return { step, sample: step * chart.samplesPerSixteenth, keys: keys.slice() };
      })
    ))
    .sort((a, b) => a.step - b.step);
}

export class GameEngine {
  constructor(chart, options = {}) {
    this.chart = { ...chart, sections: playbackSections(chart) };
    this.level = options.level || "hardest";
    this.random = options.random || Math.random;
    this.autoplay = Boolean(options.autoplay);
    // 따라 하기처럼 미리 만든 채보는 난이도별 단순화를 거치지 않고 그대로 쓴다.
    this.sourceEvents = options.events
      ? options.events.map((event) => ({ ...event, keys: event.keys.slice() }))
      : simplifyChart(chart, this.level);
    this.maxLives = LEVELS[this.level].lives;
    this.lives = this.maxLives;
    this.loopHeal = LEVELS[this.level].loopHeal;
    this.nextLoopToHeal = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.stats = { perfect: 0, hit: 0, enough: 0, uhoh: 0, poor: 0, miss: 0 };
    this.notes = [];
    this.loops = [];
    this.groups = [];
    this.effects = [];
    this.dead = false;
    this.elapsed = 0;
    this.startLoop = options.startLoop || 1;
    this.startAt = options.startAt || 0;
    this.scrollSpeed = options.scrollSpeed ?? 1;
    if (
      !Number.isFinite(this.scrollSpeed) ||
      this.scrollSpeed < 1 ||
      this.scrollSpeed > 3 ||
      !Number.isInteger(this.scrollSpeed * 4)
    ) {
      throw new RangeError("세균 이동 배속은 1.0부터 3.0까지 0.25 단위로 설정할 수 있어요.");
    }
    const rate = rateForLoop(this.startLoop);
    const countInDuration = ((60 / chart.bpm) * 4) / rate;
    this.leadIn = Math.max(countInDuration, APPROACH_SECONDS / this.scrollSpeed / rate);
    this.countInStart = this.leadIn - countInDuration;
    this.appendLoop(this.startLoop, this.leadIn, this.startAt, LANES.slice());
    this.appendNextLoop();
  }

  appendLoop(number, start, offset, map) {
    const rate = rateForLoop(number);
    const travelDuration = APPROACH_SECONDS / this.scrollSpeed / rate;
    const duration = (this.chart.durationSeconds - offset) / rate;
    const stairRotations = staircaseRotations(this.chart, this.sourceEvents, this.level, map);
    const loop = {
      number,
      start,
      end: start + duration,
      duration,
      offset,
      rate,
      map,
      stairRotations
    };
    this.loops.push(loop);
    for (const event of this.sourceEvents) {
      const songTime = event.sample / this.chart.sampleRateHz;
      if (songTime < offset) continue;
      const at = start + (songTime - offset) / rate;
      const staircase = stairRotations.find(
        (rotation) => event.step >= rotation.start && event.step < rotation.end
      );
      const group = { id: number + ":" + event.step, at, notes: [], damaged: false };
      this.groups.push(group);
      for (const original of event.keys) {
        const note = {
          lane: staircase
            ? LANES[(LANES.indexOf(original) + staircase.shift) % 4]
            : map[LANES.indexOf(original)],
          original,
          step: event.step,
          at,
          spawnAt: at - travelDuration,
          travelDuration,
          rate,
          loop: number,
          color: noteColor(event.step),
          state: "waiting",
          group
        };
        group.notes.push(note);
        this.notes.push(note);
      }
    }
    return loop;
  }

  appendNextLoop() {
    const last = this.loops[this.loops.length - 1];
    return this.appendLoop(last.number + 1, last.end, 0, shuffleLanes(last.map, this.random));
  }

  currentLoop(time = this.elapsed) {
    return this.loops.find((loop) => time < loop.end) || this.loops[this.loops.length - 1];
  }

  healCompletedLoops(time) {
    while (this.nextLoopToHeal < this.loops.length && this.loops[this.nextLoopToHeal].end <= time) {
      this.lives = Math.min(this.maxLives, this.lives + this.loopHeal);
      this.nextLoopToHeal++;
    }
  }

  hit(note, at) {
    const delta = at - note.at;
    const judgment = JUDGMENTS.find(
      (item) =>
        Math.abs(delta) <= (delta < 0 ? (item.earlyWindow ?? item.window) : item.window) + 0.0000001
    );
    if (judgment.whiff) return this.whiff(note, at, delta, judgment);
    note.state = "caught";
    note.judgedAt = at;
    note.delta = delta;
    this.score += judgment.score;
    this.stats[judgment.kind]++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.effects.push({ kind: judgment.kind, note, at, delta });
    return { kind: judgment.kind, note, delta };
  }

  // 놓친 세균은 판정선을 지나면 그대로 돌진해 다른 미스와 같이 라이프를 깎는다.
  whiff(note, at, delta, judgment) {
    note.whiffed = true;
    note.judgedAt = at;
    note.delta = delta;
    this.stats[judgment.kind]++;
    this.combo = 0;
    this.effects.push({ kind: judgment.kind, note, at, delta });
    return { kind: judgment.kind, note, delta };
  }

  input(lane, at) {
    if (this.dead || !LANES.includes(lane)) return null;
    let closest = null;
    let distance = Infinity;
    let nearby = false;
    for (const note of this.notes) {
      if (note.lane !== lane) continue;
      const error = Math.abs(at - note.at);
      if ((note.state !== "waiting" && note.state !== "attack") || note.group.damaged) continue;
      // 노트보다 일찍 누른 입력은 더 넓은 범위로 판정하고 무시한다.
      const early = at < note.at;
      if (error + 0.0000001 < (early ? EARLY_POOR_WINDOW : POOR_WINDOW)) nearby = true;
      if (note.whiffed) continue;
      if (
        error <= (early ? EARLY_CAPTURE_WINDOW : CAPTURE_WINDOW) + 0.0000001 &&
        error < distance
      ) {
        closest = note;
        distance = error;
      }
    }
    if (closest) return this.hit(closest, at);
    if (nearby) return { kind: "ignored", lane, at };
    this.score -= POOR_PENALTY;
    this.stats.poor++;
    this.combo = 0;
    const result = { kind: "poor", lane, at };
    this.effects.push(result);
    return result;
  }

  tick(time) {
    if (this.dead) return;
    this.elapsed = time;
    while (this.loops[this.loops.length - 1].end - time < 4) this.appendNextLoop();
    if (this.autoplay) {
      for (const note of this.notes) {
        if (note.state === "waiting" && !note.whiffed && note.at <= time) this.hit(note, note.at);
      }
    }
    for (const note of this.notes) {
      if (note.state === "waiting" && time > note.at + CAPTURE_WINDOW) {
        note.state = "attack";
      }
    }
    for (const group of this.groups) {
      if (group.damaged || time < group.at + CAPTURE_WINDOW + ATTACK_DURATION) continue;
      const missed = group.notes.filter((note) => note.state === "attack");
      if (!missed.length) continue;
      // 프레임이 늦어져도 완주 보상과 피해를 실제 발생 시각 순서로 처리한다.
      this.healCompletedLoops(group.at + CAPTURE_WINDOW + ATTACK_DURATION);
      group.damaged = true;
      for (const note of missed) note.state = "gone";
      // Uh oh로 이미 센 세균은 미스에 다시 세지 않는다.
      this.stats.miss += missed.filter((note) => !note.whiffed).length;
      this.lives--;
      this.combo = 0;
      this.effects.push({
        kind: "damage",
        at: group.at + CAPTURE_WINDOW + ATTACK_DURATION,
        notes: missed
      });
      if (this.lives <= 0) {
        this.dead = true;
        break;
      }
    }
    if (!this.dead) this.healCompletedLoops(time);
  }

  drainEffects() {
    return this.effects.splice(0);
  }
}
