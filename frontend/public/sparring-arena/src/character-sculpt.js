import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

const vector = point => new THREE.Vector3(...point);

function lathe(points) {
  // Lathe winding follows the profile from bottom to top, including limb end caps.
  const ordered = points[0][1] > points.at(-1)[1] ? [...points].reverse() : points;
  const curve = new THREE.CatmullRomCurve3(ordered.map(([radius, y]) => vector([radius, y, 0])));
  return new THREE.LatheGeometry(curve.getPoints(48).map(point => new THREE.Vector2(Math.max(0, point.x), point.y)), 32);
}

function lock(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(vector));
  const geometry = new THREE.TubeGeometry(curve, 32, radius, 12, false);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const u = geometry.attributes.uv.getX(i), v = geometry.attributes.uv.getY(i);
    const center = curve.getPointAt(u);
    const offset = vector([positions.getX(i), positions.getY(i), positions.getZ(i)]).sub(center);
    const taper = 0.025 + 0.975 * Math.sin(Math.PI * u) ** 0.48;
    const wave = 1 + 0.045 * Math.sin(u * Math.PI * 5) + 0.018 * Math.cos(v * Math.PI * 8 + u * 4);
    offset.multiplyScalar(taper * wave);
    offset.z *= 0.82;
    positions.setXYZ(i, center.x + offset.x, center.y + offset.y, center.z + offset.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function ribbon(points, width, thickness) {
  const curve = new THREE.CatmullRomCurve3(points.map(vector));
  const geometry = new THREE.TubeGeometry(curve, 48, 1, 8, false);
  const p = geometry.attributes.position;
  const across = new THREE.Vector3(), front = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < p.count; i++) {
    const u = geometry.attributes.uv.getX(i), angle = geometry.attributes.uv.getY(i) * Math.PI * 2;
    const center = curve.getPointAt(u), tangent = curve.getTangentAt(u);
    across.crossVectors(tangent, front).normalize();
    const depth = new THREE.Vector3().crossVectors(across, tangent).normalize();
    center.addScaledVector(across, Math.cos(angle) * width / 2).addScaledVector(depth, Math.sin(angle) * thickness / 2);
    p.setXYZ(i, center.x, center.y, center.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createCharacterSculpt() {
  const face = new THREE.SphereGeometry(1, 40, 32);
  const positions = face.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const jaw = 1 - 0.07 * Math.max(0, -y);
    positions.setXYZ(i, Math.sign(x) * Math.abs(x) ** 0.87 * jaw,
      Math.sign(y) * Math.abs(y) ** 0.88,
      Math.sign(z) * Math.abs(z) ** 0.88);
  }
  const complexion = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const blush = Math.exp(-(((Math.abs(x) - 0.62) / 0.27) ** 2) - ((y + 0.26) / 0.25) ** 2) * Math.max(0, z);
    const temple = Math.max(0, y - 0.50) * 0.16;
    complexion.set([1 - temple, 1 - blush * 0.12 - temple, 1 - blush * 0.17 - temple], i * 3);
  }
  face.setAttribute('color', new THREE.BufferAttribute(complexion, 3));
  face.computeVertexNormals();

  const scalp = new THREE.SphereGeometry(1, 40, 28, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < scalp.attributes.position.count; i++) {
    const u = scalp.attributes.uv.getX(i), v = scalp.attributes.uv.getY(i);
    const phi = u * Math.PI * 2;
    const front = Math.max(0, Math.sin(phi)), back = Math.max(0, -Math.sin(phi));
    const theta = (1 - v) * (2.07 - front * 1.06 + back * 0.60);
    const wave = 1 + 0.025 * Math.sin(phi * 7 + theta * 3) * Math.sin(theta);
    scalp.attributes.position.setXYZ(i, -0.351 * Math.cos(phi) * Math.sin(theta) * wave,
      0.073 + 0.303 * Math.cos(theta), 0.307 * Math.sin(phi) * Math.sin(theta) * wave - 0.028);
  }
  scalp.computeVertexNormals();

  const crewLocks = [
    lock([[-0.31, 0.045, 0.09], [-0.33, 0.18, 0.17], [-0.24, 0.255, 0.235], [-0.14, 0.245, 0.265]], 0.099),
    lock([[-0.25, 0.255, 0.16], [-0.17, 0.285, 0.26], [-0.06, 0.245, 0.30], [0.045, 0.27, 0.28], [0.09, 0.355, 0.18]], 0.106),
    lock([[-0.17, 0.335, 0.01], [-0.10, 0.39, 0.12], [0.015, 0.407, 0.15], [0.15, 0.35, 0.14]], 0.095),
    lock([[0.17, 0.35, 0.045], [0.275, 0.29, 0.14], [0.305, 0.18, 0.20], [0.30, 0.04, 0.10]], 0.092),
    lock([[-0.34, 0.04, -0.09], [-0.325, 0.23, -0.08], [-0.23, 0.34, 0.015], [-0.10, 0.36, 0.055]], 0.082),
    lock([[-0.22, 0.24, -0.19], [-0.12, 0.36, -0.14], [0.04, 0.37, -0.105], [0.23, 0.28, -0.10]], 0.10),
  ];
  const coachLocks = [
    lock([[-0.31, 0.05, 0.09], [-0.30, 0.19, 0.19], [-0.23, 0.29, 0.24], [-0.115, 0.325, 0.22]], 0.081),
    lock([[-0.12, 0.32, 0.15], [-0.025, 0.325, 0.27], [0.12, 0.26, 0.29], [0.265, 0.20, 0.22], [0.32, 0.14, 0.10]], 0.101),
    lock([[-0.20, 0.29, 0.04], [-0.10, 0.39, 0.12], [0.07, 0.365, 0.20], [0.23, 0.28, 0.18], [0.315, 0.155, 0.08]], 0.075),
    lock([[-0.25, 0.20, -0.14], [-0.16, 0.34, -0.09], [0.01, 0.39, -0.02], [0.24, 0.27, 0.02]], 0.071),
  ];
  const sweater = lathe([[0, -1], [0.80, -1], [0.94, -0.91], [1, -0.65], [0.98, -0.15],
    [0.94, 0.48], [0.82, 0.76], [0.49, 0.98], [0, 1]]);
  const sleeve = lathe([[0, 0.095], [0.08, 0.075], [0.133, 0.018], [0.145, -0.10],
    [0.143, -0.21], [0.137, -0.29], [0.135, -0.37], [0.128, -0.425], [0.102, -0.448], [0, -0.448]]);
  const trouser = lathe([[0, 0.08], [0.125, 0.065], [0.153, -0.015], [0.15, -0.16],
    [0.145, -0.30], [0.151, -0.43], [0.165, -0.53], [0.167, -0.57], [0.15, -0.59], [0, -0.59]]);
  const lanyard = ribbon([
    [0.105, 0.64, -0.085], [0.144, 0.625, 0.03], [0.15, 0.594, 0.145], [0.14, 0.53, 0.216],
    [0.093, 0.40, 0.24], [0, 0.235, 0.263], [-0.093, 0.40, 0.24], [-0.14, 0.53, 0.216],
    [-0.15, 0.594, 0.145], [-0.144, 0.625, 0.03], [-0.105, 0.64, -0.085],
  ], 0.032, 0.009);
  for (const [geometry, amount] of [[sweater, 0.006], [sleeve, 0.004], [trouser, 0.005]]) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), angle = Math.atan2(z, x);
      const fold = Math.sin(y * 42 + angle * 2) * amount * (0.25 + 0.75 * Math.cos(angle * 3) ** 2);
      p.setXYZ(i, x * (1 + fold), y, z * (1 + fold));
    }
    geometry.computeVertexNormals();
  }
  const crewHair = mergeGeometries([scalp, ...crewLocks]);
  const coachHair = mergeGeometries([scalp, ...coachLocks]);
  for (const source of [scalp, ...crewLocks, ...coachLocks]) source.dispose();
  return { face, crewHair, coachHair, sweater, sleeve, trouser, lanyard };
}

