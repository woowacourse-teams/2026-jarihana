const emptyCapabilities = { capabilities: [] };
let assets = new Map();
let items = new Map();
let anchors = new Map();

export function installAssetDefinitions({ capabilities, surfaceAnchors }) {
  assets = new Map(Object.entries(capabilities.assets));
  items = new Map(Object.entries(capabilities.items));
  anchors = new Map(Object.entries(surfaceAnchors));
}

export function capabilitiesFor(kind) {
  return assets.get(kind) ?? emptyCapabilities;
}

export function portableDefinition(kind) {
  return items.get(kind);
}

export function surfaceSlots(kind) {
  return anchors.get(kind) ?? [];
}
