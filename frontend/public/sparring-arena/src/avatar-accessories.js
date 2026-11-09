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

// Keep the hair outside the scalp below the brim, then tuck the crown inside
// the smallest hat band. Compressing both into the same narrow cylinder exposes skin.
function fittedHair(source) {
  const geometry = source.clone(), positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    if (y <= 0.02) continue;
    const t = THREE.MathUtils.clamp((y - 0.02) / 0.13, 0, 1);
    const blend = t * t * (3 - 2 * t);
    const tuckedHeight = Math.min(y, 0.12 + Math.max(0, y - 0.12) * 0.46);
    const height = THREE.MathUtils.lerp(y, tuckedHeight, blend);
    const x = positions.getX(index), z = positions.getZ(index) + 0.025;
    const radius = Math.hypot(x / 0.35, z / 0.315);
    const factor = THREE.MathUtils.lerp(1, Math.min(1, 1 / Math.max(radius, 0.001)), blend);
    positions.setXYZ(index, x * factor, height, z * factor - 0.025);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createAvatarAccessories(hairSculpt) {
  const bucket = band([[0, 0.202], [0.395, 0.202], [0.402, 0.210], [0.395, 0.229],
    [0.329, 0.471], [0.322, 0.490], [0.309, 0.501], [0.28, 0.505], [0, 0.505]]);
  const geometry = {
    avatarCapCrown: dome([0.405, 0.31, 0.355], [0, 0.20, -0.025]),
    avatarCapBrim: volume([0.37, 0.027, 0.29], [0, 0.21, 0.33]),
    avatarBucketCrown: bucket,
    avatarBucketBrim: band([[0.385, 0.225], [0.404, 0.22], [0.447, 0.19], [0.484, 0.158],
      [0.502, 0.142], [0.503, 0.133], [0.495, 0.128], [0.483, 0.133],
      [0.443, 0.164], [0.402, 0.194], [0.385, 0.20], [0.385, 0.225]].reverse()),
    avatarBeanieCrown: dome([0.40, 0.39, 0.35], [0, 0.20, -0.025]),
    avatarBeanieCuff: band([[0.375, 0.18], [0.396, 0.18], [0.412, 0.188], [0.418, 0.204],
      [0.418, 0.264], [0.412, 0.282], [0.398, 0.289], [0.380, 0.281], [0.375, 0.26], [0.375, 0.18]]),
    avatarBeretCrown: volume([0.46, 0.18, 0.38], [0.035, 0.35, -0.025], -0.13),
    avatarBeretBand: band([[0.36, 0.18], [0.39, 0.19], [0.39, 0.24], [0.36, 0.25], [0.36, 0.18]]),
  };
  for (const name of ['avatarCurly', 'avatarParted', 'avatarBob', 'avatarLong', 'avatarFlowing']) {
    geometry[`${name}WithHat`] = fittedHair(hairSculpt[name]);
  }
  return geometry;
}
