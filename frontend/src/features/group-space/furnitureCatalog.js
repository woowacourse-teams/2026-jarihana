// Installed before a room is opened. The editor, collision checks and Three.js share this snapshot.
export let CATALOG = [];
let byKind;
let portableByKind = new Map();
const emptyCapabilities = { capabilities: [] };

export function installFurnitureCatalog(items) {
  byKind = new Map(items.map(item => [item.kind, item]));
  CATALOG = items;
  return items;
}

export function installSpaceCatalog({ items, portableItems }) {
  const rules = new Map(Object.entries(portableItems));
  installFurnitureCatalog(items);
  portableByKind = rules;
}

export function portableDefinition(kind) {
  const rule = portableByKind.get(kind);
  return rule?.portable ? rule : undefined;
}

export function furnitureType(kind) {
  if (!byKind) throw new Error("가구 목록을 불러오지 못했어요.");
  return byKind.get(kind);
}

export function capabilitiesFor(kind) {
  return byKind?.get(kind)?.interaction ?? emptyCapabilities;
}

export function canAddFurniture(kind, version) {
  const type = furnitureType(kind);
  return Boolean(type?.placeable && type.minRoomVersion <= Math.max(version, 8));
}
