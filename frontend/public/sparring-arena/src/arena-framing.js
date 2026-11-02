import * as THREE from 'three';

export const ARENA_VIEWS = Object.freeze({
  original: Object.freeze({ trayWidth: 10, edgeScale: 1, heightRatio: 0.66, centerY: 0.24 }),
  reference: Object.freeze({ trayWidth: 14, edgeScale: 1, heightRatio: 0.7, centerY: 0.18 }),
  compact: Object.freeze({ trayWidth: 4.4, edgeScale: 0.45, heightRatio: 0.7, centerY: 0.18 }),
});

export function createArenaCamera(view) {
  if (view === 'reference' || view === 'compact') {
    // The local chair-sparring prototype's camera, without its materials or UI.
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, -5.5, 19);
    camera.lookAt(0, -1.5, 0);
    return camera;
  }
  const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 100);
  camera.position.set(0, 5, 24);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function fitArenaCamera(camera, view, width, height, tank) {
  const profile = ARENA_VIEWS[view];
  const aspect = width / height;
  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
  } else {
    camera.left = -10 * aspect; camera.right = 10 * aspect;
    camera.top = 10; camera.bottom = -10;
  }
  camera.zoom = 1; camera.clearViewOffset();
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const corners = [];
  for (const x of [-tank.width / 2, tank.width / 2]) {
    for (const y of [tank.bottom, tank.rim]) {
      for (const z of [-tank.depth / 2, tank.depth / 2]) {
        corners.push(new THREE.Vector3(x, y, z).project(camera));
      }
    }
  }
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const projectedWidth = (Math.max(...xs) - Math.min(...xs)) * width / 2;
  const projectedHeight = (maxY - minY) * height / 2;
  camera.zoom = Math.min(width * (width <= 700 ? 0.9 : 0.8) / projectedWidth, height * profile.heightRatio / projectedHeight);
  const centerY = (minY + maxY) * camera.zoom / 2;
  const desktopOffset = view === 'original' && width > 1000 ? 36 : 0;
  camera.setViewOffset(width, height, 0, (profile.centerY - centerY) * height / 2 - desktopOffset, width, height);
}

export function extendArenaViewport(camera, renderCamera, bounds, width, height, cinematic = false) {
  const top = cinematic ? Math.min(0, bounds.top) : bounds.top;
  const viewportHeight = Math.max(bounds.height + bounds.top - top, height - top);
  const view = camera.view;
  renderCamera.copy(camera);
  // Render through the page gutters while preserving every world-to-screen anchor.
  renderCamera.setViewOffset(view.fullWidth, view.fullHeight,
    view.offsetX - bounds.left * view.width / bounds.width, view.offsetY - (bounds.top - top) * view.height / bounds.height,
    view.width * width / bounds.width, view.height * viewportHeight / bounds.height);
  return { x: 0, y: height - top - viewportHeight, width, height: viewportHeight };
}
