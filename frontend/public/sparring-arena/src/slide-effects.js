import * as THREE from 'three';

const COLORS = { a: 0x2ac1bc, b: 0xed6a5a };

// Pooled world-space particles stay on the slide when the camera moves.
export function createSlideEffects(scene) {
  const root = new THREE.Group();
  root.name = 'slide-effects';
  scene.add(root);
  const dot = new THREE.SphereGeometry(1, 8, 6);
  const star = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 4, radius = i % 2 ? 0.32 : 1;
    if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  star.closePath();
  const starGeometry = new THREE.ShapeGeometry(star);
  function material(color) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  }
  const trails = Array.from({ length: 32 }, () => {
    const mesh = new THREE.Mesh(dot, material(COLORS.a));
    mesh.visible = false; root.add(mesh);
    return { mesh, age: Infinity };
  });
  function burstPool(name, geometry, count) {
    return Array.from({ length: 8 }, () => {
      const group = new THREE.Group(), surface = material(0xffffff);
      group.name = name; group.visible = false;
      const pieces = Array.from({ length: count }, () => {
        const mesh = new THREE.Mesh(geometry, surface); group.add(mesh); return mesh;
      });
      root.add(group);
      return { group, surface, pieces, age: Infinity };
    });
  }
  const dust = burstPool('slide-rolling-dust', dot, 6);
  const sparkles = burstPool('slide-curve-sparkles', starGeometry, 5);
  const last = new Map(), lastDust = new Map();
  let clock = 0, nextTrail = 0, nextDust = 0, nextSparkle = 0;
  function trail(index, position, side) {
    const previous = last.get(index);
    if (previous && (clock - previous.time < 0.075 || previous.position.distanceTo(position) < 0.16)) return;
    last.set(index, { time: clock, position: new THREE.Vector3().copy(position) });
    const item = trails[nextTrail++ % trails.length];
    item.age = 0; item.mesh.visible = true;
    item.mesh.position.copy(position); item.mesh.material.color.setHex(COLORS[side] ?? COLORS.a);
    item.mesh.material.opacity = 0.38; item.mesh.scale.setScalar(0.12);
    if (clock - (lastDust.get(index) ?? -Infinity) >= 0.24) {
      lastDust.set(index, clock);
      show(dust, nextDust++, new THREE.Vector3(position.x, position.y, position.z - 0.15), 0xaebfc0, 'slide-rolling-dust');
    }
  }
  function show(pool, index, position, color, name, scale = 1) {
    const item = pool[index % pool.length];
    item.age = 0; item.group.visible = true; item.group.position.copy(position);
    item.group.name = name; item.group.scale.setScalar(scale);
    item.surface.color.setHex(color); item.surface.opacity = 0.65;
    step(0);
  }
  function step(delta, reduced = false) {
    if (reduced) { clear(); return; }
    clock += delta;
    for (const item of trails) {
      item.age += delta;
      const t = Math.min(1, item.age / 0.32);
      item.mesh.visible = t < 1;
      if (item.mesh.visible) { item.mesh.material.opacity = 0.38 * (1 - t); item.mesh.scale.setScalar(0.12 * (1 - t * 0.6)); }
    }
    for (const [pool, duration, isDust] of [[dust, 0.48, true], [sparkles, 0.6, false]]) {
      for (const item of pool) {
        item.age += delta;
        const t = Math.min(1, item.age / duration);
        item.group.visible = t < 1;
        if (!item.group.visible) continue;
        item.surface.opacity = (isDust ? 0.5 : 0.9) * (1 - t);
        item.pieces.forEach((piece, index) => {
          const angle = index * Math.PI * 2 / item.pieces.length;
          const radius = (isDust ? 0.3 : 0.45) + t * (isDust ? 0.8 : 0.5);
          piece.position.set(Math.cos(angle) * radius, isDust ? -0.32 + Math.sin(t * Math.PI) * 0.15 : 0.2 + Math.sin(angle) * radius + t * 0.3, isDust ? Math.sin(angle) * radius : 0.2);
          piece.scale.setScalar((isDust ? 0.13 + t * 0.1 : 0.17) * (1 - t * 0.65));
        });
      }
    }
  }
  function clear() {
    last.clear(); lastDust.clear();
    for (const item of trails) { item.age = Infinity; item.mesh.visible = false; }
    for (const item of [...dust, ...sparkles]) { item.age = Infinity; item.group.visible = false; }
  }
  return {
    trail, step, clear,
    forget(index) { last.delete(index); lastDust.delete(index); },
    bend(position, side) { show(sparkles, nextSparkle++, position, COLORS[side] ?? COLORS.a, 'slide-curve-sparkles', 0.55); },
  };
}
