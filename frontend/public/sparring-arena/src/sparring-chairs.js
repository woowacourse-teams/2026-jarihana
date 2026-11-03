import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { studioMaterial } from './studio-materials.js';

function roundedBox(width, height, depth, radius) {
  const source = new THREE.BoxGeometry(width, height, depth, 16, 12, 16);
  const vertices = source.attributes.position, normals = source.attributes.normal;
  const corner = new THREE.Vector3(), offset = new THREE.Vector3();
  for (let index = 0; index < vertices.count; index++) {
    offset.fromBufferAttribute(vertices, index);
    corner.set(
      THREE.MathUtils.clamp(offset.x, -width / 2 + radius, width / 2 - radius),
      THREE.MathUtils.clamp(offset.y, -height / 2 + radius, height / 2 - radius),
      THREE.MathUtils.clamp(offset.z, -depth / 2 + radius, depth / 2 - radius),
    );
    offset.sub(corner).normalize();
    corner.addScaledVector(offset, radius);
    vertices.setXYZ(index, corner.x, corner.y, corner.z);
    normals.setXYZ(index, offset.x, offset.y, offset.z);
  }
  const geometry = source.toNonIndexed();
  source.dispose();
  return geometry;
}

function roundedRectangle(path, left, bottom, width, height, radius) {
  const right = left + width, top = bottom + height;
  path.moveTo(left + radius, bottom);
  path.lineTo(right - radius, bottom);
  path.quadraticCurveTo(right, bottom, right, bottom + radius);
  path.lineTo(right, top - radius);
  path.quadraticCurveTo(right, top, right - radius, top);
  path.lineTo(left + radius, top);
  path.quadraticCurveTo(left, top, left, top - radius);
  path.lineTo(left, bottom + radius);
  path.quadraticCurveTo(left, bottom, left + radius, bottom);
  return path;
}

