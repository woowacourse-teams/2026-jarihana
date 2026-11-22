const emptyCapabilities = { capabilities: [] };
let assets = new Map();
let items = new Map();

export function installAssetDefinitions({ capabilities }) {
  assets = new Map(Object.entries(capabilities.assets));
  items = new Map(Object.entries(capabilities.items));
}

export function capabilitiesFor(kind) {
  return assets.get(kind) ?? emptyCapabilities;
}

export function portableDefinition(kind) {
  return items.get(kind);
}
