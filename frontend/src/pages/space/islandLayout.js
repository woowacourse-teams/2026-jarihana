// Leave a planted four-metre rim between the usable grounds and the cliff.
export function getIslandLayout(building) {
  const surface = { minX: building.minX - 14, maxX: building.maxX + 14,
    minZ: building.minZ - 17, maxZ: building.maxZ + 22 };
  const walkable = { minX: surface.minX + 4, maxX: surface.maxX - 4,
    minZ: surface.minZ + 4, maxZ: surface.maxZ - 4 };
  const entrance = { ...walkable, minZ: building.maxZ };
  const exterior = [entrance,
    { minX: walkable.minX, maxX: building.minX, minZ: walkable.minZ, maxZ: building.maxZ },
    { minX: building.maxX, maxX: walkable.maxX, minZ: walkable.minZ, maxZ: building.maxZ },
    { minX: building.minX, maxX: building.maxX, minZ: walkable.minZ, maxZ: building.minZ }
  ];
  return { surface, walkable, bottomY: -8.5, entrance, exterior };
}

export function getDioramaBounds(layout) {
  const building = layout.building || layout;
  const terrace = layout.terrace;
  return {
    minX: Math.min(building.minX - 1.2, terrace?.minX ?? Infinity), maxX: Math.max(building.maxX + 1.2, terrace?.maxX ?? -Infinity),
    minZ: Math.min(building.minZ - 0.9, terrace?.minZ ?? Infinity), maxZ: Math.max(building.maxZ + 3.55, terrace?.maxZ ?? -Infinity),
    minY: -0.155, maxY: -0.015
  };
}