function subdivideShell(source) {
  const positions = source.attributes.position, normals = source.attributes.normal;
  const vertices = [], directions = [];
  const maxEdgeSquared = 0.06 ** 2;
  function triangle(a, b, c, na, nb, nc) {
    const ab = a.distanceToSquared(b), bc = b.distanceToSquared(c), ca = c.distanceToSquared(a);
    if (Math.max(ab, bc, ca) <= maxEdgeSquared) {
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      directions.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
    } else if (ab >= bc && ab >= ca) {
      const midpoint = a.clone().add(b).multiplyScalar(0.5);
      const normal = na.clone().add(nb).normalize();
      triangle(a, midpoint, c, na, normal, nc); triangle(midpoint, b, c, normal, nb, nc);
    } else if (bc >= ca) {
      const midpoint = b.clone().add(c).multiplyScalar(0.5);
      const normal = nb.clone().add(nc).normalize();
      triangle(a, b, midpoint, na, nb, normal); triangle(a, midpoint, c, na, normal, nc);
    } else {
      const midpoint = c.clone().add(a).multiplyScalar(0.5);
      const normal = nc.clone().add(na).normalize();
      triangle(a, b, midpoint, na, nb, normal); triangle(midpoint, b, c, normal, nb, nc);
    }
  }
  for (let index = 0; index < positions.count; index += 3) {
    triangle(
      new THREE.Vector3().fromBufferAttribute(positions, index),
      new THREE.Vector3().fromBufferAttribute(positions, index + 1),
      new THREE.Vector3().fromBufferAttribute(positions, index + 2),
      new THREE.Vector3().fromBufferAttribute(normals, index),
      new THREE.Vector3().fromBufferAttribute(normals, index + 1),
      new THREE.Vector3().fromBufferAttribute(normals, index + 2),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(directions, 3));
  return geometry;
}

function chairGeometry() {
  const seat = roundedBox(0.94, 0.26, 0.78, 0.12).translate(0, 0.37, 0);
  const outline = new THREE.Shape();
  outline.moveTo(-0.36, 0.34);
  outline.bezierCurveTo(-0.40, 0.49, -0.40, 0.60, -0.40, 0.88);
  outline.bezierCurveTo(-0.40, 1.08, -0.30, 1.11, 0, 1.11);
  outline.bezierCurveTo(0.30, 1.11, 0.40, 1.08, 0.40, 0.88);
  outline.bezierCurveTo(0.40, 0.60, 0.40, 0.49, 0.36, 0.34);
  outline.closePath();
  outline.holes.push(roundedRectangle(new THREE.Path(), -0.19, 0.62, 0.38, 0.18, 0.09));
  const extrusion = new THREE.ExtrudeGeometry(outline, {
    depth: 0.13, steps: 1, curveSegments: 24,
    bevelEnabled: true, bevelSegments: 8, bevelSize: 0.05, bevelThickness: 0.065,
  }).translate(0, 0, -0.34);
  extrusion.deleteAttribute('normal');
  extrusion.deleteAttribute('uv');
  const smoothExtrusion = mergeVertices(extrusion);
  smoothExtrusion.computeVertexNormals();
  smoothExtrusion.computeBoundingBox();
  const originalPositions = smoothExtrusion.attributes.position, originalNormals = smoothExtrusion.attributes.normal;
  for (let index = 0; index < originalPositions.count; index++) {
    const z = originalPositions.getZ(index);
    if (Math.abs(z - smoothExtrusion.boundingBox.min.z) < 1e-6) originalNormals.setXYZ(index, 0, 0, -1);
    if (Math.abs(z - smoothExtrusion.boundingBox.max.z) < 1e-6) originalNormals.setXYZ(index, 0, 0, 1);
  }
  // Bend fine triangles, not the extrusion's long cap triangles: their flat
  // interiors otherwise cut across the curved surface and crumple highlights.
  const originalShell = smoothExtrusion.toNonIndexed();
  const back = subdivideShell(originalShell);
  originalShell.dispose();
  smoothExtrusion.dispose();
  extrusion.dispose();
  // The logo's molded shell curls into the seat and wraps slightly around the sitter.
  const positions = back.attributes.position, normals = back.attributes.normal, normal = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index);
    const bend = THREE.MathUtils.clamp((y - 0.34) / 0.40, 0, 1);
    const z = 0.14 * (1 - bend * bend * (3 - 2 * bend)) + 0.025 * (x / 0.45) ** 2;
    positions.setZ(index, positions.getZ(index) + z);
    // Transform the original smooth normal analytically. Re-averaging bent
    // triangles biases normals toward the extrusion's irregular cap tessellation.
    const dx = 0.05 * x / 0.45 ** 2;
    const dy = -0.14 * 6 * bend * (1 - bend) / 0.40;
    normal.fromBufferAttribute(normals, index);
    normal.set(normal.x - dx * normal.z, normal.y - dy * normal.z, normal.z).normalize();
    normals.setXYZ(index, normal.x, normal.y, normal.z);
  }
  const parts = [seat, back];
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const source = new THREE.CapsuleGeometry(0.115, 0.1, 8, 20);
    const leg = source.toNonIndexed();
    source.dispose();
    leg.rotateX(-z * 0.10); leg.rotateZ(x * 0.10);
    leg.computeBoundingBox();
    leg.translate(x * 0.32, -leg.boundingBox.min.y, z * 0.25);
    parts.push(leg);
  }
  for (const part of parts) part.deleteAttribute('uv');
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSparringChairs(scene, capacity) {
  const geometry = chairGeometry();
  const material = studioMaterial({ color: 0xffffff, roughness: 0.48, clearcoat: 0.14 });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'sparring-chairs';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const mint = new THREE.Color(0x2ac1bc);
  const colors = { a: mint, b: new THREE.Color(0xed6a5a) };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), transform = new THREE.Object3D();
  const active = Array(capacity).fill(false);
  let visibleSlots = 0, disposed = false;
  for (let index = 0; index < capacity; index++) {
    mesh.setMatrixAt(index, zero);
    mesh.setColorAt(index, mint);
  }
  mesh.count = 0;
  scene.add(mesh);

  function hide(index) {
    if (disposed) return;
    active[index] = false;
    while (visibleSlots > 0 && !active[visibleSlots - 1]) visibleSlots--;
    mesh.setMatrixAt(index, zero);
    mesh.count = visibleSlots;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null;
  }

  return {
    draw(index, position, scale = 1, rotation = { x: 0, y: 0, z: 0 }, side = 'a') {
      if (disposed) return;
      active[index] = true;
      visibleSlots = Math.max(visibleSlots, index + 1);
      transform.position.copy(position);
      transform.rotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0, rotation.order ?? 'XYZ');
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, colors[side] ?? mint);
      mesh.count = visibleSlots;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    },
    hide,
    pickMeshes: [mesh],
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
