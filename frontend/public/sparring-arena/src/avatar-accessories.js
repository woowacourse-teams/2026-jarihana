import * as THREE from 'three';

function dome(scale, position) {
  const geometry = new THREE.SphereGeometry(1, 36, 22, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.scale(...scale); geometry.translate(...position);
  return geometry;
}

function volume(scale, position, tilt = 0) {
  const geometry = new THREE.SphereGeometry(1, 32, 20);
  geometry.scale(...scale); geometry.rotateZ(tilt); geometry.translate(...position);
  return geometry;
}

function band(points) {
  const geometry = new THREE.LatheGeometry(points.map(([radius, height]) => new THREE.Vector2(radius, height)), 48);
  geometry.scale(1, 1, 0.9); geometry.translate(0, 0, -0.025);
  return geometry;
}

// Tuck the upper hair into the space shared by all four hats. Finish the smooth
// transition below their lowest brim so no triangle can cross a hat's surface.
function fittedHair(source) {
  const geometry = source.clone(), positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    if (y <= -0.02) continue;
    const t = THREE.MathUtils.clamp((y + 0.02) / 0.10, 0, 1);
    const blend = t * t * (3 - 2 * t);
    const tuckedHeight = Math.min(y, 0.04 + Math.max(0, y - 0.04) * 0.38);
    const height = THREE.MathUtils.lerp(y, tuckedHeight, blend);
    const x = positions.getX(index), z = positions.getZ(index) + 0.025;
    const radius = Math.hypot(x / 0.29, z / 0.245);
    const factor = THREE.MathUtils.lerp(1, Math.min(1, 1 / Math.max(radius, 0.001)), blend);
    positions.setXYZ(index, x * factor, height, z * factor - 0.025);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createAvatarAccessories(hairSculpt) {
  const bucket = new THREE.CylinderGeometry(0.32, 0.405, 0.31, 48, 3);
  bucket.scale(1, 1, 0.9); bucket.translate(0, 0.36, -0.025);
  const geometry = {
    avatarCapCrown: dome([0.405, 0.31, 0.355], [0, 0.20, -0.025]),
    avatarCapBrim: volume([0.37, 0.027, 0.29], [0, 0.21, 0.33]),
    avatarBucketCrown: bucket,
    avatarBucketBrim: band([[0.39, 0.23], [0.49, 0.17], [0.505, 0.145], [0.49, 0.125], [0.385, 0.19], [0.39, 0.23]]),
    avatarBeanieCrown: dome([0.40, 0.39, 0.35], [0, 0.20, -0.025]),
    avatarBeanieCuff: band([[0.375, 0.18], [0.415, 0.19], [0.418, 0.27], [0.40, 0.29], [0.375, 0.26], [0.375, 0.18]]),
    avatarBeretCrown: volume([0.46, 0.18, 0.38], [0.035, 0.35, -0.025], -0.13),
    avatarBeretBand: band([[0.36, 0.18], [0.39, 0.19], [0.39, 0.24], [0.36, 0.25], [0.36, 0.18]]),
  };
  for (const name of ['avatarCurly', 'avatarParted', 'avatarBob', 'avatarLong', 'avatarFlowing']) {
    geometry[`${name}WithHat`] = fittedHair(hairSculpt[name]);
  }
  return geometry;
}
