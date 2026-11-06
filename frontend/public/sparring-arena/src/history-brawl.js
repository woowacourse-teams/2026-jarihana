export const CHAIR_BRAWL_STYLES = ['chair-slam', 'chair-shove', 'chair-sweep', 'chair-guard', 'chair-kick', 'chair-dodge', 'chair-jab', 'chair-hop',
  'chair-backhand', 'chair-feint', 'chair-counter', 'chair-double-shove', 'chair-thrust', 'chair-throw'];
export const UNARMED_BRAWL_STYLES = ['jab', 'hook', 'uppercut', 'kick', 'dodge', 'shove', 'jump-strike', 'guard',
  'one-two', 'body-shot', 'duck-counter', 'elbow-strike', 'wrestle', 'tackle'];
export const BRAWL_STYLES = [...CHAIR_BRAWL_STYLES, ...UNARMED_BRAWL_STYLES];
export const BRAWL_ATTACK_SECONDS = 0.62;
export const BRAWL_HIT_SECONDS = 0.24;
export const BRAWL_REST_SECONDS = 0.65;
const BRAWL_MOVEMENT_SPEED = 0.7;
const CHAIR_THROW_RELEASE_SECONDS = 0.38;
const CHAIR_THROW_LAND_SECONDS = 1.2;

const brawlFamily = style => CHAIR_BRAWL_STYLES.includes(style) ? CHAIR_BRAWL_STYLES : UNARMED_BRAWL_STYLES;

function brawlStyleAt({ style, sequence }, strikeCount = 1) {
  const index = Math.max(0, strikeCount - 1);
  const family = brawlFamily(style);
  const actions = sequence?.filter(action => family.includes(action));
  return actions?.length ? actions[index % actions.length]
    : family[(Math.max(0, family.indexOf(style)) + index) % family.length];
}

export function brawlAttackTiming(assignment, strikeCount = 1) {
  const style = brawlStyleAt(assignment, strikeCount);
  if (style === 'wrestle') return { duration: 1.2, hit: 0.7 };
  if (style === 'tackle') return { duration: 1.1, hit: 0.48 };
  if (style === 'chair-throw') return { duration: 1.3, hit: 0.78 };
  return { duration: BRAWL_ATTACK_SECONDS, hit: BRAWL_HIT_SECONDS };
}

export function createBrawlAssignments(count, random = Math.random) {
  const shuffled = values => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  let bag = [];
  return Array.from({ length: count }, () => {
    if (!bag.length) bag = shuffled(BRAWL_STYLES);
    const style = bag.pop();
    const sequence = shuffled(brawlFamily(style));
    const start = sequence.indexOf(style);
    return { style, sequence: [...sequence.slice(start), ...sequence.slice(0, start)],
      phase: random() * Math.PI * 2, tempo: 0.72 + random() * 0.6, amplitude: 0.8 + random() * 0.4 };
  });
}

export function brawlFormationSpot(index, side, { phase, tempo }, time = 0, reduced = false) {
  const direction = side === 'a' ? 1 : -1;
  const angle = index * Math.PI * (3 - Math.sqrt(5)) + 0.35;
  const radius = Math.sqrt(index) * 0.84;
  const step = time * tempo * 1.3 + phase;
  const sway = reduced ? 0 : Math.sin(step) * 0.1;
  const advance = reduced ? 0 : Math.cos(step * 0.8 + phase) * 0.1;
  const facing = 0.85 + Math.sin(index * 1.9 + 1.2) * 0.3 + Math.sin(phase) * 0.06;
  return {
    x: Math.cos(angle) * radius - direction * 0.48 + Math.sin(phase * 1.7) * 0.16 + sway,
    z: Math.sin(angle) * radius * 0.8 + Math.cos(phase * 1.3) * 0.18 + advance,
    yaw: direction * (facing + (reduced ? 0 : Math.sin(step * 0.7) * 0.04)),
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (left, right) => Math.hypot(left.x - right.x, left.z - right.z);
const turnToward = (yaw, target, delta) => yaw
  + Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw)) * (1 - Math.exp(-delta * 12));
