import { BRAWL_STYLES, BRAWL_ATTACK_SECONDS, BRAWL_HIT_SECONDS, BRAWL_REST_SECONDS, CHAIR_BRAWL_STYLES, UNARMED_BRAWL_STYLES,
  createBrawlAssignments, brawlFormationSpot, historyBrawlPose, stepBrawlMotions, brawlLocomotionPose, brawlDepthScale, brawlAttackTiming } from '../../public/sparring-arena/src/history-brawl.js';
import { brawlPosts } from '../fixtures/brawl-posts.js';

const frame = { position: { x: 1, y: -6.4, z: 9.6 }, yaw: .85, pose: { scale: .65, seated: 1, speaking: true } };
const bounds = { minX: -3.8, maxX: 3.8, minZ: -3, maxZ: 3.2 };
const actor = (key, side, x, z = 0) => ({ key, side,
  motion: { position: { x, y: -6.4, z }, yaw: side === 'a' ? .85 : -.85 },
  assignment: { style: 'jab', phase: key * .7, tempo: 1, amplitude: 1 } });

it('던져져 대화 구역 밖에 착지한 인물은 순간 이동하지 않고 걸어서 돌아온다', () => {
  const actors = [actor(0, 'a', 9), actor(1, 'b', 0)];
  actors[0].motion.returningFromThrow = true;
  stepBrawlMotions(actors, 1 / 60, bounds);
  expect(actors[0].motion.position.x).toBeLessThan(9);
  expect(actors[0].motion.position.x).toBeGreaterThan(8.9);
  for (let i = 0; i < 600; i++) stepBrawlMotions(actors, 1 / 60, bounds);
  expect(actors[0].motion.position.x).toBeLessThanOrEqual(bounds.maxX);
  expect(actors[0].motion.returningFromThrow).toBe(false);
});

it('가상 대화는 30명의 다른 작성자를 구분하고 연속 발언에서도 작성자 ID를 유지한다', () => {
  const posts = brawlPosts(15, 15, 8);
  expect(posts).toHaveLength(240);
  expect(new Set(posts.map(post => post.authorId)).size).toBe(30);
  expect(new Set(posts.map(post => post.name)).size).toBe(30);
  expect(new Set(posts.map(post => post.text)).size).toBeGreaterThan(20);
  const burst = brawlPosts(8, 8, 1, { burst: true });
  expect(new Set(burst.slice(0, 6).map(post => post.authorId)).size).toBe(1);
  expect(new Set(burst.map(post => post.id)).size).toBe(burst.length);
});

it('실제 상대에게 접근해 타격하고 상대를 밀어내며 마당 안에서 다시 움직인다', () => {
  const actors = [actor(0, 'a', -2), actor(1, 'b', 2)];
  const phases = new Set(), xPositions = actors.map(() => []);
  let closest = Infinity, previous = actors.map(a => ({ ...a.motion.position }));
  for (let i = 0; i < 600; i++) {
    stepBrawlMotions(actors, 1 / 60, bounds);
    actors.forEach((a, index) => {
      phases.add(a.motion.phase); xPositions[index].push(a.motion.position.x);
      expect(Math.hypot(a.motion.position.x - previous[index].x, a.motion.position.z - previous[index].z)).toBeLessThan(.1);
      expect(a.motion.position.y).toBe(-6.4);
      previous[index] = { ...a.motion.position };
    });
    closest = Math.min(closest, Math.hypot(actors[0].motion.position.x - actors[1].motion.position.x,
      actors[0].motion.position.z - actors[1].motion.position.z));
  }
  expect(closest).toBeLessThan(1);
  expect(phases).toEqual(new Set(['running', 'striking', 'recoiling', 'circling']));
  for (const positions of xPositions) expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(1);
  actors.pop();
  stepBrawlMotions(actors, 2, bounds);
  expect(actors[0].motion.phase).toBe('idle');
  const resting = { ...actors[0].motion.position };
  stepBrawlMotions(actors, 1, bounds);
  expect(actors[0].motion.position).toEqual(resting);
});

