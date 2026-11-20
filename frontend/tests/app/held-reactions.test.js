import { heldReactionPose, HELD_CHAIR_WAIT_SECONDS, HELD_CHAIR_RELEASE_SECONDS, HELD_CHAIR_FLIGHT_SECONDS, HELD_CHAIR_IMPACT_SECONDS } from '../../public/sparring-arena/src/held-reactions.js';

const frame = { position: { x: 1, y: 2, z: 3 }, yaw: 0,
  pose: { scale: 1.3, hanging: true, hangAngle: .2, chairFlight: { progress: .5 }, rightKick: 1, anger: 1 } };

it('공중 달리기는 두 배 빠른 박자로 팔다리를 반대로 크게 움직이며 놀란 표정을 유지한다', () => {
  const forward = heldReactionPose(frame, Math.PI / 40).pose;
  const backward = heldReactionPose(frame, Math.PI * 3 / 40).pose;
  expect(forward.airRun).toBeGreaterThan(.7);
  expect(backward.airRun).toBeLessThan(-.7);
  expect(forward.leftArm).toBeLessThan(forward.rightArm);
  expect(backward.leftArm).toBeGreaterThan(backward.rightArm);
  expect(Math.abs(forward.leftArm - backward.leftArm)).toBeGreaterThan(1.5);
  for (const time of [0, .5, 2.4, 4.8, 7.2, 20, 100]) {
    const result = heldReactionPose(frame, time);
    expect(result.heldReaction).toBe('struggling');
    expect(result.pose).toMatchObject({ leftPoint: 0, rightPoint: 0, wave: 0, anger: 0, surprise: .7, mouthOpen: .45 });
    expect(result.pose.leftElbow).toBeLessThan(-1);
    expect(result.pose.rightElbow).toBeLessThan(-1);
  }
});

it('발버둥 주기만 절반으로 줄이고 의자 투척 후 움직임은 기존 0.18초 동안 서서히 커진다', () => {
  const firstPeak = Math.PI / 40;
  const nextPeak = firstPeak + Math.PI / 10;
  expect(heldReactionPose(frame, firstPeak).pose.airRun).toBeCloseTo(.8);
  expect(heldReactionPose(frame, nextPeak).pose.airRun).toBeCloseTo(.8);
  const finish = HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS;
  const unarmed = heldReactionPose(frame, .09).pose;
  const afterThrow = heldReactionPose(frame, finish + .09, 0, true).pose;
  expect(afterThrow.airRun).toBeCloseTo(unarmed.airRun * .5);
  expect(afterThrow.lean).toBeCloseTo(unarmed.lean * .5);
});

it('흔들기 강도는 달리는 팔다리와 몸의 움직임·표정을 키운다', () => {
  const samples = strength => Array.from({ length: 120 }, (_, index) => heldReactionPose(frame, index / 60, strength).pose);
  const low = samples(0), high = samples(1);
  const range = (poses, key) => Math.max(...poses.map(pose => pose[key])) - Math.min(...poses.map(pose => pose[key]));
  for (const key of ['rightArm', 'airRun', 'hangAngle', 'torsoTwist']) expect(range(high, key)).toBeGreaterThan(range(low, key) * 1.2);
  expect(high.every(pose => pose.surprise === 1 && pose.mouthOpen >= .63)).toBe(true);
  for (const pose of [...low, ...high]) expect(pose).toMatchObject({ anger: 0, leftKick: 0, rightKick: 0, leftPoint: 0, rightPoint: 0 });
});

it('강도는 0과 1 사이로 제한하고 입력이 낮아지면 반응도 작아진다', () => {
  expect(heldReactionPose(frame, .8, -1)).toEqual(heldReactionPose(frame, .8, 0));
  expect(heldReactionPose(frame, .8, 5)).toEqual(heldReactionPose(frame, .8, 1));
  expect(heldReactionPose(frame, .8, NaN)).toEqual(heldReactionPose(frame, .8, 0));
  const startled = heldReactionPose(frame, .8, 1).pose;
  const calmer = heldReactionPose(frame, .8, .2).pose;
  expect(calmer.surprise).toBeLessThan(startled.surprise);
  expect(calmer.mouthOpen).toBeLessThan(startled.mouthOpen);
});

it('의자 인물은 0.7초 기다린 뒤 던지고 비행이 끝날 때까지 발버둥치지 않는다', () => {
  expect(HELD_CHAIR_WAIT_SECONDS).toBe(.7);
  const waiting = heldReactionPose(frame, 0, 1, true).pose;
  for (const time of [.2, .5, .699, .7]) {
    expect(heldReactionPose(frame, time, 1, true).pose).toEqual(waiting);
  }
  expect(heldReactionPose(frame, .8, 1, true).pose.leftArm).toBeLessThan(waiting.leftArm);
  const finish = HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS;
  for (const time of [.1, .7, .9, HELD_CHAIR_RELEASE_SECONDS, finish - .001]) {
    const pose = heldReactionPose(frame, time, 1, true).pose;
    expect(pose).toMatchObject({ airRun: 0, lean: 0, torsoTwist: 0, rightArm: -.3, rightElbow: -1.25 });
    expect(pose.hangAngle).toBe(frame.pose.hangAngle);
  }
  expect(heldReactionPose(frame, finish, 1, true).pose.airRun).toBeCloseTo(0);
  expect(heldReactionPose(frame, finish + .1, 1, true).pose.airRun).toBeGreaterThan(0);
  expect(heldReactionPose(frame, .2, 1, false).pose.airRun).not.toBe(0);
});

