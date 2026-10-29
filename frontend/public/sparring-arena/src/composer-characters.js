import * as THREE from 'three';
import { createCapsuleBatch } from './capsule-batch.js';
import { createWalkingCharacters } from './walking-characters.js';
import { NOZZLE_LENGTH_RATIO, NOZZLE_DEPTH, NOZZLE_HORIZONTAL } from './pipe-surfaces.js';

const CAPACITY = 24;
const PACK_SECONDS = 0.35;
const SUCTION_SECONDS = 0.18;
const CHARACTER_HEIGHT = 2.1;
const CAPSULE_DIAMETER = 0.96;
const sides = ['a', 'b'];
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const lerp = (from, to, amount) => from + (to - from) * amount;

function snapshotRoute(route) {
  if (!route?.getTotalLength || !route?.getPointAtLength) return null;
  const length = route.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) return null;
  const count = Math.max(32, Math.min(240, Math.ceil(length / 6)));
  const points = Array.from({ length: count + 1 }, (_, index) => {
    const point = route.getPointAtLength(length * index / count);
    return { x: point.x, y: point.y };
  });
  if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  return { points, length };
}

function validRect(rect) {
  return rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]))
    && rect.width > 0 && rect.height > 0;
}

/** Owns only its models; the caller owns the scene, lights, renderer and frame loop. */
export function createComposerCharacters(scene, pixel) {
  const group = new THREE.Group();
  group.name = 'composer-characters';
  scene.add(group);
  const standing = createWalkingCharacters(group, 2);
  const firstFlightMesh = group.children.length;
  const capsules = createCapsuleBatch(group, CAPACITY, createWalkingCharacters);
  const flightGroup = new THREE.Group();
  flightGroup.name = 'composer-shipments';
  for (const mesh of group.children.slice(firstFlightMesh)) flightGroup.add(mesh);
  flightGroup.visible = false;
  group.add(flightGroup);
  const shipments = Array(CAPACITY).fill(null);
  const standingStates = [null, null];
  let layout = [], disposed = false, sequence = 0, activeShipments = 0;
  for (let index = 0; index < CAPACITY; index++) capsules.hide(index);
  for (let index = 0; index < 2; index++) standing.hide(index);

  function drawStanding() {
    if (disposed) return;
    for (let index = 0; index < sides.length; index++) {
      const side = sides[index], entry = layout.find(item => item.side === side);
      const packing = shipments.some(item => item?.post.side === side && item.elapsed < PACK_SECONDS);
      if (!entry || packing) {
        if (standingStates[index]) { standing.hide(index); standingStates[index] = null; }
        continue;
      }
      const avatar = entry.avatar;
      const position = pixel(avatar.x + avatar.width / 2, avatar.y + avatar.height, 30);
      const size = avatar.height / CHARACTER_HEIGHT, memberType = entry.memberType ?? 'CREW', active = Boolean(entry.active);
      const previous = standingStates[index];
      if (previous?.position.equals(position) && previous.size === size && previous.memberType === memberType && previous.active === active) continue;
      standing.draw(index, { side, memberType }, position, size,
        { scale: 1, shrink: 1, stride: 0, crouch: 0, rightArm: active ? -0.3 : 0, lean: 0 },
        side === 'a' ? 0.15 : -0.15);
      standingStates[index] = { position, size, memberType, active };
    }
  }

  function update(nextLayout) {
    if (disposed) return;
    layout = nextLayout.filter(entry => sides.includes(entry.side) && validRect(entry.avatar))
      .map(entry => ({ ...entry, avatar: { ...entry.avatar } }));
    drawStanding();
  }

  function clear(shipment, arrive) {
    if (shipments[shipment.slot] !== shipment) return;
    shipments[shipment.slot] = null;
    activeShipments--;
    flightGroup.visible = activeShipments > 0;
    capsules.hide(shipment.slot);
    if (arrive) shipment.onArrive?.();
  }

  function drawShipment(shipment) {
    const { origin, route, elapsed, diameter, body } = shipment;
    const center = { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 };
    let x = center.x, y = center.y, z = 30, size = diameter / CAPSULE_DIAMETER, opening = 0;
    let pose = { stage: 'packed', scale: 0.31, shrink: 1, lift: -0.34, crouch: 0.45, leftArm: -0.95, rightArm: -0.95 };
    if (elapsed < PACK_SECONDS) {
      const progress = smooth(elapsed / PACK_SECONDS);
      size = lerp(Math.max(diameter, origin.height * 0.95) / CAPSULE_DIAMETER, size, progress);
      const characterHeight = lerp(origin.height, diameter / CAPSULE_DIAMETER * CHARACTER_HEIGHT * 0.31, progress);
      pose = { ...pose, scale: characterHeight / CHARACTER_HEIGHT / size,
        lift: lerp(-characterHeight / 2 / size, -0.34, progress),
        crouch: progress * 0.45, leftArm: progress * -0.95, rightArm: progress * -0.95 };
      opening = 1 - progress;
    } else if (elapsed < PACK_SECONDS + SUCTION_SECONDS) {
      const progress = smooth((elapsed - PACK_SECONDS) / SUCTION_SECONDS);
      x = lerp(center.x, route.points[0].x, progress);
      y = lerp(center.y, route.points[0].y, progress);
      z = lerp(30, shipment.nozzleLength * NOZZLE_DEPTH, progress);
    } else {
      const progress = Math.min(1, (elapsed - PACK_SECONDS - SUCTION_SECONDS) / shipment.travelSeconds);
      const position = progress * (route.points.length - 1), index = Math.floor(position);
      const from = route.points[index], to = route.points[Math.min(index + 1, route.points.length - 1)];
      x = lerp(from.x, to.x, position - index); y = lerp(from.y, to.y, position - index);
      const throughNozzle = Math.min(1, progress * route.length / (shipment.nozzleLength * NOZZLE_HORIZONTAL));
      z = shipment.nozzleLength * NOZZLE_DEPTH * (1 - throughNozzle);
    }
    body.position.copy(pixel(x, y, z));
    capsules.draw(shipment.slot, { post: shipment.post, body, characterPose: pose }, size, opening);
  }

  function ship({ post, route, origin, diameter, onArrive }) {
    if (disposed) return () => {};
    let snapshot;
    try { snapshot = snapshotRoute(route); } catch { snapshot = null; }
    if (!snapshot || !validRect(origin) || !Number.isFinite(diameter) || diameter <= 0) {
      onArrive?.();
      return () => {};
    }
    let slot = shipments.findIndex(item => item === null);
    if (slot < 0) {
      const oldest = shipments.reduce((first, item) => item.sequence < first.sequence ? item : first);
      clear(oldest, true);
      slot = shipments.findIndex(item => item === null);
      // An arrival can synchronously enqueue another message.
      if (slot < 0 || disposed) { if (!disposed) onArrive?.(); return () => {}; }
    }
    const side = post?.side === 'b' ? 'b' : 'a';
    const shipment = {
      slot, sequence: sequence++, elapsed: 0, diameter, onArrive, route: snapshot,
      nozzleLength: (layout.find(entry => entry.side === side)?.diameter ?? diameter) * NOZZLE_LENGTH_RATIO,
      origin: { x: origin.x, y: origin.y, width: origin.width, height: origin.height },
      post: { ...post, side, memberType: post?.memberType ?? layout.find(entry => entry.side === side)?.memberType ?? 'CREW' },
      body: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
      travelSeconds: Math.max(0.7, Math.min(1, snapshot.length / 1000)),
    };
    shipments[slot] = shipment;
    activeShipments++;
    flightGroup.visible = true;
    drawShipment(shipment); drawStanding();
    return () => { if (!disposed) { clear(shipment, false); drawStanding(); } };
  }

  function step(delta) {
    if (disposed || activeShipments === 0) return;
    const seconds = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    let packingChanged = false;
    for (const shipment of [...shipments]) {
      if (!shipment || shipments[shipment.slot] !== shipment) continue;
      const wasPacking = shipment.elapsed < PACK_SECONDS;
      shipment.elapsed += seconds;
      if (wasPacking && shipment.elapsed >= PACK_SECONDS) packingChanged = true;
      if (shipment.elapsed >= PACK_SECONDS + SUCTION_SECONDS + shipment.travelSeconds) clear(shipment, true);
      else drawShipment(shipment);
    }
    if (packingChanged) drawStanding();
  }

  function finishAll() {
    if (disposed) return;
    for (const shipment of [...shipments]) if (shipment) clear(shipment, true);
    drawStanding();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const shipment of [...shipments]) if (shipment) clear(shipment, false);
    const geometries = new Set(), materials = new Set();
    group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of [object.material].flat()) materials.add(material);
      if (object.customDepthMaterial) materials.add(object.customDepthMaterial);
      if (object.customDistanceMaterial) materials.add(object.customDistanceMaterial);
      if (object.isInstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    group.removeFromParent();
  }

  return { update, step, ship, finishAll, dispose, needsFrame: () => !disposed && activeShipments > 0 };
}
