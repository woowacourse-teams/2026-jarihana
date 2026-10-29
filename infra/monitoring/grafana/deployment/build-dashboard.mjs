import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryCatalog } from './queries.mjs';

export const output = new URL('../provisioning/dashboards/json/jarihana-deployment.json', import.meta.url);
const source = new URL('./source/dashboard.json', import.meta.url);
const colors = JSON.parse(readFileSync(new URL('./source/colors.json', import.meta.url), 'utf8'));

function expand(value) {
  if (typeof value === 'string') {
    for (const [prefix, catalog] of [['@query/', queryCatalog], ['@color/', colors]]) {
      if (value.startsWith(prefix)) {
        const key = value.slice(prefix.length);
        assert(Object.hasOwn(catalog, key), `Unknown source reference: ${value}`);
        return catalog[key];
      }
    }
  }
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, expand(child)]));
  return value;
}

export function validateDashboard(dashboard) {
  assert.equal(dashboard.apiVersion, 'dashboard.grafana.app/v2');
  assert.equal(dashboard.kind, 'Dashboard');
  assert.equal(dashboard.metadata.name, 'jarihana-deployment');
  const { elements, layout, variables } = dashboard.spec;
  assert.equal(layout.kind, 'RowsLayout');
  assert.equal(layout.spec.rows.length, 2);
  const environment = variables.find(variable => variable.spec.name === 'environment');
  assert.equal(environment.kind, 'CustomVariable');
  assert.deepEqual(environment.spec.current, { text: 'prod', value: 'prod' });
  assert.equal(environment.spec.multi, false);
  assert.equal(environment.spec.skipUrlSync, false);
  assert.deepEqual(environment.spec.options.filter(option => option.selected).map(option => option.value), ['prod']);
  const panelIds = Object.values(elements).map(panel => panel.spec.id);
  assert.equal(new Set(panelIds).size, panelIds.length);
  const referenced = new Set();
  for (const row of layout.spec.rows) {
    assert(row.spec.hideHeader);
    const conditions = row.spec.conditionalRendering;
    assert.equal(conditions.kind, 'ConditionalRenderingGroup');
    const condition = conditions.spec.items[0].spec;
    assert.equal(condition.variable, 'environment');
    assert.equal(condition.operator, 'equals');
    assert(['prod', 'dev'].includes(condition.value));
    for (const item of row.spec.layout.spec.items) {
      const name = item.spec.element.name;
      assert(Object.hasOwn(elements, name), `Missing panel: ${name}`);
      assert(!referenced.has(name), `Panel appears in multiple environments: ${name}`);
      referenced.add(name);
      const panel = elements[name].spec;
      for (const target of panel.data?.spec.queries ?? []) {
        const query = target.spec.query;
        assert.equal(query.datasource.name, 'prometheus');
        assert(query.spec.expr.includes(`environment="${condition.value}"`), `Wrong environment: ${name}/${target.spec.refId}`);
      }
      if (panel.vizConfig.group !== 'canvas') continue;
      const nodes = panel.vizConfig.spec.options.root.elements;
      const nodeNames = new Set(nodes.map(node => node.name));
      assert.equal(nodeNames.size, nodes.length);
      const fields = new Set(panel.data.spec.queries.map(target => target.spec.query.spec.legendFormat));
      for (const target of panel.data.spec.queries) {
        for (const label of target.spec.query.spec.expr.matchAll(/"([a-z_]+_host_name)"/g)) fields.add(label[1]);
      }
      for (const node of nodes) {
        assert(node.placement.width > 0 && node.placement.height > 0);
        for (const connection of node.connections ?? []) assert(nodeNames.has(connection.targetName), `Missing edge target: ${connection.targetName}`);
        for (const field of [node.config.text?.field, node.config.color?.field].filter(Boolean)) assert(fields.has(field), `Unbound Canvas field: ${field}`);
      }
    }
  }
  assert.equal(referenced.size, Object.keys(elements).length);
  assert(!JSON.stringify(dashboard).includes('@query/'));
  assert(!JSON.stringify(dashboard).includes('@color/'));
  return dashboard;
}

export function buildDashboard() {
  return validateDashboard(expand(JSON.parse(readFileSync(source, 'utf8'))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dashboard = buildDashboard();
  writeFileSync(output, JSON.stringify(dashboard, null, 2) + '\n');
  console.log(JSON.stringify({ path: fileURLToPath(output), uid: dashboard.metadata.name, panels: Object.keys(dashboard.spec.elements).length, schema: dashboard.apiVersion }));
}
