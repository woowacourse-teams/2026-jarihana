import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from '../../public/sparring-arena/vendor/three.module.js';
import { characterVariant } from '../../public/sparring-arena/src/character-motion.js';

it('캡슐 의자는 회원 유형과 독립적으로 편 색을 선택하고 편을 바꾸면 이전 이미지를 숨긴다', async () => {
  const source = readFileSync(path.join(__dirname, '../../public/sparring-arena/src/characters.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export function', 'function')
    .replace('import.meta.url', JSON.stringify('http://localhost/sparring-arena/src/characters.js'));
  const { createCharacters, whenCharacterAssetsReady } = new Function('THREE', 'characterVariant',
    `${source}\nreturn { createCharacters, whenCharacterAssetsReady };`)(THREE, characterVariant);
  const loader = jest.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, ready) => {
    const texture = new THREE.Texture();
    ready(texture);
    return texture;
  });
  const scene = new THREE.Scene(), characters = createCharacters(scene, 1);
  await whenCharacterAssetsReady();
  const matrix = new THREE.Matrix4(), pose = { scale: 1, shrink: 1, lift: 0, lean: 0, wave: 0 };
  for (const [side, memberType, expected] of [['a', 'CREW', 0], ['a', 'COACH', 1], ['b', 'CREW', 2], ['b', 'COACH', 3]]) {
    characters.draw(0, { side, memberType }, new THREE.Vector3(), 1, pose);
    characters.pickMeshes.forEach((mesh, index) => {
      mesh.getMatrixAt(0, matrix);
      expect(matrix.determinant() !== 0).toBe(index === expected);
      expect(mesh.material.map.repeat.toArray()).toEqual([0.5, 0.5]);
      expect(mesh.material.map.offset.toArray()).toEqual([index % 2 / 2, index < 2 ? 0.5 : 0]);
    });
  }
  characters.hide(0);
  for (const mesh of characters.pickMeshes) {
    mesh.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    mesh.dispose(); mesh.material.map.dispose(); mesh.material.dispose();
  }
  characters.pickMeshes[0].geometry.dispose();
  loader.mockRestore();
});
