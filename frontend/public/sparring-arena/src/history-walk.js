export const WALKOUT_SECONDS = 2.4;
export const PACKED_SCALE = 0.31 * (0.5 / 0.48);
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from, to, amount) => from + (to - from) * amount;

// Feet stay on the tray while the head, arms and legs articulate above them.
export function historyWalkPose({ origin, destination, elapsed, side, speaking = false, time = 0, reduced = false, departure = 0 }) {
  const stand = reduced ? 1 : smooth(elapsed / 0.5);
  const walk = reduced ? 1 : clamp((elapsed - 0.5) / 1.65);
  const turn = reduced ? 1 : smooth((elapsed - 2.05) / 0.35);
  const moving = walk > 0 && walk < 1;
  const gait = moving ? Math.sin(walk * Math.PI * 6) : 0;
  const direction = side === 'a' ? 1 : -1;
  const travelYaw = Math.atan2(destination.x - origin.x, destination.z - origin.z);
  const exit = smooth(departure);
  return {
    position: {
      x: mix(origin.x, destination.x, walk) - direction * exit * 0.8,
      y: mix(mix(origin.y, origin.floorY ?? origin.y, stand), destination.y, walk),
      z: mix(origin.z, destination.z, walk),
    },
    yaw: mix(mix(0, travelYaw, smooth(walk / 0.15)), direction * 0.85, turn),
    phase: stand < 1 ? 'standing' : walk < 1 ? 'walking' : turn < 1 ? 'turning' : 'talking',
    pose: {
      scale: mix(PACKED_SCALE, 1.8, stand), shrink: 1 - exit,
      lift: 0, crouch: (1 - stand) * 0.45,
      stride: gait, stepLift: Math.abs(gait) * 0.08,
      lean: moving ? -0.045 : 0,
      leftArm: -0.95 * (1 - stand), rightArm: -0.95 * (1 - stand), wave: 0,
      head: (1 - stand) * 0.04 + (!reduced && !moving && speaking ? Math.sin(time * 6) * 0.06 : 0),
      speaking: !reduced && elapsed >= WALKOUT_SECONDS && speaking,
      time: reduced ? 0 : time,
    },
  };
}
