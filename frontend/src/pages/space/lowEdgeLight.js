import * as THREE from "three";

export const LOW_EDGE_LIGHT_SPEC = Object.freeze({
  kind: "lowEdgeLight", name: "하부 간접조명", width: 2.4, depth: 0.08, height: 0.08,
  category: "furniture", collection: "architecture", mount: "wall"
});

const WARM_LIGHT = "#ffd29a";

function spillTexture() {
  const width = 64, height = 32;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = Math.sin(Math.PI * x / (width - 1));
      const reach = y / (height - 1);
      const alpha = Math.pow(edge, 0.35) * Math.pow(reach, 2) * Math.min(1, (1 - reach) * 12);
      const offset = (y * width + x) * 4;
      pixels.set([255, 255, 255, Math.round(alpha * 255)], offset);
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// The fixture sits on the receiving tread/floor; its local +Z side faces the room.
export function buildLowEdgeLight(root, color = WARM_LIGHT, dimensions = [2.4, 0.08, 0.08]) {
  const [width, depth, height] = dimensions;
  const casing = new THREE.MeshStandardMaterial({ color: "#574b40", roughness: 0.64, metalness: 0.3 });
  const box = (name, w, h, d, y, z, material = casing) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name;
    mesh.position.set(0, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.customFinish = true;
    root.add(mesh);
    return mesh;
  };
  box("edge-light-back", width, height, depth * 0.15, height / 2, -depth * 0.425);
  box("edge-light-hood", width, height * 0.15, depth, height * 0.925, 0);
  box("edge-light-fascia", width, height * 0.65, depth * 0.15, height * 0.525, depth * 0.425);
  const emitter = box("edge-light-recessed-emitter", width * 0.98, height * 0.08, depth * 0.4,
    height * 0.28, -depth * 0.1, new THREE.MeshStandardMaterial({
      color: "#e7d1b3", emissive: color, emissiveIntensity: 1.1, roughness: 0.65
    }));
  emitter.castShadow = emitter.receiveShadow = false;
  Object.assign(emitter.userData, { roomBulb: true, roomBulbColor: color, roomBulbStrength: 1.1 });

  const reach = 0.33 * depth / LOW_EDGE_LIGHT_SPEC.depth;
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(width, reach), new THREE.MeshStandardMaterial({
    color: "#000000", emissive: color, emissiveIntensity: 0.65,
    map: spillTexture(), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  }));
  spill.name = "edge-light-floor-spill";
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.003, depth * 0.2 + reach / 2);
  spill.raycast = () => {};
  Object.assign(spill.userData, {
    customFinish: true, roomBulb: true, roomBulbColor: color, roomBulbStrength: 0.65
  });
  root.add(spill);
  return root;
}
