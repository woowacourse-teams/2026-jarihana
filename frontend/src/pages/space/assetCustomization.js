import { furnitureType } from "../../features/group-space/furnitureCatalog.js";

export const ASSET_FINISHES = Object.freeze([
  { id: 'auto', name: '기본 재질' }, { id: 'oak', name: '오크' }, { id: 'walnut', name: '월넛' },
  { id: 'stone', name: '석재' }, { id: 'fabric', name: '패브릭' }, { id: 'metal', name: '금속' }
]);
export const assetScale = (item) => ({ x: item.scaleX ?? 1, y: item.scaleY ?? 1, z: item.scaleZ ?? 1 });
export function surfaceHeight(parent, index = 0) { return (furnitureType(parent.kind)?.surfaces[index] ?? 0) * (parent.scaleY ?? 1); }
export function localToWorld(parent, x, z) {
  const a = parent.rotation * Math.PI / 2, s = assetScale(parent);
  return { x: parent.x + x * s.x * Math.cos(a) + z * s.z * Math.sin(a),
    z: parent.z - x * s.x * Math.sin(a) + z * s.z * Math.cos(a) };
}
export function transformAttachedItems(items, id, patch) {
  const before = items.find((item) => item.id === id);
  if (!before) return items;
  const after = { ...before, ...patch };
  return items.map((item) => {
    if (item.id === id) return after;
    if (item.parentId !== id) return item;
    const angle = -before.rotation * Math.PI / 2, dx = item.x - before.x, dz = item.z - before.z;
    const x = (dx * Math.cos(angle) + dz * Math.sin(angle)) / (before.scaleX ?? 1);
    const z = (-dx * Math.sin(angle) + dz * Math.cos(angle)) / (before.scaleZ ?? 1);
    return { ...item, ...localToWorld(after, x, z), level: after.level ?? 0,
      rotation: (item.rotation + after.rotation - before.rotation + 4) % 4 };
  });
}
export function validAssetCustomization(item) {
  if (['scaleX', 'scaleY', 'scaleZ'].some((key) => item[key] !== undefined && (!Number.isFinite(item[key]) || item[key] < 0.25 || item[key] > 3))) return false;
  if (item.elevation !== undefined && (!Number.isFinite(item.elevation) || item.elevation < 0 || item.elevation > 14)) return false;
  if (item.finish !== undefined && !ASSET_FINISHES.some((entry) => entry.id === item.finish)) return false;
  if (item.variant !== undefined && (!Number.isInteger(item.variant) || item.variant < 0 || item.variant > 5)) return false;
  if (item.parentId !== undefined && (typeof item.parentId !== 'string' || !item.parentId || item.parentId.length > 80 || item.parentId === item.id)) return false;
  return item.surfaceIndex === undefined || Boolean(item.parentId) && Number.isInteger(item.surfaceIndex) && item.surfaceIndex >= 0;
}

export function surfaceFootprint(parent, index, type) {
  const shelf = parent.kind === 'kitchenCounter' && index > 0;
  const size = assetScale(parent);
  const local = shelf ? {width:3.08,depth:0.33,x:0,z:-0.23} : {width:type.width,depth:type.depth,x:0,z:0};
  const center = localToWorld(parent,local.x,local.z);
  return {...center,width:parent.rotation%2?local.depth*size.z:local.width*size.x,
    depth:parent.rotation%2?local.width*size.x:local.depth*size.z};
}
