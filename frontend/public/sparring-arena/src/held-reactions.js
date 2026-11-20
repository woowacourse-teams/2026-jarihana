const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from, to, amount) => from + (to - from) * amount;

export const HELD_CHAIR_WAIT_SECONDS = .7;
export const HELD_CHAIR_RELEASE_SECONDS = HELD_CHAIR_WAIT_SECONDS + .45;
export const HELD_CHAIR_FLIGHT_SECONDS = .85;
export const HELD_CHAIR_IMPACT_SECONDS = HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS * .94;
const CAMERA_SHAKE_SECONDS = .28;

export function heldReactionPose(frame, time, intensity = 0, chair = false, reduced = false) {
  const strength = reduced ? 0 : clamp(Number.isNaN(intensity) ? 0 : intensity);
  const elapsed = reduced ? 0 : Math.max(0, Number.isFinite(time) ? time : 0);
  const struggleTime = chair ? Math.max(0, elapsed - HELD_CHAIR_RELEASE_SECONDS - HELD_CHAIR_FLIGHT_SECONDS) : elapsed;
  const struggle = reduced ? 0 : chair ? smooth(struggleTime / .18) : 1;
  const motionTime = struggleTime * 2;
  const run = Math.sin(motionTime * 10) * struggle;
  const tremble = Math.sin(motionTime * 25) * struggle;
  const stride = run * (.8 + strength * .2);
  const armSwing = run * (.8 + strength * .3);
  const released = chair && !reduced && elapsed >= HELD_CHAIR_RELEASE_SECONDS;
  const flightTime = elapsed - HELD_CHAIR_RELEASE_SECONDS;
  const flying = released && flightTime < HELD_CHAIR_FLIGHT_SECONDS;
  const pose = {
    ...frame.pose, seated: 0, crouch: 0, lift: 0, lunge: 0,
    stride: 0, airRun: reduced ? undefined : stride, stepLift: 0, leftKick: 0, rightKick: 0,
    lean: tremble * (.015 + strength * .025), forwardLean: .08,
    torsoTwist: run * (.08 + strength * .08), head: -.08 - strength * .04,
    leftArm: reduced ? -1.9 : -.3 - armSwing,
    rightArm: reduced ? -1.9 : -.3 + armSwing,
    leftElbow: -1.25 - run * .2, rightElbow: -1.25 + run * .2,
    leftSpread: -.22, rightSpread: .22,
    leftGrip: .2, rightGrip: .2, leftPoint: 0, rightPoint: 0,
    wave: 0, anger: 0, surprise: .7 + strength * .3,
    mouthOpen: .45 + strength * (.18 + Math.abs(run) * .04),
    hangAngle: (reduced ? 0 : frame.pose.hangAngle ?? 0) + tremble * (.015 + strength * .025),
    chairCarry: false, chairGrounded: false, chairVisible: chair && (!released || flying),
    chairHand: chair ? 'left' : undefined, chairLift: chair ? 1 : 0,
    chairPitch: .12, chairRestBack: 0, chairFlight: undefined, cameraShake: undefined,
    speaking: false,
  };
  if (chair && !released) {
    const throwTime = Math.max(0, elapsed - HELD_CHAIR_WAIT_SECONDS);
    const windup = smooth(throwTime / .28);
    const toss = smooth((throwTime - .28) / (HELD_CHAIR_RELEASE_SECONDS - HELD_CHAIR_WAIT_SECONDS - .28));
    pose.leftArm = reduced ? .25 : mix(mix(.25, -2.65, windup), -.85, toss);
    pose.leftElbow = reduced ? -.35 : mix(-.35, -.15, toss);
    pose.leftGrip = 1;
    pose.chairPitch = mix(.12, -.45, windup * (1 - toss));
  } else if (flying) {
    const recover = smooth(flightTime / .18);
    pose.leftArm = mix(-.85, pose.leftArm, recover);
    pose.leftElbow = mix(-.15, pose.leftElbow, recover);
    pose.leftGrip = mix(0, pose.leftGrip, recover);
    pose.chairFlight = { progress: clamp(flightTime / HELD_CHAIR_FLIGHT_SECONDS), target: 'camera' };
  }
  const impactTime = elapsed - HELD_CHAIR_IMPACT_SECONDS;
  if (chair && !reduced && impactTime >= 0 && elapsed < HELD_CHAIR_IMPACT_SECONDS + CAMERA_SHAKE_SECONDS) {
    const fade = (1 - impactTime / CAMERA_SHAKE_SECONDS) ** 2;
    pose.cameraShake = { x: Math.cos(impactTime * 65) * 4 * fade, y: Math.sin(impactTime * 83) * 2.5 * fade };
  }
  return { ...frame, heldReaction: reduced ? 'rest' : chair && (!released || flying) ? 'chair-throw' : 'struggling', pose };
}
