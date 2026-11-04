import * as CANNON from '../vendor/cannon-es.js';
import { TANK, RADIUS } from './physics.js';

export const OUTPUT_CAPACITY = 24;
export const ROLL_SPEED = 12.8;
export const OUTLET = Object.freeze({ x: 0, y: TANK.bottom + 0.45, z: 2.45 });
export const SLIDE = Object.freeze({ points: [
  [2.2, -0.08, 1.4], [2.55, -0.16, 1.5], [2.95, -0.35, 1.6],
  [3.4, -0.6, 1.7], [3.95, -0.9, 1.9], [4.45, -1.2, 2.05], [5.2, -1.35, 2.2],
].map(([z, y, width]) => [z, TANK.bottom + y, width]) });
export const TRAY = Object.freeze({ y: TANK.bottom - 1.47, frontY: TANK.bottom - 2.12, back: 5.1, front: 10.8, backWidth: 2.8, frontWidth: 10.0 });

export function createDispenserPhysics({ seed = 73, trayWidth = TRAY.frontWidth } = {}) {
  const trayBarrierGroup = 1 << (OUTPUT_CAPACITY + 1);
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const between = (min, max) => min + random() * (max - min);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0), allowSleep: true });
  world.defaultContactMaterial.friction = 0.32;
  world.defaultContactMaterial.restitution = 0.3;
  function surface(size, position, rotation = [0, 0, 0]) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(...size.map(value => value / 2))) });
    body.position.set(...position); body.quaternion.setFromEuler(...rotation);
    world.addBody(body);
    return body;
  }
  for (let i = 1; i < SLIDE.points.length; i++) {
    const [az, ay, aw] = SLIDE.points[i - 1], [bz, by, bw] = SLIDE.points[i];
    const angle = Math.atan2(ay - by, bz - az);
    surface([(aw + bw) / 2, 0.16, Math.hypot(bz - az, by - ay) + 0.03],
      [0, (ay + by) / 2 - Math.cos(angle) * 0.08, (az + bz) / 2 - Math.sin(angle) * 0.08], [angle, 0, 0]);
  }
  const depth = TRAY.front - TRAY.back, flare = (TRAY.frontWidth - TRAY.backWidth) / 2;
  const slope = Math.atan2(TRAY.y - TRAY.frontY, depth);
  const trayFloor = surface([TRAY.frontWidth, 0.24, Math.hypot(depth, TRAY.y - TRAY.frontY)], [0, (TRAY.y + TRAY.frontY) / 2, (TRAY.back + TRAY.front) / 2], [slope, 0, 0]);
  const bumper = surface([TRAY.frontWidth, 3, 0.16], [0, TRAY.frontY + 1.1, TRAY.front]);
  surface([2.3, 3, 0.16], [0, OUTLET.y, OUTLET.z - 0.62]);
  const trayRails = [];
  for (const sign of [-1, 1]) {
    const angle = sign * Math.atan2(flare, depth);
    trayRails.push(surface([0.16, 3, Math.hypot(depth, flare) + 0.12], [sign * (TRAY.frontWidth + TRAY.backWidth) / 4, (TRAY.y + TRAY.frontY) / 2 + 1.1, (TRAY.front + TRAY.back) / 2], [0, angle, 0]));
    surface([0.15, 5, 3.1], [sign * 1.17, TANK.bottom - 0.1, 3.65]);
  }
  // Keep rolling capsules contained, but let opened shells clear the low visible rim.
  for (const barrier of [bumper, ...trayRails]) barrier.collisionFilterGroup = trayBarrierGroup;
  function resizeBox(body, x, y, z) {
    body.removeShape(body.shapes[0]);
    body.addShape(new CANNON.Box(new CANNON.Vec3(x / 2, y / 2, z / 2)));
    body.aabbNeedsUpdate = true;
  }
  function setTrayWidth(width) {
    trayWidth = width;
    const flare = (width - TRAY.backWidth) / 2;
    resizeBox(trayFloor, width, 0.24, Math.hypot(depth, TRAY.y - TRAY.frontY));
    resizeBox(bumper, width, 3, 0.16);
    trayRails.forEach((rail, index) => {
      const sign = index === 0 ? -1 : 1;
      rail.position.x = sign * (width + TRAY.backWidth) / 4;
      rail.quaternion.setFromEuler(0, sign * Math.atan2(flare, depth), 0);
      resizeBox(rail, 0.16, 3, Math.hypot(depth, flare) + 0.12);
    });
    world.broadphase.dirty = true;
  }
  if (trayWidth !== TRAY.frontWidth) setTrayWidth(trayWidth);
  const bodies = Array.from({ length: OUTPUT_CAPACITY }, () => new CANNON.Body({ mass: 0.7, shape: new CANNON.Sphere(RADIUS), linearDamping: 0.035, angularDamping: 0.06 }));
  const active = Array(OUTPUT_CAPACITY).fill(false), contacts = Array(OUTPUT_CAPACITY).fill(0), age = Array(OUTPUT_CAPACITY).fill(0);
  const impacts = Array(OUTPUT_CAPACITY).fill(null);
  const fragments = Array(OUTPUT_CAPACITY).fill(null);
  let capsuleContacts = 0;
  bodies.forEach((body, index) => body.addEventListener('collide', event => {
    contacts[index]++;
    if (event.body.mass > 0) capsuleContacts++;
    const speed = Math.abs(event.contact.getImpactVelocityAlongNormal());
    const inTray = body.position.z > TRAY.back + 0.4;
    if (!impacts[index] && inTray && speed > 2.2) {
      impacts[index] = { elapsed: age[index], speed, x: body.position.x, z: body.position.z, target: event.body === bumper ? 'bumper' : event.body.mass > 0 ? 'capsule' : 'tray' };
    }
  }));
  function reset(index, rollSpeed = ROLL_SPEED) {
    const body = bodies[index];
    release(index);
    body.type = CANNON.Body.DYNAMIC;
    const speed = rollSpeed * between(0.78, 1.16);
    body.mass = between(0.55, 0.9); body.updateMassProperties();
    body.position.set(between(-0.3, 0.3), OUTLET.y + between(0, 0.12), OUTLET.z);
    body.velocity.set(between(-1.8, 1.8), between(-1.4, -0.5), speed);
    body.angularVelocity.set(speed / RADIUS * between(0.7, 1.15), between(-5, 5), between(-4, 4));
    body.quaternion.setFromEuler(between(-3, 3), between(-3, 3), between(-3, 3));
    body.previousPosition.copy(body.position); body.interpolatedPosition.copy(body.position);
    body.previousQuaternion.copy(body.quaternion); body.interpolatedQuaternion.copy(body.quaternion);
    body.force.setZero(); body.torque.setZero(); body.aabbNeedsUpdate = true; body.wakeUp();
    contacts[index] = 0; age[index] = 0; impacts[index] = null; active[index] = true; world.addBody(body);
    return body;
  }
  function positionPair(indexes, progress) {
    const scaled = Math.max(0, Math.min(1, progress)) * (SLIDE.points.length - 1);
    const segment = Math.min(SLIDE.points.length - 2, Math.floor(scaled));
    const local = scaled - segment;
    const [fromZ, fromY] = SLIDE.points[segment], [toZ, toY] = SLIDE.points[segment + 1];
    const z = fromZ + (toZ - fromZ) * local;
    const y = fromY + (toY - fromY) * local + RADIUS + 0.12;
    const rub = Math.sin(progress * Math.PI * 7);
    indexes.forEach((index, side) => {
      const body = bodies[index], sign = side ? 1 : -1;
      body.type = CANNON.Body.KINEMATIC;
      body.position.set(sign * (0.39 + rub * 0.055), y + sign * rub * 0.055, z + sign * rub * 0.13);
      body.velocity.setZero(); body.angularVelocity.setZero();
      body.quaternion.setFromEuler(progress * 15 + sign * rub * 0.12, 0, sign * (0.2 + rub * 0.22));
      body.previousPosition.copy(body.position); body.interpolatedPosition.copy(body.position);
      body.previousQuaternion.copy(body.quaternion); body.interpolatedQuaternion.copy(body.quaternion);
      body.aabbNeedsUpdate = true;
    });
  }
  function releasePair(indexes) {
    indexes.forEach((index, side) => {
      const body = bodies[index];
      body.type = CANNON.Body.DYNAMIC; body.updateMassProperties();
      body.velocity.set(side ? 0.75 : -0.75, -1, 4.5);
      body.angularVelocity.set(9, 0, side ? -2 : 2);
      body.wakeUp();
    });
  }
  function release(index) {
    if (active[index]) {
      if (fragments[index]) Object.values(fragments[index]).forEach(body => world.removeBody(body));
      else world.removeBody(bodies[index]);
      active[index] = false;
    }
    fragments[index] = null;
  }
  function breakApart(index, reduced = false) {
    if (fragments[index]) return fragments[index];
    const source = bodies[index], parts = {};
    world.removeBody(source);
    for (const name of ['top', 'bottom']) {
      const lid = name === 'top', sign = index % 2 ? -1 : 1;
      const group = 1 << (index + 1);
      const part = new CANNON.Body({ mass: lid ? 0.15 : 0.5, shape: new CANNON.Box(new CANNON.Vec3(0.44, 0.24, 0.44)), linearDamping: 0.12, angularDamping: 0.4, fixedRotation: false, sleepSpeedLimit: 0.2, sleepTimeLimit: 0.7, collisionFilterGroup: group, collisionFilterMask: ~(group | trayBarrierGroup) });
      // Fragment centres match the rotated hemisphere offsets used by the renderer.
      part.quaternion.copy(source.quaternion);
      const axis = source.quaternion.vmult(new CANNON.Vec3(0, lid ? 1 : -1, 0));
      source.position.vadd(axis.scale(0.24), part.position);
      part.velocity.copy(source.velocity.scale(0.2));
      part.velocity.vadd(axis.scale(lid ? 2.2 : 1.1), part.velocity);
      const topAxis = source.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      const outward = (Math.abs(topAxis.x) > 0.15 ? Math.sign(topAxis.x) : sign) * (lid ? 1 : -1);
      part.velocity.x = outward * Math.max(7, (trayWidth / 2 + RADIUS * 2 - outward * part.position.x) / 0.4);
      part.velocity.y = Math.max(3, part.velocity.y);
      part.angularVelocity.copy(source.angularVelocity.scale(0.35));
      if (lid) part.angularVelocity.vadd(new CANNON.Vec3(between(-2, 2), between(-2, 2), sign * 2), part.angularVelocity);
      if (reduced) { if (lid) part.position.x += sign * 0.9; part.velocity.setZero(); part.angularVelocity.setZero(); }
      else { part.addEventListener('collide', event => { if (event.body.mass > 0) capsuleContacts++; }); world.addBody(part); }
      parts[name] = part;
    }
    fragments[index] = parts;
    return parts;
  }
  function step(delta) {
    const elapsed = Math.min(delta, 0.05);
    world.step(1 / 120, elapsed, 6);
    active.forEach((value, i) => {
      if (!value) return;
      age[i] += elapsed;
      const body = bodies[i];
      // A lid can knock a rolling capsule into a rail seam. Resume its downhill roll.
      if (!fragments[i] && !impacts[i] && body.sleepState === CANNON.Body.SLEEPING && body.position.z <= TRAY.back + 0.4) {
        body.wakeUp(); body.velocity.z = ROLL_SPEED * 0.5; body.angularVelocity.x = body.velocity.z / RADIUS;
      }
    });
  }
  function ready(index) {
    const body = bodies[index];
    if (active[index] && !fragments[index] && !impacts[index] && body.sleepState === CANNON.Body.SLEEPING && body.position.z > TRAY.back && contacts[index] > 0) {
      impacts[index] = { elapsed: age[index], speed: 0, x: body.position.x, z: body.position.z, target: 'settled' };
    }
    return active[index] && !fragments[index] && impacts[index] !== null;
  }
  function inletClear() { return bodies.every((body, i) => !active[i] || body.position.z > OUTLET.z + 0.75 || body.position.y < OUTLET.y - 0.8); }
  function stats(index) {
    const body = fragments[index]?.bottom ?? bodies[index];
    return body ? { elapsed: age[index], contacts: contacts[index], x: body.position.x, y: body.position.y, z: body.position.z, speed: body.velocity.length(), impact: impacts[index], fragments: fragments[index] ? 2 : 0 } : null;
  }
  return { world, bodies, reset, release, positionPair, releasePair, breakApart, step, ready, inletClear, stats, setTrayWidth, capsuleContacts: () => capsuleContacts };
}
