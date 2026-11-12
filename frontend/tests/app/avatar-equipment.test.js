import * as THREE from 'three';
import { AVATAR_BASIC_APPEARANCE } from '../../public/sparring-arena/src/avatar-appearance.js';
import { createAvatarBagShapes } from '../../public/sparring-arena/src/avatar-bags.js';
import { createAvatarHandheldShapes } from '../../public/sparring-arena/src/avatar-handheld.js';
import { releasedCharacterPose } from '../../public/sparring-arena/src/character-landing.js';
import { heldReactionPose } from '../../public/sparring-arena/src/held-reactions.js';
import { createWalkingCharacters } from '../../public/sparring-arena/src/walking-characters.js';

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

it('아바타를 들면 기존 놀란 입을 표시하고 내려놓으면 선택한 입으로 복귀한다', () => {
  const scene = new THREE.Scene(), position = new THREE.Vector3();
  const characters = createWalkingCharacters(scene, 2);
  const post = { appearance: { ...AVATAR_BASIC_APPEARANCE, hair: 'bob', mouth: 'flat' } };
  const mouthInstances = () => scene.children.find(mesh => mesh.userData.avatarMaterial === 'mouthInner').count;
  try {
    characters.draw(0, post, position, 1, {});
    characters.draw(1, post, position, 1, {});
    expect(mouthInstances()).toBe(0);
    const held = heldReactionPose({ pose: { hanging: true } }, 1, 0.5);
    characters.draw(0, post, position, 1, held.pose);
    expect(mouthInstances()).toBe(1);
    characters.draw(1, post, position, 1, {});
    expect(mouthInstances()).toBe(1);
    const released = releasedCharacterPose({ pose: {}, yaw: 0 }, {
      time: 0.5, scale: 1, originalScale: 1, position, landing: position, lastFrame: held,
    });
    characters.draw(0, post, position, 1, released.pose);
    expect(mouthInstances()).toBe(1);
    characters.draw(0, post, position, 1, {});
    expect(mouthInstances()).toBe(0);
  } finally { characters.dispose(); }
});
