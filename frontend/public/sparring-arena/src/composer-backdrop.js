import * as THREE from 'three';

// The field must cover the hose but remain behind the selectable 3D characters.
export function createComposerBackdrop(scene) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'composer-backdrop'; mesh.visible = false;
  scene.add(mesh);
  let dimensions = '';
  function update(rect, viewport, radius = 16) {
    mesh.visible = !!rect && rect.width > 0 && rect.height > 0;
    if (!mesh.visible) return;
    const w = rect.width, h = rect.height, r = Math.min(radius, w / 2, h / 2);
    const key = `${w}:${h}:${r}`;
    if (key !== dimensions) {
      const shape = new THREE.Shape();
      shape.moveTo(r, 0); shape.lineTo(w - r, 0); shape.quadraticCurveTo(w, 0, w, r);
      shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h);
      shape.lineTo(r, h); shape.quadraticCurveTo(0, h, 0, h - r);
      shape.lineTo(0, r); shape.quadraticCurveTo(0, 0, r, 0);
      mesh.geometry.dispose(); mesh.geometry = new THREE.ShapeGeometry(shape);
      dimensions = key;
    }
    mesh.position.set(rect.left - viewport.width / 2, viewport.height / 2 - rect.bottom, 20);
  }
  return { update, dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); } };
}
