import { Group } from "three";

export function sharedDoor(parent, parts, hingeX, hingeZ) {
  const pivot = new Group();
  pivot.position.set(hingeX, 0, hingeZ);
  pivot.userData.sharedDoor = true;
  parts.forEach((part) => {
    part.position.x -= hingeX;
    part.position.z -= hingeZ;
    pivot.add(part);
  });
  parent.add(pivot);
  return pivot;
}
