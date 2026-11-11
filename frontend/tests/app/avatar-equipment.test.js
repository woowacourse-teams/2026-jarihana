import { createAvatarBagShapes } from '../../public/sparring-arena/src/avatar-bags.js';
import { createAvatarHandheldShapes } from '../../public/sparring-arena/src/avatar-handheld.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it('가방 끈과 소지품은 유효한 입체 형상이고 아이스컵은 종이컵보다 길고 빨대가 위로 나온다', () => {
  const bags = createAvatarBagShapes(), items = createAvatarHandheldShapes();
  try {
    for (const geometry of [...Object.values(bags), ...Object.values(items)]) {
      geometry.computeBoundingBox();
      expect(geometry.boundingBox.isEmpty()).toBe(false);
      expect([...geometry.attributes.position.array, ...geometry.attributes.normal.array].every(Number.isFinite)).toBe(true);
    }
    const height = geometry => geometry.boundingBox.max.y - geometry.boundingBox.min.y;
    expect(height(items.avatarColdCup)).toBeGreaterThan(height(items.avatarHotCup));
    expect(items.avatarStraw.boundingBox.max.y).toBeGreaterThan(0.24);
  } finally { [...Object.values(bags), ...Object.values(items)].forEach(geometry => geometry.dispose()); }
});
