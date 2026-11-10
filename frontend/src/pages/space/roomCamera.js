import * as THREE from "three";
import { getDioramaBounds } from "./islandLayout";
import { DEFAULT_ROOM_ZOOM } from "./roomCameraZoom";

function projectVolumes(camera, volumes) {
  const bounds = new THREE.Box2();
  for (const area of volumes) {
    for (const x of [area.minX, area.maxX]) for (const y of [area.minY, area.maxY]) for (const z of [area.minZ, area.maxZ]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      const depth = camera.isPerspectiveCamera ? -point.z : 1;
      bounds.expandByPoint(new THREE.Vector2(point.x / depth, point.y / depth));
    }
  }
  return bounds;
}

export function frameRoomFrontCamera(camera, { layout, template, aspect }) {
  const { building, terrace } = layout;
  const apron = getDioramaBounds(layout);
  const centerX = (building.minX + building.maxX) / 2;
  // Keep the camera level and shift the lens upward so verticals stay straight.
  camera.position.set(centerX, 1.45, apron.maxZ + 7.5);
  camera.rotation.set(0, 0, 0);
  camera.focus = camera.position.z - building.maxZ;
  camera.updateMatrixWorld();
  const facade = projectVolumes(camera, [{
    minX: building.minX - 0.5, maxX: building.maxX + 0.5,
    minY: 0, maxY: building.height + (terrace ? 0.67 : 0.25),
    minZ: building.minZ, maxZ: building.maxZ + 0.75
  }]);
  if (template === "dining" && terrace) {
    facade.union(projectVolumes(camera, [{ ...building, minY: 4.5, maxY: 5.1, minZ: building.maxZ, maxZ: building.maxZ + 2 }]));
  }
  const foreground = projectVolumes(camera, [terrace ? {
    ...apron, maxZ: apron.maxZ + 0.16, minY: -0.22
  } : apron]);
  const lower = Math.min(facade.min.y, foreground.min.y);
  // Fit the facade horizontally and keep the front lip of the paving above the body seam.
  const span = Math.max((facade.max.y - lower) / 0.95, (facade.max.x - facade.min.x) / (aspect * 0.94));
  return { halfHeight: span / 2, centerY: lower + span * 0.475 };
}

export function setRoomFrontLens(camera, lens, aspect, wideAngle) {
  const halfHeight = lens.halfHeight * (1 + wideAngle / 100);
  camera.aspect = aspect;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight));
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = lens.centerY / halfHeight;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

export function frameRoomCameraFlight(camera, from, to, fromRect, toRect, canvasRect, progress) {
  const lerp = (a, b) => THREE.MathUtils.lerp(a, b, progress);
  camera.position.lerpVectors(from.position, to.position, progress);
  camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, progress);
  // Keep both endpoints in the same screen positions when the canvas changes size.
  if (from.isPerspectiveCamera || to.isPerspectiveCamera) {
    const distance = from.focus ?? to.focus;
    const fromProjection = fitFlightProjection(from, fromRect, canvasRect, distance);
    const toProjection = fitFlightProjection(to, toRect, canvasRect, distance);
    camera.aspect = canvasRect.width / canvasRect.height;
    camera.focus = distance;
    camera.projectionMatrix.elements.forEach((_, index, elements) => {
      elements[index] = lerp(fromProjection[index], toProjection[index]);
    });
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  } else {
    const fromUnit = (from.right - from.left) / fromRect.width;
    const toUnit = (to.right - to.left) / toRect.width;
    const unit = lerp(fromUnit, toUnit);
    camera.left = lerp(from.left + (canvasRect.left - fromRect.left) * fromUnit, to.left + (canvasRect.left - toRect.left) * toUnit);
    camera.top = lerp(from.top - (canvasRect.top - fromRect.top) * fromUnit, to.top - (canvasRect.top - toRect.top) * toUnit);
    camera.right = camera.left + canvasRect.width * unit;
    camera.bottom = camera.top - canvasRect.height * unit;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}

function fitFlightProjection(camera, rect, canvasRect, distance) {
  const scaleX = rect.width / canvasRect.width;
  const scaleY = rect.height / canvasRect.height;
  const x = 2 * (rect.left - canvasRect.left) / canvasRect.width + scaleX - 1;
  const y = 1 - 2 * (rect.top - canvasRect.top) / canvasRect.height - scaleY;
  const matrix = camera.projectionMatrix.elements;
  // Give both projections the same homogeneous weight at the reference depth.
  return new THREE.Matrix4().set(scaleX, 0, 0, x, 0, scaleY, 0, y, 0, 0, 1, 0, 0, 0, 0, 1)
    .multiply(camera.projectionMatrix).multiplyScalar(1 / (matrix[15] - distance * matrix[11])).elements;
}

