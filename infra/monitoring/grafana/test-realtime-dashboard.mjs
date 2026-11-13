import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const dashboard = JSON.parse(readFileSync(new URL('./provisioning/dashboards/json/jarihana-realtime.json', import.meta.url)));
const panel = (id) => dashboard.panels.find((item) => item.id === id);
const expand = (expr) => expr.replaceAll('$__rate_interval', '2m');
const expression = (id, index = 0) => expand(panel(id).targets[index].expr);
const metrics = dashboard.panels.filter((item) => item.datasource.uid === 'prometheus');
const logPanels = dashboard.panels.filter((item) => item.datasource.uid === 'loki');

assert.equal(dashboard.uid, 'jarihana-realtime');
assert.equal(new Set(dashboard.panels.map((item) => item.id)).size, dashboard.panels.length);
assert.equal(logPanels.length, 1);
assert.equal(logPanels[0].type, 'logs');
assert.equal(logPanels[0].targets[0].expr, '{job="jarihana-realtime",service_name="jarihana-realtime"}');
for (const item of dashboard.panels) {
  assert(item.gridPos.x >= 0 && item.gridPos.y >= 0);
  assert(item.gridPos.w > 0 && item.gridPos.h > 0 && item.gridPos.x + item.gridPos.w <= 24);
  assert(item.targets.every((target) => target.datasource.uid === item.datasource.uid));
  assert.equal(new Set(item.targets.map((target) => target.refId)).size, item.targets.length);
  for (const other of dashboard.panels.filter((candidate) => candidate.id < item.id)) {
    const a = item.gridPos;
    const b = other.gridPos;
    assert(a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h,
      `Overlapping panels: ${item.title} and ${other.title}`);
  }
}

const rules = metrics.flatMap((item) => item.targets.map((target) => {
  assert.equal(item.fieldConfig.defaults.noValue, '수집 없음');
  assert.match(target.expr, /job="jarihana-realtime(?:-[a-z]+)?"/);
  assert.doesNotMatch(target.expr, /or vector\(0\)/);
  return { record: `realtime_dashboard_query_${item.id}_${target.refId.toLowerCase()}`, expr: expand(target.expr) };
}));

const app = 'job="jarihana-realtime",instance="realtime-app",host_id="shared"';
const host = 'job="jarihana-realtime-node",instance="realtime-node",host_id="shared"';
const health = 'job="jarihana-realtime-health",instance="realtime-health"';
const collector = 'job="jarihana-realtime-alloy",instance="realtime-alloy"';
const unrelated = 'job="jarihana-backend",instance="api"';
const input = [
  { series: `up{${app}}`, values: '1x12' },
  { series: `up{${host}}`, values: '1x12' },
  { series: `up{${collector}}`, values: '1x12' },
  { series: `probe_success{${health}}`, values: '0x12' },
  { series: `realtime_connections{${app}}`, values: '12x12' },
  { series: `realtime_connections{${unrelated}}`, values: '100x12' },
  { series: `realtime_active_players{${app},environment="dev"}`, values: '3x12' },
  { series: `realtime_active_players{${app},environment="prod"}`, values: '5x12' },
  { series: `realtime_active_rooms{${app},environment="dev"}`, values: '2x12' },
  { series: `realtime_active_rooms{${app},environment="prod"}`, values: '4x12' },
  { series: `realtime_websocket_admissions_total{${app},environment="dev",outcome="accepted"}`, values: '0+10x12' },
  { series: `realtime_websocket_admissions_total{${app},environment="unknown",outcome="rejected"}`, values: '0+20x12' },
  { series: `realtime_websocket_rejections_total{${app},reason="slow_consumer"}`, values: '0+10x12' },
  { series: `hikaricp_connections_active{${app},pool="realtime-dev"}`, values: '2x12' },
  { series: `hikaricp_connections_active{${app},pool="realtime-prod"}`, values: '4x12' },
  { series: `hikaricp_connections_active{${app},pool="other"}`, values: '20x12' },
  { series: `node_cpu_seconds_total{${host},cpu="0",mode="idle"}`, values: '0+5x12' },
  { series: `node_memory_MemTotal_bytes{${host}}`, values: '100x12' },
  { series: `node_memory_MemAvailable_bytes{${host}}`, values: '25x12' },
];
const sample = (labels, value) => ({ labels, value });
const evaluate = (expr, expSamples = [], time = '2m') => ({ expr, eval_time: time, exp_samples: expSamples });
const tests = [
  {
    name: 'shared telemetry and the two environment series have the expected values',
    interval: '10s',
    input_series: input,
    promql_expr_test: [
      evaluate(expression(1), [sample('{}', 0)]),
      evaluate(expression(2), [sample('{}', 1)]),
      evaluate(expression(3), [sample('{}', 1)]),
      evaluate(expression(4), [sample('{}', 12)]),
      evaluate(expression(5), [sample('{environment="dev"}', 3), sample('{environment="prod"}', 5)]),
      evaluate(expression(6), [sample('{environment="dev"}', 2), sample('{environment="prod"}', 4)]),
      evaluate(expression(7), [
        sample('{environment="dev",outcome="accepted"}', 1),
        sample('{environment="unknown",outcome="rejected"}', 2),
      ]),
      evaluate(expression(8), [sample('{reason="slow_consumer"}', 1)]),
      evaluate(`sum(${expression(11)})`, [sample('{}', 6)]),
      evaluate(expression(15), [sample('{host_id="shared"}', 50)]),
      evaluate(expression(16), [sample(`{${host}}`, 75)]),
    ],
  },
  {
    name: 'failed scrape hides previously sampled socket and pool counts',
    interval: '10s',
    input_series: input.map((item) => item.series === `up{${app}}` ? { ...item, values: '1x11 0' } : item),
    promql_expr_test: [
      evaluate(expression(2), [sample('{}', 0)]),
      ...[4, 5, 6, 7, 8, 11].map((id) => evaluate(expression(id))),
    ],
  },
  {
    name: 'stale remote-write samples do not show healthy or active',
    interval: '10s',
    input_series: input,
    promql_expr_test: rules.map((rule) => evaluate(rule.expr, [], '4m')),
  },
];

for (const [operation, document] of [
  ['check', { groups: [{ name: 'realtime_dashboard', rules }] }],
  ['test', { rule_files: [], fuzzy_compare: true, tests }],
]) {
  const result = spawnSync('docker', ['run', '--rm', '-i', '--entrypoint', 'promtool', 'prom/prometheus:v3.15.0', operation, 'rules', '/dev/stdin'], {
    input: JSON.stringify(document), encoding: 'utf8', timeout: 60_000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, result.error?.message || `promtool ${operation} must pass`);
}
console.log(`PASS: ${rules.length} PromQL queries, Loki selector, and provisioned dashboard layout`);
