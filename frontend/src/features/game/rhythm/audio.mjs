export function audibleTimeAt(context, baseTime, resumedAt, performanceTime = performance.now()) {
  const timestamp = context.getOutputTimestamp?.();
  if (timestamp && timestamp.performanceTime > resumedAt && timestamp.contextTime > 0) {
    return timestamp.contextTime + (performanceTime - timestamp.performanceTime) / 1000 - baseTime;
  }
  const latency = context.outputLatency || context.baseLatency || 0;
  return context.currentTime - latency - baseTime + (performanceTime - performance.now()) / 1000;
}

export class CalibrationMetronome {
  constructor(context) {
    this.context = context;
    this.nodes = [];
    this.stopped = false;
    this.master = context.createGain();
    this.master.connect(context.destination);
  }

  async start({ bpm, warmup, beats }, volume) {
    await this.context.resume();
    if (this.stopped) return false;
    this.resumedAt = performance.now();
    this.baseTime = this.context.currentTime + 0.25;
    this.master.gain.value = volume / 100;
    for (let index = 0; index < warmup + beats; index++) {
      const at = this.baseTime + (index * 60) / bpm;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      // 노트북 스피커에서도 또렷하도록 배음이 있는 삼각파로 크게 친다. 시작 3ms는 그대로라 박자 기준은 같다.
      oscillator.type = "triangle";
      oscillator.frequency.value = index === warmup ? 1320 : index % 4 === 0 ? 990 : 660;
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.5, at + 0.003);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
      oscillator.connect(envelope);
      envelope.connect(this.master);
      oscillator.start(at);
      oscillator.stop(at + 0.07);
      this.nodes.push(oscillator);
    }
    return true;
  }

  timeAt(stamp = performance.now()) {
    return audibleTimeAt(this.context, this.baseTime, this.resumedAt, stamp);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* The click may have already ended. */
      }
      node.disconnect();
    }
    this.nodes = [];
    this.master.disconnect();
    if (this.context.state !== "closed") void this.context.close().catch(() => {});
  }
}

export class MusicTransport {
  constructor(context, buffer) {
    this.context = context;
    this.buffer = buffer;
    this.gain = context.createGain();
    this.gain.gain.value = 0.65;
    this.gain.connect(context.destination);
    this.sources = [];
    this.scheduled = new Set();
    this.baseTime = 0;
    this.resumedAt = 0;
  }

  async start(loops) {
    this.stop();
    const generation = this.generation;
    await this.context.resume();
    if (generation !== this.generation) return false;
    this.resumedAt = performance.now();
    this.baseTime = this.context.currentTime + 0.12;
    this.schedule(loops);
    return true;
  }

  schedule(loops) {
    for (const loop of loops) {
      if (this.scheduled.has(loop.number)) continue;
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.playbackRate.value = loop.rate;
      source.connect(this.gain);
      source.start(this.baseTime + loop.start, loop.offset, this.buffer.duration - loop.offset);
      this.sources.push(source);
      this.scheduled.add(loop.number);
    }
  }

  countIn(engine) {
    const loop = engine.loops[0];
    const interval = 60 / engine.chart.bpm / loop.rate;
    for (let beat = 0; beat < 4; beat++) {
      const at = this.baseTime + engine.countInStart + beat * interval;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = beat === 0 ? 990 : 660;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.035, at + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
      oscillator.connect(gain);
      gain.connect(this.gain);
      oscillator.start(at);
      oscillator.stop(at + 0.06);
      this.sources.push(oscillator);
    }
  }

  timeAt(performanceTime = performance.now()) {
    return audibleTimeAt(this.context, this.baseTime, this.resumedAt, performanceTime);
  }

  async pause() {
    await this.context.suspend();
  }

  async resume() {
    await this.context.resume();
    this.resumedAt = performance.now();
  }

  stop() {
    this.generation = (this.generation ?? 0) + 1;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* The source may have already ended. */
      }
      source.disconnect();
    }
    this.sources = [];
    this.scheduled.clear();
  }
}
