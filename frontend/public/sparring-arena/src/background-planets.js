import * as THREE from 'three';
import { studioMaterial } from './studio-materials.js';

export const PLANET_COLORS = Object.freeze({ mint: 0x32c9c0, ivory: 0xeeeae3 });

export function createClayPlanetGeometry() {
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const positions = geometry.attributes.position;
  const colors = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 3), 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const field = Math.sin(11 * x + 2 * Math.sin(7 * y))
      * Math.sin(12 * y + Math.sin(6 * z)) * Math.sin(10 * z + Math.sin(7 * x));
    const island = THREE.MathUtils.smoothstep(field, 0.08, 0.4);
    const radius = 1 + island * 0.012;
    positions.setXYZ(i, x * radius, y * radius, z * radius);
    const shade = 1 - island * 0.07;
    colors.setXYZ(i, shade, shade, shade);
  }
  geometry.setAttribute('color', colors);
  geometry.computeVertexNormals();
  return geometry;
}

// Clay islands and a soft ring echo the home hero's mint and ivory planets.
export function createBackgroundPlanets(scene) {
  const group = new THREE.Group();
  group.name = 'background-planets';
  const geometry = createClayPlanetGeometry();
  const mint = studioMaterial({ color: PLANET_COLORS.mint, vertexColors: true, roughness: 0.82, envMapIntensity: 0.12 });
  const ivory = studioMaterial({ color: PLANET_COLORS.ivory, vertexColors: true, roughness: 0.82, envMapIntensity: 0.12 });
  const ringGeometry = new THREE.TorusGeometry(1.4, 0.07, 12, 96);
  const ringMaterial = studioMaterial({ color: PLANET_COLORS.ivory, roughness: 0.65, envMapIntensity: 0.12 });
  const planets = [
    { position: [-9, 5.5, -22], radius: 2.4, material: mint, tilt: 0.4 },
    { position: [7, 6.5, -14], radius: 4.2, material: ivory, tilt: -0.3, ring: true },
    { position: [-23, 11, -25], radius: 0.95, material: mint, tilt: 1.2 },
    { position: [-25, -1, -23], radius: 0.7, material: ivory, tilt: -0.7 },
    { position: [24, -3, -23], radius: 1.05, material: mint, tilt: -0.5 },
    { position: [-19, -4, -18], radius: 1.4, material: ivory, tilt: 0.5, ring: true },
    { position: [24, 11, -28], radius: 0.7, material: mint, tilt: 0.9 },
  ];
  for (const { position, radius, material, tilt, ring: hasRing } of planets) {
    const planet = new THREE.Mesh(geometry, material);
    planet.position.set(...position);
    planet.scale.setScalar(radius);
    planet.rotation.set(tilt, tilt * 2, tilt);
    group.add(planet);
    if (hasRing) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(planet.position);
      ring.scale.setScalar(radius);
      ring.rotation.set(1.1, 0.2, tilt);
      group.add(ring);
    }
  }
  scene.add(group);
  return group;
}
