import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const labels = 'job="jarihana-backend",environment="dev",instance="backend"';
const health = [
  { series: `up{${labels}}`, values: '1x60' },
  { series: 'pg_up{job="jarihana-postgres",environment="dev",instance="db"}', values: '1x60' },
  { series: 'up{job="jarihana-postgres",environment="dev",instance="db"}', values: '1x60' },
  { series: 'probe_success{job="jarihana-liveness",environment="dev",instance="blackbox/backend"}', values: '1x60' },
  { series: 'probe_success{job="jarihana-database",environment="dev",instance="blackbox/database"}', values: '1x60' },
];
const histogram = (idle = false) => [
  { series: `jdbc_query_seconds_count{${labels}}`, values: idle ? '100x60' : '0+100x60' },
  ...[['0.01', 95], ['0.1', 100], ['+Inf', 100]].map(([le, count]) => ({
    series: `jdbc_query_seconds_bucket{${labels},le="${le}"}`,
    values: idle ? `${count}x60` : `0+${count}x60`,
  })),
];
const active = histogram();
const removed = active.map(item => ({ ...item, values: item.values.replace('x60', 'x56 stale') }));
const expired = active.map(item => ({ ...item, values: item.values.replace('x60', 'x54') }));
const recovered = active.map(item => {
  const increment = Number(item.values.match(/\+(\d+)x/)[1]);
  return { ...item, values: `${item.values.replace('x60', 'x54')} stale _ _ ${58 * increment}+${increment}x2` };
});
const cases = [
  { name: 'JDBC metrics without any Tempo samples', series: [...health, ...active], rps: 20, p95: 10, flow: 20 },
  { name: 'idle database keeps zero throughput and unknown percentile', series: [...health, ...histogram(true)], rps: 0, p95: -1, flow: 0 },
  { name: 'backend scrape failure hides old JDBC metrics', series: [{ ...health[0], values: '0x60' }, ...health.slice(1), ...active], rps: -1, p95: -1, flow: 0 },
  { name: 'backend samples older than 30 seconds', series: [{ ...health[0], values: '1x50' }, ...health.slice(1), ...active], rps: -1, p95: -1, flow: 0 },
  { name: 'missing JDBC instrumentation is not zero traffic', series: health, rps: -1, p95: -1, flow: 0 },
  { name: 'JDBC removal hides historical rates while backend and health stay normal', series: [...health, ...removed], rps: -1, p95: -1, flow: 0, healthUnchanged: true },
  { name: 'JDBC samples exactly 30 seconds old hide historical rates', series: [...health, ...expired], rps: -1, p95: -1, flow: 0, healthUnchanged: true },
  { name: 'JDBC samples less than 30 seconds old remain valid', series: [...health, ...histogram(true).map(item => ({ ...item, values: item.values.replace('x60', 'x55') }))], rps: 0, p95: -1, flow: 0 },
  { name: 'fresh zero counters are valid idle metrics', series: [...health, ...active.map(item => ({ ...item, values: '0x60' }))], rps: 0, p95: -1, flow: 0 },
  { name: 'query counter collection resuming restores throughput and animation', series: [...health, recovered[0], ...active.slice(1)], rps: 20, p95: 10, flow: 20 },
  { name: 'a fresh instance cannot keep expired instance rates in the aggregate', series: [...health, ...active, ...expired.map(item => ({ ...item, series: item.series.replace('instance="backend"', 'instance="retired"') }))], rps: 20, p95: 10, flow: 20 },
  { name: 'missing histogram buckets hide only the percentile', series: [...health, active[0], ...removed.slice(1)], rps: 20, p95: -1, flow: 20 },
  { name: 'missing query counter hides throughput and animation', series: [...health, removed[0], ...active.slice(1)], rps: -1, p95: 10, flow: 0 },
  { name: 'other environment metrics cannot leak into dev', series: [...health, ...active.map(item => ({ ...item, series: item.series.replace('environment="dev"', 'environment="prod"') }))], rps: -1, p95: -1, flow: 0 },
  { name: 'direct DB failure does not stop app DB line when backend connection is healthy', series: [health[0], { ...health[1], values: '0x60' }, ...health.slice(2), ...active], rps: 20, p95: 10, flow: 20 },
  { name: 'app DB probe failure stops animation even when direct DB is healthy', series: [...health.slice(0, 4), { ...health[4], values: '0x60' }, ...active], rps: 20, p95: 10, flow: 0 },
  { name: 'missing app DB probe stops animation', series: [...health.slice(0, 4), ...active], rps: 20, p95: 10, flow: 0 },
  { name: 'app DB probe older than 150 seconds stops animation', series: [...health.slice(0, 4), { ...health[4], values: '1x20' }, ...active], rps: 20, p95: 10, flow: 0 },
  { name: 'failed liveness stops animation despite a fresh healthy app DB probe', series: [...health.slice(0, 3), { ...health[3], values: '0x60' }, health[4], ...active], rps: 20, p95: 10, flow: 0 },
];
const tests = [];
for (const [filename, type] of [['jarihana-canvas.json', 'andrewbmchugh-flow-panel'], ['jarihana-canvas-native.json', 'canvas']]) {
  const dashboard = JSON.parse(readFileSync(new URL(`../provisioning/dashboards/json/${filename}`, import.meta.url), 'utf8'));
  assert.ok(!dashboard.links.some(link => link.title === '트레이스'), 'Disabled tracing must not have a navigation link');
  for (const panel of dashboard.panels) {
    for (const target of panel.targets ?? []) {
      assert.doesNotMatch(target.expr, /traces_service_graph_|job="tempo"/, 'Dashboard must not depend on Tempo');
    }
  }
  const panel = dashboard.panels.find(item => item.type === type);
  const expressions = Object.fromEntries(['db_rps', 'db_p95', 'db_flow', 'db_health', 'db_connection_health'].map(name => {
    const target = panel.targets.find(item => item.legendFormat === name);
    assert.ok(target, `Missing ${name}`);
    return [name, target.expr.replaceAll('$environment', 'dev').replaceAll('${motion}', '1')];
  }));
  assert.match(expressions.db_rps, /jdbc_query_seconds_count/);
  assert.match(expressions.db_p95, /jdbc_query_seconds_bucket/);
  for (const scenario of cases) {
    const flow = type === 'canvas' && scenario.flow > 0 ? Math.min(2 + 2 * Math.log(1 + scenario.flow), 9) : scenario.flow;
    tests.push({
      name: `${filename}: ${scenario.name}`, interval: '5s', input_series: scenario.series,
      promql_expr_test: Object.entries({ db_rps: scenario.rps, db_p95: scenario.p95, db_flow: flow,
        ...(scenario.healthUnchanged ? { db_health: 1, db_connection_health: 1 } : {}),
      }).map(([name, value]) => ({
        expr: expressions[name], eval_time: '5m', exp_samples: [{ labels: '{}', value }],
      })),
    });
  }
}
const directory = mkdtempSync(join(tmpdir(), 'jarihana-jdbc-promtool-'));
try {
  // JSON is valid YAML and avoids a test-only serialization dependency.
  const testFile = join(directory, 'jdbc.yml');
  writeFileSync(testFile, JSON.stringify({ evaluation_interval: '5s', tests }));
  // promtool runs as nobody; Linux mkdtemp directories are owner-only.
  chmodSync(directory, 0o755);
  chmodSync(testFile, 0o644);
  const result = spawnSync('docker', [
    'run', '--rm', '--entrypoint', 'promtool', '-v', `${directory}:/work:ro`,
    'prom/prometheus:v3.15.0', 'test', 'rules', '/work/jdbc.yml',
  ], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'JDBC PromQL tests must pass');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