const ease = value => {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const attackPulse = (time, start, peak, end) => time < peak
  ? ease((time - start) / (peak - start)) : 1 - ease((time - peak) / (end - peak));

export function brawlDepthScale(z, { cameraZ, referenceZ }) {
  return cameraZ == null ? 1 : clamp((cameraZ - z) / (cameraZ - referenceZ), 0.3, 1.3);
}

export function stepBrawlMotions(actors, delta, bounds) {
  if (!Number.isFinite(delta) || delta <= 0 || !actors.length) return;
  const byKey = new Map(actors.map(actor => [actor.key, actor]));
  const sides = ['a', 'b'].map(side => actors.filter(actor => actor.side === side).sort((a, b) => a.key - b.key));
  const groups = Array.from({ length: Math.min(...sides.map(side => side.length)) }, () => []);
  if (groups.length) for (const side of sides) side.forEach((actor, index) => groups[index % groups.length].push(actor));
  const encounter = new Map();
  groups.forEach((members, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + 0.35;
    const radius = Math.sqrt((index + 0.5) / groups.length) * 0.9;
    const center = {
      x: (bounds.minX + bounds.maxX) / 2 + Math.cos(angle) * radius * ((bounds.maxX - bounds.minX) / 2 - 1.1),
      z: (bounds.minZ + bounds.maxZ) / 2 + Math.sin(angle) * radius * ((bounds.maxZ - bounds.minZ) / 2 - 1.1),
    };
    const middleX = (bounds.minX + bounds.maxX) / 2;
    center.x = middleX + (center.x - middleX) * brawlDepthScale(center.z, bounds);
    for (const actor of members) encounter.set(actor.key, { members, center });
  });
  for (const actor of actors) {
    const motion = actor.motion;
    motion.phase ??= 'idle';
    motion.phaseTime ??= 0;
    motion.cooldown ??= 0.2 + (Math.sin(actor.assignment.phase) + 1) * 0.25;
    motion.gait ??= actor.assignment.phase;
    motion.speed ??= 0;
    motion.recoilRemaining ??= 0;
    motion.strikeCount ??= 0;
  }
  const steps = Math.ceil(delta / (1 / 60)), dt = delta / steps;
  const movementDelta = dt * BRAWL_MOVEMENT_SPEED;
  for (let step = 0; step < steps; step++) {
    const before = actors.map(actor => ({ ...actor.motion.position }));
    const hits = [];
    for (const actor of actors) {
      const { motion, assignment } = actor;
      const position = motion.position;
      motion.cooldown = Math.max(0, motion.cooldown - dt);
      motion.phaseTime += dt;
      if (motion.recoilRemaining > 0) {
        motion.phase = 'recoiling';
        const strength = motion.recoilRemaining / 0.42;
        position.x += motion.recoilX * strength * movementDelta;
        position.z += motion.recoilZ * strength * movementDelta;
        motion.yaw = turnToward(motion.yaw, Math.atan2(-motion.recoilX, -motion.recoilZ), dt);
        motion.recoilRemaining = Math.max(0, motion.recoilRemaining - dt);
        if (!motion.recoilRemaining) { motion.phase = 'circling'; motion.phaseTime = 0; }
        continue;
      }
      let target = byKey.get(motion.targetKey);
      const members = encounter.get(actor.key)?.members ?? [];
      if (!target || target.side === actor.side || !members.includes(target)) {
        target = members.filter(other => other.side !== actor.side)
          .reduce((nearest, other) => !nearest || distance(position, other.motion.position)
            < distance(position, nearest.motion.position) ? other : nearest, null);
        motion.targetKey = target?.key;
        motion.phase = target ? 'running' : 'idle';
        motion.phaseTime = 0;
      }
      if (!target) continue;
      const dx = target.motion.position.x - position.x, dz = target.motion.position.z - position.z;
      const gap = Math.hypot(dx, dz);
      const nx = gap > 0.001 ? dx / gap : Math.sin(motion.yaw);
      const nz = gap > 0.001 ? dz / gap : Math.cos(motion.yaw);
      const facing = Math.atan2(nx, nz);
      if (motion.phase === 'striking') {
        const timing = brawlAttackTiming(assignment, motion.strikeCount);
        motion.yaw = turnToward(motion.yaw, facing, dt);
        if (!motion.hit && motion.phaseTime >= timing.hit) {
          motion.hit = true;
          if (gap < 1.15) hits.push({ target, nx, nz, attacker: actor });
        }
        if (motion.phaseTime >= timing.duration) {
          motion.phase = 'circling'; motion.phaseTime = 0;
          motion.cooldown = BRAWL_REST_SECONDS + (Math.sin(assignment.phase) + 1) * 0.15;
        }
      } else if (motion.phase === 'circling') {
        const direction = Math.sin(assignment.phase) < 0 ? -1 : 1;
        const inwardX = clamp(position.x, bounds.minX + 0.9, bounds.maxX - 0.9) - position.x;
        const inwardZ = clamp(position.z, bounds.minZ + 0.9, bounds.maxZ - 0.9) - position.z;
        const vx = nz * direction * 0.9 - nx * 0.4 + inwardX * 2;
        const vz = -nx * direction * 0.9 - nz * 0.4 + inwardZ * 2;
        position.x += vx * assignment.tempo * movementDelta;
        position.z += vz * assignment.tempo * movementDelta;
        motion.yaw = turnToward(motion.yaw, facing, dt);
        if (motion.phaseTime > 0.8 / assignment.tempo) {
          motion.phase = 'running'; motion.phaseTime = 0;
        }
      } else {
        motion.phase = 'running';
        motion.yaw = turnToward(motion.yaw, facing, dt);
        const travel = Math.min(Math.max(0, gap - 0.8), 2.2 * assignment.tempo * movementDelta);
        position.x += nx * travel; position.z += nz * travel;
        if (gap <= 0.84) {
          motion.phase = motion.cooldown ? 'circling' : 'striking';
          motion.phaseTime = 0; motion.hit = false;
          if (motion.phase === 'striking') motion.strikeCount++;
        }
      }
    }
    for (const { target, nx, nz, attacker } of hits) {
      const motion = target.motion;
      if (motion.recoilRemaining > 0.18) continue;
      motion.phase = 'recoiling'; motion.phaseTime = 0;
      motion.targetKey = attacker.key;
      motion.recoilRemaining = 0.42;
      const force = 3.5 + (attacker.assignment.amplitude ?? 1) * 0.5;
      motion.recoilX = nx * force; motion.recoilZ = nz * force;
      motion.cooldown = 0.9;
    }
    if (groups.length > 1) for (const members of groups) {
      const center = encounter.get(members[0].key).center;
      const midpoint = members.reduce((sum, actor) => ({ x: sum.x + actor.motion.position.x / members.length,
        z: sum.z + actor.motion.position.z / members.length }), { x: 0, z: 0 });
      const dx = center.x - midpoint.x, dz = center.z - midpoint.z;
      const pull = Math.min(0.9, 1.8 / Math.max(0.01, Math.hypot(dx, dz))) * movementDelta;
      for (const actor of members) {
        actor.motion.position.x += dx * pull; actor.motion.position.z += dz * pull;
      }
    }
    for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
      const left = actors[i].motion.position, right = actors[j].motion.position;
      const gap = distance(left, right);
      const sameGroup = encounter.get(actors[i].key)?.members === encounter.get(actors[j].key)?.members;
      const spacing = (sameGroup ? 0.48 : 1.35) * brawlDepthScale((left.z + right.z) / 2, bounds);
      if (gap >= spacing) continue;
      const angle = (actors[i].key + actors[j].key) * 2.4;
      const nx = gap > 0.001 ? (left.x - right.x) / gap : Math.sin(angle);
      const nz = gap > 0.001 ? (left.z - right.z) / gap : Math.cos(angle);
      const push = (spacing - gap) * Math.min(0.5, movementDelta * 3);
      left.x += nx * push; left.z += nz * push;
      right.x -= nx * push; right.z -= nz * push;
    }
    actors.forEach((actor, index) => {
      const { motion } = actor;
      motion.position.z = clamp(motion.position.z, bounds.minZ, bounds.maxZ);
      const halfWidth = (bounds.maxX - bounds.minX) / 2 * brawlDepthScale(motion.position.z, bounds);
      const middleX = (bounds.minX + bounds.maxX) / 2;
      const previousX = motion.returningFromThrow ? before[index].x : middleX;
      motion.position.x = clamp(motion.position.x, Math.min(middleX - halfWidth, previousX), Math.max(middleX + halfWidth, previousX));
      if (motion.position.x >= middleX - halfWidth && motion.position.x <= middleX + halfWidth) motion.returningFromThrow = false;
      const moved = distance(before[index], motion.position);
      motion.speed = moved / dt;
      motion.gait += moved * 9;
    });
  }
}

