import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const selectedTargetNames = ['app_liveness', 'db_health', 'db_connection_health'];
const healthSurfaces = [
  {
    name: 'flow',
    dashboardUrl: new URL('../provisioning/dashboards/json/jarihana-canvas.json', import.meta.url),
    panelType: 'andrewbmchugh-flow-panel',
    targetNames: ['db_health', 'db_connection_health', 'db_flow'],
  },
  {
    name: 'native',
    dashboardUrl: new URL('../provisioning/dashboards/json/jarihana-canvas-native.json', import.meta.url),
    panelType: 'canvas',
    targetNames: selectedTargetNames,
  },
];

const loadSurface = surface => {
  const dashboard = JSON.parse(readFileSync(surface.dashboardUrl, 'utf8'));
  const panel = dashboard.panels.find(item => item.type === surface.panelType);
  if (!panel) {
    throw new Error('Missing ' + surface.name + ' health panel in ' + fileURLToPath(surface.dashboardUrl));
  }

  if (surface.name === 'native') {
    const databaseNode = panel.options.root.elements.find(item => item.name === 'database-node');
    if (databaseNode?.config?.fill?.field !== 'db_health') {
      throw new Error('Native database icon must use direct database health');
    }
    for (const name of ['api-node', 'pool-connection-anchor']) {
      const element = panel.options.root.elements.find(item => item.name === name);
      if (element?.connections?.length !== 2 || element.connections.some(connection => connection.color.field !== 'db_connection_health')) {
        throw new Error('Native DB connection must use backend database connectivity: ' + name);
      }
    }
  } else if (surface.name === 'flow') {
    const panelConfig = JSON.parse(panel.options.panelConfig);
    if (panelConfig.cells.database?.dataRef !== 'db_health' || panelConfig.cells['db-health']?.dataRef !== 'db_health') {
      throw new Error('Flow database icon/status must use direct database health');
    }
    const dbLine = panelConfig.cells['db-line'];
    if (dbLine?.strokeColor?.dataRef !== 'db_connection_health' || dbLine?.fillColor?.dataRef !== 'db_connection_health') {
      throw new Error('Flow DB line color must use backend database connectivity');
    }
  }

  const targets = new Map(panel.targets.map(target => [target.legendFormat, target]));
  const missingTargets = surface.targetNames.filter(name => !targets.has(name));
  if (missingTargets.length > 0) {
    const availableTargets = [...targets.keys()].sort().join(', ');
    throw new Error(
      'Missing ' + surface.name + ' health target(s): ' + missingTargets.join(', ') +
      '\nAvailable targets: ' + availableTargets,
    );
  }

  const expressions = Object.fromEntries(surface.targetNames.map(name => [name, renderExpression(surface, targets, name)]));
  for (const [name, pattern] of requiredMatchers) {
    if (surface.targetNames.includes(name) && !pattern.test(expressions[name])) {
      throw new Error(surface.name + ' health target ' + name + ' does not use the expected job/environment matcher:\n' + expressions[name]);
    }
  }

  return { ...surface, expressions };
};

const renderExpression = (surface, targets, name) => {
  const rendered = targets.get(name).expr
    .replaceAll('$environment', 'dev')
    .replaceAll('${environment}', 'dev');
  if (rendered.includes('$')) {
    throw new Error('Unrendered Grafana variable in ' + surface.name + ' ' + name + ': ' + rendered);
  }
  return rendered;
};

const requiredMatchers = [
  ['app_liveness', /probe_success\{[^}]*job="jarihana-liveness"[^}]*environment="dev"/],
  ['db_health', /pg_up\{[^}]*job="jarihana-postgres"[^}]*environment="dev"/],
  ['db_health', /up\{[^}]*job="jarihana-postgres"[^}]*environment="dev"/],
  ['db_connection_health', /probe_success\{[^}]*job="jarihana-database"[^}]*environment="dev"/],
  ['db_connection_health', /probe_success\{[^}]*job="jarihana-liveness"[^}]*environment="dev"/],
  ['db_flow', /jdbc_query_seconds_count\{[^}]*job="jarihana-backend"[^}]*environment="dev"/],
  ['db_flow', /up\{[^}]*job="jarihana-backend"[^}]*environment="dev"/],
  ['db_flow', /probe_success\{[^}]*job="jarihana-database"[^}]*environment="dev"/],
  ['db_flow', /probe_success\{[^}]*job="jarihana-liveness"[^}]*environment="dev"/],
];

