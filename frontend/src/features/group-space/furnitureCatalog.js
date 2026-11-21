// Installed before a room is opened. The editor, collision checks and Three.js share this snapshot.
export let CATALOG = [];
let byKind;

export function installFurnitureCatalog(items) {
  byKind = new Map(items.map(item => [item.kind, item]));
  CATALOG = items;
  return items;
}

export function furnitureType(kind) {
  if (!byKind) throw new Error("가구 목록을 불러오지 못했어요.");
  return byKind.get(kind);
}

export function canAddFurniture(kind, version) {
  const type = furnitureType(kind);
  return Boolean(type?.placeable && type.minRoomVersion <= Math.max(version, 8));
}
