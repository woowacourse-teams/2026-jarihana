import * as THREE from 'three';

function turned(points) {
  return new THREE.LatheGeometry(points.map(point => new THREE.Vector2(...point)), 40);
}

export function createAvatarHandheldShapes() {
  const straw = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.018, 0.09, 0.05), new THREE.Vector3(0.018, 0.21, 0.05), new THREE.Vector3(0.052, 0.25, 0.05),
  ]), 20, 0.007, 8, false);
  return {
    avatarHotCup: turned([[0, -0.08], [0.040, -0.08], [0.045, -0.076], [0.061, 0.074],
      [0.062, 0.079], [0.060, 0.082], [0, 0.082]]),
    avatarHotLid: turned([[0, -0.009], [0.063, -0.009], [0.068, -0.006], [0.069, 0],
      [0.067, 0.005], [0.060, 0.006], [0.058, 0.016], [0.054, 0.020], [0, 0.020]]),
    avatarCupSleeve: new THREE.CylinderGeometry(0.057, 0.050, 0.064, 28),
    avatarColdCup: turned([[0, -0.105], [0.040, -0.105], [0.045, -0.099], [0.065, 0.100],
      [0.065, 0.105], [0.062, 0.105], [0.042, -0.096], [0, -0.096]]),
    avatarColdLid: turned([[0, -0.006], [0.067, -0.006], [0.071, -0.003], [0.072, 0.002],
      [0.069, 0.007], [0.062, 0.009], [0, 0.009]]),
    avatarCoffeeFill: new THREE.CylinderGeometry(0.056, 0.041, 0.16, 28),
    avatarStraw: straw,
  };
}
