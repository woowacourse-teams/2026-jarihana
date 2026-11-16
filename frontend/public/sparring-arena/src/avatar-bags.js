import * as THREE from 'three';

function ribbon(points, width) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), true);
  const geometry = new THREE.TubeGeometry(curve, 64, 1, 8, true);
  const positions = geometry.attributes.position, uv = geometry.attributes.uv;
  const across = new THREE.Vector3(), depth = new THREE.Vector3(), front = new THREE.Vector3(0, 0, 1);
  for (let index = 0; index < positions.count; index++) {
    const t = uv.getX(index), angle = uv.getY(index) * Math.PI * 2;
    const center = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    across.crossVectors(tangent, front);
    if (across.lengthSq() < 0.00001) across.crossVectors(tangent, new THREE.Vector3(0, 1, 0));
    across.normalize(); depth.crossVectors(across, tangent).normalize();
    center.addScaledVector(across, Math.cos(angle) * width / 2).addScaledVector(depth, Math.sin(angle) * 0.009);
    positions.setXYZ(index, center.x, center.y, center.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createAvatarBagShapes() {
  const shapes = {
    avatarCrossbodyStrap: ribbon([[-0.23, 0.50, 0.205], [-0.12, 0.37, 0.26], [0.02, 0.22, 0.27],
      [0.20, 0.06, 0.28], [0.32, 0.04, 0.08], [0.29, 0.15, -0.24], [0.08, 0.34, -0.26],
      [-0.18, 0.55, -0.19], [-0.23, 0.59, 0.02]], 0.05),
    avatarShoulderStrap: ribbon([[0.25, 0.55, 0.19], [0.39, 0.32, 0.17], [0.46, 0.10, -0.12],
      [0.43, 0.06, -0.24], [0.39, 0.26, -0.30], [0.29, 0.52, -0.20], [0.25, 0.60, -0.02]], 0.042),
  };
  for (const [name, back] of [['avatarBackpackStrap', -0.34], ['avatarBackpackLongStrap', -0.50]]) {
    shapes[name] = ribbon([[0, 0.08, 0.235], [0, 0.44, 0.205], [0, 0.60, 0.03],
      [0, 0.58, -0.10], [0, 0.46, back], [0, 0.17, back], [0, 0.025, 0.02]], 0.052);
  }
  return shapes;
}
