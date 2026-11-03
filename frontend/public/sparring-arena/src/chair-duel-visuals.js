import * as THREE from 'three';
import { createWalkingCharacters } from './walking-characters.js';
import { createSparringChairs } from './sparring-chairs.js';

export function createChairDuelVisuals(scene, stage) {
  const group = new THREE.Group();
  group.name = 'chair-duel';
  group.visible = false;
  scene.add(group);
  const actors = createWalkingCharacters(group, 2);
  const chairs = createSparringChairs(group, 2);
  const active = [false, false];
  const position = new THREE.Vector3(), anchor = new THREE.Vector3(), grip = new THREE.Vector3();
  const seatGrip = new THREE.Vector3();
  const chairBounds = new THREE.Box3(), chairMatrix = new THREE.Matrix4();
  const rotation = new THREE.Euler();
  let disposed = false;

  function boundsAt(index, stageBounds) {
    const mesh = chairs.pickMeshes[0];
    mesh.getMatrixAt(index, chairMatrix);
    chairBounds.copy(mesh.geometry.boundingBox).applyMatrix4(chairMatrix);
    const centerX = document.documentElement.clientWidth / 2 - stageBounds.left;
    const centerY = innerHeight / 2 - stageBounds.top;
    return { left: centerX + chairBounds.min.x, right: centerX + chairBounds.max.x,
      top: centerY - chairBounds.max.y, bottom: centerY - chairBounds.min.y };
  }

  return {
    draw(index, post, frame) {
      if (disposed) return;
      active[index] = true;
      group.visible = true;
      const bounds = stage.getBoundingClientRect();
      const size = frame.size * frame.scale / 2.1;
      const { motion } = frame;
      position.set(bounds.left + frame.x - document.documentElement.clientWidth / 2, innerHeight / 2 - bounds.top - frame.y, 80);
      const hands = actors.draw(index, post, position, size,
        { ...motion, scale: 1, shrink: 1, speaking: false }, motion.yaw);
      const chair = motion.chair;
      rotation.set(chair.pitch, motion.yaw, chair.roll, 'ZYX');
      if (chair.mode === 'seat') {
        chairs.draw(index, position, size, rotation, post.side);
        return boundsAt(index, bounds);
      }
      grip.set(0, 1.05, -0.3).applyEuler(rotation).multiplyScalar(size);
      if (chair.mode === 'flight') {
        anchor.set(chair.x * frame.scale, -chair.y * frame.scale, 0).add(position);
      } else {
        anchor.copy(hands.leftHand).add(hands.rightHand).multiplyScalar(0.5);
        if (motion.phase === 'grab') anchor.lerpVectors(seatGrip.copy(position).add(grip), anchor, 1 - motion.seated);
      }
      chairs.draw(index, anchor.sub(grip), size * chair.scale, rotation, post.side);
      return boundsAt(index, bounds);
    },
    hide(index) {
      active[index] = false;
      actors.hide(index);
      chairs.hide(index);
      group.visible = active.some(Boolean);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      chairs.dispose();
      const geometries = new Set(), materials = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat().filter(Boolean)) materials.add(material);
        if (object.isInstancedMesh) object.dispose();
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
    },
  };
}
