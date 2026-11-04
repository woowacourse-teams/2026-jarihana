import * as THREE from 'three';

export const COURT_COLORS = Object.freeze({ mint: 0x27bdb6, coral: 0xec7569, line: 0xffffff });
export const FRAME_COLOR = 0x46645e;

// Broad reflections match the soft vinyl finish of the existing chair illustrations.
export function studioMaterial(parameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.5, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.45,
    envMapIntensity: 0.3, ...parameters,
  });
}

export function teamMaterial({ colorIntensity = 0.65, ...parameters } = {}) {
  const material = studioMaterial({ ...parameters, toneMapped: false, envMapIntensity: 0, specularIntensity: 0.05, clearcoat: 0 });
  // Compensate for the studio lighting so team colors retain the entry screen's saturation.
  material.color.multiplyScalar(colorIntensity);
  return material;
}

export function createStudioEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0xe9edf0);
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