it('의자 인물은 한 번만 준비·카메라 투척한 뒤 빈손으로 같은 발버둥을 친다', () => {
  const before = heldReactionPose(frame, HELD_CHAIR_RELEASE_SECONDS - .001, 0, true);
  expect(before.heldReaction).toBe('chair-throw');
  expect(before.pose).toMatchObject({ chairVisible: true, chairHand: 'left', leftGrip: 1 });
  expect(before.pose.chairFlight).toBeUndefined();
  for (const progress of [0, .25, .5, .9]) {
    const time = HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS * progress;
    const result = heldReactionPose(frame, time, .5, true);
    expect(result.heldReaction).toBe('chair-throw');
    expect(result.pose.chairFlight.target).toBe('camera');
    expect(result.pose.chairFlight.progress).toBeCloseTo(progress);
    expect(result.pose.chairVisible).toBe(true);
    expect(result.pose.leftGrip).toBeLessThan(1);
  }
  const finish = HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS;
  for (const sinceThrow of [.2, 1, 5, 100]) {
    const time = finish + sinceThrow;
    const result = heldReactionPose(frame, time, .5, true);
    const unarmed = heldReactionPose(frame, sinceThrow, .5, false);
    expect(result.heldReaction).toBe('struggling');
    expect(result.pose.chairVisible).toBe(false);
    expect(result.pose.chairFlight).toBeUndefined();
    for (const key of ['airRun', 'leftArm', 'rightArm', 'leftElbow', 'rightElbow']) expect(result.pose[key]).toBeCloseTo(unarmed.pose[key]);
  }
  expect(heldReactionPose(frame, 0, 0, true).pose.chairVisible).toBe(true);
});

it('맨손 인물은 의자를 만들지 않고 잡힌 위치·크기와 입력 프레임을 유지한다', () => {
  const before = JSON.stringify(frame);
  for (const chair of [false, true]) for (const time of [0, .3, .7, 2, 10]) {
    const result = heldReactionPose(frame, time, .5, chair);
    expect(result.position).toEqual(frame.position);
    expect(result.pose).toMatchObject({ scale: 1.3, hanging: true });
    if (!chair) {
      expect(result.pose.chairVisible).toBe(false);
      expect(result.pose.chairFlight).toBeUndefined();
      expect(result.pose.chairHand).toBeUndefined();
    }
  }
  expect(JSON.stringify(frame)).toBe(before);
});

it.each([false, true])('모션 감소에서는 달리기·투척 없이 소유 의자를 유지한다: chair=%s', chair => {
  const still = heldReactionPose(frame, 0, 0, chair, true);
  expect(still.heldReaction).toBe('rest');
  expect(still.pose).toMatchObject({ stride: 0, leftKick: 0, rightKick: 0, hangAngle: 0, lean: 0, anger: 0, surprise: .7, chairVisible: chair });
  expect(still.pose.airRun).toBeUndefined();
  expect(still.pose.chairFlight).toBeUndefined();
  for (const intensity of [0, .5, 1]) expect(heldReactionPose(frame, 40, intensity, chair, true)).toEqual(still);
});

it('의자가 카메라에 도달할 때 한 번 충격을 주고 0.28초 뒤에는 다시 흔들리지 않는다', () => {
  const impact = HELD_CHAIR_IMPACT_SECONDS;
  expect(impact).toBeCloseTo(HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS * .94);
  expect(heldReactionPose(frame, impact - .001, 0, true).pose.cameraShake).toBeUndefined();
  const contact = heldReactionPose(frame, impact, 0, true).pose;
  expect(contact.cameraShake).toEqual({ x: 4, y: 0 });
  expect(contact.chairFlight.progress).toBeCloseTo(.94);
  expect(heldReactionPose(frame, impact + .06, 0, true).pose.cameraShake.x).toBeLessThan(0);
  for (const time of [impact + .28, impact + 1, 10, 100]) {
    expect(heldReactionPose(frame, time, 0, true).pose.cameraShake).toBeUndefined();
  }
});

it('충격 진폭은 화면 4px·2.5px 이내에서 빠르게 줄고 잡기 강도와 무관하다', () => {
  for (let tick = 0; tick < 28; tick++) {
    const delta = tick / 100, time = HELD_CHAIR_IMPACT_SECONDS + delta;
    const shake = heldReactionPose(frame, time, 0, true).pose.cameraShake;
    const envelope = (1 - delta / .28) ** 2;
    expect(Math.abs(shake.x)).toBeLessThanOrEqual(4 * envelope + 1e-12);
    expect(Math.abs(shake.y)).toBeLessThanOrEqual(2.5 * envelope + 1e-12);
    expect(heldReactionPose(frame, time, 1, true).pose.cameraShake).toEqual(shake);
  }
});

it('맨손·모션 감소·충격 전후에는 이전 프레임의 흔들림도 지우며 입력은 수정하지 않는다', () => {
  const stale = { ...frame, pose: { ...frame.pose, cameraShake: { x: 8, y: 8 } } };
  const before = JSON.stringify(stale);
  for (const [chair, reduced, time] of [
    [false, false, HELD_CHAIR_IMPACT_SECONDS],
    [true, true, HELD_CHAIR_IMPACT_SECONDS],
    [true, false, 0],
    [true, false, 10],
  ]) expect(heldReactionPose(stale, time, 1, chair, reduced).pose.cameraShake).toBeUndefined();
  heldReactionPose(stale, HELD_CHAIR_IMPACT_SECONDS, 0, true);
  expect(JSON.stringify(stale)).toBe(before);
});
