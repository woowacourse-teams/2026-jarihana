import * as CANNON from '../vendor/cannon-es.js';

export const CAPACITY = 240;
export const RADIUS = 0.5;
export const TANK = Object.freeze({ width: 18, depth: 4.4, bottom: -4.4, rim: 4.4 });

// Rendering and physics share the actual pipe mouth, not an approximate launch point.
export function nozzlePose(side) {
  const sign = side === 'a' ? -1 : 1;
  return { mouth: [sign * (TANK.width / 2 - 0.7), 3.2, 0.12], direction: [-sign * 0.965, -0.15, 0.215] };
}

export function createCapsulePhysics({ capacity = CAPACITY, seed = 19 } = {}) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -10, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 8;
  world.defaultContactMaterial.friction = 0.48;
  world.defaultContactMaterial.restitution = 0.16;
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
  let exchanges = 0;
  function step(delta) { world.step(1 / 120, Math.min(delta, 0.05), 6); }
  function settle(seconds = 2.4) { for (let i = 0; i < seconds * 120; i++) world.step(1 / 120); }
  function launch(post, { mode = 'pressure', fresh = false, skipProtected = false, speed = 2.1 } = {}) {
    const sameSide = entries.filter(e => e.visualSide === post.side);
    const pool = sameSide.length ? sameSide : entries;
    const eligible = pool.filter(e => world.time > e.protectedUntil);
    if (skipProtected && !eligible.length) return null;
    const item = (eligible.length ? eligible : pool).reduce((lowest, e) => e.body.position.y < lowest.body.position.y ? e : lowest);
    if (mode === 'pressure') {
      const pose = nozzlePose(post.side);
      item.body.position.set(...pose.mouth);
      item.body.velocity.set(...pose.direction.map(value => value * speed));
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
    Object.assign(item, { post, born: world.time, fresh, landedAt: null, openedAt: null, revealed: false, protectedUntil: world.time + (fresh ? 16 : 5) });
    exchanges++;
    return item;
  }
  function stats() {
    const bodies = entries.map(e => e.body);
    return { bodies: world.bodies.length, physicalCapsules: entries.length, sleeping: bodies.filter(b => b.sleepState === CANNON.Body.SLEEPING).length,
      contacts: world.contacts.filter(c => c.bi.mass > 0 && c.bj.mass > 0).length, seconds: Number(world.time.toFixed(3)), exchanges,
      finite: bodies.every(b => [b.position.x, b.position.y, b.position.z, b.quaternion.w].every(Number.isFinite)),
      minY: Number(Math.min(...bodies.map(b => b.position.y)).toFixed(3)), maxY: Number(Math.max(...bodies.map(b => b.position.y)).toFixed(3)) };
  }
  return { world, entries, step, settle, launch, stats, takeCollision() { const event = collisionEvent; collisionEvent = null; return event; } };
}
