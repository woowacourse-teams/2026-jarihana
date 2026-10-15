import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const labels = 'job="jarihana-backend",environment="dev",instance="backend"';
const up = { series: `up{${labels}}`, values: '1x60' };
const metrics = (count = '0+10x60', fast = '0+8x60', boundary = '0.1') => [
  { series: `jdbc_query_seconds_count{${labels}}`, values: count },
  { series: `jdbc_query_seconds_bucket{${labels},le="${boundary}"}`, values: fast },
];
const active = metrics();
const old = (items, suffix) => items.map(item => ({ ...item, values: item.values.replace('x60', suffix) }));
const relabel = (items, from, to) => items.map(item => ({ ...item, series: item.series.replace(from, to) }));
const cases = [
  { name: 'mixed fast and strictly over 100 milliseconds executions', series: [up, ...active], count: 120, ratio: 20 },
  { name: 'multiple healthy instances aggregate executions', series: [up, ...active, ...relabel([up, ...active], 'instance="backend"', 'instance="backend-2"')], count: 240, ratio: 20 },
  { name: '100 milliseconds or faster executions are excluded', series: [up, ...metrics(undefined, '0+10x60')], count: 0, ratio: 0 },
  { name: 'all executions are slow', series: [up, ...metrics(undefined, '0x60')], count: 600, ratio: 100 },
  { name: 'idle after earlier traffic is zero', series: [up, ...metrics('100x60', '80x60')], count: 0, ratio: 0 },
  { name: 'fresh zero counters are zero', series: [up, ...metrics('0x60', '0x60')], count: 0, ratio: 0 },
  { name: 'missing instrumentation is no data', series: [up] },
  { name: 'missing exact bucket is no data', series: [up, active[0]] },
  { name: 'nearby bucket cannot replace exact 100 milliseconds', series: [up, ...metrics(undefined, undefined, '0.1073741824')] },
  { name: 'missing count is no data', series: [up, active[1]] },
  { name: 'stale marker hides historical rates', series: [up, ...old(active, 'x56 stale')] },
  { name: 'count exactly 30 seconds old is no data', series: [up, ...old([active[0]], 'x54'), active[1]] },
  { name: 'bucket exactly 30 seconds old is no data', series: [up, active[0], ...old([active[1]], 'x54')] },
  { name: 'samples younger than 30 seconds are still valid', series: [up, ...old(metrics('100x60', '80x60'), 'x55')], count: 0, ratio: 0 },
  { name: 'failed scrape hides historical rates', series: [{ ...up, values: '0x60' }, ...active] },
  { name: 'up exactly 30 seconds old is no data', series: [...old([up], 'x54'), ...active] },
  { name: 'missing scrape series is no data', series: active },
  { name: 'retired instances cannot contaminate current totals', series: [up, ...active, ...relabel(old([up, ...metrics('0+100x60', '0x60')], 'x54'), 'instance="backend"', 'instance="retired"')], count: 120, ratio: 20 },
  { name: 'fresh metrics without matching instance up cannot contaminate totals', series: [up, ...active, ...relabel(metrics('0+100x60', '0x60'), 'instance="backend"', 'instance="retired"')], count: 120, ratio: 20 },
  { name: 'other environments cannot contaminate totals', series: [up, ...active, ...relabel([up, ...metrics('0+100x60', '0x60')], 'environment="dev"', 'environment="prod"')], count: 120, ratio: 20 },
  { name: 'other environment alone is no data', series: relabel([up, ...active], 'environment="dev"', 'environment="prod"') },
  // The left boundary is excluded: 58 observed increments extrapolated from 295 to 300 seconds.
  { name: 'counter resets preserve slow ratio', series: [up, ...metrics('0+10x29 0+10x30', '0+8x29 0+8x30')], count: 116 * 60 / 59, ratio: 20 },
];

