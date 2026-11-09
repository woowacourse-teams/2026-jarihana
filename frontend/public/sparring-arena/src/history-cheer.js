export const CHEER_STYLES = ['chair', 'fist', 'jump', 'point', 'double-fist'];
export const CHEER_TRANSITION_SECONDS = 0.55;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from, to, amount) => from + (to - from) * amount;

// Shuffle once per reply, so the crowd varies without changing gestures every frame.
export function createCheerAssignments(count, random = Math.random) {
  let bag = [];
  return Array.from({ length: count }, () => {
    if (!bag.length) {
      bag = [...CHEER_STYLES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return { style: bag.pop(), phase: random() * Math.PI * 2, tempo: 0.85 + random() * 0.3 };
  });
}

export function historyCheerPose(frame, { style, phase, tempo }, time, amount, side, reduced = false) {
  if (reduced || amount <= 0) return frame;
  const weight = ease(amount);
  const beat = Math.sin(time * 6 * tempo + phase);
  const pump = (beat + 1) / 2;
  const scale = frame.pose.scale;
  const target = {
    seated: 0, crouch: 0.08, stride: 0, stepLift: 0, lift: 0,
    lean: beat * 0.035, forwardLean: 0, lunge: 0, head: -0.08,
    leftArm: -0.35, rightArm: -0.35, leftElbow: -1.1, rightElbow: -1.1,
    leftSpread: -0.16, rightSpread: 0.16, leftGrip: 1, rightGrip: 1, rightPoint: 0,
    chairLift: 0, chairPitch: 0, chairRestBack: 0.5,
  };
  if (style === 'chair') {
    target.leftArm = target.rightArm = -2.8 + pump * 0.24;
    target.leftElbow = target.rightElbow = -0.25 - pump * 0.2;
    target.leftSpread = -0.12; target.rightSpread = 0.12;
    target.chairLift = 1; target.chairPitch = -Math.PI;
    target.chairRestBack = 0;
    target.crouch = 0.12 * pump;
  } else if (style === 'fist') {
    target.rightArm = -1.9 - pump * 0.7;
    target.rightElbow = -0.65;
    target.leftArm = -0.6; target.leftElbow = -1.5;
  } else if (style === 'jump') {
    const hop = Math.max(0, beat);
    target.lift = hop * 0.42 * scale;
    target.crouch = Math.max(0, -beat) * 0.28;
    target.leftArm = target.rightArm = -2.4 - hop * 0.4;
    target.leftElbow = target.rightElbow = -0.35;
    target.leftSpread = -0.4; target.rightSpread = 0.4;
  } else if (style === 'point') {
    target.lunge = 0.8;
    target.crouch = 0.28;
    target.forwardLean = 0.3 + pump * 0.12;
    target.rightArm = -1.45 - pump * 0.12; target.rightElbow = -0.1;
    target.rightPoint = 1;
    target.leftArm = 0.35; target.leftElbow = -1.25;
    target.head = -0.16;
  } else {
    target.leftArm = -1.5 - pump * 0.65;
    target.rightArm = -1.5 - (1 - pump) * 0.65;
    target.leftElbow = target.rightElbow = -1.2;
    target.leftSpread = -0.28; target.rightSpread = 0.28;
  }
  const pose = { ...frame.pose, chairCarry: false, chairGrounded: true, speaking: false };
  for (const [key, value] of Object.entries(target)) pose[key] = mix(frame.pose[key] ?? 0, value, weight);
  return { ...frame, phase: 'cheering', pose,
    position: { ...frame.position,
      x: frame.position.x + (side === 'a' ? -1 : 1) * scale * 5.65 * weight,
      z: frame.position.z - scale * weight },
  };
}
