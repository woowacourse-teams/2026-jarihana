import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dashboard = JSON.parse(readFileSync(new URL('./provisioning/dashboards/json/jarihana-overview.json', import.meta.url)));
const api = dashboard.panels.find(panel => panel.id === 11);
const sse = dashboard.panels.find(panel => panel.id === 29);
assert.equal(api.fieldConfig.defaults.unit, 'ms');
assert.equal(sse.fieldConfig.defaults.unit, 's');
assert.equal(new Set(dashboard.panels.map(panel => panel.id)).size, dashboard.panels.length);
const responsePanels = [9, 10, 11].map(id => dashboard.panels.find(panel => panel.id === id));
for (const [index, panel] of responsePanels.entries()) {
  assert.equal(panel.gridPos.y, 9);
  assert.ok(panel.gridPos.x + panel.gridPos.w <= 24);
  if (index > 0) {
    const previous = responsePanels[index - 1].gridPos;
    assert.ok(previous.x + previous.w <= panel.gridPos.x, 'Response panels must not overlap');
  }
}

for (const panel of dashboard.panels) {
  const pos = panel.gridPos;
  assert.ok(pos.x >= 0 && pos.x + pos.w <= 24);
  for (const other of dashboard.panels) {
    if (panel.id >= other.id) continue;
    const next = other.gridPos;
    assert.ok(pos.x + pos.w <= next.x || next.x + next.w <= pos.x ||
      pos.y + pos.h <= next.y || next.y + next.h <= pos.y, 'Panels must not overlap');
  }
}
const expand = (panel, environment = 'dev') => panel.targets[0].expr
  .replaceAll('$sse_endpoint', '.*').replaceAll('$environment', environment).replaceAll('$__rate_interval', '2m');
