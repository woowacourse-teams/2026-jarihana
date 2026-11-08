export const WALKOUT_SECONDS = 1.5;
export const EXIT_SECONDS = 1.4;
export const PACKED_SCALE = 0.31 * (0.5 / 0.48);
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from, to, amount) => from + (to - from) * amount;

// Walk from the outlet onto the yard, then face the opposite row.
export function historyWalkPose({ origin, destination, elapsed, side, speaking = false, time = 0, reduced = false, standingScale = 0.65 }) {
  const progress = elapsed * (2.4 / WALKOUT_SECONDS);
  const stand = reduced ? 1 : smooth(progress / 0.5);
  const walk = reduced ? 1 : clamp((progress - 0.5) / 1.65);
  const turn = reduced ? 1 : smooth((progress - 2.05) / 0.35);
  const moving = walk > 0 && walk < 1;
  const gait = moving ? Math.sin(walk * Math.PI * 6) : 0;
  const direction = side === 'a' ? 1 : -1;
  const travelYaw = Math.atan2(destination.x - origin.x, destination.z - origin.z);
  return {
    position: {
      x: mix(origin.x, destination.x, walk),
      y: mix(mix(origin.y, origin.floorY ?? origin.y, stand), destination.y, walk),
      z: mix(origin.z, destination.z, walk),
    },
    yaw: mix(mix(0, travelYaw, smooth(walk / 0.15)), direction * 0.85, turn),
    phase: stand < 1 ? 'standing' : walk < 1 ? 'walking' : turn < 1 ? 'turning' : 'talking',
    pose: {
      scale: mix(PACKED_SCALE, standingScale, stand), shrink: 1,
      lift: 0, crouch: (1 - stand) * 0.45,
      seated: turn, chairCarry: true,
      stride: gait, stepLift: Math.abs(gait) * 0.08,
      lean: moving ? -0.045 : 0,
      leftArm: -0.95 * (1 - stand), rightArm: -0.95 * (1 - stand), wave: 0,
      head: (1 - stand) * 0.04 + (!reduced && !moving && speaking ? Math.sin(time * 6) * 0.06 : 0),
      speaking: !reduced && elapsed >= WALKOUT_SECONDS && speaking,
      time: reduced ? 0 : time,
    },
  };
}

export function historyExitPose({ origin, destination, elapsed, reduced = false }) {
  const turn = reduced ? 1 : smooth(elapsed / 0.2);
  const walk = reduced ? 1 : clamp((elapsed - 0.2) / (EXIT_SECONDS - 0.2));
  const yaw = Math.atan2(destination.x - origin.position.x, destination.z - origin.position.z);
  const rotation = Math.atan2(Math.sin(yaw - origin.yaw), Math.cos(yaw - origin.yaw));
  const gait = Math.sin(walk * Math.PI * 8);
  return {
    position: {
      x: mix(origin.position.x, destination.x, walk),
      y: mix(origin.position.y, destination.y, walk),
      z: mix(origin.position.z, destination.z, walk),
    },
    yaw: origin.yaw + rotation * turn,
    phase: 'leaving',
    pose: {
      ...origin.pose, shrink: 1,
      seated: mix(origin.pose.seated ?? 0, 0, turn), chairCarry: true,
      crouch: mix(origin.pose.crouch, 0, turn),
      stride: mix(origin.pose.stride, gait, turn), stepLift: Math.abs(gait) * 0.08,
      lean: mix(origin.pose.lean, walk > 0 && walk < 1 ? -0.045 : 0, turn),
      leftArm: mix(origin.pose.leftArm, 0, turn), rightArm: mix(origin.pose.rightArm, 0, turn),
      head: mix(origin.pose.head, 0, turn) + (reduced ? 0 : Math.sin(turn * Math.PI) * 0.12),
      speaking: false, time: 0,
    },
  };
}
