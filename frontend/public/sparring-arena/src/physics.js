import * as CANNON from '../vendor/cannon-es.js';

export const CAPACITY = 240;
export const RADIUS = 0.5;
export const FRESH_CAPSULE_SCALE = 1.28;
export const TANK = Object.freeze({ width: 18, depth: 4.4, bottom: -4.4, rim: 4.4 });

// The 5:24 front-view elevation keeps this nozzle axis horizontal on screen.
// The mouth is shared; the capsule retains its downward discharge velocity.
export function nozzlePose(side) {
  const sign = side === 'a' ? -1 : 1;
  return {
    mouth: [sign * (TANK.width / 2 - 0.7), 3.2, 0.12],
    direction: [-sign * 0.92, 0.08, 0.384],
    launchDirection: [-sign * 0.965, -0.15, 0.215],
  };
}

export function createCapsulePhysics({ capacity = CAPACITY, seed = 19 } = {}) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 8;
  world.defaultContactMaterial.friction = 0.48;
  world.defaultContactMaterial.restitution = 0.08;
  world.defaultContactMaterial.contactEquationStiffness = 1e6;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(TANK.width / 2 + 0.2, 0.12, TANK.depth / 2 + 0.2)), position: new CANNON.Vec3(0, TANK.bottom - 0.12, 0) });
  world.addBody(floor);
  const wall = new CANNON.Body({ mass: 0 });
  const height = TANK.rim - TANK.bottom;
  for (const sign of [-1, 1]) {
    wall.addShape(new CANNON.Box(new CANNON.Vec3(0.1, height / 2, TANK.depth / 2 + 0.2)), new CANNON.Vec3(sign * (TANK.width / 2 + 0.1), TANK.bottom + height / 2, 0));
    wall.addShape(new CANNON.Box(new CANNON.Vec3(TANK.width / 2, height / 2, 0.1)), new CANNON.Vec3(0, TANK.bottom + height / 2, sign * (TANK.depth / 2 + 0.1)));
  }
  // Fast, repeated pipe releases must not fling older capsules above the tank.
  wall.addShape(new CANNON.Box(new CANNON.Vec3(TANK.width / 2, 0.1, TANK.depth / 2)), new CANNON.Vec3(0, TANK.rim + 0.1, 0));
  world.addBody(wall);
  const spacing = RADIUS * 2 + 0.012;
  const columns = Math.floor(TANK.width / spacing), rows = Math.floor(TANK.depth / spacing);
  const cells = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    cells.push([(column - (columns - 1) / 2) * spacing, (row - (rows - 1) / 2) * spacing]);
  }
  const bodyEntries = new Map();
  let lastCollision = -Infinity, collisionEvent = null;
  const entries = Array.from({ length: capacity }, (_, index) => {
    const [x, z] = cells[index % cells.length], layer = Math.floor(index / cells.length);
    const body = new CANNON.Body({ mass: 0.7, shape: new CANNON.Sphere(RADIUS), linearDamping: 0.12, angularDamping: 0.18, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.8 });
    body.position.set(x + (random() - 0.5) * 0.012, TANK.bottom + RADIUS + layer * spacing, z + (random() - 0.5) * 0.012);
    body.quaternion.setFromEuler(random() * 6, random() * 6, random() * 6);
    world.addBody(body);
    const entry = { body, post: null, born: -20, fresh: false, landedAt: null, openedAt: null, revealed: true, protectedUntil: -1 };
    bodyEntries.set(body.id, entry);
    body.addEventListener('collide', ({ body: other }) => {
      const opponent = bodyEntries.get(other.id);
      if (opponent && entry.visualSide && opponent.visualSide && entry.visualSide !== opponent.visualSide &&
          body.position.y > -0.6 && Math.abs(body.position.x) < 4 && world.time - lastCollision > 0.7) {
        lastCollision = world.time;
        collisionEvent = { x: body.position.x, y: body.position.y, z: body.position.z };
      }
      if (!entry.post || entry.landedAt !== null || world.time - entry.born < 0.25) return;
      const older = bodyEntries.get(other.id);
      if (other === floor || (older && older.born < entry.born - 0.5 && other.position.y <= body.position.y && body.position.y < 2.6)) entry.landedAt = world.time;
    });
    return entry;
  });
  let exchanges = 0, shockwaves = 0;
  const waves = [];
  function step(delta) {
    const elapsed = Math.min(delta, 0.05);
    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      wave.elapsed += elapsed;
      while (wave.next < wave.targets.length && wave.targets[wave.next].distance <= wave.elapsed * 10) {
        const { entry, born, post, distance, dx, dz, index } = wave.targets[wave.next++];
        if (entry.born !== born || entry.post !== post) continue;
        const { body } = entry;
        if (!Number.isFinite(body.position.y) || body.position.y >= TANK.rim - 1.3) continue;
        const strength = 1 - distance / 8.5;
        const direction = distance > 0.01 ? dx / distance : (index % 2 ? 0.15 : -0.15);
        body.wakeUp();
        body.velocity.x += direction * strength * 3.2;
        body.velocity.y = Math.max(body.velocity.y, 0.9 + strength * 6.2);
        body.velocity.z += dz / Math.max(distance, 0.5) * strength * 1.2;
        body.angularVelocity.z += direction * strength * 1.2;
      }
      if (wave.next === wave.targets.length) waves.splice(i, 1);
    }
    world.step(1 / 120, elapsed, 6);
  }
  function settle(seconds = 2.4) { for (let i = 0; i < seconds * 120; i++) world.step(1 / 120); }
  function shockwave({ x = 0, z = 0.3 } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const targets = [];
    for (const [index, entry] of entries.entries()) {
      const { body } = entry;
      const dx = body.position.x - x, dz = body.position.z - z;
      const distance = Math.hypot(dx, dz);
      if (!Number.isFinite(distance) || !Number.isFinite(body.position.y) || distance >= 8.5 || body.position.y >= TANK.rim - 1.3 ||
          (entry.landedAt === null && world.time - entry.born < 2)) continue;
      targets.push({ entry, born: entry.born, post: entry.post, distance, dx, dz, index });
    }
    if (!targets.length) return 0;
    targets.sort((a, b) => a.distance - b.distance);
    if (waves.length >= 3) waves.shift();
    waves.push({ targets, elapsed: 0, next: 0 });
    shockwaves++;
    return targets.length;
  }
  function launch(post, { mode = 'pressure', fresh = false, skipProtected = false, speed = 2.1 } = {}) {
    const eligible = entries.filter(e => world.time > e.protectedUntil);
    if (skipProtected && !eligible.length) return null;
    // Retire the oldest capsule regardless of color; only its replacement gets the new side.
    const item = (eligible.length ? eligible : entries).reduce((oldest, e) =>
      e.born < oldest.born || (e.born === oldest.born && e.body.position.y < oldest.body.position.y) ? e : oldest);
    if (mode === 'pressure') {
      const pose = nozzlePose(post.side);
      item.body.position.set(...pose.mouth);
      item.body.velocity.set(...pose.launchDirection.map(value => value * speed));
    } else {
      item.body.position.set((random() - 0.5) * (TANK.width - RADIUS * 2 - 0.4), TANK.rim - RADIUS - 0.08, (random() - 0.5) * (TANK.depth - RADIUS * 2 - 0.4));
      item.body.velocity.set((random() - 0.5) * 0.35, -0.4, 0);
    }
    item.body.quaternion.setFromEuler(random() * 6, random() * 6, random() * 6);
    item.body.previousPosition.copy(item.body.position);
    item.body.interpolatedPosition.copy(item.body.position);
    item.body.previousQuaternion.copy(item.body.quaternion);
    item.body.interpolatedQuaternion.copy(item.body.quaternion);
    item.body.angularVelocity.set((random() - 0.5) * 2, (random() - 0.5) * 2, (random() - 0.5) * 2);
    item.body.force.setZero(); item.body.torque.setZero(); item.body.aabbNeedsUpdate = true;
    item.body.wakeUp();
    Object.assign(item, { post, visualSide: post.side, born: world.time, fresh, landedAt: null, openedAt: null, revealed: false, protectedUntil: world.time + (fresh ? 16 : 5) });
    exchanges++;
    return item;
  }
  function stats() {
    const bodies = entries.map(e => e.body);
    return { bodies: world.bodies.length, physicalCapsules: entries.length, sleeping: bodies.filter(b => b.sleepState === CANNON.Body.SLEEPING).length,
      contacts: world.contacts.filter(c => c.bi.mass > 0 && c.bj.mass > 0).length, seconds: Number(world.time.toFixed(3)), exchanges, shockwaves,
      finite: bodies.every(b => [b.position.x, b.position.y, b.position.z, b.quaternion.w].every(Number.isFinite)),
      minY: Number(Math.min(...bodies.map(b => b.position.y)).toFixed(3)), maxY: Number(Math.max(...bodies.map(b => b.position.y)).toFixed(3)) };
  }
  return { world, entries, step, settle, launch, shockwave, stats, takeCollision() { const event = collisionEvent; collisionEvent = null; return event; } };
}
