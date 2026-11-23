// The mock HTTP API and Jest use the published migration rows without connecting to PostgreSQL.
const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

const migrations = path.resolve(__dirname, "../../../backend/src/main/resources/db/migration");
const migrationFiles = readdirSync(migrations);
function sql(name) {
  const files = migrationFiles.filter(file => file.replace(/^V\d+__/, "") === name);
  if (files.length !== 1) throw new Error("Expected one migration for " + name);
  return readFileSync(path.join(migrations, files[0]), "utf8");
}
const interactionMigration = sql("space_furniture_interactions.sql");
const furnitureInteractions = JSON.parse(interactionMigration.split("$interactions$")[1]);
const [, switchVersion, switchDefinition] = interactionMigration.match(
  /SELECT 'room-general-light-switch', MAX\(display_order\) \+ 1, (\d+), false,\s*'([^']+)'::jsonb/
);
const furnitureCatalog = [
  ...JSON.parse(sql("space_furniture_catalog.sql").split("$catalog$")[1]),
  { kind: "room-general-light-switch", minRoomVersion: Number(switchVersion), placeable: false, ...JSON.parse(switchDefinition) }
].map(item => ({ ...item, ...(furnitureInteractions[item.kind] && { interaction: furnitureInteractions[item.kind] }) }));
const portableItems = JSON.parse(sql("space_portable_item_catalog.sql").split("$portable_items$")[1]);
const spaceCatalog = { interactionCatalogVersion: 1, items: furnitureCatalog, portableCatalogVersion: 1, portableItems };
const defaults = JSON.parse(sql("space_blueprint_runtime.sql").split("$defaults$")[1]);
const geometries = new Map();
for (const [, template, version, geometry] of sql("versioned_space_blueprints.sql")
  .matchAll(/\('(\w+)', (\d+), 1, '(.+?)'::jsonb\)/g)) {
  geometries.set(template + ":" + version, JSON.parse(geometry.replaceAll("''", "'")));
}

function blueprint(templateKey, version = templateKey === "lounge" ? 12 : 11) {
  const geometry = geometries.get(templateKey + ":" + version);
  if (!geometry) throw new Error("Missing seeded blueprint " + templateKey + ":" + version);
  return {
    blueprintRef: { templateKey, version }, geometry, spawn: { x: -2, z: 6.8 },
    defaultRoom: defaults.find(room => room.template === templateKey && room.version === version) ?? null
  };
}

module.exports = { spaceCatalog, furnitureCatalog, portableItems, blueprint };
