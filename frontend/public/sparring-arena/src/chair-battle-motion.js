export const CHAIR_BATTLE_SECONDS = 7.5;

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from, to, amount) => from + (to - from) * amount;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const pulse = (time, contact, duration = 0.2) => time < contact ? 0 : 1 - ease((time - contact) / duration);
const envelope = (time, start, peak, release, end) => ease((time - start) / (peak - start)) * (1 - ease((time - release) / (end - release)));
const THRUST_CONTACT = 1.65;
const THROW_START = 3.5, THROW_FLIGHT = 0.75;
const SETTLE_AT = 5.3;

/** Offsets use screen pixels from the actor's feet; flight offsets locate the chair's grip. */
export function chairBattlePose({ time = 0, index = 0, speaker = 1, opposed = true, reduced = false, distance = 200, size = 180 } = {}) {
  const actor = index === 0 ? 0 : 1;
  const reply = speaker === 0 ? 0 : 1;
  const first = 1 - reply;
  const direction = actor === 0 ? 1 : -1;
  const height = Math.max(1, finite(size, 180));
  const gap = Math.max(0, finite(distance, 200));
  const elapsed = Math.max(0, finite(time, CHAIR_BATTLE_SECONDS));
  const pose = {
    phase: 'seated', attacker: null,
    x: 0, y: 0, lean: 0, yaw: direction * 0.65, seated: 1,
    leftArm: -0.25, rightArm: -0.25, leftElbow: -0.85, rightElbow: -0.85,
    chair: { mode: 'seat', pitch: 0, roll: 0, x: 0, y: 0, scale: 1 }, impact: 0,
  };
  if (reduced || !opposed) {
    pose.phase = 'settled';
    return pose;
  }
  if (elapsed < 0.65) return pose;

  const rise = ease((elapsed - 0.65) / 0.5);
  pose.seated = 1 - rise;
  pose.leftArm = pose.rightArm = mix(-0.25, -1.1, rise);
  pose.leftElbow = pose.rightElbow = mix(-0.85, -0.65, rise);
  pose.chair.mode = 'held';
  pose.chair.x = direction * height * 0.22 * rise;
  pose.chair.y = -height * 0.62 * rise;
  if (elapsed < 1.15) {
    pose.phase = 'grab';
    return pose;
  }

  // The chair reaches the other actor while the two torsos retain at least 40% of a body height between them.
  const approach = Math.max(0, gap - height * 0.55);
  const recoil = Math.min(height * 0.055, gap * 0.08);
  if (elapsed < 2.15) {
    pose.phase = 'thrust';
    pose.attacker = first;
    const strike = envelope(elapsed, 1.27, THRUST_CONTACT, 1.75, 2.15);
    if (actor === first) {
      pose.x = direction * approach * strike;
      pose.lean = -direction * 0.13 * strike;
      pose.leftArm = pose.rightArm = -1.1 - 0.5 * strike;
      pose.leftElbow = pose.rightElbow = -0.65 + 0.53 * strike;
      pose.chair.pitch = -Math.PI / 2 * strike;
    } else {
      const hit = envelope(elapsed, THRUST_CONTACT, 1.77, 1.83, 2.15);
      pose.x = -direction * recoil * hit;
      pose.lean = direction * 0.19 * hit;
      pose.impact = pulse(elapsed, THRUST_CONTACT);
    }
    return pose;
  }

  if (elapsed < THROW_START) {
    pose.phase = 'slam';
    pose.attacker = reply;
    const advance = envelope(elapsed, 2.15, 2.65, 2.9, THROW_START);
    const lift = envelope(elapsed, 2.15, 2.55, 2.62, 2.9);
    const swing = envelope(elapsed, 2.62, 2.9, 3.02, THROW_START);
    if (actor === reply) {
      pose.x = direction * approach * advance;
      pose.lean = direction * (0.1 * lift - 0.21 * swing);
      pose.leftArm = pose.rightArm = -1.1 - 1.95 * lift + 0.45 * swing;
      pose.leftElbow = pose.rightElbow = -0.65 - 0.2 * lift + 0.48 * swing;
      pose.chair.pitch = -Math.PI * lift - 1.25 * swing;
    } else {
      const dodge = envelope(elapsed, 2.45, 2.78, 3.05, THROW_START);
      pose.x = -direction * recoil * dodge;
      pose.seated = 0.42 * dodge;
      pose.lean = direction * 0.27 * dodge;
    }
    return pose;
  }

  const release = THROW_START + 0.25 + (actor === first ? 0 : 0.25);
  const contact = release + THROW_FLIGHT;
  const incomingContact = THROW_START + 0.25 + (actor === first ? 0.25 : 0) + THROW_FLIGHT;
  const incoming = pulse(elapsed, incomingContact, 0.3);
  pose.phase = elapsed < SETTLE_AT ? 'throw' : 'settled';
  pose.attacker = elapsed < SETTLE_AT ? (elapsed < THROW_START + 0.5 ? first : reply) : null;
  pose.impact = incoming;
  pose.x = -direction * recoil * incoming;
  pose.lean = direction * 0.16 * incoming;
  const windup = ease((elapsed - THROW_START - (actor === first ? 0 : 0.25)) / 0.25);
  const relax = ease((elapsed - release) / 0.4);
  pose.leftArm = pose.rightArm = mix(-1.1 - windup * 1.3, -0.25, relax);
  pose.leftElbow = pose.rightElbow = mix(-0.65, -0.2, relax);
  if (elapsed < release) {
    pose.chair.pitch = -Math.PI * 0.8 * windup;
    return pose;
  }

  pose.chair.mode = 'flight';
  const startX = direction * height * 0.055;
  const startY = -height * 0.835;
  const targetX = direction * Math.max(height * 0.22, gap - height * 0.13);
  const targetY = -height * 0.54;
  const restingX = targetX + direction * height * 0.15;
  const restingY = -height * 0.2;
  if (elapsed < contact) {
    const flight = clamp((elapsed - release) / THROW_FLIGHT);
    pose.chair.x = mix(startX, targetX, flight);
    pose.chair.y = mix(startY, targetY, flight) - Math.sin(flight * Math.PI) * height * 0.6;
    pose.chair.pitch = mix(-Math.PI * 0.8, 0, ease(flight));
    pose.chair.roll = direction * Math.PI * 2 * flight;
  } else {
    const bounce = clamp((elapsed - contact) / (SETTLE_AT - contact));
    pose.chair.x = mix(targetX, restingX, ease(bounce));
    pose.chair.y = mix(targetY, restingY, ease(bounce)) - Math.sin(bounce * Math.PI) * height * 0.2;
    pose.chair.roll = direction * (Math.PI * 2 + Math.PI / 2 * ease(bounce));
  }
  // Keep the projectile on its world path while its owner recoils from the other chair.
  pose.chair.x -= pose.x;
  return pose;
}
