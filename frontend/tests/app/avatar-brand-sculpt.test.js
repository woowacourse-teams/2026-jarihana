import { createAvatarBrandSculpt } from '../../public/sparring-arena/src/avatar-brand-sculpt.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it('모든 헤어와 얼굴은 유효한 좌표와 표면 법선을 가진 입체 형상이다', () => {
  const sculpt = createAvatarBrandSculpt();
  try {
    for (const geometry of Object.values(sculpt)) {
      geometry.computeBoundingBox();
      expect(geometry.boundingBox.isEmpty()).toBe(false);
      expect([...geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
      expect([...geometry.attributes.normal.array].every(Number.isFinite)).toBe(true);
      expect(geometry.boundingBox.max.z - geometry.boundingBox.min.z).toBeGreaterThan(0.02);
    }
  } finally { Object.values(sculpt).forEach(geometry => geometry.dispose()); }
});

it('긴 웨이브의 뒷머리는 정면에서도 볼 바깥으로 보이며 어깨 아래까지 이어진다', () => {
  const sculpt = createAvatarBrandSculpt();
  try {
    const hair = sculpt.avatarFlowing;
    const p = hair.attributes.position, n = hair.attributes.normal;
    const visible = { left: 0, right: 0 };
    for (let index = 0; index < p.count; index++) {
      if (p.getY(index) < 0 && p.getZ(index) > -0.07 && n.getZ(index) > 0.3) {
        if (p.getX(index) < -0.34) visible.left++;
        if (p.getX(index) > 0.34) visible.right++;
      }
    }
    hair.computeBoundingBox();
    expect(visible.left).toBeGreaterThan(20);
    expect(visible.right).toBeGreaterThan(20);
    expect(hair.boundingBox.min.y).toBeLessThan(-0.65);
  } finally { Object.values(sculpt).forEach(geometry => geometry.dispose()); }
});
