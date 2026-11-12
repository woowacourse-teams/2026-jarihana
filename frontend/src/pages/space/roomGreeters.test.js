import { Matrix4, Vector3 } from "three";
import { getRoomLayout, PLAYER } from "./roomLayout";
import { createYardGreeters, placeYardGreeters } from "./roomGreeters";
import { isWalkablePosition } from "./roomNavigation";
import { createInitialRoom, ROOM_TEMPLATES } from "./roomState";

it.each(ROOM_TEMPLATES.map(({ id }) => id))("puts a small %s roster on the diorama yard and leaves the entry clear", (template) => {
  const room = createInitialRoom(template);
  const { building } = getRoomLayout(template);
  const greeters = placeYardGreeters(room, [7, 8, 9]);
  expect(greeters.map(({ memberId }) => memberId)).toEqual([7, 8, 9]);
  for (const { x, z, inDiorama } of greeters) {
    expect(inDiorama).toBe(true);
    expect(z).toBeGreaterThan(building.maxZ);
    expect(Math.abs(x - PLAYER.spawn.x)).toBeGreaterThan(2);
    expect(isWalkablePosition({ x, z }, room, 0.66)).toBe(true);
  }
});

it("places a larger roster throughout the yard with one raised hand per person", () => {
  const room = createInitialRoom("boardgame");
  const memberIds = Array.from({ length: 130 }, (_, index) => index + 1);
  const layer = createYardGreeters(room, memberIds);
  const [diorama, overflow] = layer.children;
  expect(overflow.userData.memberIds.length).toBeGreaterThan(0);
  expect([...diorama.userData.memberIds, ...overflow.userData.memberIds]).toEqual(memberIds);
  for (const group of layer.children) {
    const hand = group.getObjectByName("greeting-hand");
    expect(hand.count).toBe(group.userData.memberIds.length);
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    hand.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);
    scale.setFromMatrixScale(matrix);
    expect(position.y / (scale.y / 0.124)).toBeGreaterThan(1.2);
  }
});