it.each([
  { phase: 'running', gap: 4, vx: 2.2, vz: 0 },
  { phase: 'circling', gap: .8, vx: -.4, vz: -.9 },
  { phase: 'recoiling', gap: 4, vx: -4, vz: 0 },
])('$phase 이동만 70%로 줄이고 동작 시계와 대기 시간은 그대로 진행한다', ({ phase, gap, vx, vz }) => {
  const actors = [actor(0, 'a', 0), actor(1, 'b', gap)];
  const motion = actors[0].motion;
  Object.assign(motion, { phase, phaseTime: 0, cooldown: 1, targetKey: 1,
    recoilRemaining: phase === 'recoiling' ? .42 : 0, recoilX: -4, recoilZ: 0 });
  stepBrawlMotions(actors, .01, { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  expect(motion.position.x).toBeCloseTo(vx * .01 * .7);
  expect(motion.position.z).toBeCloseTo(vz * .01 * .7);
  expect(motion.phaseTime).toBeCloseTo(.01);
  expect(motion.cooldown).toBeCloseTo(.99);
  expect(motion.phase).toBe(phase);
  if (phase === 'recoiling') expect(motion.recoilRemaining).toBeCloseTo(.41);
});

it('경계에 밀린 뒤에는 마당 안쪽으로 발을 옮긴다', () => {
  const actors = [actor(0, 'a', 0, bounds.maxZ), actor(1, 'b', 1, bounds.maxZ)];
  actors.forEach((a, index) => Object.assign(a.motion, {
    phase: 'circling', phaseTime: 0, targetKey: 1 - index, cooldown: 1,
  }));
  stepBrawlMotions(actors, .25, bounds);
  actors.forEach(a => expect(a.motion.position.z).toBeLessThan(bounds.maxZ - .1));
});

it('30명이 부딪혀도 좌표는 유한하고 마당 경계를 벗어나지 않는다', () => {
  const actors = Array.from({ length: 30 }, (_, key) => {
    const a = actor(key, key < 15 ? 'a' : 'b', 0);
    const spot = brawlFormationSpot(key % 15, a.side, a.assignment, 0, true);
    Object.assign(a.motion.position, { x: spot.x, z: spot.z });
    return a;
  });
  for (let i = 0; i < 200; i++) {
    stepBrawlMotions(actors, .05, bounds);
    for (const { motion } of actors) {
      expect(motion.position.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(motion.position.x).toBeLessThanOrEqual(bounds.maxX);
      expect(motion.position.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(motion.position.z).toBeLessThanOrEqual(bounds.maxZ);
      expect(Number.isFinite(motion.yaw)).toBe(true);
    }
  }
});

it('오래 재생해도 여러 싸움이 마당의 좌우와 앞뒤에 흩어져 있다', () => {
  const yard = { minX: -4.8, maxX: 4.8, minZ: 6.8, maxZ: 15.4, cameraZ: 19, referenceZ: 9.6 };
  const actors = Array.from({ length: 30 }, (_, key) => actor(key, key < 15 ? 'a' : 'b', (key % 5) * .2, 9.6));
  for (let i = 0; i < 1800; i++) stepBrawlMotions(actors, 1 / 30, yard);
  const positions = actors.map(a => ({ x: a.motion.position.x / brawlDepthScale(a.motion.position.z, yard), z: a.motion.position.z }));
  expect(Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x))).toBeGreaterThan(6);
  expect(Math.max(...positions.map(p => p.z)) - Math.min(...positions.map(p => p.z))).toBeGreaterThan(5);
  for (const left of [true, false]) for (const back of [true, false]) {
    expect(positions.filter(p => (p.x < 0) === left && (p.z < 11.1) === back).length).toBeGreaterThanOrEqual(3);
  }
  for (const a of actors) {
    const x = a.motion.position.x / brawlDepthScale(a.motion.position.z, yard);
    const nearby = positions.filter(p => Math.hypot(p.x - x, (p.z - a.motion.position.z) * 1.8) < 1.5);
    expect(nearby.length).toBeLessThanOrEqual(6);
    expect(a.motion.strikeCount).toBeGreaterThan(2);
    expect(actors.find(other => other.key === a.motion.targetKey).side).not.toBe(a.side);
  }
});

it('편별 인원이 달라도 실제 상대만 나누어 상대하고 혼자 남으면 기다린다', () => {
  const actors = Array.from({ length: 10 }, (_, key) => actor(key, key < 3 ? 'a' : 'b', key % 3));
  stepBrawlMotions(actors, 3, bounds);
  for (const a of actors) expect(actors.find(other => other.key === a.motion.targetKey).side).not.toBe(a.side);
  const remaining = actors.filter(a => a.side === 'b');
  stepBrawlMotions(remaining, 2, bounds);
  expect(remaining.every(a => a.motion.phase === 'idle')).toBe(true);
});

it('한 인물은 처음 배정된 의자 또는 맨손의 14가지 동작만 섞어 반복한다', () => {
  for (const assignment of createBrawlAssignments(BRAWL_STYLES.length)) {
    const family = CHAIR_BRAWL_STYLES.includes(assignment.style) ? CHAIR_BRAWL_STYLES : UNARMED_BRAWL_STYLES;
    expect(assignment.sequence).toHaveLength(family.length);
    expect(assignment.sequence[0]).toBe(assignment.style);
    expect(new Set(assignment.sequence)).toEqual(new Set(family));
    const styles = Array.from({ length: family.length * 2 }, (_, index) => historyBrawlPose(frame, assignment, 1, 'a', false,
      { phase: 'striking', phaseTime: BRAWL_HIT_SECONDS, strikeCount: index + 1 }).brawlStyle);
    expect(styles.slice(0, family.length)).toEqual(assignment.sequence);
    expect(styles.slice(family.length)).toEqual(assignment.sequence);
  }
  const assignment = { style: 'jab', sequence: ['jab', 'one-two'], phase: 0, tempo: 1 };
  const attack = phaseTime => historyBrawlPose(frame, assignment, 100, 'a', false, { phase: 'striking', phaseTime, strikeCount: 1 });
  expect(attack(BRAWL_HIT_SECONDS).pose.rightElbow).toBeGreaterThan(attack(0).pose.rightElbow);
  expect(attack(BRAWL_ATTACK_SECONDS).pose.rightElbow).toBeCloseTo(attack(0).pose.rightElbow);
});

it.each(['chair-slam', 'chair-throw', 'jab', 'tackle'])('%s의 순서가 없어도 마당·단독 재생·모션 감소에서 격투 종류가 바뀌지 않는다', style => {
  const family = CHAIR_BRAWL_STYLES.includes(style) ? CHAIR_BRAWL_STYLES : UNARMED_BRAWL_STYLES;
  const assignment = { style, phase: 0, tempo: 1 };
  const styles = [];
  for (let index = 0; index < family.length * 2; index++) {
    const motion = { phase: 'striking', phaseTime: .2, strikeCount: index + 1 };
    const active = historyBrawlPose(frame, assignment, index * 5.5, 'a', false, motion);
    const standalone = historyBrawlPose(frame, assignment, index * 5.5, 'a');
    const reduced = historyBrawlPose(frame, assignment, index * 5.5, 'a', true, motion);
    styles.push(active.brawlStyle);
    expect(family).toContain(active.brawlStyle);
    expect(standalone.brawlStyle).toBe(active.brawlStyle);
    expect(reduced.brawlStyle).toBe(family === CHAIR_BRAWL_STYLES ? 'chair-guard' : 'guard');
  }
  expect(new Set(styles)).toEqual(new Set(family));
  expect(styles.slice(0, family.length)).toEqual(styles.slice(family.length));
});

it('외부에서 섞인 동작 순서를 주어도 초기 격투 종류만 고르고 시간표도 동일하게 따른다', () => {
  const sequence = ['chair-throw', 'wrestle', 'chair-thrust', 'tackle'];
  for (const [style, expected] of [['chair-slam', ['chair-throw', 'chair-thrust']], ['jab', ['wrestle', 'tackle']]]) {
    const assignment = { style, sequence, phase: 0, tempo: 1 };
    for (let index = 0; index < 4; index++) {
      const action = expected[index % expected.length];
      const active = historyBrawlPose(frame, assignment, 1, 'a', false, { phase: 'striking', phaseTime: .2, strikeCount: index + 1 });
      expect(active.brawlStyle).toBe(action);
      expect(brawlAttackTiming(assignment, index + 1)).toEqual(brawlAttackTiming({ style: action }));
    }
  }
  for (const [style, sequence] of [['chair-throw', UNARMED_BRAWL_STYLES], ['tackle', CHAIR_BRAWL_STYLES]]) {
    const active = historyBrawlPose(frame, { style, sequence, phase: 0, tempo: 1 }, 1, 'a', false,
      { phase: 'striking', phaseTime: .2, strikeCount: 1 });
    expect(active.brawlStyle).toBe(style);
  }
});

it('준비 동작이 끝난 타격 시점에 밀리고 공격을 회수한 다음 쉬어 간다', () => {
  const actors = [actor(0, 'a', 0), actor(1, 'b', .8)];
  actors.forEach((a, index) => Object.assign(a.motion, {
    phase: 'striking', phaseTime: index ? -3 : 0, targetKey: 1 - index, strikeCount: 1,
  }));
  stepBrawlMotions(actors, BRAWL_HIT_SECONDS - .01, bounds);
  expect(actors[0].motion.hit).not.toBe(true);
  expect(actors[1].motion.recoilRemaining).toBe(0);
  stepBrawlMotions(actors, .02, bounds);
  expect(actors[0].motion.hit).toBe(true);
  expect(actors[1].motion.phase).toBe('recoiling');
  stepBrawlMotions(actors, BRAWL_ATTACK_SECONDS - BRAWL_HIT_SECONDS - .005, bounds);
  expect(actors[0].motion.phase).toBe('circling');
  expect(actors[0].motion.cooldown).toBeGreaterThanOrEqual(BRAWL_REST_SECONDS);
});

it.each(BRAWL_STYLES)('%s 동작은 가드에서 천천히 출발해 가드로 부드럽게 돌아온다', style => {
  const assignment = { style, sequence: [style], phase: .3, tempo: 1, amplitude: 1.2 };
  const attack = phaseTime => historyBrawlPose(frame, assignment, 10, 'a', false,
    { phase: 'striking', phaseTime, strikeCount: 1 });
  const resting = historyBrawlPose(frame, assignment, 10, 'a', false, { phase: 'circling', strikeCount: 1 });
  const { duration } = brawlAttackTiming(assignment);
  const start = attack(0), end = attack(duration);
  for (const endpoint of [start, end]) for (const [joint, value] of Object.entries(resting.pose)) {
    if (style === 'chair-throw' && ['chairVisible', 'chairFlight'].includes(joint)) continue;
    if (typeof value === 'number') expect(endpoint.pose[joint]).toBeCloseTo(value, 8);
    else expect(endpoint.pose[joint]).toEqual(value);
  }
  for (const [at, next] of [[0, .001], [duration - .001, duration]]) {
    const before = attack(at), after = attack(next);
    for (const [joint, value] of Object.entries(before.pose)) {
      if (typeof value === 'number') expect(Math.abs(after.pose[joint] - value)).toBeLessThan(.001);
    }
    expect(Math.abs(after.yaw - before.yaw)).toBeLessThan(.001);
  }
});

it('연속잽은 좌우 팔을 차례로 뻗고 회피 반격은 먼저 숙였다가 공격한다', () => {
  const pose = (style, phaseTime) => historyBrawlPose(frame, { style, sequence: [style], phase: 0, tempo: 1 }, 1, 'a', false,
    { phase: 'striking', phaseTime, strikeCount: 1 }).pose;
  const first = pose('one-two', BRAWL_HIT_SECONDS), second = pose('one-two', BRAWL_HIT_SECONDS + .19);
  expect(first.leftElbow).toBeGreaterThan(first.rightElbow);
  expect(second.rightElbow).toBeGreaterThan(second.leftElbow);
  expect(first.rightElbow).toBeLessThanOrEqual(-2);
  expect(second.leftElbow).toBeLessThanOrEqual(-2);
  expect(first.rightArm).toBeLessThanOrEqual(-1.1);
  expect(second.leftArm).toBeLessThanOrEqual(-1.1);
  expect([first.leftGrip, first.rightGrip, second.leftGrip, second.rightGrip]).toEqual([1, 1, 1, 1]);
  const duck = pose('duck-counter', .1), counter = pose('duck-counter', BRAWL_HIT_SECONDS);
  expect(duck.crouch).toBeGreaterThan(counter.crouch + .5);
  expect(counter.rightElbow).toBeGreaterThan(duck.rightElbow + 1);
  const swing = pose('chair-backhand', BRAWL_HIT_SECONDS), backhand = pose('chair-backhand', BRAWL_HIT_SECONDS + .19);
  expect(swing.torsoTwist).toBeLessThan(0);
  expect(backhand.torsoTwist).toBeGreaterThan(0);
});

it('레슬링은 양팔을 벌려 붙잡고 당기며 태클은 더 낮게 숙여 앞으로 파고든다', () => {
  const pose = (style, phaseTime) => historyBrawlPose(frame, { style, sequence: [style], phase: 0, tempo: 1 }, 1, 'a', false,
    { phase: 'striking', phaseTime, strikeCount: 1 }).pose;
  const reach = pose('wrestle', .4), pull = pose('wrestle', .7), tackle = pose('tackle', .48);
  expect(reach.leftElbow).toBeGreaterThan(pull.leftElbow + 1);
  expect(reach.rightElbow).toBeGreaterThan(pull.rightElbow + 1);
  expect(pull.leftGrip).toBeGreaterThan(reach.leftGrip + .8);
  expect(pull.rightGrip).toBeGreaterThan(reach.rightGrip + .8);
  expect(pull.torsoTwist).toBeGreaterThan(.4);
  expect(tackle.crouch).toBeGreaterThan(pull.crouch + .3);
  expect(tackle.forwardLean).toBeGreaterThan(pull.forwardLean + .7);
  expect(tackle.lunge).toBeGreaterThan(1);
  expect(tackle.chairVisible).toBe(false);
});

it('의자 찌르기는 몸 앞으로 양팔을 펴고 의자를 가로로 내민다', () => {
  const assignment = { style: 'chair-thrust', sequence: ['chair-thrust'], phase: 0, tempo: 1 };
  const pose = phaseTime => historyBrawlPose(frame, assignment, 1, 'a', false,
    { phase: 'striking', phaseTime, strikeCount: 1 }).pose;
  const ready = pose(0), contact = pose(BRAWL_HIT_SECONDS);
  expect(contact.leftElbow).toBeGreaterThan(ready.leftElbow + 1);
  expect(contact.rightElbow).toBe(contact.leftElbow);
  expect(contact.chairPitch).toBeLessThan(-1.5);
  expect(contact.lunge).toBeGreaterThan(1);
  expect(contact.chairFlight).toBeNull();
});

it('의자는 들어 올린 뒤 손에서 떠나 날아가며 던진 직후 다시 손에 생기지 않는다', () => {
  const assignment = { style: 'chair-throw', sequence: ['chair-throw', 'chair-thrust'], phase: 0, tempo: 1 };
  const attack = phaseTime => historyBrawlPose(frame, assignment, 1, 'a', false,
    { phase: 'striking', phaseTime, strikeCount: 1 }).pose;
  expect(attack(.24).leftArm).toBeLessThan(-2.5);
  expect(attack(.379).chairFlight).toBeNull();
  expect(attack(.38).chairFlight.progress).toBe(0);
  expect(attack(.78).chairFlight.progress).toBeGreaterThan(.4);
  expect(attack(1.2).chairFlight.progress).toBe(1);
  expect(attack(1.3).chairFlight.progress).toBe(1);
  const rest = historyBrawlPose(frame, assignment, 1, 'a', false, { phase: 'circling', phaseTime: 0, strikeCount: 1 });
  expect(rest.pose.chairVisible).toBe(false);
  expect(rest.pose.chairFlight).toBeNull();
  const nextChair = historyBrawlPose(frame, assignment, 1, 'a', false, { phase: 'striking', phaseTime: 0, strikeCount: 2 });
  expect(nextChair.brawlStyle).toBe('chair-thrust');
  expect(nextChair.pose.chairVisible).toBe(true);
  expect(nextChair.pose.chairFlight).toBeNull();
  const still = historyBrawlPose(frame, assignment, 1, 'a', true, { phase: 'striking', phaseTime: .8, strikeCount: 1 });
  expect(still.pose.chairVisible).toBe(true);
  expect(still.pose.chairFlight).toBeNull();
});

it('긴 동작도 같은 랜덤 순서의 시간표로 재생하고 의자가 날아온 시점에만 상대가 밀린다', () => {
  const assignment = { style: 'chair-throw', sequence: ['chair-throw', 'chair-thrust'], phase: 0, tempo: 1 };
  const unarmed = { style: 'wrestle', sequence: ['wrestle', 'tackle', 'one-two'] };
  expect(brawlAttackTiming(assignment, 1)).toEqual({ duration: 1.3, hit: .78 });
  expect(brawlAttackTiming(unarmed, 1)).toEqual({ duration: 1.2, hit: .7 });
  expect(brawlAttackTiming(unarmed, 2)).toEqual({ duration: 1.1, hit: .48 });
  expect(brawlAttackTiming(unarmed, 3)).toEqual({ duration: BRAWL_ATTACK_SECONDS, hit: BRAWL_HIT_SECONDS });
  expect(brawlAttackTiming(assignment, 3)).toEqual(brawlAttackTiming(assignment, 1));
  expect(brawlAttackTiming(unarmed, 4)).toEqual(brawlAttackTiming(unarmed, 1));
  const actors = [actor(0, 'a', 0), actor(1, 'b', .8)];
  actors[0].assignment = assignment;
  actors.forEach((a, index) => Object.assign(a.motion, {
    phase: 'striking', phaseTime: index ? -3 : 0, targetKey: 1 - index, strikeCount: 1,
  }));
  stepBrawlMotions(actors, .77, bounds);
  expect(actors[0].motion.hit).not.toBe(true);
  expect(actors[0].motion.phase).toBe('striking');
  expect(actors[1].motion.recoilRemaining).toBe(0);
  stepBrawlMotions(actors, .02, bounds);
  expect(actors[0].motion.hit).toBe(true);
  expect(actors[1].motion.phase).toBe('recoiling');
  stepBrawlMotions(actors, .52, bounds);
  expect(actors[0].motion.phase).toBe('circling');
});

it('달리는 동안 다리가 움직이고 모션 감소에서는 위치와 자세가 멈춘다', () => {
  const motion = { position: { ...frame.position }, yaw: 1.2, phase: 'running', speed: 2, gait: 1 };
  const moving = brawlLocomotionPose(frame, motion, 1);
  expect(moving.pose.stride).not.toBe(0);
  expect(moving.pose.stepLift).toBeGreaterThan(0);
  expect(moving.yaw).toBe(1.2);
  expect(brawlLocomotionPose(frame, motion, 1, true)).toEqual(brawlLocomotionPose(frame, motion, 50, true));
  expect(brawlLocomotionPose(frame, motion, 1, true).pose.stride).toBe(0);
});
it('30명의 실제 인물에게 맨손·의자 동작과 서로 다른 속도를 섞는다', () => {
  const assignments = createBrawlAssignments(30);
  expect(assignments).toHaveLength(30);
  expect(new Set(assignments.map(item => item.style))).toEqual(new Set(BRAWL_STYLES));
  expect(new Set(assignments.map(item => item.phase)).size).toBe(30);
});
it.each(BRAWL_STYLES)('%s 동작은 도구에 맞는 표시와 위치·크기·상대 방향을 유지한다', style => {
  const assignment = { style, phase: .3, tempo: 1 };
  for (const side of ['a', 'b']) for (let time = 0; time < 8; time += .2) {
    const result = historyBrawlPose({ ...frame, yaw: side === 'a' ? .65 : -1.1 }, assignment, time, side);
    expect(result.position).toEqual(frame.position);
    const chair = CHAIR_BRAWL_STYLES.includes(result.brawlStyle);
    expect(result.pose).toMatchObject({ scale: .65, chairVisible: chair, chairLift: chair ? 1 : 0, chairCarry: false });
    expect(Object.values(result.pose).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
    expect(Math.sign(result.yaw)).toBe(side === 'a' ? 1 : -1);
    if (result.brawlStyle !== 'chair-sweep') expect(result.yaw).toBe(side === 'a' ? .65 : -1.1);
  }
  expect(historyBrawlPose(frame, assignment, 0, 'a', true)).toEqual(historyBrawlPose(frame, assignment, 20, 'a', true));
  expect(historyBrawlPose(frame, assignment, 6, 'a').brawlStyle).not.toBe(style);
});

it('흩어진 자리는 마당 안에 머물고 발놀림은 작고 연속적이며 동작 줄이기에서는 멈춘다', () => {
  for (let index = 0; index < 15; index++) for (const side of ['a', 'b']) {
    const assignment = { phase: index * .7, tempo: .72 + index * .04 };
    const still = brawlFormationSpot(index, side, assignment, 0, true);
    expect(brawlFormationSpot(index, side, assignment, 100, true)).toEqual(still);
    for (let time = 0; time < 20; time += .5) {
      const spot = brawlFormationSpot(index, side, assignment, time);
      const next = brawlFormationSpot(index, side, assignment, time + .016);
      expect(Math.abs(spot.x)).toBeLessThan(4);
      expect(Math.abs(spot.z)).toBeLessThan(3);
      expect(Math.hypot(spot.x - still.x, spot.z - still.z)).toBeLessThan(.15);
      expect(Math.hypot(next.x - spot.x, next.z - spot.z)).toBeLessThan(.01);
      expect(Math.sign(spot.yaw)).toBe(side === 'a' ? 1 : -1);
    }
  }
});
