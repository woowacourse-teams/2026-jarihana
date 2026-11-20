import { bindRoomBlueprint, getRoomLayout } from "./roomLayout";
import { createRoomShell, disposeObject } from "./roomModels";

function expectSurface(mesh, left, right, back, front, top, overhangX = 0, overhangZ = 0) {
  const { width, depth, height } = mesh.geometry.parameters;
  expect(mesh.position.x - width / 2).toBeCloseTo(left - overhangX);
  expect(mesh.position.x + width / 2).toBeCloseTo(right + overhangX);
  expect(mesh.position.z - depth / 2).toBeCloseTo(back - overhangZ);
  expect(mesh.position.z + depth / 2).toBeCloseTo(front + overhangZ);
  expect(mesh.position.y - height / 2).toBeCloseTo(top);
}

test.each([
  ["original lounge", 11, -10, 10, -8, 5, 6.4, 4.2, 4],
  ["original loft", 12, -15, 10, -8, 5, 7.6, 4.2, 4],
  ["published two-height lounge", 13, -6, 18, -12, 8, 9, 5, 11],
  ["published single-height lounge", 14, -6, 18, -12, 8, 9, undefined, null]
])("%s floor and ceilings follow the published footprint", (_, version, minX, maxX, minZ, maxZ, height, wingHeight, wingX) => {
  const previous = getRoomLayout("lounge", Math.min(version, 12));
  const geometry = version <= 12 ? previous : {
    ...previous,
    building: { minX, maxX, minZ, maxZ, height, wingHeight },
    walls: wingX === null ? [] : [
      { x: (wingX + maxX) / 2, z: minZ, width: maxX - wingX, depth: 0.24, height: wingHeight }
    ]
  };
  const shell = createRoomShell(bindRoomBlueprint({ template: "lounge", version: 11 }, {
    blueprintRef: { templateKey: "lounge", version }, geometry
  }));
  try {
    const floors = shell.children.filter(mesh => mesh.userData.roomSurface === "floor");
    const [floor, ...planks] = floors;
    expectSurface(floor, minX, maxX, minZ, maxZ, -0.105);
    expect(planks).toHaveLength(30);
    const halfPlank = planks[0].geometry.parameters.depth / 2;
    expect(planks[0].position.z - halfPlank).toBeCloseTo(minZ + 0.004);
    expect(planks.at(-1).position.z + halfPlank).toBeCloseTo(maxZ - 0.004);

    const ceilings = shell.children.filter(child => child.name === "building-ceiling")
      .map(roof => roof.children.find(mesh => mesh.userData.roomSurface === "wall"));
    expect(ceilings).toHaveLength(wingX === null ? 1 : 2);
    expectSurface(ceilings[0], minX, wingX ?? maxX, minZ, maxZ, height, 0.125, 0.15);
    if (wingHeight === undefined) {
      const pendants = shell.getObjectByName("lounge-pendants");
      const cords = pendants.children.filter(mesh => mesh.geometry?.parameters.radiusTop === 0.032);
      expect(cords.length).toBeGreaterThan(0);
      for (const cord of cords) {
        expect(cord.position.y + cord.geometry.parameters.height / 2).toBeCloseTo(height - 0.04);
      }
    }
    if (wingX !== null) {
      expectSurface(ceilings[1], wingX, maxX, minZ, maxZ, wingHeight, 0.125, 0.15);
      const upperWall = shell.getObjectByName("hall-upper-wall").children[0];
      expectSurface(upperWall, wingX - 0.1, wingX + 0.1, minZ, maxZ, wingHeight);
      expect(upperWall.geometry.parameters.height).toBeCloseTo(height - wingHeight);
    }
  } finally { disposeObject(shell); }
});