const dashboard = JSON.parse(readFileSync(new URL('./provisioning/dashboards/json/jarihana-overview.json', import.meta.url), 'utf8'));
const expressions = Object.fromEntries([
  ['count', '느린 JDBC 실행 · 100ms 초과 · 5분'],
  ['ratio', '느린 JDBC 비율 · 100ms 초과 · 5분'],
].map(([name, title]) => {
  const panel = dashboard.panels.find(item => item.title === title);
  assert.ok(panel, `Missing panel: ${title}`);
  assert.equal(panel.type, 'stat');
  assert.equal(panel.targets.length, 1);
  assert.equal(panel.targets[0].instant, true);
  assert.equal(panel.targets[0].range, false);
  assert.equal(panel.datasource.uid, 'prometheus');
  assert.equal(panel.fieldConfig.defaults.unit, name === 'ratio' ? 'percent' : 'short');
  assert.equal(panel.fieldConfig.defaults.noValue, 'No data');
  assert.match(panel.targets[0].expr, /job="jarihana-backend",environment="\$environment"/);
  return [name, panel.targets[0].expr.replaceAll('$environment', 'dev')];
}));

const tests = cases.map(scenario => ({
  name: scenario.name,
  interval: '5s',
  input_series: scenario.series,
  promql_expr_test: Object.entries(expressions).map(([name, expr]) => ({
    expr, eval_time: '5m',
    exp_samples: scenario[name] === undefined ? [] : [{ labels: '{}', value: scenario[name] }],
  })),
}));
const executionPanel = dashboard.panels.find(panel => panel.id === 28);
assert.equal(executionPanel.type, 'timeseries');
assert.equal(executionPanel.targets[0].range, true);
assert.equal(executionPanel.fieldConfig.defaults.noValue, 'No data');
const executionExpression = executionPanel.targets[0].expr.replaceAll('$environment', 'dev');
const executionCases = [
  { name: 'all JDBC executions regardless of slow bucket', series: [up, ...active], total: 600 },
  { name: 'count without bucket remains observable', series: [up, active[0]], total: 600 },
  { name: 'idle count is zero', series: [up, ...metrics('100x60', '80x60')], total: 0 },
  { name: 'missing count is no data', series: [up] },
  { name: 'failed scrape is no data', series: [{ ...up, values: '0x60' }, ...active] },
  { name: 'stale count is no data', series: [up, ...old(active, 'x54')] },
  { name: 'other environment count is excluded', series: relabel([up, ...active], 'environment="dev"', 'environment="prod"') },
  { name: 'first sample already positive has no observed increase', series: [up, ...metrics('1x60', '1x60')], total: 0 },
  { name: 'counter reset is handled per series', series: [up, ...metrics('0+10x29 0+10x30', '0+8x29 0+8x30')], total: 580 * 60 / 59 },
];
tests.push(...executionCases.map(scenario => ({
  name: scenario.name,
  interval: '5s',
  input_series: scenario.series,
  promql_expr_test: [{
    expr: executionExpression, eval_time: '5m',
    exp_samples: scenario.total === undefined ? [] : [{ labels: '{}', value: scenario.total }],
  }],
})));
const evidenceDirectory = process.env.EVIDENCE_DIR && resolve(process.env.EVIDENCE_DIR);
if (evidenceDirectory) mkdirSync(evidenceDirectory, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'jarihana-slow-query-promtool-'));
try {
  const fixture = JSON.stringify({ evaluation_interval: '5s', fuzzy_compare: true, tests }, null, 2);
  const testFile = join(directory, 'slow-queries.yml');
  writeFileSync(testFile, fixture);
  if (evidenceDirectory) writeFileSync(join(evidenceDirectory, 'slow-queries.fixture.json'), fixture);
  chmodSync(directory, 0o755);
  chmodSync(testFile, 0o644);
  const result = spawnSync('docker', [
    'run', '--rm', '--entrypoint', 'promtool', '-v', `${directory}:/work:ro`,
    'prom/prometheus:v3.15.0', 'test', 'rules', '/work/slow-queries.yml',
  ], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}exit_code=${result.status}\n`;
  if (evidenceDirectory) writeFileSync(join(evidenceDirectory, 'promtool.log'), output);
  process.stdout.write(output);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Slow query panel PromQL scenarios must pass');
  console.log(`PASS: ${tests.length} scenarios / ${cases.length * 2 + executionCases.length} actual panel expression assertions`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
