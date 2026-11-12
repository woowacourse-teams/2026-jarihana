// Heights are measured from each unscaled model's floor, not from its bounding box.
export const ASSET_SURFACES = Object.freeze({
  table: [0.9], diningTable: [0.88], feastTable: [0.98], gameTable: [0.79],
  coffeeTable: [0.5], cafeTable: [0.775], kitchenIsland: [1.015], kitchenCounter: [1.015, 1.915, 2.415],
  cafeCabinet: [1.015], gameCredenza: [1.1], bookshelf: [0.55, 1.15, 1.75, 2.05],
  pantryShelf: [0.65, 1.3, 1.95, 2.65], libraryShelfWood: [3.25], libraryShelfDark: [3.25], libraryShelfDisplay: [3.25],
  studyDesk: [0.79], focusDesk: [0.79], photoEditDesk: [0.79], photoPrintBench: [0.92],
  studyCabinet: [0.95], mixingDesk: [0.925], cameraCabinet: [2.7],
  longCredenza: [0.98], openDisplayShelf: [0.25, 0.95, 1.65, 2.35, 3.05],
  worktop: [0.92], wallShelf: [0.08]
});
export const ASSET_FINISHES = Object.freeze([
  { id: 'auto', name: '기본 재질' }, { id: 'oak', name: '오크' }, { id: 'walnut', name: '월넛' },
  { id: 'stone', name: '석재' }, { id: 'fabric', name: '패브릭' }, { id: 'metal', name: '금속' }
]);
export const assetScale = (item) => ({ x: item.scaleX ?? 1, y: item.scaleY ?? 1, z: item.scaleZ ?? 1 });
export function surfaceHeight(parent, index = 0) { return (ASSET_SURFACES[parent.kind]?.[index] ?? 0) * (parent.scaleY ?? 1); }
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
  return item.surfaceIndex === undefined || Boolean(item.parentId) && Number.isInteger(item.surfaceIndex) && item.surfaceIndex >= 0 && item.surfaceIndex <= 4;
}

export function surfaceFootprint(parent, index, type) {
  const shelf = parent.kind === 'kitchenCounter' && index > 0;
  const size = assetScale(parent);
  const local = shelf ? {width:3.08,depth:0.33,x:0,z:-0.23} : {width:type.width,depth:type.depth,x:0,z:0};
  const center = localToWorld(parent,local.x,local.z);
  return {...center,width:parent.rotation%2?local.depth*size.z:local.width*size.x,
    depth:parent.rotation%2?local.width*size.x:local.depth*size.z};
}