// Each limb remains instanced. Its bend follows the same elbow/knee as the hand/foot.
// Apply the deformation to shadow passes too, so gestures do not leave rigid shadows.
export function bendLimbMaterial(material, pivot) {
  const prepareSurface = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    prepareSurface(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float limbBend;
      mat3 limbRotation() {
        float c = cos(limbBend), s = sin(limbBend);
        return mat3(1., 0., 0., 0., c, s, 0., -s, c);
      }
      float limbWeight() { return 1. - smoothstep(${pivot - 0.09}, ${pivot + 0.09}, position.y); }
    `).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      objectNormal = normalize(mix(objectNormal, limbRotation() * objectNormal, limbWeight()));
    `).replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 hinge = vec3(0., ${pivot}, 0.);
      transformed = mix(transformed, limbRotation() * (transformed - hinge) + hinge, limbWeight());
    `);
  };
  material.customProgramCacheKey = () => `character-limb-${pivot}`;
  return material;
}

export function sculptSurface(material, kind) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 sculptPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsculptPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 sculptPosition;
      float sculptNoise(vec3 p) {
        vec3 cell = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        vec4 n = vec4(dot(cell, vec3(127.1, 311.7, 74.7))) + vec4(0., 127.1, 311.7, 438.8);
        vec4 a = fract(sin(n) * 43758.5453), b = fract(sin(n + 74.7) * 43758.5453);
        vec4 v = mix(a, b, f.z);
        return mix(mix(v.x, v.y, f.x), mix(v.z, v.w, f.x), f.y);
      }
    `).replace('#include <color_fragment>', `#include <color_fragment>
      float grain = sculptNoise(sculptPosition * ${kind === 'hair' ? '180.' : '290.'});
      float strand = sin(sculptPosition.x * 130. + sculptPosition.y * 55.
        + sculptNoise(sculptPosition * 25.) * 3.);
      float knit = sin(atan(sculptPosition.z, sculptPosition.x) * 72.);
      diffuseColor.rgb *= 1. + (grain - .5) * ${kind === 'skin' ? '.025' : '.10'};
      ${kind === 'hair' ? 'diffuseColor.rgb *= .96 + .04 * strand;' : ''}
      ${kind === 'rib' ? 'diffuseColor.rgb *= .97 + .03 * knit;' : ''}
    `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 surfaceX = dFdx(vViewPosition), surfaceY = dFdy(vViewPosition);
      vec3 tangentX = cross(surfaceY, normal), tangentY = cross(normal, surfaceX);
      float determinant = dot(surfaceX, tangentX);
      float bump = grain * ${kind === 'skin' ? '.00015' : '.00055'}
        ${kind === 'hair' ? '+ strand * .0018' : kind === 'rib' ? '+ knit * .0008' : ''};
      vec3 gradient = sign(determinant) * (dFdx(bump) * tangentX + dFdy(bump) * tangentY);
      normal = normalize(abs(determinant) * normal - gradient);
    `);
  };
  material.customProgramCacheKey = () => `character-surface-${kind}`;
  return material;
}
