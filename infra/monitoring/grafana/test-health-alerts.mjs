import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Test the provisioned expression itself, not a copy that can drift from Grafana.
const rules = readFileSync(new URL('./provisioning/alerting/rules.yaml', import.meta.url), 'utf8');
const rule = rules.split('  - uid: jarihana-prod-health\n')[1]?.split('\n  - uid: ')[0];
const expression = rule?.match(/^        expr: (.+)$/m)?.[1];
if (!expression) throw new Error('Could not find prod health alert expression');
const metric = (name, labels) => name + '{' + Object.entries(labels).map(([k, v]) => k + '="' + v + '"').join(',') + '}';
const central = { environment: 'prod', instance: 'collector', job: 'integrations/unix' };
const source = { ...central, source: 'nginx' };
const host = (host_id, environment = 'prod') => ({ environment, host_id, job: 'jarihana-health', instance: host_id });
const route = (host_id, slot, environment = 'prod') => ({ ...central, environment, host_id, slot });
const s = (name, labels, values) => ({ series: metric(name, labels), values });
const collector = (timestamp = '0+10x30', success = '1x30', observed = '0+10x30') => [
  s('jarihana_deployment_collector_timestamp_seconds', central, timestamp),
  s('jarihana_deployment_source_success', source, success),
  s('jarihana_deployment_source_observed_timestamp_seconds', source, observed),
];
const routes = (old, next, env = 'prod') => [
  s('jarihana_nginx_route', route('old', 'B', env), old),
  s('jarihana_nginx_route', route('new', 'A', env), next),
];
const health = (old, next, env = 'prod') => [
  ...(old === null ? [] : [s('probe_success', host('old', env), old)]),
  ...(next === null ? [] : [s('probe_success', host('new', env), next)]),
];
const cases = [
  ['inactive old fails; active new healthy', [...collector(), ...routes('0x30', '1x30'), ...health('0x30', '1x30')], 0],
  ['both hosts healthy; only old route active', [...collector(), ...routes('1x30', '0x30'), ...health('1x30', '1x30')], 0],
  ['two active routes with both hosts healthy', [...collector(), ...routes('1x30', '1x30'), ...health('1x30', '1x30')], 1],
  ['two active routes with one failed health', [...collector(), ...routes('1x30', '1x30'), ...health('1x30', '0x30')], 1],
  ['both routes explicitly inactive', [...collector(), ...routes('0x30', '0x30'), ...health('1x30', '1x30')], 1],
  ['active fails; standby healthy', [...collector(), ...routes('0x30', '1x30'), ...health('1x30', '0x30')], 1],
  ['active health missing', [...collector(), ...routes('0x30', '1x30'), ...health('1x30', null)], 1],
  ['all health missing', [...collector(), ...routes('0x30', '1x30')], 1],
  ['stale collector payload repeatedly scraped', [...collector('0x30'), ...routes('0x30', '1x30'), ...health('0x30', '1x30')], 1],
  ['stale nginx observation repeatedly scraped', [...collector('0+10x30', '1x30', '0x30'), ...routes('0x30', '1x30'), ...health('0x30', '1x30')], 1],
  ['stale route sample', [...collector(), ...routes('0x30', '1x1'), ...health('1x30', '1x30')], 1],
  ['stale old route during series rollover', [...collector(), ...routes('1x1', '1x30'), ...health('0x30', '1x30')], 0],
  ['route missing', [...collector(), ...health('1x30', '1x30')], 1],
  ['nginx source failed', [...collector('0+10x30', '0x30'), ...routes('0x30', '1x30'), ...health('1x30', '1x30')], 1],
  ['reversed route remains healthy', [...collector(), ...routes('1x30', '0x30'), ...health('1x30', '0x30')], 0],
  ['other environment cannot supply prod route', [...collector(), ...routes('0x30', '1x30', 'dev'), ...health('1x30', '1x30')], 1],
  ['other environment cannot supply prod health', [...collector(), ...routes('0x30', '1x30'), ...health('1x30', '1x30', 'dev')], 1],
  ['stale active health sample', [...collector(), ...routes('0x30', '1x30'), ...health('1x30', '1x1')], 1],
  ['stale collector sample', [...collector('0+10x1'), ...routes('0x30', '1x30'), ...health('1x30', '1x30')], 1],
  ['nginx observation missing', [s('jarihana_deployment_collector_timestamp_seconds', central, '0+10x30'), s('jarihana_deployment_source_success', source, '1x30'), ...routes('0x30', '1x30'), ...health('1x30', '1x30')], 1],
  ['no collector', [...routes('0x30', '1x30'), ...health('1x30', '1x30')], 1],
  ['two active routes with one missing health', [...collector(), ...routes('1x30', '1x30'), ...health('1x30', null)], 1],
];
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const yaml = ['evaluation_interval: 10s', 'tests:', ...cases.flatMap(([name, input, value]) => [
  '  - name: ' + quote(name), '    interval: 10s', '    input_series:',
  ...input.flatMap(item => ['      - series: ' + quote(item.series), '        values: ' + quote(item.values)]),
  '    promql_expr_test:', '      - expr: ' + quote(expression), "        eval_time: '5m'",
  '        exp_samples:', "          - labels: '{}'", '            value: ' + value,
]), ''].join('\n');
const tempDir = mkdtempSync(join(tmpdir(), 'jarihana-health-alert-promtool-'));
try {
  const testFile = join(tempDir, 'alerts.yml');
  writeFileSync(testFile, yaml);
  chmodSync(tempDir, 0o755);
  chmodSync(testFile, 0o644);
  const result = spawnSync('docker', ['run', '--rm', '--entrypoint', 'promtool', '-v', tempDir + ':/work:ro',
    'prom/prometheus:v3.15.0', 'test', 'rules', '/work/alerts.yml'], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
