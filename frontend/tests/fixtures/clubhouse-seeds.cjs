// The mock HTTP API and Jest use the published blueprint and furniture data.
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
const blueprints = path.resolve(__dirname, "../../../backend/src/main/resources/contracts/clubhouse/blueprints");

function blueprint(templateKey, version = templateKey === "lounge" ? 12 : 11) {
  const source = JSON.parse(readFileSync(path.join(blueprints, templateKey, `v${version}.json`), "utf8"));
  return {
    blueprintRef: { templateKey, version }, geometry: source.geometry, spawn: source.spawn, defaultRoom: source.defaultRoom
  };
}

module.exports = { assetDefinitions, furnitureCatalog, blueprint };
