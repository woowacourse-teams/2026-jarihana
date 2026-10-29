import * as THREE from 'three';
import { characterPose } from './character-motion.js';
import { createCharacters } from './characters.js';
import { studioMaterial } from './studio-materials.js';

export function createCapsuleBatch(scene, capacity, characterFactory = createCharacters) {
  const pieces = [
    [new THREE.SphereGeometry(0.48, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), studioMaterial({ color: 0xf4fff9, transparent: true, opacity: 0.18, roughness: 0.24, clearcoat: 0.5, side: THREE.DoubleSide, depthWrite: false })],
    [new THREE.SphereGeometry(0.48, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), studioMaterial({ roughness: 0.48, side: THREE.DoubleSide })],
    [new THREE.TorusGeometry(0.48, 0.018, 4, 24), studioMaterial({ color: 0xffffff, roughness: 0.4 })],
  ];
  const meshes = pieces.map(([geometry, material]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });
  meshes[1].castShadow = meshes[1].receiveShadow = true;
  const characters = characterFactory(scene, capacity);
  const transform = new THREE.Object3D();
  const equator = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const identity = new THREE.Quaternion();
  const offset = new THREE.Vector3(), origin = new THREE.Vector3(), closedLid = new THREE.Vector3();
  const shellColors = { a: new THREE.Color(0x4ac5b8), b: new THREE.Color(0xf2907f) };
  const postIds = Array(capacity).fill(null), sides = Array(capacity).fill(null);
  function draw(index, entry, size, opening = 0, burst = false) {
    const { post, body } = entry;
    postIds[index] = post?.id ?? null;
    meshes[0].boundingSphere = null; meshes[1].boundingSphere = null;
    const pose = entry.characterPose ?? characterPose({ ...entry, mine: post?.name === '나' });
    const shellScale = pose.shrink * (entry.shellScale ?? 1);
    origin.copy(body.position);
    if (entry.parts) origin.y += 0.24;
    const side = entry.visualSide ?? post?.side ?? 'a';
    if (sides[index] !== side) {
      sides[index] = side;
      meshes[1].setColorAt(index, shellColors[side]);
      meshes[1].instanceColor.needsUpdate = true;
    }
    if (entry.phase === 'open') characters.hide(index);
    else characters.draw(index, post, origin, size, pose);
    for (let part = 0; part < meshes.length; part++) {
      if (entry.parts) {
        const fragment = [entry.parts.top, entry.parts.bottom][part];
        transform.scale.setScalar(fragment ? size * shellScale : 0);
        if (fragment) {
          transform.position.copy(fragment.position); transform.quaternion.copy(fragment.quaternion);
          if (part === 0 && pose.closing > 0) {
            closedLid.copy(origin); closedLid.y += 0.24;
            transform.position.lerp(closedLid, pose.closing); transform.quaternion.slerp(identity, pose.closing);
          }
          transform.position.add(offset.set(0, part === 0 ? -0.24 : 0.24, 0).applyQuaternion(transform.quaternion));
        }
        transform.updateMatrix(); meshes[part].setMatrixAt(index, transform.matrix); meshes[part].instanceMatrix.needsUpdate = true;
        continue;
      }
      transform.position.copy(body.position);
      transform.scale.setScalar(size * shellScale);
      transform.quaternion.copy(body.quaternion).slerp(identity, opening);
      if (part === 0) {
        transform.position.y += opening * size * 0.88;
        transform.position.x += opening * size * (side === 'a' ? -0.42 : 0.42);
        transform.rotateZ(opening * (side === 'a' ? -0.5 : 0.5));
      }
      if (part === 1) transform.position.y -= opening * size * 0.18;
      if (part === 2) transform.quaternion.multiply(equator);
      if (burst && opening > 0) {
        if (part === 0) {
          transform.position.x += (side === 'a' ? -1 : 1) * opening * size * 0.5;
          transform.scale.multiplyScalar(1 - opening);
        }
        if (part === 2) transform.scale.multiplyScalar(1 - opening);
      }
      transform.updateMatrix();
      meshes[part].setMatrixAt(index, transform.matrix);
      meshes[part].instanceMatrix.needsUpdate = true;
    }
  }
  function hide(index) {
    postIds[index] = null;
    characters.hide(index);
    transform.position.set(0, 0, 0); transform.quaternion.identity(); transform.scale.setScalar(0);
    transform.updateMatrix();
    for (const mesh of meshes) { mesh.setMatrixAt(index, transform.matrix); mesh.instanceMatrix.needsUpdate = true; }
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const pickMeshes = [meshes[0], meshes[1]];
  function pick(event, canvas, camera) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickMeshes, false).find(entry => postIds[entry.instanceId]);
    return hit?.instanceId ?? null;
  }
  return { draw, hide, pick, visibleCount: () => postIds.filter(id => id !== null).length };
}
