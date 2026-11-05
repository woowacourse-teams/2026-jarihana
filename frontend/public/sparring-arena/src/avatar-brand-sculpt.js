import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

// Shapes for the editable avatar. The arena's original crew/coach keep their own sculpt.
function combine(parts) {
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return geometry;
}

function volume(position, scale, rotation = 0) {
  const geometry = new THREE.SphereGeometry(1, 28, 20);
  geometry.scale(...scale); geometry.rotateZ(rotation); geometry.translate(...position);
  return geometry;
}

function strand(points, radius, depth = 0.72) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const geometry = new THREE.TubeGeometry(curve, 32, radius, 12, false);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  const offset = new THREE.Vector3();
  for (let index = 0; index < p.count; index++) {
    const t = uv.getX(index), center = curve.getPointAt(t);
    offset.fromBufferAttribute(p, index).sub(center);
    offset.multiplyScalar(0.06 + 0.94 * Math.sin(Math.PI * t) ** 0.42);
    offset.z *= depth;
    p.setXYZ(index, center.x + offset.x, center.y + offset.y, center.z + offset.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function cap() {
  const geometry = new THREE.SphereGeometry(1, 40, 28, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let index = 0; index < p.count; index++) {
    const phi = uv.getX(index) * Math.PI * 2, t = 1 - uv.getY(index);
    const front = Math.max(0, Math.sin(phi));
    const theta = t * (2.50 - front ** 3 * 1.46);
    p.setXYZ(index, -0.365 * Math.cos(phi) * Math.sin(theta),
      0.075 + 0.335 * Math.cos(theta), -0.03 + 0.325 * Math.sin(phi) * Math.sin(theta));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function partedFringe() {
  return [
    strand([[-0.24, 0.18, 0.22], [-0.30, 0.30, 0.22], [-0.21, 0.40, 0.17], [-0.10, 0.40, 0.12]], 0.09),
    strand([[-0.15, 0.39, 0.17], [-0.06, 0.39, 0.28], [0.12, 0.29, 0.30], [0.29, 0.20, 0.17]], 0.115),
    strand([[-0.13, 0.40, 0.08], [0.01, 0.46, 0.15], [0.20, 0.37, 0.21], [0.33, 0.19, 0.10]], 0.09),
    strand([[-0.14, 0.37, -0.07], [0.04, 0.45, 0.02], [0.27, 0.34, 0.08], [0.35, 0.10, 0.01]], 0.075),
  ];
}

function centerFringe(length) {
  return [-1, 1].map(sign => strand([
    [sign * 0.02, 0.41, 0.10], [sign * 0.16, 0.36, 0.28],
    [sign * 0.30, 0.22, 0.25], [sign * 0.36, -0.03, 0.18],
    [sign * 0.38, -length, 0.12],
  ], 0.09));
}

function longCurtain(length, wavy) {
  const geometry = new THREE.SphereGeometry(1, 40, 32);
  const p = geometry.attributes.position;
  for (let index = 0; index < p.count; index++) {
    const x = p.getX(index), y = p.getY(index), z = p.getZ(index);
    const wave = wavy ? 0.025 * Math.sin(y * 10) : 0;
    p.setXYZ(index, Math.sign(x) * Math.abs(x) ** 0.83 * (0.44 + wave),
      0.12 - length / 2 + Math.sign(y) * Math.abs(y) ** 0.80 * (length / 2 + 0.20),
      -0.19 + z * 0.19);
  }
  geometry.computeVertexNormals();
  const parts = [geometry];
  for (const sign of [-1, 1]) {
    if (wavy) {
      // Broad overlapping waves form one full rear volume, visible outside the cheeks from the front.
      for (let wave = 0; wave < 3; wave++) {
        parts.push(volume([sign * (0.35 + wave * 0.025), 0.04 - wave * 0.25, -0.045],
          [0.15 + wave * 0.012, 0.21, 0.19], sign * (wave % 2 ? 0.30 : -0.24)));
      }
      parts.push(strand([[sign * 0.27, 0.24, 0.22], [sign * 0.37, 0.02, 0.20],
        [sign * 0.33, -0.22, 0.22], [sign * 0.44, -0.43, 0.16], [sign * 0.40, -0.72, 0.10]], 0.105));
    } else {
      parts.push(strand([[sign * 0.31, 0.26, 0.13], [sign * 0.38, 0, 0.13],
        [sign * 0.38, -0.30, 0.10], [sign * 0.34, -length + 0.12, 0.10]], 0.085));
    }
  }
  return parts;
}

export function createAvatarBrandSculpt() {
  const face = new THREE.SphereGeometry(1, 40, 32);
  const p = face.attributes.position, colors = new Float32Array(p.count * 3);
  for (let index = 0; index < p.count; index++) {
    const x = p.getX(index), y = p.getY(index), z = p.getZ(index);
    const jaw = 1 - 0.13 * Math.max(0, -y);
    const cheek = 1 + 0.055 * Math.exp(-(((y + 0.26) / 0.38) ** 2));
    p.setXYZ(index, Math.sign(x) * Math.abs(x) ** 0.90 * jaw * cheek,
      Math.sign(y) * Math.abs(y) ** 0.92, Math.sign(z) * Math.abs(z) ** 0.90);
    const blush = Math.exp(-(((Math.abs(x) - 0.62) / 0.25) ** 2) - ((y + 0.25) / 0.27) ** 2) * Math.max(0, z);
    colors.set([1, 1 - blush * 0.11, 1 - blush * 0.16], index * 3);
  }
  face.setAttribute('color', new THREE.BufferAttribute(colors, 3)); face.computeVertexNormals();
  const smile = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, index) => {
    const x = (index / 12 - 0.5) * 0.17, y = -0.115 + 0.042 * (x / 0.085) ** 2;
    const z = 0.292 * Math.max(0, 1 - Math.abs(x / 0.33) ** (2 / 0.90) - Math.abs(y / 0.32) ** (2 / 0.92)) ** 0.45 + 0.014;
    return new THREE.Vector3(x, y, z);
  })), 24, 0.009, 8, false);
  const curly = combine([cap(),
    volume([-0.29, 0.23, 0.19], [0.135, 0.13, 0.125], -0.4),
    volume([-0.18, 0.33, 0.25], [0.14, 0.12, 0.13], 0.25),
    volume([-0.02, 0.31, 0.30], [0.14, 0.13, 0.115], -0.3),
    volume([0.15, 0.35, 0.26], [0.145, 0.135, 0.12], 0.4),
    volume([0.29, 0.23, 0.17], [0.12, 0.145, 0.12], 0.35),
    volume([-0.15, 0.43, 0.01], [0.16, 0.105, 0.14]),
    volume([0.06, 0.45, 0.06], [0.15, 0.115, 0.14]),
    volume([0.23, 0.36, -0.02], [0.14, 0.12, 0.17]),
  ]);
  return {
    avatarFace: face, avatarSmile: smile,
    avatarCurly: curly, avatarParted: combine([cap(), ...partedFringe()]),
    avatarBob: combine([cap(), volume([0, -0.055, -0.14], [0.40, 0.37, 0.23]), ...centerFringe(0.26)]),
    avatarLong: combine([cap(), ...longCurtain(0.66, false), ...centerFringe(0.20)]),
    avatarFlowing: combine([cap(), ...longCurtain(0.76, true), ...centerFringe(0.15)]),
  };
}
