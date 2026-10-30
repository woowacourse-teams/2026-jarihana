import * as THREE from 'three';
import { characterVariant } from './character-motion.js';

// Alpha-cutout image planes preserve the brand faces without competing with transparent capsule lids for draw order.
// Atlas regions exclude the neighboring character, without altering the generated alpha channel.
const regions = [[369, 31, 432, 846], [947, 34, 428, 843]];
let maps, assetsReady;
export function whenCharacterAssetsReady() {
  characterMaps();
  return assetsReady;
}
function characterMaps() {
  if (maps) return maps;
  maps = regions.map(([x, y, width, height]) => {
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(width / 1774, height / 887);
    texture.offset.set(x / 1774, 1 - (y + height) / 887);
    return texture;
  });
  assetsReady = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(new URL('../assets/crew-coach-atlas.png', import.meta.url).href, texture => {
      for (const map of maps) { map.image = texture.image; map.needsUpdate = true; }
      window.dispatchEvent(new Event('sparringassetsready'));
      texture.dispose();
      resolve();
    }, undefined, () => {
      window.dispatchEvent(new Event('sparringasseterror'));
      reject(new Error('캐릭터 이미지를 불러오지 못했어요.'));
    });
  });
  return maps;
}

export function createCharacters(scene, capacity) {
  const textures = characterMaps();
  const geometry = new THREE.PlaneGeometry(1.08, 2.1);
  const meshes = textures.map(map => {
    const material = new THREE.MeshBasicMaterial({ map, transparent: false, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: true, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    scene.add(mesh); return mesh;
  });
  const transform = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function hideMesh(mesh, index) {
    mesh.setMatrixAt(index, zero); mesh.instanceMatrix.needsUpdate = true; mesh.boundingSphere = null;
  }
  function hide(index) { for (const mesh of meshes) hideMesh(mesh, index); }
  function draw(index, post, position, size, pose, yaw = 0) {
    const variant = post?.memberType === 'CREW' ? 0 : post?.memberType === 'COACH' ? 1 : characterVariant(post);
    const scale = size * pose.scale * pose.shrink;
    transform.position.copy(position); transform.position.y += pose.lift * size + 1.05 * scale;
    transform.rotation.set(0.17, yaw * 0.18, pose.lean + pose.wave * 0.07);
    transform.scale.setScalar(scale); transform.updateMatrix();
    meshes[variant].setMatrixAt(index, transform.matrix);
    meshes[variant].instanceMatrix.needsUpdate = true; meshes[variant].boundingSphere = null;
    hideMesh(meshes[1 - variant], index);
  }
  for (let i = 0; i < capacity; i++) hide(i);
  return { draw, hide, pickMeshes: meshes };
}
