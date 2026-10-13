import { readFileSync, writeFileSync } from 'node:fs';
import { buildPoolNodes } from './pool-nodes.mjs';

// Keep the editable SVG and Flow mappings embedded in the provisioned dashboard.
const dashboardUrl = new URL('../provisioning/dashboards/json/jarihana-canvas.json', import.meta.url);
const dashboard = JSON.parse(readFileSync(dashboardUrl, 'utf8'));
const panel = dashboard.panels.find((panel) => panel.type === 'andrewbmchugh-flow-panel');
if (!panel) throw new Error('Flow panel missing from the topology dashboard');
const active = panel.targets.find((target) => target.legendFormat === 'db_active');
if (!active) throw new Error('Pool metric missing: db_active');
const completed = {
  ...active,
  refId: 'POOL_COMPLETED',
  legendFormat: 'db_completed',
  expr: active.expr.replaceAll('hikaricp_connections_active', 'hikaricp_connections_usage_seconds_count'),
};
const completedIndex = panel.targets.findIndex((target) => target.legendFormat === completed.legendFormat);
if (completedIndex < 0) panel.targets.push(completed);
else panel.targets[completedIndex] = completed;
for (const [metric, refId] of [['db_active', 'POOL_PREV_ACTIVE'], ['db_max', 'POOL_PREV_MAX'], ['db_completed', 'POOL_PREV_COMPLETED']]) {
  const current = panel.targets.find((target) => target.legendFormat === metric);
  if (!current) throw new Error(`Pool metric missing: ${metric}`);
  const previous = {
    ...current,
    refId,
    legendFormat: `${metric}_previous`,
    expr: current.expr.replace(/((?:hikaricp_connections_(?:active|max|usage_seconds_count)|up)\{[^}]+\})/g, '$1 offset 5s'),
  };
  const index = panel.targets.findIndex((target) => target.legendFormat === previous.legendFormat);
  if (index < 0) panel.targets.push(previous);
  else panel.targets[index] = previous;
}
const poolNodes = buildPoolNodes();
const svg = readFileSync(new URL('./map.svg', import.meta.url), 'utf8').trimEnd();
if (!svg.includes('<!-- pool-connection-nodes -->')) throw new Error('Pool nodes placeholder missing');
panel.options.svg = svg.replace('<!-- pool-connection-nodes -->', poolNodes.svg);
const panelConfig = JSON.parse(readFileSync(new URL('./panel-config.yaml', import.meta.url), 'utf8'));
panelConfig.cells['pool-node'].bespoke = poolNodes.bespoke;
panel.options.panelConfig = JSON.stringify(panelConfig, null, 2);
writeFileSync(dashboardUrl, `${JSON.stringify(dashboard, null, 2)}\n`);
