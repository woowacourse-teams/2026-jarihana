import * as THREE from 'three';
import { createWalkingCharacters } from './walking-characters.js';
import { createSparringChairs } from './sparring-chairs.js';

const mix = (from, to, amount) => from + (to - from) * amount;

export function createChairCharacters(scene, capacity) {
  const characters = createWalkingCharacters(scene, capacity);
  const chairs = createSparringChairs(scene, capacity);
  const seatOrigin = new THREE.Vector3(), chairOrigin = new THREE.Vector3(), grip = new THREE.Vector3();
  const rootRotation = new THREE.Quaternion(), chairRotation = new THREE.Quaternion(), pitch = new THREE.Quaternion();
  const rotation = new THREE.Euler(), inverseScene = new THREE.Matrix4();
  const xAxis = new THREE.Vector3(1, 0, 0);
  return {
    draw(index, post, position, size, pose, yaw = 0, capsuleRotation = null) {
      const seated = THREE.MathUtils.clamp(pose.seated ?? 0, 0, 1);
      const carried = Boolean(pose.chairCarry);
      const characterPose = carried ? {
        ...pose,
        leftArm: mix(-1.1, pose.leftArm ?? 0, seated),
        rightArm: mix(-1.1, pose.rightArm ?? 0, seated),
        leftElbow: mix(-0.65, pose.leftElbow ?? -0.12, seated),
        rightElbow: mix(-0.65, pose.rightElbow ?? -0.12, seated),
      } : pose;
      const hands = characters.draw(index, post, position, size, characterPose, yaw, capsuleRotation);
      const scale = size * (pose.scale ?? 1) * (pose.shrink ?? 1);
      seatOrigin.set(0, (pose.lift ?? 0) * size, 0);
      rootRotation.setFromEuler(rotation.set(0, yaw, 0));
      if (capsuleRotation) {
        seatOrigin.applyQuaternion(capsuleRotation);
        rootRotation.premultiply(capsuleRotation);
      }
      seatOrigin.add(position);
      chairRotation.copy(rootRotation);
      chairOrigin.copy(seatOrigin);
      if (carried) {
        pitch.setFromAxisAngle(xAxis, 0.2 * (1 - seated));
        chairRotation.multiply(pitch);
        inverseScene.copy(scene.matrixWorld).invert();
        chairOrigin.copy(hands.leftHand).add(hands.rightHand).multiplyScalar(0.5).applyMatrix4(inverseScene);
        grip.set(0, 1.05, -0.3).multiplyScalar(scale).applyQuaternion(chairRotation);
        chairOrigin.sub(grip).lerp(seatOrigin, seated);
      }
      chairs.draw(index, chairOrigin, scale, rotation.setFromQuaternion(chairRotation), post?.side);
      return hands;
    },
    hide(index) { characters.hide(index); chairs.hide(index); },
    pickMeshes: [...characters.pickMeshes, ...chairs.pickMeshes],
  };
}

export function createSeatedCapsuleCharacters(scene, capacity) {
  const characters = createChairCharacters(scene, capacity);
  return {
    ...characters,
    draw(index, post, position, size, pose, yaw = 0, capsuleRotation = null) {
      return characters.draw(index, post, position, size,
        { ...pose, seated: 1, crouch: 0, chairCarry: false }, yaw, capsuleRotation);
    },
  };
}
