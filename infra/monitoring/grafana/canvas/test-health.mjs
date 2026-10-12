import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const dashboardUrl = new URL('../provisioning/dashboards/json/jarihana-canvas-native.json', import.meta.url);
const dashboard = JSON.parse(readFileSync(dashboardUrl, 'utf8'));
const canvasPanel = dashboard.panels.find(panel => panel.type === 'canvas');
if (!canvasPanel) {
  throw new Error('Missing native Canvas panel in ' + fileURLToPath(dashboardUrl));
}

const targets = new Map(canvasPanel.targets.map(target => [target.legendFormat, target]));
const selectedTargetNames = ['app_liveness', 'db_health', 'db_connection_health'];
const missingTargets = selectedTargetNames.filter(name => !targets.has(name));
if (missingTargets.length > 0) {
  const availableTargets = [...targets.keys()].sort().join(', ');
  throw new Error(
    'Missing native Canvas health target(s): ' + missingTargets.join(', ') +
    '\nAvailable targets: ' + availableTargets,
  );
}

const renderExpression = name => {
  const rendered = targets.get(name).expr
    .replaceAll('$environment', 'dev')
    .replaceAll('${environment}', 'dev');
  if (rendered.includes('$')) {
    throw new Error('Unrendered Grafana variable in ' + name + ': ' + rendered);
  }
  return rendered;
};

const expressions = Object.fromEntries(selectedTargetNames.map(name => [name, renderExpression(name)]));

const requiredMatchers = [
  ['app_liveness', /probe_success\{[^}]*job="jarihana-liveness"[^}]*environment="dev"/],
  ['db_health', /pg_up\{[^}]*job="jarihana-postgres"[^}]*environment="dev"/],
  ['db_health', /up\{[^}]*job="jarihana-postgres"[^}]*environment="dev"/],
  ['db_connection_health', /probe_success\{[^}]*job="jarihana-database"[^}]*environment="dev"/],
];
for (const [name, pattern] of requiredMatchers) {
  if (!pattern.test(expressions[name])) {
    throw new Error('Health target ' + name + ' does not use the expected job/environment matcher:\n' + expressions[name]);
  }
}

const metric = (name, labels) => {
  const entries = Object.entries(labels).map(([key, value]) => key + '="' + value + '"');
  return name + '{' + entries.join(',') + '}';
};
const common = { environment: 'dev', host_id: 'testhost' };
const series = {
  appLiveness: metric('probe_success', { ...common, job: 'jarihana-liveness', instance: 'blackbox/backend' }),
  appDbProbe: metric('probe_success', { ...common, job: 'jarihana-database', instance: 'blackbox/database' }),
  directPgUp: metric('pg_up', { ...common, job: 'jarihana-postgres', instance: 'testhost:postgres' }),
  postgresScrapeUp: metric('up', { ...common, job: 'jarihana-postgres', instance: 'testhost:postgres' }),
  backendUp: metric('up', { ...common, job: 'jarihana-backend', instance: 'jarihana-backend' }),
};

const inputSeries = items => items.map(([name, values]) => ({ series: series[name], values }));
const expected = (expr, value) => ({ expr, eval_time: '5m', exp_samples: [{ labels: '{}', value }] });
const checks = values => selectedTargetNames.map(name => expected(expressions[name], values[name]));

const cases = [
  {
    name: 'database down while app liveness stays up',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '0x6'],
      ['directPgUp', '0x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '1x6'],
    ]),
    expected: { app_liveness: 1, db_health: 0, db_connection_health: 0 },
  },
  {
    name: 'app down keeps direct database health independent',
    input: inputSeries([
      ['appLiveness', '0x6'],
      ['appDbProbe', '0x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '0x6'],
    ]),
    expected: { app_liveness: 0, db_health: 1, db_connection_health: -1 },
  },
  {
    name: 'metrics scrape failure does not mask liveness or direct database probes',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '1x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '0x6'],
    ]),
    expected: { app_liveness: 1, db_health: 1, db_connection_health: 1 },
  },
  {
    name: 'collector samples older than 150 seconds are unknown',
    input: inputSeries([
      ['appLiveness', '1x1'],
      ['appDbProbe', '1x1'],
      ['directPgUp', '1x1'],
      ['postgresScrapeUp', '1x1'],
      ['backendUp', '1x1'],
    ]),
    expected: { app_liveness: -1, db_health: -1, db_connection_health: -1 },
  },
  {
    name: 'postgres exporter scrape failure makes direct database health unknown',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '1x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '0x6'],
      ['backendUp', '1x6'],
    ]),
    expected: { app_liveness: 1, db_health: -1, db_connection_health: 1 },
  },
];

const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const yaml = [
  'evaluation_interval: 1m',
  'tests:',
  ...cases.flatMap(testCase => [
    '  - name: ' + quote(testCase.name),
    '    interval: 1m',
    '    input_series:',
    ...testCase.input.flatMap(item => [
      '      - series: ' + quote(item.series),
      '        values: ' + quote(item.values),
    ]),
    '    promql_expr_test:',
    ...checks(testCase.expected).flatMap(item => [
      '      - expr: ' + quote(item.expr),
      '        eval_time: ' + quote(item.eval_time),
      '        exp_samples:',
      '          - labels: ' + quote(item.exp_samples[0].labels),
      '            value: ' + item.exp_samples[0].value,
    ]),
  ]),
  '',
].join('\n');

const tempDir = mkdtempSync(join(tmpdir(), 'jarihana-health-promtool-'));
try {
  const testFile = join(tempDir, 'health.yml');
  writeFileSync(testFile, yaml);
  const result = spawnSync('docker', [
    'run', '--rm',
    '--entrypoint', 'promtool',
    '-v', tempDir + ':/work:ro',
    'prom/prometheus:v3.15.0',
    'test', 'rules', '/work/health.yml',
  ], { encoding: 'utf8' });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
