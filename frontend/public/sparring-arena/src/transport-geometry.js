import * as THREE from 'three';

export const HOSE_RADIUS = 0.8;
const BARREL_LENGTH = 2.35;

// Unproject at camera depth: the tank and hose share the same lens and world units.
export function createTransportGeometry(entry, camera, bounds, viewportWidth) {
  camera.updateMatrixWorld();
  const rear = new THREE.Vector3(...entry.outlet.rear);
  const direction = new THREE.Vector3(...entry.outlet.direction).normalize();
  const tankDepth = -rear.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const nearDepth = camera.isPerspectiveCamera ? tankDepth * 0.66 : tankDepth - 5;
  function unproject(x, y, depth) {
    const point = new THREE.Vector3((x - bounds.left) / bounds.width * 2 - 1,
      1 - (y - bounds.top) / bounds.height * 2, 0).unproject(camera).applyMatrix4(camera.matrixWorldInverse);
    if (camera.isPerspectiveCamera) point.multiplyScalar(depth / -point.z);
    else point.z = -depth;
    return point.applyMatrix4(camera.matrixWorld);
  }
  function project(point) {
    const p = point.clone().project(camera);
    return { x: bounds.left + (p.x + 1) * bounds.width / 2, y: bounds.top + (1 - p.y) * bounds.height / 2 };
  }
  function diameterAt(point, radius = HOSE_RADIUS) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(radius);
    const a = project(point.clone().add(right)), b = project(point.clone().sub(right));
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  const sign = entry.side === 'a' ? 1 : -1;
  const mouth = unproject(entry.inlet.x, entry.inlet.y, nearDepth);
  const inletDiameter = diameterAt(mouth);
  // Keep the short intake level on screen, including away from the camera's centre.
  const inletRear = unproject(entry.inlet.x - sign * inletDiameter * 0.3, entry.inlet.y, nearDepth + (viewportWidth > 700 ? 0 : 0.15));
  const inletDirection = mouth.clone().sub(inletRear).normalize();
  const railInset = inletDiameter * 0.65 + 8;
  const railX = sign === 1 ? railInset : viewportWidth - railInset;
  const rearScreen = project(rear);
  const lower = unproject(railX, entry.inlet.y - inletDiameter * 1.1, nearDepth);
  const upper = unproject(railX, rearScreen.y + entry.diameter * 1.8, tankDepth);
  const rise = upper.clone().sub(lower).normalize();
  const lowerSpan = lower.clone().sub(inletRear);
  const lowerEntryBend = Math.max(0, -lowerSpan.dot(inletDirection)) * 0.55;
  const lowerExitBend = Math.max(0, lowerSpan.dot(rise)) * 0.55;
  const upperBend = Math.min(2.4, upper.distanceTo(rear) * 0.55);
  const hose = new THREE.CurvePath();
  let lowerRing;
  if (viewportWidth > 700) {
    // A level intake, one rounded elbow, then the receding upright.
    const corner = unproject(railX, entry.inlet.y, nearDepth);
    const upright = upper.clone().sub(corner).normalize();
    const radius = Math.min(2.4, corner.distanceTo(inletRear) * 0.45, corner.distanceTo(upper) * 0.3);
    const bendStart = corner.clone().addScaledVector(inletDirection, radius);
    const bendEnd = corner.clone().addScaledVector(upright, radius);
    hose.add(new THREE.LineCurve3(inletRear, bendStart));
    hose.add(new THREE.CubicBezierCurve3(bendStart,
      bendStart.clone().addScaledVector(inletDirection, -radius * 0.55228475),
      bendEnd.clone().addScaledVector(upright, -radius * 0.55228475), bendEnd));
    hose.add(new THREE.LineCurve3(bendEnd, upper));
    lowerRing = hose.curves[0].getLength() + hose.curves[1].getLength() / 2;
    rise.copy(upright);
  } else {
    hose.add(new THREE.CubicBezierCurve3(inletRear,
      inletRear.clone().addScaledVector(inletDirection, -lowerEntryBend),
      lower.clone().addScaledVector(rise, -lowerExitBend), lower));
    hose.add(new THREE.LineCurve3(lower, upper));
    lowerRing = hose.curves[0].getLength() / 2;
  }
  hose.add(new THREE.CubicBezierCurve3(upper,
    upper.clone().addScaledVector(rise, upperBend),
    rear.clone().addScaledVector(direction, -upperBend), rear));
  // Anchor equal world-space intervals at the middle of both elbows.
  const upperRing = hose.getLength() - hose.curves.at(-1).getLength() / 2;
  const ringSpacing = (upperRing - lowerRing) / Math.max(1, Math.round((upperRing - lowerRing) / 5));
  const ringOffset = (ringSpacing - lowerRing % ringSpacing) % ringSpacing;
  const flight = new THREE.CurvePath();
  flight.add(new THREE.LineCurve3(mouth, inletRear));
  flight.add(hose);
  flight.add(new THREE.LineCurve3(rear, new THREE.Vector3(...entry.outlet.mouth)));
  const physicalLength = flight.getLength();
  // Composer animation uses a frozen projected copy of this exact physical route.
  const route = {
    getTotalLength: () => physicalLength * entry.diameter / 1.6,
    getPointAtLength(distance) {
      const t = Math.max(0, Math.min(1, distance / this.getTotalLength()));
      const point = flight.getPointAt(t);
      return { ...project(point), scale: diameterAt(point) / inletDiameter, world: point };
    },
    hiddenAfter: (physicalLength - BARREL_LENGTH) / physicalLength,
  };
  return { hose, mouth, inletRear, inletDirection, inletDiameter, route, ringSpacing, ringOffset, ringStart: viewportWidth > 700 ? lowerRing : 0 };
}