export function frameRoomCamera(camera, { layout, template, view = "perspective", floorView = "all", aspect = 1, zoom = 1, focusBuilding = false }) {
  const front = view === "front";
  const exterior = view === "exterior" && layout.terrace;
  const upper = Boolean(layout.mezzanine) && floorView === "mezzanine";
  const buildingOnly = focusBuilding && view === "perspective" && !upper;
  const closeInterior = view === "perspective" && !upper && aspect >= 1.35;
  const building = layout.building;
  const center = upper
    ? new THREE.Vector3((layout.mezzanine.minX + layout.mezzanine.maxX) / 2, layout.mezzanine.height, (layout.mezzanine.minZ + layout.mezzanine.maxZ) / 2)
    : new THREE.Vector3(0, front ? 3.1 : building.height / 3, (building.minZ + building.maxZ) / 2);
  const height = closeInterior
    ? (layout.island ? 23 : Math.max(7, Math.min(22, 36 / aspect)))
    : template === "boardgame" ? 25 : template === "climbing" ? 18 : 23.5;
  const fromLeft = layout.walls.some((wall) => wall.x === building.minX && wall.cutaway);
  // A wider orthographic framing for warming meshes before expansion.
  const offset = front ? new THREE.Vector3(0, -1.6, 30)
    : exterior ? new THREE.Vector3(-18, 15, 36)
    : view === "top" ? new THREE.Vector3(0, 36, 0.01)
    : fromLeft ? new THREE.Vector3(-17, height, 27) : new THREE.Vector3(19, height, 29);
  camera.position.copy(center).add(offset);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const entrance = { ...layout.entrance, minY: -0.2, maxY: 2.8 };
  let volumes = upper
    ? [{ ...layout.mezzanine, minY: layout.mezzanine.height - 0.3, maxY: layout.mezzanine.height + 2.8 }]
    : [{ ...building, minY: -0.35, maxY: building.height + 0.4 }, entrance];
  if (front) {
    volumes.push(getDioramaBounds(layout));
  } else if (layout.island && !upper && !buildingOnly) {
    const { surface, walkable, bottomY } = layout.island;
    if (closeInterior) {
      const centerX = (surface.minX + surface.maxX) / 2;
      const centerZ = (surface.minZ + surface.maxZ) / 2;
      // Fit both usable yards without letting the closest trees set the building scale.
      volumes = [
        { ...building, minY: -0.2, maxY: building.height + 0.4 },
        { ...walkable, minY: -0.35, maxY: 0.5 },
        { minX: centerX - 3, maxX: centerX + 3, minZ: centerZ - 2, maxZ: centerZ + 2,
          minY: bottomY, maxY: 0 }
      ];
    } else {
      volumes = [
        { ...building, minY: -0.35, maxY: building.height + 0.4 },
        { ...surface, minY: bottomY, maxY: 0.5 },
        { ...surface, maxZ: walkable.minZ, minY: 0, maxY: 7 },
        { ...surface, maxX: walkable.minX, maxZ: surface.maxZ - 6, minY: 0, maxY: 7 },
        { ...surface, minX: walkable.maxX, maxZ: surface.maxZ - 6, minY: 0, maxY: 7 }
      ];
    }
  }
  if (layout.terrace && !upper && !buildingOnly) {
    volumes.push({ ...layout.terrace, minY: -0.3, maxY: exterior ? 2 : 0 });
    if (front || exterior) volumes.push({ ...building, minX: building.minX - 0.7, maxX: building.maxX + 0.7,
      minZ: building.minZ - 0.7, maxZ: building.maxZ + 0.7, minY: building.height, maxY: building.height + 1.3 });
  }
  const projected = projectVolumes(camera, volumes);
  const size = projected.getSize(new THREE.Vector2());
  const middle = projected.getCenter(new THREE.Vector2());
  let verticalSpan = Math.max(size.y + 1.2, (size.x + 1.2) / aspect);
  if (front) {
    // Leave room for the group title and camera buttons above the facade.
    verticalSpan = Math.max((size.y + 0.24) / 0.85, (size.x + 0.4) / (aspect * 0.92));
    middle.y = projected.min.y + verticalSpan * 0.47;
  } else if (buildingOnly) {
    verticalSpan = DEFAULT_ROOM_ZOOM * Math.max(size.y / 0.88, size.x / (aspect * 0.90));
  } else if (closeInterior && !layout.island) {
    // Favor the interior above the floor center; the outer entrance corners may crop.
    const floor = projectVolumes(camera, [
      { ...building, minY: -0.2, maxY: 0.2 }, entrance
    ]);
    const floorSize = floor.getSize(new THREE.Vector2());
    middle.copy(floor.getCenter(new THREE.Vector2()));
    verticalSpan = Math.max(floorSize.y + 0.8, (size.x + 0.6) / (aspect * 0.86));
    middle.y += verticalSpan * 0.12;
  }
  verticalSpan /= zoom;
  camera.left = middle.x - verticalSpan * aspect / 2;
  camera.right = middle.x + verticalSpan * aspect / 2;
  camera.top = middle.y + verticalSpan / 2;
  camera.bottom = middle.y - verticalSpan / 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return center;
}
