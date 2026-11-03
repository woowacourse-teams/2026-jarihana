import * as THREE from 'three';
import { characterVariant } from './character-motion.js';

// Alpha-cutout image planes preserve the brand faces without competing with transparent capsule lids for draw order.
// Each team gets both character models, baked once into four lightweight instance batches.
const regions = [[0, 0, 512, 512], [512, 0, 512, 512], [0, 512, 512, 512], [512, 512, 512, 512]];
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
    texture.repeat.set(width / 1024, height / 1024);
    texture.offset.set(x / 1024, 1 - (y + height) / 1024);
    return texture;
  });
  assetsReady = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(new URL('../assets/seated-characters.webp', import.meta.url).href, texture => {
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
  const geometry = new THREE.PlaneGeometry(2.2, 2.2);
  const meshes = textures.map(map => {
    const material = new THREE.MeshBasicMaterial({ map, transparent: false, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: true, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    scene.add(mesh); return mesh;
  });
  const capsuleUp = new THREE.Vector3(), offset = new THREE.Vector3(), rollAxis = new THREE.Vector3(0, 0, 1);
  const transform = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function hideMesh(mesh, index) {
    mesh.setMatrixAt(index, zero); mesh.instanceMatrix.needsUpdate = true; mesh.boundingSphere = null;
  }
  function hide(index) { for (const mesh of meshes) hideMesh(mesh, index); }
  function draw(index, post, position, size, pose, yaw = 0, capsuleRotation = null) {
    const variant = characterVariant(post) + (post?.side === 'b' ? 2 : 0);
    const scale = size * pose.scale * pose.shrink;
    // Keep the atlas face visible while its body rolls with the capsule in the screen plane.
    capsuleUp.set(0, 1, 0);
    if (capsuleRotation) capsuleUp.applyQuaternion(capsuleRotation);
    const roll = Math.atan2(-capsuleUp.x, capsuleUp.y);
    offset.set(0, pose.lift * size + 1.0 * scale, 0).applyAxisAngle(rollAxis, roll);
    transform.position.copy(position).add(offset);
    transform.rotation.set(0.17, yaw * 0.18, roll + pose.lean + pose.wave * 0.07);
    transform.scale.setScalar(scale); transform.updateMatrix();
    meshes[variant].setMatrixAt(index, transform.matrix);
    meshes[variant].instanceMatrix.needsUpdate = true; meshes[variant].boundingSphere = null;
    for (let other = 0; other < meshes.length; other++) if (other !== variant) hideMesh(meshes[other], index);
  }
  for (let i = 0; i < capacity; i++) hide(i);
  return { draw, hide, pickMeshes: meshes };
}
