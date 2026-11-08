const JOINTS = [
  'crouch', 'stride', 'stepLift', 'lift', 'lean', 'forwardLean', 'torsoTwist', 'lunge', 'head',
  'leftArm', 'rightArm', 'leftElbow', 'rightElbow', 'leftSpread', 'rightSpread',
  'leftGrip', 'rightGrip', 'leftPoint', 'rightPoint', 'leftKick', 'rightKick', 'wave',
  'chairLift', 'chairPitch', 'chairRestBack',
];

export function smoothBrawlFrame(previous, target, delta, reduced = false) {
  if (!previous || reduced) return target;
  const blend = -Math.expm1(-Math.max(0, delta) * 12);
  const pose = { ...target.pose };
  for (const key of JOINTS) {
    const from = previous.pose[key] ?? 0, to = target.pose[key] ?? 0;
    pose[key] = from + (to - from) * blend;
  }
  const turn = Math.atan2(Math.sin(target.yaw - previous.yaw), Math.cos(target.yaw - previous.yaw));
  return { ...target, pose, yaw: previous.yaw + turn * blend };
}
