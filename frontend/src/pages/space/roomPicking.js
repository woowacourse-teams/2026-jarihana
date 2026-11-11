function visibleObject(object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

export function pickRoomItem(intersections, editable) {
  const hit = intersections.find(({ object }) => (object.isMesh || object.isSprite) && visibleObject(object));
  for (let object = hit?.object; object; object = object.parent) {
    if (!editable && object.userData.memoryId) return object.userData.memoryId;
    if (object.userData.itemId) return object.userData.itemId;
  }
  return null;
}