const expressions = { api: expand(api), sse: expand(sse) };
const traffic = ({ uri = '/sparrings/{topicId}/posts', count = 100, seconds = 1, instance = 'a', environment = 'dev', reset = false, type } = {}) => {
  const labels = `job="jarihana-backend",environment="${environment}",status="200",instance="${instance}",uri="${uri}"${type ? `,response_type="${type}"` : ''}`;
  const values = increment => reset ? `0+${increment}x5 0+${increment}x6` : `0+${increment}x12`;
  return [
    { series: `http_server_requests_seconds_count{${labels}}`, values: values(count) },
    { series: `http_server_requests_seconds_sum{${labels}}`, values: values(seconds) },
  ];
};
const stream = options => traffic({ uri: '/sparrings/{topicId}/events', count: 1, seconds: 120, ...options });
const cases = [
  { name: 'SSE on an unrelated new route is excluded by response type', input: [...traffic({ type: 'http' }), ...stream({ uri: '/notifications/live', type: 'sse' })], api: 10, sse: 120 },
  { name: 'new and legacy instances are aggregated without double counting', input: [...traffic(), ...traffic({ instance: 'b', type: 'http' }), ...stream(), ...stream({ instance: 'b', uri: '/new-stream', type: 'sse' })], api: 10, sse: 120 },
  { name: 'JSON rejection on a stream route remains HTTP', input: traffic({ uri: '/sparrings/{topicId}/events', type: 'http' }), api: 10 },

  { name: '120 second SSE connections do not inflate 10 millisecond HTTP responses', input: [...traffic(), ...stream()], api: 10, sse: 120 },
  { name: 'SSE alone has no completed ordinary HTTP requests', input: stream(), sse: 120 },
  { name: 'HTTP alone has no completed SSE connections', input: traffic(), api: 10 },
  { name: 'missing collection has no average', input: [] },
  { name: 'idle counters have no average', input: [...traffic({ count: 0, seconds: 0 }), ...stream({ count: 0, seconds: 0 })] },
  { name: 'Actuator and another environment cannot contaminate either average', input: [...traffic(), ...stream(), ...traffic({ uri: '/actuator/health', count: 1000, seconds: 5000 }), ...traffic({ environment: 'prod', seconds: 1000 }), ...stream({ environment: 'prod', seconds: 300 })], api: 10, sse: 120 },
  { name: 'multiple instances use request weighted averages', input: [...traffic(), ...traffic({ instance: 'b', count: 20, seconds: 2 }), ...stream(), ...stream({ instance: 'b', count: 3, seconds: 120 })], api: 25, sse: 60 },
  { name: 'counter reset on one instance preserves both averages', input: [...traffic({ reset: true }), ...traffic({ instance: 'b' }), ...stream({ reset: true }), ...stream({ instance: 'b' })], api: 10, sse: 120 },
  { name: 'an unrelated REST events route stays in ordinary HTTP', input: traffic({ uri: '/events', seconds: 2 }), api: 20 },
];
const tests = cases.map(test => ({
  name: test.name,
  interval: '10s',
  input_series: test.input,
  promql_expr_test: Object.entries(expressions).map(([name, expr]) => ({
    expr,
    eval_time: '2m',
    exp_samples: test[name] === undefined ? [] : [{ labels: '{}', value: test[name] }],
  })),
}));
tests.push({
  name: 'HTTP status counts exclude all SSE paths',
  interval: '10s',
  input_series: [...traffic({ type: 'http' }), ...stream({ uri: '/notifications/live', type: 'sse' }), ...stream()],
  promql_expr_test: [{
    expr: expand(dashboard.panels.find(panel => panel.id === 10)),
    eval_time: '2m',
    exp_samples: [{ labels: '{status="200"}', value: 600 }],
  }],
});
const connectionPanels = [31, 32, 33].map(id => dashboard.panels.find(panel => panel.id === id));
const connectionSeries = (metric, values, { instance = 'a', uri = '/sparrings/{topicId}/events', environment = 'dev', status } = {}) => ({
  series: `${metric}{job="jarihana-backend",environment="${environment}",instance="${instance}",uri="${uri}"${status ? `,status="${status}"` : ''}}`,
  values,
});
const labels = '{instance="a",uri="/sparrings/{topicId}/events"}';
tests.push({
  name: 'active SSE counts are separate by server and route and exclude other environments',
  interval: '10s',
  input_series: [
    connectionSeries('jarihana_sse_connections_active', '20+0x12'),
    connectionSeries('jarihana_sse_connections_active', '30+0x12', { instance: 'b' }),
    connectionSeries('jarihana_sse_connections_active', '5+0x12', { uri: '/notifications/live' }),
    connectionSeries('jarihana_sse_connections_active', '999+0x12', { environment: 'prod' }),
  ],
  promql_expr_test: [
    { expr: expand(connectionPanels[0]), eval_time: '2m', exp_samples: [
      { labels, value: 20 },
      { labels: '{instance="b",uri="/sparrings/{topicId}/events"}', value: 30 },
      { labels: '{instance="a",uri="/notifications/live"}', value: 5 },
    ] },
    { expr: expand(connectionPanels[0]).replace('uri=~".*"', 'uri=~"/notifications/live"'), eval_time: '2m', exp_samples: [
      { labels: '{instance="a",uri="/notifications/live"}', value: 5 },
    ] },
  ],
});
for (const [name, attemptValues, rejectedValues, expected] of [
  ['twenty percent rejected', '0+10x12', '0+2x12', 20],
  ['attempts with no rejection series yield zero percent', '0+10x12', null, 0],
  ['idle attempts do not divide by zero', '0+0x12', null, null],
  ['counter reset preserves rejection rate', '0+10x5 0+10x6', '0+2x5 0+2x6', 20],
]) {
  tests.push({
    name, interval: '10s',
    input_series: [
      connectionSeries('jarihana_sse_connections_attempts_total', attemptValues),
      ...(rejectedValues ? [connectionSeries('jarihana_sse_connections_rejected_total', rejectedValues, { status: '503' })] : []),
    ],
    promql_expr_test: [{ expr: expand(connectionPanels[2]), eval_time: '2m',
      exp_samples: expected === null ? [] : [{ labels, value: expected }] }],
  });
}
tests.push({
  name: 'rejected requests keep HTTP status and selected environment',
  interval: '10s',
  input_series: [
    connectionSeries('jarihana_sse_connections_rejected_total', '0+2x30', { status: '503' }),
    connectionSeries('jarihana_sse_connections_rejected_total', '0+1x30', { status: '429' }),
    connectionSeries('jarihana_sse_connections_rejected_total', '0+99x30', { status: '503', environment: 'prod' }),
  ],
  promql_expr_test: [{ expr: expand(connectionPanels[1]), eval_time: '5m', exp_samples: [
    { labels: '{instance="a",uri="/sparrings/{topicId}/events",status="503"}', value: 60 },
    { labels: '{instance="a",uri="/sparrings/{topicId}/events",status="429"}', value: 30 },
  ] }],
});
tests.push({
  name: 'missing SSE instrumentation is not shown as healthy zero',
  interval: '10s', input_series: [],
  promql_expr_test: connectionPanels.map(panel => ({ expr: expand(panel), eval_time: '2m', exp_samples: [] })),
});
const rules = [api, sse, dashboard.panels.find(panel => panel.id === 10), ...connectionPanels].flatMap((panel, index) => ['dev', 'prod'].map(environment => ({
  record: `http_sse_dashboard_${index}_${environment}`,
  expr: expand(panel, environment),
})));
for (const [operation, document] of [
  ['check', { groups: [{ name: 'http_sse_dashboard', rules }] }],
  ['test', { evaluation_interval: '10s', fuzzy_compare: true, tests }],
]) {
  const result = spawnSync('docker', ['run', '--rm', '-i', '--entrypoint', 'promtool', 'prom/prometheus:v3.15.0', operation, 'rules', '/dev/stdin'], {
    input: JSON.stringify(document), encoding: 'utf8', timeout: 60_000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `promtool ${operation} must pass`);
}
console.log(`PASS: ${rules.length} query checks; ${tests.length} HTTP/SSE separation scenarios`);
