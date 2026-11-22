// The mock HTTP API and Jest use the published migration rows without connecting to PostgreSQL.
const { readFileSync } = require("node:fs");
const path = require("node:path");

const migrations = path.resolve(__dirname, "../../../backend/src/main/resources/db/migration");
const realtimeResources = path.resolve(__dirname, "../../../realtime/src/main/resources/contracts");
const sql = name => readFileSync(path.join(migrations, name), "utf8");
const realtimeJson = (name) => JSON.parse(readFileSync(path.join(realtimeResources, name), "utf8"));
const assetDefinitions = {
  capabilities: realtimeJson("asset-capabilities.json"),
  surfaceAnchors: realtimeJson("surface-anchors.json")
};
const furnitureCatalog = JSON.parse(sql("V46__space_furniture_catalog.sql").split("$catalog$")[1]);
const defaults = JSON.parse(sql("V47__space_blueprint_runtime.sql").split("$defaults$")[1]);
const geometries = new Map();
for (const [, template, version, geometry] of sql("V45__versioned_space_blueprints.sql")
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

module.exports = { assetDefinitions, furnitureCatalog, blueprint };
