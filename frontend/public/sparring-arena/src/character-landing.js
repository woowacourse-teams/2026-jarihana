export const LANDING_FALL_SECONDS = .34;
export const LANDING_SECONDS = 1.14;
const SPLAT_SECONDS = .2;
const DUST_SECONDS = .52;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from, to, amount) => from + (to - from) * amount;
const BRACE = {
  seated: 0, crouch: .12, stride: 0, stepLift: 0, lunge: 0,
  lean: 0, forwardLean: .02, torsoTwist: 0, head: -.05,
  leftArm: -.9, rightArm: -.9, leftElbow: -.45, rightElbow: -.45,
  leftSpread: -.6, rightSpread: .6, leftGrip: 0, rightGrip: 0,
  leftPoint: 0, rightPoint: 0, leftKick: 0, rightKick: 0, wave: 0,
  anger: 0, surprise: .75, mouthOpen: .5,
};

export function landingDuration(held) {
  return held.flight ? held.flight.duration + (LANDING_SECONDS - LANDING_FALL_SECONDS) : LANDING_SECONDS;
}

export function releasedCharacterPose(frame, held) {
  const elapsed = Math.max(0, Number.isFinite(held.time) ? held.time : 0);
  if (elapsed >= landingDuration(held)) return frame;
  const fallSeconds = held.flight?.duration ?? LANDING_FALL_SECONDS;
  const fall = clamp(elapsed / fallSeconds), travel = fall * fall;
  const contact = elapsed - fallSeconds;
  const rise = smooth((contact - SPLAT_SECONDS) / (LANDING_SECONDS - LANDING_FALL_SECONDS - SPLAT_SECONDS));
  const tilt = smooth(fall);
  const scale = mix(held.scale, held.originalScale, travel);
  const source = held.lastFrame?.pose ?? frame.pose;
  const pose = { ...frame.pose };
  for (const [key, value] of Object.entries(BRACE)) {
    const braced = mix(source[key] ?? 0, value, tilt);
    pose[key] = mix(braced, frame.pose[key] ?? 0, rise);
  }
  const flatLift = .42 * scale * tilt;
  Object.assign(pose, {
    scale, hanging: false, released: true, hangAngle: 0, airRun: undefined,
    fallPitch: mix(1.4 * tilt, 0, rise),
    fallRoll: mix(mix(held.angle ?? 0, .08, tilt), 0, rise),
    lift: mix(flatLift, frame.pose.lift ?? 0, rise),
    chairVisible: false, chairCarry: false, chairGrounded: false, chairLift: 0,
    chairFlight: undefined, cameraShake: undefined, speaking: false,
    landingDust: contact >= 0 && contact < DUST_SECONDS ? contact / DUST_SECONDS : undefined,
  });
  const fromYaw = held.lastFrame?.yaw ?? 0;
  const turn = Math.atan2(Math.sin(frame.yaw - fromYaw), Math.cos(frame.yaw - fromYaw));
  const position = held.flight
    ? Object.fromEntries(['x', 'y', 'z'].map(axis => {
      if (contact >= 0) return [axis, held.landing[axis]];
      const from = held.position[axis], impulse = held.flight.velocity[axis] * fallSeconds;
      return [axis, from + impulse * fall + (held.landing[axis] - from - impulse) * travel];
    }))
    : {
      x: mix(held.position.x, held.landing.x, travel),
      y: mix(held.position.y, held.landing.y, travel) + Math.sin(fall * Math.PI) * .18 * held.scale,
      z: mix(held.position.z, held.landing.z, travel),
    };
  return { ...frame,
    phase: contact < 0 ? 'landing' : contact < SPLAT_SECONDS ? 'splat' : 'recovering',
    heldReaction: '',
    position,
    yaw: fromYaw + turn * tilt,
    pose,
  };
}
