import * as THREE from "three";
import { getDioramaBounds } from "./islandLayout";
import { getRoomLayout, PLAYER } from "./roomLayout";
import { createMascot } from "./roomModels";
import { isWalkablePosition } from "./roomNavigation";

const GREETING_COLORS = ["#5369dc", "#c87689", "#368e77", "#ce8c36", "#8e64b6", "#458cae"];
const PATH_HALF_WIDTH = 1.325;
const CHARACTER_RADIUS = 0.66;

function defaultOutfit(memberId) {
  return GREETING_COLORS[memberId % GREETING_COLORS.length];
}

export function placeYardGreeters(room, memberIds) {
  if (!memberIds.length) return [];
  const { building, island } = getRoomLayout(room);
  const yard = island.entrance;
  const display = getDioramaBounds(building);
  let positions = [];
  for (let scale = 1; scale >= 0.24; scale *= 0.75) {
    const radius = CHARACTER_RADIUS * scale;
    const spacing = 1.65 * scale;
    const visible = [];
    const overflow = [];
    for (let z = yard.minZ + 2.38; z <= yard.maxZ - radius; z += spacing) {
      const firstOffset = PATH_HALF_WIDTH + radius + 0.12;
      for (let offset = firstOffset; offset <= yard.maxX - yard.minX; offset += spacing) {
        for (const side of [1, -1]) {
          const x = PLAYER.spawn.x + side * offset;
          if (x < yard.minX + radius || x > yard.maxX - radius || !isWalkablePosition({ x, z }, room, radius)) continue;
          const inDiorama = x >= display.minX + radius && x <= display.maxX - radius && z <= display.maxZ - radius;
          (inDiorama ? visible : overflow).push({ x, z, scale, inDiorama });
        }
      }
    }
    positions = [...visible, ...overflow];
    if (positions.length >= memberIds.length) break;
  }
  return positions.slice(0, memberIds.length).map((position, index) => ({ ...position, memberId: memberIds[index] }));
}

export function createYardGreeters(room, memberIds) {
  const layer = new THREE.Group();
  layer.name = "yard-greeters";
  const positions = placeYardGreeters(room, memberIds);
  const model = positions.length ? createMascot({ color: "#ffffff", pose: "greeting" }) : null;
  model?.updateMatrixWorld(true);

  for (const inDiorama of [true, false]) {
    const group = new THREE.Group();
    group.name = inDiorama ? "diorama-greeters" : "yard-greeters-overflow";
    layer.add(group);
    const entries = positions.filter((entry) => entry.inDiorama === inDiorama);
    if (!entries.length) continue;

    group.userData.memberIds = entries.map(({ memberId }) => memberId);
    const transform = new THREE.Object3D();
    const matrices = entries.map(({ x, z, scale }) => {
      transform.position.set(x, 0, z);
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      return transform.matrix.clone();
    });
    const outfits = entries.map(({ memberId }) => new THREE.Color(defaultOutfit(memberId)));
    const instance = new THREE.Matrix4();
    model.traverse((part) => {
      if (!part.isMesh) return;
      const batch = new THREE.InstancedMesh(part.geometry, part.material, entries.length);
      batch.name = part.name;
      batch.castShadow = part.castShadow;
      batch.receiveShadow = part.receiveShadow;
      const outfit = part.material.color.getHex() === 0xffffff;
      matrices.forEach((matrix, index) => {
        batch.setMatrixAt(index, instance.multiplyMatrices(matrix, part.matrixWorld));
        if (outfit) batch.setColorAt(index, outfits[index]);
      });
      group.add(batch);
    });
  }
  return layer;
}