const surfaces = healthSurfaces.map(loadSurface);

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
  dbRequests: metric('jdbc_query_seconds_count', { ...common, job: 'jarihana-backend', instance: 'jarihana-backend' }),
  wrongEnvAppLiveness: metric('probe_success', { ...common, environment: 'prod', job: 'jarihana-liveness', instance: 'blackbox/backend' }),
  wrongEnvDirectPgUp: metric('pg_up', { ...common, environment: 'prod', job: 'jarihana-postgres', instance: 'testhost:postgres' }),
  wrongEnvPostgresScrapeUp: metric('up', { ...common, environment: 'prod', job: 'jarihana-postgres', instance: 'testhost:postgres' }),
  wrongHostPostgresScrapeUp: metric('up', { ...common, host_id: 'otherhost', job: 'jarihana-postgres', instance: 'otherhost:postgres' }),
};

const inputSeries = items => items.map(([name, values]) => ({ series: series[name], values }));
const expected = (expr, value) => ({ expr, eval_time: '5m', exp_samples: [{ labels: '{}', value }] });
const checks = (surface, values) => surface.targetNames.map(name => expected(surface.expressions[name], values[name]));

const cases = [
  {
    name: 'database down while app liveness stays up',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '0x6'],
      ['directPgUp', '0x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 1, db_health: 0, db_connection_health: 0, db_flow: 0 },
  },
  {
    name: 'app down keeps direct database health independent',
    input: inputSeries([
      ['appLiveness', '0x6'],
      ['appDbProbe', '0x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '0x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 0, db_health: 1, db_connection_health: -1, db_flow: 0 },
  },
  {
    name: 'app database probe failure stops DB line but keeps direct postgres healthy',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '0x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 1, db_health: 1, db_connection_health: 0, db_flow: 0 },
  },
  {
    name: 'missing app database probe stops DB line but keeps direct postgres healthy',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 1, db_health: 1, db_connection_health: -1, db_flow: 0 },
  },
  {
    name: 'stale app database probe stops DB line but keeps direct postgres healthy',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '1x1'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 1, db_health: 1, db_connection_health: -1, db_flow: 0 },
  },
  {
    name: 'failed liveness invalidates a still-fresh healthy app database probe',
    input: inputSeries([
      ['appLiveness', '0x6'],
      ['appDbProbe', '1x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 0, db_health: 1, db_connection_health: -1, db_flow: 0 },
  },
  {
    name: 'metrics scrape failure does not mask liveness or direct database probes',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '1x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '1x6'],
      ['backendUp', '0x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 1, db_health: 1, db_connection_health: 1, db_flow: 0 },
  },
  {
    name: 'collector samples older than 150 seconds are unknown',
    input: inputSeries([
      ['appLiveness', '1x1'],
      ['appDbProbe', '1x1'],
      ['directPgUp', '1x1'],
      ['postgresScrapeUp', '1x1'],
      ['backendUp', '1x1'],
      ['dbRequests', '0x1'],
    ]),
    expected: { app_liveness: -1, db_health: -1, db_connection_health: -1, db_flow: 0 },
  },
  {
    name: 'postgres exporter scrape failure does not stop app DB line',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '1x6'],
      ['directPgUp', '1x6'],
      ['postgresScrapeUp', '0x6'],
      ['backendUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 1, db_health: -1, db_connection_health: 1, db_flow: 1 },
  },
  {
    name: 'no matching health samples are unknown',
    input: inputSeries([
      ['wrongEnvAppLiveness', '1x6'],
      ['wrongEnvDirectPgUp', '1x6'],
      ['wrongEnvPostgresScrapeUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: -1, db_health: -1, db_connection_health: -1, db_flow: 0 },
  },
  {
    name: 'wrong host postgres scrape does not satisfy direct database liveness',
    input: inputSeries([
      ['appLiveness', '1x6'],
      ['appDbProbe', '1x6'],
      ['directPgUp', '1x6'],
      ['wrongEnvPostgresScrapeUp', '1x6'],
      ['wrongHostPostgresScrapeUp', '1x6'],
      ['backendUp', '1x6'],
      ['dbRequests', '0+60x6'],
    ]),
    expected: { app_liveness: 1, db_health: -1, db_connection_health: 1, db_flow: 1 },
  },
];

const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const yaml = [
  'evaluation_interval: 1m',
  'tests:',
  ...surfaces.flatMap(surface => cases.flatMap(testCase => [
    '  - name: ' + quote(surface.name + ' ' + testCase.name),
    '    interval: 1m',
    '    input_series:',
    ...testCase.input.flatMap(item => [
      '      - series: ' + quote(item.series),
      '        values: ' + quote(item.values),
    ]),
    '    promql_expr_test:',
    ...checks(surface, testCase.expected).flatMap(item => [
      '      - expr: ' + quote(item.expr),
      '        eval_time: ' + quote(item.eval_time),
      '        exp_samples:',
      '          - labels: ' + quote(item.exp_samples[0].labels),
      '            value: ' + item.exp_samples[0].value,
    ]),
  ])),
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