export function brawlLocomotionPose(frame, motion, time, reduced = false) {
  const pose = { ...frame.pose };
  const moving = !reduced && motion.speed > 0.05;
  const stride = moving ? Math.sin(motion.gait) * Math.min(1, motion.speed / 1.2) : 0;
  if (reduced || motion.phase === 'idle') {
    Object.assign(pose, { stride: 0, stepLift: 0, lift: 0, rightKick: 0, leftKick: 0,
      forwardLean: 0.04, crouch: 0.12, lunge: 0, time: reduced ? 0 : time });
    if (motion.phase === 'idle') {
      Object.assign(pose, pose.chairVisible
        ? { leftArm: -1.4, rightArm: -1.4, leftElbow: -1.1, rightElbow: -1.1, chairPitch: -0.1 }
        : { leftArm: -1.1, rightArm: -1.2, leftElbow: -2, rightElbow: -2 });
    }
  } else if (motion.phase !== 'striking') {
    Object.assign(pose, { stride, stepLift: Math.abs(stride) * 0.16,
      lift: 0, rightKick: 0, leftKick: 0, lunge: 0,
      forwardLean: motion.phase === 'recoiling' ? -0.3 : motion.phase === 'running' ? 0.2 : 0.08,
      crouch: motion.phase === 'recoiling' ? 0.32 : 0.12 });
    if (!pose.chairVisible && motion.phase === 'running') {
      pose.leftArm = -0.7 + stride * 0.55; pose.rightArm = -0.7 - stride * 0.55;
      pose.leftElbow = pose.rightElbow = -1.1;
    }
  }
  return { ...frame, position: { ...motion.position },
    yaw: motion.phase === 'striking' && !reduced ? frame.yaw : motion.yaw,
    movementPhase: motion.phase, pose };
}

