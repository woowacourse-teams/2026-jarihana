import * as THREE from 'three';

// Broad reflections match the soft vinyl finish of the existing chair illustrations.
export function studioMaterial(parameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.5, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.45,
    envMapIntensity: 0.3, ...parameters,
  });
}

export function createStudioEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0xe9e6de);
  const panels = [
    { position: [-6, 8, 6], size: [8, 10], intensity: 3 },
    { position: [8, 4, 1], size: [6, 8], intensity: 1.7 },
    { position: [0, 5, -8], size: [10, 6], intensity: 2 },
  ];
  for (const { position, size, intensity } of panels) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(intensity, intensity, intensity), side: THREE.DoubleSide,
    }));
    panel.position.set(...position); panel.lookAt(0, 0, 0); studio.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(studio, 0.08, 0.1, 100);
  generator.dispose();
  for (const panel of studio.children) { panel.geometry.dispose(); panel.material.dispose(); }
  return target.texture;
}
