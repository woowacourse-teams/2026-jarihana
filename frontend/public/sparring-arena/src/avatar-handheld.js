import * as THREE from 'three';

export function createAvatarHandheldShapes() {
  const straw = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.018, 0.09, 0.05), new THREE.Vector3(0.018, 0.21, 0.05), new THREE.Vector3(0.052, 0.25, 0.05),
  ]), 20, 0.007, 8, false);
  return {
    avatarHotCup: new THREE.CylinderGeometry(0.062, 0.045, 0.16, 28),
    avatarHotLid: new THREE.CylinderGeometry(0.068, 0.065, 0.018, 28),
    avatarCupSleeve: new THREE.CylinderGeometry(0.057, 0.050, 0.064, 28),
    avatarColdCup: new THREE.CylinderGeometry(0.065, 0.045, 0.21, 28),
    avatarColdLid: new THREE.CylinderGeometry(0.071, 0.068, 0.012, 28),
    avatarCoffeeFill: new THREE.CylinderGeometry(0.056, 0.041, 0.16, 28),
    avatarStraw: straw,
  };
}
