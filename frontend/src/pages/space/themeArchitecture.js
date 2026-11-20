import * as THREE from 'three';
import { createClearWindowMaterial } from './roomGlazing';

const CLIMBING_WALL_DEPTH = 0.16;
const CLIMBING_WALL_OFFSET = -0.04;
export const CLIMBING_WALL_INNER_FACE = CLIMBING_WALL_OFFSET + CLIMBING_WALL_DEPTH / 2;

// Legacy openings remain stable for saved v10 rooms. New plans own their openings.
export function wallOpenings(template, side, height) {
  if (template === 'climbing' && side === 'back')
    return [1.9, 5.2, 8.5].map(x => ({ x, width: 2.7, sill: 6.9, top: height - 0.8, divisions: 2 }));
  if (template === 'dining' && side === 'back')
    return [-9.6, -3.2, 3.2, 9.6].map(x => ({ x, width: 4.9, sill: 7.3, top: 11.1, arch: true }));
  if (template === 'study' && side === 'left')
    return [-7.8, -2.6, 2.6, 7.8].map(x => ({ x, width: 4.85, sill: 0.45, top: height - 0.6, divisions: 2 }));
  if (template === 'photo' && side === 'back')
    return [{ x: 7, width: 7.6, sill: 6.3, top: height - 1.1, divisions: 3 }];
  if (template === 'photo' && side === 'left')
    return [{ x: 3.3, width: 7.4, sill: 6.6, top: 10.8, divisions: 3 }];
  return [];
}

