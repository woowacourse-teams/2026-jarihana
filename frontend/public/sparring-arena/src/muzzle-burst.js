import * as THREE from 'three';

// Local +Z points out of the barrel, so the burst follows every camera/view mode.
export function createMuzzleBurst(pipe, barrel, length, color) {
  const effect = new THREE.Group();
  effect.position.z = length / 2 + 0.08;
  effect.visible = false;
  pipe.add(effect);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.055, 6, 32), material);
  effect.add(ring);
  const geometry = new THREE.SphereGeometry(0.07, 6, 4);
  const sparks = Array.from({ length: 8 }, () => {
    const mesh = new THREE.Mesh(geometry, material);
    effect.add(mesh);
    return mesh;
  });
  let elapsed = Infinity;
  function step(delta, reduced = false) {
    elapsed = reduced ? Infinity : elapsed + delta;
    const progress = Math.min(1, elapsed / 0.32);
    const kick = progress < 0.2 ? Math.sin(progress / 0.2 * Math.PI / 2)
      : Math.pow((1 - progress) / 0.8, 2);
    barrel.position.z = -0.18 * kick;
    effect.visible = progress < 1;
    if (!effect.visible) return;
    material.opacity = 0.85 * (1 - progress);
    ring.scale.setScalar(1 + progress * 1.3);
    ring.position.z = progress * 0.65;
    sparks.forEach((spark, index) => {
      const angle = index * Math.PI / 4;
      const radius = 0.75 + progress * 0.85;
      spark.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, progress * 0.9);
      spark.scale.setScalar(1 - progress * 0.6);
    });
  }
  return {
    fire() { elapsed = 0; step(0); },
    step,
  };
}