export function historyBrawlPose(frame, assignment, time, side, reduced = false, motion) {
  const { style, phase, tempo, amplitude = 1 } = assignment;
  const strike = Math.max(0, (motion?.strikeCount ?? 1) - 1);
  const cycle = reduced ? 0 : motion ? strike : Math.floor(time * tempo / 5.5);
  const selected = brawlStyleAt(motion ? assignment : { style }, cycle + 1);
  const resting = reduced || (motion && motion.phase !== 'striking');
  const action = resting ? (UNARMED_BRAWL_STYLES.includes(reduced ? style : selected) ? 'guard' : 'chair-guard') : selected;
  const { duration, hit } = brawlAttackTiming({ style: selected });
  const period = duration + BRAWL_REST_SECONDS;
  const elapsed = motion?.phaseTime ?? (time * tempo + phase / (Math.PI * 2) * period) % period;
  const attackTime = resting ? 0 : elapsed;
  const prepare = attackPulse(attackTime, 0, hit * 0.42, hit) * amplitude;
  const strikePulse = attackPulse(attackTime, hit * 0.33, hit, duration);
  const force = strikePulse * amplitude;
  const comboLead = attackPulse(attackTime, hit * 0.33, hit, hit + (duration - hit) * 0.395) * amplitude;
  const follow = attackPulse(attackTime, hit, hit + (duration - hit) * 0.5, duration) * amplitude;
  const settle = attackPulse(attackTime, 0, hit * 0.8, duration) * amplitude;
  const unarmed = UNARMED_BRAWL_STYLES.includes(action);
  const pose = {
    ...frame.pose, seated: 0, crouch: unarmed ? 0.12 : 0.28, stride: 0, stepLift: 0, lift: 0,
    lean: 0, forwardLean: unarmed ? 0.08 : 0.06, torsoTwist: 0, lunge: 0.25, head: -0.06,
    leftArm: unarmed ? -1.1 : -1.4, rightArm: unarmed ? -1.2 : -1.4,
    leftElbow: unarmed ? -2 : -1.1, rightElbow: unarmed ? -2 : -1.1,
    leftSpread: -0.16, rightSpread: 0.16, leftGrip: 1, rightGrip: 1,
    leftPoint: 0, rightPoint: 0, leftKick: 0, rightKick: 0, wave: 0,
    chairCarry: false, chairGrounded: false, chairVisible: !unarmed, chairLift: unarmed ? 0 : 1, chairPitch: -0.1, chairRestBack: 0,
    chairFlight: null,
    speaking: !reduced && frame.pose.speaking, time: reduced ? 0 : time,
  };
  let turn = 0;
  if (unarmed) {
    if (action === 'jab') {
      pose.rightArm += prepare * 0.25 - force * 0.4;
      pose.rightElbow += force * 1.6;
      pose.torsoTwist = prepare * 0.16 - force * 0.25;
      pose.lunge += force * 0.35;
    } else if (action === 'hook') {
      pose.leftArm -= force * 0.3; pose.leftSpread -= force * 0.85;
      pose.leftElbow += force * 0.5; pose.torsoTwist = -prepare * 0.35 + force * 0.8;
      pose.lean = force * 0.12;
    } else if (action === 'uppercut') {
      pose.rightArm += prepare * 0.55 - force * 1.1; pose.rightElbow += force * 0.55;
      pose.crouch += prepare * 0.32; pose.forwardLean -= force * 0.14;
      pose.torsoTwist = -force * 0.3;
    } else if (action === 'kick') {
      pose.rightKick = force; pose.forwardLean -= force * 0.3;
      pose.leftSpread -= force * 0.4; pose.rightArm += force * 0.3;
      pose.crouch += prepare * 0.14;
    } else if (action === 'dodge') {
      pose.crouch += force * 0.65; pose.lean = force * 0.36;
      pose.leftArm += force * 0.2; pose.rightArm += force * 0.1;
      pose.forwardLean += force * 0.18;
    } else if (action === 'shove') {
      pose.leftArm -= force * 0.25; pose.rightArm -= force * 0.35;
      pose.leftElbow += force * 1.7; pose.rightElbow += force * 1.7;
      pose.leftGrip = pose.rightGrip = 1 - strikePulse;
      pose.forwardLean += force * 0.25; pose.lunge += force * 0.35;
    } else if (action === 'jump-strike') {
      pose.lift = force * 0.3 * frame.pose.scale;
      pose.crouch += prepare * 0.35 + follow * 0.18;
      pose.leftArm -= force * 1.1; pose.rightArm -= force * 0.95;
      pose.leftElbow += force * 1.3; pose.rightElbow += force * 1.3;
    } else if (action === 'one-two') {
      pose.leftArm -= comboLead * 0.5; pose.leftElbow += comboLead * 1.9;
      pose.rightArm -= follow * 0.5; pose.rightElbow += follow * 1.9;
      pose.leftElbow -= follow * 0.15; pose.rightElbow -= comboLead * 0.15;
      pose.torsoTwist = comboLead * 0.4 - follow * 0.5;
      pose.lunge += comboLead * 0.3 + follow * 0.25;
      pose.crouch += prepare * 0.1;
    } else if (action === 'body-shot') {
      pose.crouch += settle * 0.4; pose.forwardLean += force * 0.18;
      pose.rightArm += prepare * 0.35 + force * 0.18;
      pose.rightElbow += force * 1.55; pose.torsoTwist = -force * 0.45;
      pose.head += settle * 0.12; pose.lunge += force * 0.3;
    } else if (action === 'duck-counter') {
      pose.crouch += prepare * 0.68; pose.lean = prepare * 0.3;
      pose.rightArm += prepare * 0.35 - force * 0.85;
      pose.rightElbow += force * 1.3; pose.torsoTwist = prepare * 0.25 - force * 0.45;
      pose.forwardLean += prepare * 0.2; pose.lunge += force * 0.28;
    } else if (action === 'elbow-strike') {
      pose.leftArm -= force * 0.45; pose.leftSpread -= force * 0.6;
      pose.leftElbow -= force * 0.3; pose.rightArm -= prepare * 0.2;
      pose.torsoTwist = -prepare * 0.3 + force * 0.65;
      pose.forwardLean += force * 0.18; pose.lunge += force * 0.3;
    } else if (action === 'wrestle') {
      const reach = attackPulse(attackTime, 0.08, 0.4, duration);
      const pull = attackPulse(attackTime, 0.4, hit, duration);
      pose.crouch += settle * 0.4; pose.forwardLean += reach * 0.3 - pull * 0.22;
      pose.leftArm -= reach * 0.45; pose.rightArm -= reach * 0.4;
      pose.leftElbow += reach * 1.65 - pull * 1.35;
      pose.rightElbow += reach * 1.65 - pull * 1.35;
      pose.leftSpread -= reach * 0.24 - pull * 0.3;
      pose.rightSpread += reach * 0.24 - pull * 0.3;
      pose.leftGrip = pose.rightGrip = 1 - reach * (1 - pull);
      pose.torsoTwist = pull * 0.48; pose.lean = -pull * 0.12;
      pose.lunge += reach * 0.65; pose.head += pull * 0.12;
    } else if (action === 'tackle') {
      const low = attackPulse(attackTime, 0, 0.28, duration);
      pose.crouch += low * 0.8;
      pose.forwardLean += force * 0.9;
      pose.leftArm += low * 0.25 - force * 0.3;
      pose.rightArm += low * 0.25 - force * 0.3;
      pose.leftElbow += force * 1.7; pose.rightElbow += force * 1.7;
      pose.leftSpread -= force * 0.3; pose.rightSpread += force * 0.3;
      pose.leftGrip = pose.rightGrip = 1 - strikePulse * 0.75;
      pose.lunge += force * 1.15; pose.head -= force * 0.25;
    } else {
      pose.leftArm -= force * 0.3; pose.rightArm -= force * 0.35;
      pose.lean = force * 0.18;
      pose.crouch += force * 0.15;
    }
  } else if (action === 'chair-slam') {
    pose.leftArm += -prepare * 1.45 + force * 0.2; pose.rightArm = pose.leftArm;
    pose.leftElbow += settle * 0.8; pose.rightElbow = pose.leftElbow;
    pose.chairPitch -= prepare * 2.8 + force * 0.8;
    pose.forwardLean += force * 0.3; pose.crouch += force * 0.2;
  } else if (action === 'chair-shove') {
    pose.leftArm += prepare * 0.2 - force * 0.1; pose.rightArm = pose.leftArm;
    pose.leftElbow += force; pose.rightElbow = pose.leftElbow;
    pose.chairPitch -= settle * 0.55;
    pose.lunge += force * 0.6; pose.forwardLean += force * 0.22;
  } else if (action === 'chair-sweep') {
    turn = -prepare * 0.18 + force * 0.22;
    pose.leftArm -= force * 0.3; pose.rightArm -= prepare * 0.3;
    pose.torsoTwist = -prepare * 0.45 + force * 0.65;
    pose.chairPitch -= settle * 1.6; pose.crouch += force * 0.15;
  } else if (action === 'chair-guard') {
    pose.leftArm -= force * 0.3; pose.rightArm -= force * 0.3;
    pose.crouch += force * 0.18; pose.lean = force * 0.12;
  } else if (action === 'chair-kick') {
    pose.rightKick = force;
    pose.leftElbow += force * 0.3; pose.rightElbow += force * 0.3;
    pose.chairPitch -= settle * 0.45;
    pose.forwardLean -= force * 0.3; pose.crouch += prepare * 0.16;
  } else if (action === 'chair-dodge') {
    pose.crouch += force * 0.6; pose.lean = force * 0.3;
    pose.leftArm -= settle; pose.rightArm -= settle;
    pose.leftElbow += settle * 0.75; pose.rightElbow += settle * 0.75;
    pose.chairPitch -= settle * 2.4;
  } else if (action === 'chair-jab') {
    pose.leftArm -= force * 0.15; pose.rightArm -= force * 0.15;
    pose.leftElbow += force; pose.rightElbow += force;
    pose.chairPitch -= settle * 1.5;
    pose.torsoTwist = -force * 0.2; pose.lunge += force * 0.4;
  } else if (action === 'chair-hop') {
    pose.lift = force * 0.32 * frame.pose.scale;
    pose.crouch += prepare * 0.3 + follow * 0.15;
    pose.leftArm -= settle * 1.35; pose.rightArm -= settle * 1.35;
    pose.leftElbow += settle * 0.8; pose.rightElbow += settle * 0.8;
    pose.chairPitch -= settle * 2.8;
  } else if (action === 'chair-backhand') {
    pose.torsoTwist = -force * 0.65 + follow * 0.8;
    pose.leftArm += force * 0.2 - follow * 0.35;
    pose.rightArm += follow * 0.2 - force * 0.35;
    pose.leftSpread -= force * 0.22; pose.rightSpread += follow * 0.22;
    pose.chairPitch -= settle * 1.2; pose.lean = force * 0.12 - follow * 0.15;
  } else if (action === 'chair-feint') {
    pose.leftArm -= prepare * 0.65 - force * 0.15 + follow * 0.3; pose.rightArm = pose.leftArm;
    pose.leftElbow += prepare * 0.3 + follow * 0.9; pose.rightElbow = pose.leftElbow;
    pose.chairPitch -= prepare * 1.7 + follow * 0.6;
    pose.crouch += force * 0.25; pose.lunge += prepare * 0.12 + follow * 0.5;
  } else if (action === 'chair-counter') {
    pose.leftArm -= prepare * 0.6 - force * 0.1; pose.rightArm = pose.leftArm;
    pose.leftElbow += force * 0.95; pose.rightElbow = pose.leftElbow;
    pose.chairPitch += prepare * 0.5 - force * 0.85;
    pose.forwardLean += -prepare * 0.2 + force * 0.28;
    pose.crouch += prepare * 0.2; pose.lunge += force * 0.45;
  } else if (action === 'chair-double-shove') {
    pose.leftArm -= comboLead * 0.15 + follow * 0.2; pose.rightArm = pose.leftArm;
    pose.leftElbow += comboLead * 0.85 + follow * 0.9; pose.rightElbow = pose.leftElbow;
    pose.chairPitch -= settle * 0.5 + follow * 0.25;
    pose.lunge += comboLead * 0.3 + follow * 0.3;
    pose.forwardLean += comboLead * 0.12 + follow * 0.15;
  } else if (action === 'chair-thrust') {
    pose.leftArm += prepare * 0.3 - force * 0.25; pose.rightArm = pose.leftArm;
    pose.leftElbow += force * 1.05; pose.rightElbow = pose.leftElbow;
    pose.chairPitch -= settle * Math.PI / 2;
    pose.forwardLean += force * 0.35; pose.lunge += force * 0.95;
    pose.crouch += prepare * 0.15;
  } else if (action === 'chair-throw') {
    const windup = attackPulse(attackTime, 0, 0.24, CHAIR_THROW_RELEASE_SECONDS);
    const release = attackPulse(attackTime, 0.24, CHAIR_THROW_RELEASE_SECONDS, duration);
    pose.leftArm -= windup * 1.35 + release * 0.35; pose.rightArm = pose.leftArm;
    pose.leftElbow += windup * 0.45 + release; pose.rightElbow = pose.leftElbow;
    pose.chairPitch -= windup * 2.5 + release * 1.1;
    pose.crouch += windup * 0.2; pose.forwardLean += release * 0.32;
    pose.lunge += release * 0.5;
    pose.leftGrip = pose.rightGrip = 1 - release;
    if (attackTime >= CHAIR_THROW_RELEASE_SECONDS) {
      pose.chairFlight = { progress: clamp((attackTime - CHAIR_THROW_RELEASE_SECONDS)
        / (CHAIR_THROW_LAND_SECONDS - CHAIR_THROW_RELEASE_SECONDS), 0, 1) };
    }
  }
  if (!reduced && selected === 'chair-throw' && resting && motion?.strikeCount > 0) pose.chairVisible = false;
  return { ...frame, phase: 'brawling', brawlStyle: action, pose,
    yaw: (frame.yaw ?? (side === 'a' ? 0.85 : -0.85)) + (side === 'a' ? turn : -turn) };
}
