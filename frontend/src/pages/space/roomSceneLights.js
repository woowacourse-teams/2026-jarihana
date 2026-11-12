import * as THREE from "three";

const LIGHT_PROPERTIES = ["distance", "decay", "angle", "penumbra", "width", "height", "map"];

// Hidden floors keep zero-intensity lights in the renderer so their shader light counts stay stable.
export function createRoomSceneLights(scene) {
  const layer = new THREE.Group();
  layer.name = "room-scene-light-proxies";
  scene.add(layer);
  const entries = new Map();
  const inverseScene = new THREE.Matrix4();
  let signature = "";
  let revision = 0;
  let disposed = false;

  function release(source, { proxy, mask }) {
    source.layers.mask = mask;
    proxy.removeFromParent();
    proxy.dispose();
    entries.delete(source);
  }

  function refresh() {
    if (disposed) return;
    scene.updateWorldMatrix(true, false);
    inverseScene.copy(scene.matrixWorld).invert();
    layer.updateWorldMatrix(false, false);
    for (const [source, entry] of entries) {
      const { proxy, mask } = entry;
      let visible = false;
      for (let ancestor = source; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) break;
        if (ancestor === scene) { visible = true; break; }
      }
      proxy.visible = true;
      proxy.layers.mask = mask;
      proxy.color.copy(source.color);
      proxy.intensity = visible ? source.intensity : 0;
      for (const property of LIGHT_PROPERTIES) {
        if (property in source) proxy[property] = source[property];
      }
      if (source.groundColor) proxy.groundColor.copy(source.groundColor);
      if (source.sh) proxy.sh.copy(source.sh);
      source.updateWorldMatrix(true, false);
      proxy.matrix.multiplyMatrices(inverseScene, source.matrixWorld);
      proxy.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale);
      proxy.matrixWorldNeedsUpdate = true;
      proxy.updateWorldMatrix(false, false);
      if (source.target) {
        source.target.getWorldPosition(proxy.target.position);
        proxy.target.updateMatrixWorld(true);
      }
    }
  }

  function sync() {
    if (disposed) return revision;
    const sources = new Set();
    for (const child of scene.children) {
      if (child === layer) continue;
      child.traverse((object) => {
        // The global rig and shadow owners retain their existing rendering and disposal lifecycle.
        if (object.isLight && object.parent !== scene && !object.castShadow) sources.add(object);
      });
    }
    for (const [source, entry] of entries) {
      if (!sources.has(source)) release(source, entry);
    }
    const counts = new Map();
    for (const source of sources) {
      let entry = entries.get(source);
      if (!entry) {
        const proxy = source.clone(false);
        proxy.clear();
        proxy.userData = {};
        proxy.matrixAutoUpdate = false;
        entry = { proxy, mask: source.layers.mask };
        entries.set(source, entry);
        source.layers.disableAll();
        layer.add(proxy);
      }
      const { mask } = entry;
      const key = `${source.type}:${mask}:${Boolean(source.map)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    refresh();
    const nextSignature = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `${key}:${count}`).join("|");
    if (nextSignature !== signature) {
      signature = nextSignature;
      revision += 1;
    }
    return revision;
  }

  return {
    sync,
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [source, entry] of entries) release(source, entry);
      layer.removeFromParent();
    }
  };
}
