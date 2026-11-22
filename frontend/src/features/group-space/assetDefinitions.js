let items = new Map();

export function installAssetDefinitions({ capabilities }) {
  items = new Map(Object.entries(capabilities.items));
}

export function portableDefinition(kind) {
  return items.get(kind);
}
