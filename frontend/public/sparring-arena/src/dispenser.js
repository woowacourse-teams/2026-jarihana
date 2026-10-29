import * as THREE from 'three';
import { createCapsuleBatch } from './capsule-batch.js';
import { createDispenserPhysics, OUTPUT_CAPACITY, SLIDE, TRAY } from './dispenser-physics.js';
import { TANK, RADIUS } from './physics.js';
import { studioMaterial } from './studio-materials.js';
import { characterPose, characterVariant } from './character-motion.js';
import { createWalkingCharacters } from './walking-characters.js';

const VISIBLE_LIMIT = 4;
const SHELL_LIFETIME = 2.5, SHELL_FADE = 0.35;
const PAIR_SLIDE_SECONDS = 1.4;
const OPEN_SHELL_POSE = { stage: 'empty-shell', scale: 1, shrink: 1, closing: 0 };

export function createDispenser(scene, onReveal, { onOpened = () => {} } = {}) {
  const cream = studioMaterial({ color: 0xf5efe2, roughness: 0.65, side: THREE.DoubleSide });
  const rim = studioMaterial({ color: 0xd9e8dd, roughness: 0.5 });
  function box(size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); mesh.receiveShadow = true; scene.add(mesh);
    return mesh;
  }
  box([TANK.width + 0.3, 0.15, TANK.depth + 0.2], [0, TANK.bottom - 0.08, 0], rim);
  function floor(points) {
    const vertices = [], indices = [];
    for (const [z, y, width] of points) vertices.push(-width / 2, y, z, width / 2, y, z);
    for (let i = 0; i < points.length - 1; i++) {
      const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, cream); mesh.receiveShadow = true; scene.add(mesh);
  }
  floor(SLIDE.points);
  floor([[TRAY.back, TRAY.y + 0.12, TRAY.backWidth], [TRAY.front, TRAY.frontY + 0.12, TRAY.frontWidth]]);
  for (const side of [-1, 1]) {
    const points = SLIDE.points.map(([z, y, width]) => new THREE.Vector3(side * width / 2, y + 0.12, z));
    points.push(new THREE.Vector3(side * TRAY.backWidth / 2, TRAY.y + 0.24, TRAY.back));
    points.push(new THREE.Vector3(side * TRAY.frontWidth / 2, TRAY.frontY + 0.24, TRAY.front));
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 56, 0.09, 8, false), rim);
    rail.castShadow = true; scene.add(rail);
  }
  box([TRAY.frontWidth, 0.32, 0.16], [0, TRAY.frontY + 0.16, TRAY.front], rim);
  const batch = createCapsuleBatch(scene, OUTPUT_CAPACITY, createWalkingCharacters), physics = createDispenserPhysics();
  const slots = Array(OUTPUT_CAPACITY).fill(null);
  for (let i = 0; i < OUTPUT_CAPACITY; i++) batch.hide(i);
  let opened = 0, serial = 0, latest = null, pair = null;
  const busy = () => slots.some(entry => entry && (entry.phase !== 'open' || entry.elapsed < 1.8));
  function available(priority = false) {
    if (slots.filter(Boolean).length < VISIBLE_LIMIT) return slots.findIndex(entry => entry === null);
    if (!priority) return -1;
    let candidate = -1;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]?.phase === 'open' && slots[i].elapsed > 2 && (candidate < 0 || slots[i].born < slots[candidate].born)) candidate = i;
    }
    return candidate;
  }
  function clear(index) {
    const entry = slots[index];
    if (entry === latest) latest = null;
    slots[index] = null; physics.release(index); batch.hide(index);
  }
  function clearAll() { pair = null; for (let index = 0; index < slots.length; index++) clear(index); }
  function reveal(entry) {
    if (entry.revealed) return;
    entry.revealed = true; entry.openedAt = 0; opened++;
    const keepPersonal = latest?.post.name === '나' && latest.elapsed < 4 && entry.post.name !== '나';
    if (!keepPersonal) { latest = entry; onReveal(entry.post, entry.fresh); }
  }
  function start(selection, reduced = false, paired = false) {
    const index = available(selection?.fresh);
    if (index < 0 || !selection || (!paired && !reduced && !selection.fresh && !physics.inletClear())) return false;
    if (slots[index]) clear(index);
    const entry = { ...selection, body: physics.reset(index, selection.kind === 'history' ? 5.2 : undefined), born: ++serial, openedAt: null, dispensed: true, phase: 'rolling', elapsed: 0, revealed: false, reduced };
    slots[index] = entry;
    if (reduced) {
      for (let i = 0; i < 900 && !physics.ready(index); i++) physics.step(1 / 120);
      open(index, entry, true); batch.draw(index, entry, RADIUS / 0.48);
    } else batch.draw(index, entry, RADIUS / 0.48);
    return true;
  }
  function startPair(selections, reduced = false) {
    if (reduced || selections.length !== 2 || slots.filter(entry => !entry).length < 2 || slots.filter(Boolean).length > VISIBLE_LIMIT - 2) return false;
    const indexes = [];
    for (const selection of selections) {
      if (!start(selection, false, true)) { indexes.forEach(clear); return false; }
      indexes.push(slots.findIndex(entry => entry?.born === serial));
    }
    pair = { indexes, elapsed: 0 };
    physics.positionPair(indexes, 0);
    indexes.forEach(index => batch.draw(index, slots[index], RADIUS / 0.48));
    return true;
  }
  function open(index, entry, reduced) {
    if (entry.phase === 'open') return;
    const { x, y, z } = entry.body.position;
    entry.characterOrigin = { x, y: y - 0.34 * RADIUS / 0.48, z,
      floorY: TRAY.y + (TRAY.frontY - TRAY.y) * (z - TRAY.back) / (TRAY.front - TRAY.back) + 0.12 };
    entry.parts = physics.breakApart(index, reduced);
    entry.body = entry.parts.bottom;
    entry.phase = 'open'; entry.elapsed = 0; entry.reduced = reduced;
    entry.characterPose = OPEN_SHELL_POSE; entry.shellScale = 1;
    onOpened(entry);
    if (reduced) reveal(entry);
  }
  function step(delta, reduced = false) {
    if (slots.every(entry => !entry)) return;
    if (pair) {
      pair.elapsed += delta;
      const progress = Math.min(1, pair.elapsed / PAIR_SLIDE_SECONDS);
      physics.positionPair(pair.indexes, progress * progress);
      if (reduced || pair.elapsed >= PAIR_SLIDE_SECONDS) {
        physics.releasePair(pair.indexes);
        pair = null;
      }
    }
    if (!reduced) physics.step(delta);
    for (let index = 0; index < slots.length; index++) {
      const entry = slots[index];
      if (!entry) continue;
      entry.elapsed += delta;
      entry.reduced = reduced;
      if (entry.phase === 'rolling' && !pair?.indexes.includes(index) && (reduced || physics.ready(index))) open(index, entry, reduced);
      else if (entry.phase === 'open' && entry.elapsed >= SHELL_LIFETIME) { clear(index); continue; }
      if (entry.phase === 'open') {
        entry.shellScale = reduced ? 1 : Math.max(0, Math.min(1, (SHELL_LIFETIME - entry.elapsed) / SHELL_FADE));
        if (reduced || entry.elapsed >= 0.42) reveal(entry);
      } else entry.characterPose = characterPose({ ...entry, mine: entry.post.name === '나' });
      batch.draw(index, entry, RADIUS / 0.48);
    }
  }
  function pick(event, canvas, camera) {
    const index = batch.pick(event, canvas, camera), entry = index === null ? null : slots[index];
    if (!entry?.revealed) return false;
    latest = entry; onReveal(entry.post, entry.fresh); return true;
  }
  function phase() {
    if (slots.some(entry => entry?.phase === 'rolling')) return 'rolling';
    return latest ? 'open' : 'idle';
  }
  function stats() {
    const active = slots.filter(Boolean), index = slots.findIndex(entry => entry && entry.phase !== 'open');
    return { dispenserPhase: phase(), dispenserOpened: opened, dispenserPostId: latest?.post.id ?? null,
      dispenserPhysics: index >= 0 ? physics.stats(index) : latest ? physics.stats(slots.indexOf(latest)) : null,
      outputCapsules: active.length, outputContacts: physics.capsuleContacts(), outputRolling: active.filter(entry => entry.phase === 'rolling').length, outputCapacity: OUTPUT_CAPACITY, outputLimit: VISIBLE_LIMIT,
      characters: active.map(entry => ({ postId: entry.post.id, variant: characterVariant(entry.post), fresh: entry.fresh, stage: entry.characterPose?.stage ?? 'bracing', elapsed: entry.elapsed, scale: entry.characterPose?.scale ?? 0.31 })) };
  }
  return { start, startPair, step, busy, pick, clearAll, outputs: () => slots.filter(Boolean), readyForNext: (priority, reduced = false) => available(priority) >= 0 && (reduced || (!slots.some(entry => entry?.phase === 'rolling') && physics.inletClear())), entries: () => slots.filter(entry => entry?.revealed).sort((a, b) => Number(b.fresh && b.elapsed < 5) - Number(a.fresh && a.elapsed < 5) || b.born - a.born).slice(0, 4), stats };
}
