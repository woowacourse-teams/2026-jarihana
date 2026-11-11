import * as THREE from "three";
import { scaleRoomZoom } from "./roomCameraZoom";

export function createRoomCameraControls(camera, element, { onChange, onZoom, onClick }) {
  const pan = new THREE.Vector3();
  const target = new THREE.Vector3();
  let azimuth;
  let polar;
  let gesture;

  function panBy(dx, dy) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const offset = right.multiplyScalar(-dx * (camera.right - camera.left) / (bounds.width * camera.zoom))
      .addScaledVector(up, dy * (camera.top - camera.bottom) / (bounds.height * camera.zoom));
    pan.add(offset);
    camera.position.add(offset);
    camera.updateMatrixWorld();
  }

  return {
    hasGesture() { return gesture !== undefined; },
    isDragging() { return gesture?.moved === true; },
    frame(center) {
      // Center an off-axis fitted frustum without changing its projected image.
      const shift = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
        .multiplyScalar((camera.left + camera.right) / 2)
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), (camera.top + camera.bottom) / 2);
      const halfWidth = (camera.right - camera.left) / 2;
      const halfHeight = (camera.top - camera.bottom) / 2;
      camera.left = -halfWidth; camera.right = halfWidth;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      const orbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(center));
      azimuth ??= orbit.theta;
      polar ??= orbit.phi;
      orbit.theta = azimuth;
      orbit.phi = polar;
      target.copy(center).add(shift).add(pan);
      camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(orbit));
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },
    turn(angle) {
      if (azimuth === undefined) return false;
      azimuth += angle;
      return true;
    },
    reset() {
      azimuth = undefined; polar = undefined; pan.set(0, 0, 0);
      const previous = gesture;
      gesture = undefined;
      if (previous && element.hasPointerCapture(previous.id)) element.releasePointerCapture(previous.id);
      element.style.cursor = "grab";
    },
    onDown(event, itemId) {
      if (gesture || ![0, 1, 2].includes(event.button)) return false;
      event.preventDefault();
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, moved: false, itemId,
        pan: event.button !== 0 || event.shiftKey,
        click: event.button === 0 && !event.shiftKey };
      element.setPointerCapture(event.pointerId);
      return true;
    },
    onMove(event) {
      if (!gesture || gesture.id !== event.pointerId) return false;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 5) return true;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture.moved = true;
      gesture.x = event.clientX; gesture.y = event.clientY;
      if (gesture.pan) {
        panBy(dx, dy);
      } else {
        azimuth -= dx * 0.006;
        polar = THREE.MathUtils.clamp(polar - dy * 0.006, 0.02, Math.PI - 0.02);
      }
      element.style.cursor = "grabbing";
      element.setAttribute("data-ph-capture-attribute-action", gesture.pan ? "space_camera_pan" : "space_camera_rotate");
      onChange(gesture.pan ? undefined : { dx, dy });
      return true;
    },
    onUp(event) {
      if (!gesture || gesture.id !== event.pointerId) return false;
      const previous = gesture;
      gesture = undefined;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      element.style.cursor = "grab";
      if (event.type === "pointerup" && !previous.moved && previous.click) onClick(previous.itemId || null);
      return true;
    },
    onWheel(event, zoom) {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const factor = Math.exp(-THREE.MathUtils.clamp(event.deltaY * unit, -700, 700) * 0.0015);
      const next = scaleRoomZoom(zoom, factor);
      if (next !== zoom) onZoom(next);
    }
  };
}
