import { LESSON_SAMPLE_RATE, LESSON_TAIL_BARS, lessonDrumHits } from "./lesson.mjs";

// 따라 하기 배경음은 녹음된 곡 없이 Web Audio로 만든 드럼 비트다.
function noiseBuffer(context) {
  const buffer = context.createBuffer(1, Math.round(context.sampleRate * 0.5), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 7;
  for (let index = 0; index < data.length; index++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    data[index] = seed / 2147483648 - 1;
  }
  return buffer;
}

function envelope(gain, at, peak, length) {
  gain.gain.setValueAtTime(peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0008, at + length);
}

const VOICES = {
  kick(context, output, hit) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(150, hit.at);
    oscillator.frequency.exponentialRampToValueAtTime(45, hit.at + 0.13);
    envelope(gain, hit.at, 0.95 * hit.volume, 0.24);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(hit.at);
    oscillator.stop(hit.at + 0.26);
  },
  openHat(context, output, hit, noise) {
    VOICES.noise(context, output, hit, noise, 6500, 0.3, 0.17);
  },
  closedHat(context, output, hit, noise) {
    VOICES.noise(context, output, hit, noise, 8500, 0.15, 0.045);
  },
  noise(context, output, hit, noise, frequency, peak, length) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise;
    filter.type = "highpass";
    filter.frequency.value = frequency;
    envelope(gain, hit.at, peak * hit.volume, length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(hit.at);
    source.stop(hit.at + length + 0.02);
  },
  bass(context, output, hit) {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = hit.frequency;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, hit.at);
    filter.frequency.exponentialRampToValueAtTime(180, hit.at + 0.18);
    envelope(gain, hit.at, 0.2 * hit.volume, 0.2);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    oscillator.start(hit.at);
    oscillator.stop(hit.at + 0.22);
  }
};

// 소리가 겹칠 때 찢어지지 않도록 출력 앞에 리미터를 둔다.
function masterBus(context, level) {
  const master = context.createGain();
  master.gain.value = level;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter);
  limiter.connect(context.destination);
  return master;
}

function scheduleHits(context, output, hits, start) {
  const noise = noiseBuffer(context);
  for (const hit of hits) VOICES[hit.voice](context, output, { ...hit, at: start + hit.at }, noise);
}

// 따라 하기 한 번 분량(연주 마디와 끝의 빈 마디)을 오디오 버퍼로 미리 만든다.
export function renderLessonTrack(createOfflineContext, stepIndex, { bpm, bars }) {
  const duration = (bars + LESSON_TAIL_BARS) * (60 / bpm) * 4;
  const context = createOfflineContext(1, Math.ceil(duration * LESSON_SAMPLE_RATE), LESSON_SAMPLE_RATE);
  scheduleHits(context, masterBus(context, 0.9), lessonDrumHits(stepIndex, { bpm, bars }), 0);
  return context.startRendering();
}