export function buildThemeWall(parent, wall, layout, template, color) {
  const b = layout.building;
  const side = wall.z === b.minZ ? 'back' : wall.x === b.minX ? 'left' : wall.x === b.maxX ? 'right' : 'front';
  if (side === 'front') return false;
  const span = side === 'back' ? wall.width : wall.depth;
  const thickness = side === 'back' ? wall.depth : wall.width;
  const group = new THREE.Group();
  group.name = `${template}-${side}-wall-construction`;
  group.position.set(wall.x, 0, wall.z);
  group.rotation.y = side === 'left' ? Math.PI / 2 : side === 'right' ? -Math.PI / 2 : 0;
  parent.add(group);
  const mats = new Map();
  function material(tint, surface) {
    const key = `${tint}:${surface}`;
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9 }));
    return mats.get(key);
  }
  function box(name, w, h, d, x, y, z = 0, tint = color, surface = true) {
    if (w <= 0 || h <= 0) return;
    if (surface && template === 'band') { d = 0.1; z = -0.07; }
    if (surface && template === 'climbing') { d = CLIMBING_WALL_DEPTH; z = CLIMBING_WALL_OFFSET; }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(tint, surface));
    mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    if (surface) { mesh.userData.roomSurface = 'wall'; mesh.userData.surfaceShade = 1; }
    group.add(mesh); return mesh;
  }
  const openings = [...(layout.openings?.[side] ?? wallOpenings(template, side, b.height))].sort((a, c) => a.x - c.x);
  let cursor = -span / 2;
  for (const win of openings) {
    const left = win.x - win.width / 2, right = win.x + win.width / 2;
    box('window-pier', left - cursor, b.height, thickness, (left + cursor) / 2, b.height / 2);
    box('window-sill-wall', win.width, win.sill, thickness, win.x, win.sill / 2);
    box('window-head-wall', win.width, b.height - win.top, thickness, win.x, (b.height + win.top) / 2);
    const frame = template === 'dining' ? '#ac8764' : template === 'study' ? '#727d82' : '#464f50';
    const radius = win.width / 2;
    const archBase = win.arch ? win.top - radius : win.top;
    const glassShape = new THREE.Shape();
    glassShape.moveTo(-radius, win.sill); glassShape.lineTo(radius, win.sill); glassShape.lineTo(radius, archBase);
    if (win.arch) glassShape.absarc(0, archBase, radius, 0, Math.PI, false);
    else glassShape.lineTo(-radius, win.top);
    glassShape.closePath();
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(glassShape), createClearWindowMaterial());
    glass.userData.roomWindow = true;
    glass.name = `${template}-daylight-window`; glass.position.set(win.x, 0, -0.02); group.add(glass);
    for (const x of [left, right]) box('window-jamb', 0.12, archBase - win.sill, thickness + 0.12, x, (archBase + win.sill) / 2, 0, frame, false);
    box('window-sill', win.width + 0.2, 0.13, thickness + 0.28, win.x, win.sill, 0.05, frame, false);
    if (win.arch) {
      const infill = new THREE.Shape();
      infill.moveTo(-radius, archBase); infill.lineTo(-radius, win.top); infill.lineTo(radius, win.top); infill.lineTo(radius, archBase);
      infill.absarc(0, archBase, radius, 0, Math.PI, false); infill.closePath();
      const corner = new THREE.Mesh(new THREE.ExtrudeGeometry(infill, { depth: thickness, bevelEnabled: false, curveSegments: 24 }), material(color, true));
      corner.name = 'arched-window-spandrel'; corner.position.set(win.x, 0, -thickness / 2); corner.userData.roomSurface = 'wall'; group.add(corner);
      const curve = new THREE.EllipseCurve(win.x, archBase, radius, radius, 0, Math.PI, false, 0);
      const points = curve.getPoints(32).map(p => new THREE.Vector3(p.x, p.y, 0.08));
      const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.08, 6, false), material(frame, false));
      arch.name = 'arched-window-frame'; group.add(arch);
      box('arch-spring-transom', win.width, 0.075, thickness + 0.1, win.x, archBase, 0, frame, false);
    } else box('window-head-frame', win.width + 0.12, 0.12, thickness + 0.1, win.x, win.top, 0, frame, false);
    const divisions = win.divisions || 2;
    for (let n = 1; n < divisions; n++) box('window-mullion', 0.065, archBase - win.sill, 0.15, left + win.width * n / divisions, (archBase + win.sill) / 2, 0.07, frame, false);
    if (!win.arch && archBase - win.sill > 5) box('window-transom', win.width, 0.065, 0.15, win.x, 5.8, 0.07, frame, false);
    cursor = right;
  }
  box(openings.length ? 'window-pier' : 'solid-wall', span / 2 - cursor, b.height, thickness, (span / 2 + cursor) / 2, b.height / 2);
  if (template === 'band') {
    // Thick, separated fabric wall cassettes, not wood slats printed on a flat wall.
    const columns = Math.floor(span / 1.55), rows = Math.floor(b.height / 1.4);
    const pw = (span - 0.25) / columns, ph = (b.height - 0.2) / rows;
    const geometry = new THREE.BoxGeometry(pw - 0.065, ph - 0.065, 0.13);
    const panel = new THREE.InstancedMesh(geometry, material(color, true).clone(), columns * rows);
    panel.name = 'band-fabric-wall-cassettes'; panel.userData.roomSurface = 'wall'; panel.userData.surfaceShade = 0.82;
    panel.material.color.multiplyScalar(0.82);
    const matrix = new THREE.Matrix4();
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      matrix.makeTranslation(-span / 2 + 0.125 + pw * (col + 0.5), 0.1 + ph * (row + 0.5), 0.045);
      panel.setMatrixAt(row * columns + col, matrix);
    }
    panel.castShadow = panel.receiveShadow = true; panel.computeBoundingBox(); group.add(panel);
    for (const x of [-span / 2 + 0.2, span / 2 - 0.2])
      box('band-corner-bass-trap', 0.3, b.height - 0.3, 0.2, x, b.height / 2, 0.01, '#24252b', false);
  }
  if (template === 'climbing') {
    for (let x = -span / 2 + 0.2; x < span / 2; x += 4.4)
      box('industrial-wall-upright', 0.18, b.height, 0.1, x, b.height / 2, 0.06, '#535f63', false);
  }
  return true;
}
