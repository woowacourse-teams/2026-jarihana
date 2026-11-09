import * as THREE from 'three';
import { createWalkingCharacters } from './walking-characters.js';
import { createSparringChairs } from './sparring-chairs.js';

const mix = (from, to, amount) => from + (to - from) * amount;

export function createChairCharacters(scene, capacity) {
  const characters = createWalkingCharacters(scene, capacity);
  const chairs = createSparringChairs(scene, capacity);
  const seatOrigin = new THREE.Vector3(), chairOrigin = new THREE.Vector3(), grip = new THREE.Vector3();
  const rootRotation = new THREE.Quaternion(), chairRotation = new THREE.Quaternion(), pitch = new THREE.Quaternion();
  const hangRotation = new THREE.Quaternion(), hangAxis = new THREE.Vector3(0, 0, 1);
  const rotation = new THREE.Euler(), inverseScene = new THREE.Matrix4();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const chairCenter = new THREE.Vector3();
  const flights = Array(capacity).fill(null);
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
      if (pose.chairVisible === false) { flights[index] = null; chairs.hide(index); return hands; }
      const scale = size * (pose.scale ?? 1) * (pose.shrink ?? 1);
      seatOrigin.set(0, (pose.chairGrounded ? 0 : pose.lift ?? 0) * size, -(pose.chairRestBack ?? 0) * scale);
      rootRotation.setFromEuler(rotation.set(0, yaw, 0));
      seatOrigin.applyQuaternion(rootRotation);
      if (capsuleRotation) {
        seatOrigin.applyQuaternion(capsuleRotation);
        rootRotation.premultiply(capsuleRotation);
      }
      if (pose.hanging) rootRotation.premultiply(hangRotation.setFromAxisAngle(hangAxis, pose.hangAngle ?? 0));
      seatOrigin.add(position);
      chairRotation.copy(rootRotation);
      chairOrigin.copy(seatOrigin);
      const held = carried ? 1 - seated : pose.chairLift ?? 0;
      if (carried || held > 0) {
        pitch.setFromAxisAngle(xAxis, carried ? 0.2 * (1 - seated) : pose.chairPitch ?? 0);
        chairRotation.multiply(pitch);
        inverseScene.copy(scene.matrixWorld).invert();
        if (pose.chairHand === 'left') chairOrigin.copy(hands.leftHand);
        else if (pose.chairHand === 'right') chairOrigin.copy(hands.rightHand);
        else chairOrigin.copy(hands.leftHand).add(hands.rightHand).multiplyScalar(0.5);
        chairOrigin.applyMatrix4(inverseScene);
        grip.set(0, 1.05, -0.3).multiplyScalar(scale).applyQuaternion(chairRotation);
        chairOrigin.sub(grip).lerp(seatOrigin, 1 - held);
      }
      let chairScale = scale;
      if (pose.chairFlight) {
        const progress = THREE.MathUtils.clamp(pose.chairFlight.progress, 0, 1);
        const camera = pose.chairFlight.target === 'camera' ? pose.chairFlight.camera : null;
        if (!flights[index] || progress < flights[index].progress || flights[index].owner !== post?.id
          || flights[index].target !== pose.chairFlight.target) {
          flights[index] = { origin: chairOrigin.clone(), rotation: chairRotation.clone(),
            direction: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
            floor: position.y, scale, progress, owner: post?.id, target: pose.chairFlight.target };
          if (camera) {
            const flight = flights[index];
            const lens = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
            const aim = new THREE.Vector3(0, 0, 0).unproject(camera);
            const direction = camera.isPerspectiveCamera ? aim.clone().sub(lens).normalize() : camera.getWorldDirection(new THREE.Vector3());
            flight.center = new THREE.Vector3(0, .55 * scale, 0).applyQuaternion(chairRotation).add(chairOrigin);
            flight.lens = camera.isPerspectiveCamera ? lens : aim.addScaledVector(direction, -aim.clone().sub(lens).dot(direction));
            flight.lens.addScaledVector(direction, camera.near + scale * .5);
            flight.facing = new THREE.Quaternion().setFromRotationMatrix(camera.matrixWorld);
            flight.endScale = camera.isPerspectiveCamera ? scale : Math.max(scale, (camera.top - camera.bottom) / camera.zoom * 1.4);
          }
        }
        const flight = flights[index];
        flight.progress = progress;
        if (flight.lens) {
          chairScale = progress < 1 ? mix(flight.scale, flight.endScale, progress ** 3) : 0;
          chairRotation.copy(flight.rotation).slerp(flight.facing, THREE.MathUtils.smoothstep(progress, 0, .65))
            .multiply(pitch.setFromAxisAngle(xAxis, progress * Math.PI * 2));
          chairCenter.set(0, .55 * chairScale, 0).applyQuaternion(chairRotation);
          chairOrigin.copy(flight.center).lerp(flight.lens, progress).sub(chairCenter);
        } else {
          chairOrigin.copy(flight.origin).addScaledVector(flight.direction, progress * 2.2 * flight.scale);
          chairOrigin.y = mix(flight.origin.y, flight.floor + 0.05 * flight.scale, progress)
            + Math.sin(progress * Math.PI) * 1.2 * flight.scale;
          chairRotation.copy(flight.rotation).multiply(pitch.setFromAxisAngle(xAxis, progress * Math.PI * 2));
          chairScale = flight.scale * (1 - THREE.MathUtils.smoothstep(progress, 0.85, 1));
        }
      } else flights[index] = null;
      if (chairScale > 0) chairs.draw(index, chairOrigin, chairScale, rotation.setFromQuaternion(chairRotation), post?.side);
      else chairs.hide(index);
      return hands;
    },
    hide(index) { flights[index] = null; characters.hide(index); chairs.hide(index); },
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
