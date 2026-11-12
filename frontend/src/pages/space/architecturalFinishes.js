import * as THREE from "three";
import { resolveSurface, resolveFloorProfile } from "./surfaceCatalog";
import { createSurfaceMaterial } from "./architecturalMaterials";

export function finishArchitecture(root, template, layout, atmosphere = {}, onReady) {
  const { building: b, mezzanine: m } = layout;
  const finishes = new Map();
  const retired = new Set();
  root.traverse((object) => {
    const surface = object.userData.roomSurface;
    if (!object.isMesh || !["wall", "floor"].includes(surface)) return;
    const dims = object.geometry.parameters;
    if (!dims?.height || (surface === "wall" && (dims.height < 1.2 || dims.height < Math.min(dims.width, dims.depth)))) return;
    const width = surface === "floor" ? dims.width : Math.max(dims.width, dims.depth);
    const height = surface === "floor" ? dims.depth : dims.height;
    const kind = resolveSurface(template, surface, atmosphere[`${surface}Material`] || "auto");
    const scale = atmosphere[`${surface}PatternScale`] || 1;
    const profile = surface === "floor" ? resolveFloorProfile(template, atmosphere.floorMaterial || "auto") : {};
    const key = `${JSON.stringify(profile)}:${kind}:${object.material.color.getHex()}:${width}:${height}:${scale}`;
    if (!finishes.has(key)) finishes.set(key, createSurfaceMaterial(kind, object.material.color, width, height, scale, onReady, profile));
    retired.add(object.material);
    object.material = finishes.get(key);
    object.userData.surfaceMaterial = kind;
  });
  const liveTextures = new Set();
  root.traverse((object) => {
    if (!object.material) return;
    retired.delete(object.material);
    for (const value of Object.values(object.material)) if (value?.isTexture) liveTextures.add(value);
  });
  for (const material of retired) {
    for (const value of Object.values(material)) if (value?.isTexture && !liveTextures.has(value)) value.dispose();
    material.dispose();
  }
  if (!m || template === "lounge") return root;
  const detailing = new THREE.Group();
  detailing.name = `${template}-architectural-detail`;
  root.add(detailing);
  const steel = new THREE.MeshStandardMaterial({ color: template === "study" ? "#6e777b" : "#393638", roughness: 0.43, metalness: 0.48 });
  const wood = new THREE.MeshStandardMaterial({ color: template === "band" ? "#413029" : "#6d503b", roughness: 0.62 });
  function box(name, w, h, d, x, y, z, material = steel, parent = detailing) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  // Loft undersides retain visible joists, so both storeys have an architectural ceiling.
  const underside = new THREE.Group();
  underside.name = "exposed-loft-soffit";
  underside.userData.mezzanine = true;
  detailing.add(underside);
  for (let x = m.minX + 0.25; x < m.maxX; x += template === "study" ? 3.2 : 2.4) {
    box("loft-joist", 0.12, 0.26, m.maxZ - m.minZ, x, m.height - 0.35,
      (m.minZ + m.maxZ) / 2, template === "climbing" || template === "study" ? steel : wood, underside);
  }
  const trim = new THREE.Group(); trim.name = "loft-front-fascia"; trim.userData.mezzanine = true; detailing.add(trim);
  box("fascia-edge", m.maxX - m.minX, 0.08, 0.08, (m.minX + m.maxX) / 2, m.height - 0.05, m.maxZ + 0.06, steel, trim);
  // Each room keeps the reference's own envelope and treatment, not a shared wall skin.
  if (template === "boardgame") {
    // Walnut dado and vertical plaster bays around the right-hand booth.
    const wall = new THREE.Group(); wall.name = "boardgame-booth-paneling"; detailing.add(wall);
    const panel = createSurfaceMaterial("walnut", "#614334", 4, 4);
    box("walnut-dado", 0.07, 1.5, b.maxZ - b.minZ, b.maxX - 0.15, 0.75, (b.minZ + b.maxZ) / 2, panel, wall);
    for (let z = b.minZ + 0.4; z < b.maxZ; z += 2.1) {
      box("wall-panel-stile", 0.11, 1.5, 0.055, b.maxX - 0.2, 0.75, z, wood, wall);
    }
    box("dado-cap", 0.14, 0.07, b.maxZ - b.minZ, b.maxX - 0.2, 1.52, (b.minZ + b.maxZ) / 2, wood, wall);
  }
  if (template === "photo") {
    const wall = new THREE.Group(); wall.name = "gallery-picture-rail"; detailing.add(wall);
    box("gallery-hanging-rail", 0.1, 0.08, 11, b.maxX - 0.19, 7.1, -2, steel, wall);
    for (const z of [-6, -2.8, 0.5]) {
      box("gallery-picture-wire", 0.012, 3.3, 0.012, b.maxX - 0.22, 5.45, z, steel, wall);
    }
  }
  return root;
}
