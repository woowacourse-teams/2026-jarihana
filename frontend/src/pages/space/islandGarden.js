import * as THREE from "three";

function roundedOutline(bounds, radius, path = new THREE.Shape()) {
  const { minX, maxX, minZ, maxZ } = bounds;
  path.moveTo(minX + radius, -maxZ);
  path.lineTo(maxX - radius, -maxZ);
  path.quadraticCurveTo(maxX, -maxZ, maxX, -maxZ + radius);
  path.lineTo(maxX, -minZ - radius);
  path.quadraticCurveTo(maxX, -minZ, maxX - radius, -minZ);
  path.lineTo(minX + radius, -minZ);
  path.quadraticCurveTo(minX, -minZ, minX, -minZ - radius);
  path.lineTo(minX, -maxZ + radius);
  path.quadraticCurveTo(minX, -maxZ, minX + radius, -maxZ);
  return path;
}

export function createIslandGarden(layout, building, terrace) {
  const root = new THREE.Group();
  root.name = "island-garden";
  root.userData.outdoor = true;
  const { walkable } = layout;
  const frontZ = terrace?.maxZ ?? building.maxZ;
  const pathEnd = walkable.maxZ - 0.7;
  const loop = {
    minX: building.minX - 3.8,
    maxX: building.maxX + 3.8,
    minZ: building.minZ - 6.8,
    maxZ: Math.min(frontZ + 7, pathEnd - 3)
  };
  const surface = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const stone = surface("#d8c9ad");
  const transform = new THREE.Object3D();

  function instances(name, geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.userData.walkCameraPassThrough = true;
    root.add(mesh);
    return mesh;
  }

  function place(mesh, index, x, y, z, sx, sy, sz, rotation = 0) {
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    transform.rotation.set(0, rotation, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }

  const pathShape = roundedOutline(loop, 2.6);
  pathShape.holes.push(roundedOutline({
    minX: loop.minX + 1.65, maxX: loop.maxX - 1.65,
    minZ: loop.minZ + 1.65, maxZ: loop.maxZ - 1.65
  }, 0.95, new THREE.Path()));
  const loopGeometry = new THREE.ShapeGeometry(pathShape, 8);
  loopGeometry.rotateX(-Math.PI / 2);
  const promenade = new THREE.Mesh(loopGeometry, surface("#c4b496"));
  promenade.name = "garden-loop-path";
  promenade.position.y = 0.006;
  promenade.receiveShadow = true;
  root.add(promenade);

  const stepCount = Math.max(1, Math.floor((pathEnd - frontZ) / 0.85));
  const entry = instances("entrance-path", new THREE.BoxGeometry(1, 1, 1), stone, stepCount);
  for (let i = 0; i < stepCount; i += 1) {
    place(entry, i, -2 + Math.sin(i * 0.9) * 0.06, -0.03, frontZ + 0.43 + i * 0.85,
      2.9, 0.08, 0.78, Math.sin(i * 1.7) * 0.015);
  }

  const frontBedZ = (loop.maxZ + walkable.maxZ) / 2;
  const beds = [
    { x: (loop.minX - 3.5) / 2, z: frontBedZ, rx: 3.1, rz: 1.25 },
    { x: (loop.maxX + 0.5) / 2, z: frontBedZ, rx: 3.5, rz: 1.3 },
    { x: building.minX - 6.5, z: frontZ + 2, rx: 1.5, rz: 3.2 },
    { x: building.maxX + 6.5, z: frontZ + 1, rx: 1.6, rz: 3.5 },
    { x: building.minX - 4, z: building.minZ - 10, rx: 2.7, rz: 1.25 },
    { x: building.maxX + 3.6, z: building.minZ - 10, rx: 2.5, rz: 1.2 }
  ];
  const soilGeometry = new THREE.CircleGeometry(1, 32);
  soilGeometry.rotateX(-Math.PI / 2);
  const soil = instances("garden-flower-beds", soilGeometry, surface("#667045"), beds.length);
  const edgingCount = 44;
  const plantCount = 58;
  const edging = instances("garden-bed-stone-edging", new THREE.OctahedronGeometry(1, 1),
    surface("#b8b29b"), beds.length * edgingCount);
  const leaves = instances("garden-groundcover", new THREE.OctahedronGeometry(1, 1),
    surface("#82965b"), beds.length * plantCount);
  const flowers = instances("garden-flower-heads", new THREE.OctahedronGeometry(1, 1),
    surface("#ffffff"), beds.length * plantCount * 3);
  const flowerColors = ["#f0c8cf", "#eee2ac", "#cbb5e3", "#f4e9d9"].map((color) => new THREE.Color(color));
  const leafColors = ["#82965b", "#657e50", "#9ea76a"].map((color) => new THREE.Color(color));

  const drySoil = new THREE.Color("#ffffff");
  beds.forEach((bed, bedIndex) => {
    soil.setColorAt(bedIndex, drySoil);
    place(soil, bedIndex, bed.x, 0.004, bed.z, bed.rx, 1, bed.rz);
    for (let i = 0; i < edgingCount; i += 1) {
      const angle = i / edgingCount * Math.PI * 2;
      place(edging, bedIndex * edgingCount + i,
        bed.x + Math.cos(angle) * bed.rx, 0.025, bed.z + Math.sin(angle) * bed.rz,
        0.12, 0.05, 0.1, angle);
    }
    for (let i = 0; i < plantCount; i += 1) {
      const angle = i * 2.399963;
      const radius = Math.sqrt((i + 0.5) / plantCount) * 0.88;
      const x = bed.x + Math.cos(angle) * bed.rx * radius;
      const z = bed.z + Math.sin(angle) * bed.rz * radius;
      const index = bedIndex * plantCount + i;
      const height = 0.11 + (i % 3) * 0.025;
      place(leaves, index, x, height * 0.55, z, 0.25, height, 0.2, angle);
      leaves.setColorAt(index, leafColors[(i + bedIndex) % leafColors.length]);
      for (let bloom = 0; bloom < 3; bloom += 1) {
        const bloomAngle = bloom / 3 * Math.PI * 2 + angle;
        const flowerIndex = index * 3 + bloom;
        place(flowers, flowerIndex, x + Math.cos(bloomAngle) * 0.13,
          height + 0.055, z + Math.sin(bloomAngle) * 0.12, 0.075, 0.045, 0.075);
        flowers.setColorAt(flowerIndex, flowerColors[(bedIndex + Math.floor(i / 10)) % flowerColors.length]);
      }
    }
  });

  root.userData.flowerBeds = beds.map(({ x, z, rx, rz }, index) => {
    const setFlowerColor = (color) => {
      for (let bloom = 0; bloom < plantCount * 3; bloom += 1) {
        flowers.setColorAt(index * plantCount * 3 + bloom, color || flowerColors[(index + Math.floor(bloom / 30)) % flowerColors.length]);
      }
      flowers.instanceColor.needsUpdate = true;
    };
    const setSoilColor = (color) => {
      soil.setColorAt(index, color);
      soil.instanceColor.needsUpdate = true;
    };
    return {
      id: `garden-bed-${index}`, x, z, width: rx * 2, depth: rz * 2, y: 0.25, floor: 0,
      paint: (color) => setFlowerColor(new THREE.Color(color)),
      water: () => setSoilColor(new THREE.Color("#c3c4ad")),
      reset() { setFlowerColor(null); setSoilColor(drySoil); }
    };
  });

  const lightMaterial = new THREE.MeshStandardMaterial({ color: "#e6c58c", emissive: "#efbc76", emissiveIntensity: 0.7, roughness: 0.8 });
  const markers = instances("garden-recessed-path-lights", new THREE.CylinderGeometry(0.12, 0.12, 0.025, 8), lightMaterial, 4);
  markers.userData.roomBulb = true;
  markers.userData.roomBulbColor = "#efbc76";
  for (let i = 0; i < 4; i += 1) {
    const x = i % 2 ? loop.maxX - 0.8 : loop.minX + 0.8;
    const z = i < 2 ? loop.maxZ - 2.5 : loop.minZ + 2.5;
    place(markers, i, x, 0.025, z, 1, 1, 1);
    const light = new THREE.PointLight("#efbc76", 7, 7, 2);
    light.name = "garden-path-light";
    light.position.set(x, 1.2, z);
    light.userData.roomLamp = true;
    light.userData.roomLampColor = "#efbc76";
    light.userData.roomLampStrength = light.intensity;
    root.add(light);
  }
  return root;
}
