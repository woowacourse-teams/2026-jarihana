import * as THREE from 'three';
import { createAvatarBrandSculpt } from '../../public/sparring-arena/src/avatar-brand-sculpt.js';
import { createAvatarAccessories } from '../../public/sparring-arena/src/avatar-accessories.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it('버킷햇의 앞면과 챙 윗면은 바깥쪽에서 보이며 뒷면 제거로 이마가 드러나지 않는다', () => {
  const hair = createAvatarBrandSculpt(), accessories = createAvatarAccessories(hair);
  const material = new THREE.MeshBasicMaterial();
  try {
    const crown = new THREE.Mesh(accessories.avatarBucketCrown, material);
    const brim = new THREE.Mesh(accessories.avatarBucketBrim, material);
    const front = new THREE.Raycaster(new THREE.Vector3(0, 0.30, 1), new THREE.Vector3(0, 0, -1));
    const above = new THREE.Raycaster(new THREE.Vector3(0, 1, 0.40), new THREE.Vector3(0, -1, 0));
    expect(front.intersectObject(crown)[0]?.point.z).toBeGreaterThan(0.25);
    expect(above.intersectObject(brim)[0]?.face.normal.y).toBeGreaterThan(0);
  } finally {
    material.dispose();
    [...Object.values(hair), ...Object.values(accessories)].forEach(geometry => geometry.dispose());
  }
});

it('모자는 유효한 입체 형상이며 캡 챙은 앞으로, 버킷햇 챙은 둘레로 뻗는다', () => {
  const hair = createAvatarBrandSculpt(), accessories = createAvatarAccessories(hair);
  try {
    for (const geometry of Object.values(accessories)) {
      geometry.computeBoundingBox();
      expect(geometry.boundingBox.isEmpty()).toBe(false);
      expect([...geometry.attributes.position.array, ...geometry.attributes.normal.array].every(Number.isFinite)).toBe(true);
    }
    expect(accessories.avatarCapBrim.boundingBox.max.z).toBeGreaterThan(0.6);
    expect(accessories.avatarBucketBrim.boundingBox.min.z).toBeLessThan(-0.4);
    expect(accessories.avatarBucketBrim.boundingBox.max.x).toBeGreaterThan(0.49);
  } finally { [...Object.values(hair), ...Object.values(accessories)].forEach(geometry => geometry.dispose()); }
});

it('모자용 머리는 윗부분을 안에 넣고 아래로 나오는 옆머리·긴 뒷머리는 보존한다', () => {
  const hair = createAvatarBrandSculpt(), accessories = createAvatarAccessories(hair);
  try {
    for (const name of ['avatarCurly', 'avatarParted', 'avatarBob', 'avatarLong', 'avatarFlowing']) {
      const original = hair[name].attributes.position, fitted = accessories[`${name}WithHat`].attributes.position;
      let changed = 0;
      for (let index = 0; index < original.count; index++) {
        if (original.getY(index) <= -0.02) {
          expect([fitted.getX(index), fitted.getY(index), fitted.getZ(index)])
            .toEqual([original.getX(index), original.getY(index), original.getZ(index)]);
        } else {
          expect(fitted.getY(index)).toBeLessThanOrEqual(original.getY(index));
          if (original.getY(index) - fitted.getY(index) > 0.00001) changed++;
        }
      }
      expect(changed).toBeGreaterThan(20);
    }
  } finally { [...Object.values(hair), ...Object.values(accessories)].forEach(geometry => geometry.dispose()); }
});

it('모든 머리의 삼각형 단면이 모자 챙과 밴드 안쪽에 들어가 어느 방향에서도 관통하지 않는다', () => {
  const hair = createAvatarBrandSculpt(), accessories = createAvatarAccessories(hair);
  try {
    for (const name of ['avatarCurly', 'avatarParted', 'avatarBob', 'avatarLong', 'avatarFlowing']) {
      const geometry = accessories[`${name}WithHat`], positions = geometry.attributes.position;
      const indices = geometry.index?.array ?? Array.from({ length: positions.count }, (_, index) => index);
      let worst = 0, intersections = 0;
      // Below the brim hair must clear the scalp. From the brim upwards, the
      // beret's 0.36 × 0.324 inner band is the tightest shared hat envelope.
      for (const height of [0.17, 0.18, 0.205, 0.24, 0.30]) {
        for (let triangle = 0; triangle < indices.length; triangle += 3) {
          for (let edge = 0; edge < 3; edge++) {
            const a = indices[triangle + edge], b = indices[triangle + (edge + 1) % 3];
            const ya = positions.getY(a), yb = positions.getY(b);
            if (ya === yb || height < Math.min(ya, yb) || height > Math.max(ya, yb)) continue;
            const t = (height - ya) / (yb - ya);
            const x = positions.getX(a) + (positions.getX(b) - positions.getX(a)) * t;
            const z = positions.getZ(a) + (positions.getZ(b) - positions.getZ(a)) * t;
            worst = Math.max(worst, Math.hypot(x / 0.36, (z + 0.025) / 0.324));
            intersections++;
          }
        }
      }
      expect(worst).toBeLessThan(1);
      expect(intersections).toBeGreaterThan(0);
    }
  } finally { [...Object.values(hair), ...Object.values(accessories)].forEach(geometry => geometry.dispose()); }
});

it('모자 아래 긴 머리는 양쪽 관자놀이에서 피부보다 앞에 있어 두피가 드러나지 않는다', () => {
  const hair = createAvatarBrandSculpt(), accessories = createAvatarAccessories(hair);
  const material = new THREE.MeshBasicMaterial();
  const face = new THREE.Mesh(hair.avatarFace, material);
  face.scale.set(0.33, 0.32, 0.292); face.updateMatrixWorld();
  try {
    for (const name of ['avatarLongWithHat', 'avatarFlowingWithHat']) {
      const mesh = new THREE.Mesh(accessories[name], material);
      for (const sign of [-1, 1]) for (const height of [0.08, 0.12, 0.16]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(sign * 0.27, height, 1), new THREE.Vector3(0, 0, -1));
        const skin = ray.intersectObject(face)[0], lock = ray.intersectObject(mesh)[0];
        expect(skin).toBeDefined();
        expect(lock?.point.z).toBeGreaterThan(skin.point.z + 0.005);
      }
    }
  } finally {
    material.dispose();
    [...Object.values(hair), ...Object.values(accessories)].forEach(geometry => geometry.dispose());
  }
});
