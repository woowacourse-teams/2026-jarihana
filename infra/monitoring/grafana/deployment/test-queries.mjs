import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { queries, devQueries, mappingQuery } from './queries.mjs';
import { validateDashboard } from './build-dashboard.mjs';

const evidence = resolve(process.env.DEPLOYMENT_DASHBOARD_EVIDENCE_DIR ?? '.omo/evidence/deployment-dashboard');
mkdirSync(evidence, { recursive: true });
chmodSync(evidence, 0o755);
const render = value => value.replaceAll('$environment', 'dev').replaceAll('environment="prod"', 'environment="dev"');
const m = (name, labels = '') => `${name}{environment="dev"${labels ? ',' + labels : ''}}`;
const slot = 'slot="A",host_id="actual-a",instance_id="i-actual-a"';
const metric = (name, values, labels = '') => ({ series: m(name, labels), values });
const base = [
  metric('jarihana_deployment_collector_timestamp_seconds', '0+30x10'),
  metric('jarihana_deployment_source_success', '1x10', 'source="config"'),
  metric('jarihana_deployment_source_success', '1x10', 'source="journal"'),
  metric('jarihana_deployment_slot_info', '1x10', slot),
  metric('jarihana_deployment_phase', '6x10'),
  metric('jarihana_deployment_lease_valid', '0x10'),
  metric('jarihana_deployment_created_timestamp_seconds', '0x10'),
  metric('jarihana_nginx_active_slot', '1x10'),
  metric('jarihana_nginx_route', '1x10', slot),
  metric('jarihana_ec2_state', '1x10', slot),
  metric('probe_success', '1x10', 'job="jarihana-health",host_id="actual-a"'),
  metric('probe_success', '1x10', 'job="jarihana-liveness",host_id="actual-a"'),
  metric('probe_success', '0x10', 'job="jarihana-health",host_id="unmapped"'),
  metric('jarihana_nginx_traffic_collection_success', '1x10'),
  metric('jarihana_nginx_traffic_observed_at_seconds', '0+30x10'),
  metric('jarihana_nginx_requests_total', '0+30x10', slot),
];
const replace = (name, values) => base.map(item => item.series.startsWith(name + '{') ? { ...item, values } : item);
const cases = [
  { name: 'fresh automatic slot mapping and actual route', input: base, expected: { a_health: 1, a_liveness: 1, a_ec2: 1, a_route: 1, active_slot: 1, a_rps: 1, deployment_phase: 6, lease_valid: 0, deployment_age: 300 }, mapping: 1 },
  { name: 'collector payload remains valid at 89 seconds', input: replace('jarihana_deployment_collector_timestamp_seconds', '211x10'), expected: { a_health: 1, a_ec2: 1, active_slot: 1, collector_age: 89 }, mapping: 1 },
  { name: 'collector payload expires at 90 seconds despite fresh scrapes', input: replace('jarihana_deployment_collector_timestamp_seconds', '210x10'), expected: { a_health: -1, a_ec2: -1, active_slot: -1, collector_age: -1 }, mapping: 0 },
  { name: 'collector samples tolerate a delayed 30-second poll', input: replace('jarihana_deployment_collector_timestamp_seconds', '0+30x8'), expected: { a_health: 1, a_ec2: 1, active_slot: 1 }, mapping: 1 },
  { name: 'traffic observation tolerates one delayed poll', input: replace('jarihana_nginx_traffic_observed_at_seconds', '240x10'), expected: { a_rps: 1 } },
  { name: 'traffic observation expires at 90 seconds', input: replace('jarihana_nginx_traffic_observed_at_seconds', '210x10'), expected: { a_rps: -1 } },
  { name: 'app health samples still expire after 45 seconds', input: base.map(item => item.series.startsWith('probe_success{') ? { ...item, values: '1x8' } : item), expected: { a_health: -1, a_liveness: -1 } },
  { name: 're-scraped frozen textfile is unknown', input: replace('jarihana_deployment_collector_timestamp_seconds', '0x10'), expected: { a_health: -1, a_ec2: -1, active_slot: -1, deployment_phase: -1, a_rps: -1 }, mapping: 0 },
  { name: 'collector samples stop arriving', input: replace('jarihana_deployment_collector_timestamp_seconds', '0+30x7'), expected: { a_health: -1, a_ec2: -1, active_slot: -1 }, mapping: 0 },
  { name: 'missing configuration cannot retain old mapping', input: replace('jarihana_deployment_source_success', '0x10'), expected: { a_health: -1, a_ec2: -1, a_route: -1 }, mapping: 0 },
  { name: 'explicit EC2 stopped differs from missing data', input: replace('jarihana_ec2_state', '0x10'), expected: { a_ec2: 0, b_ec2: -1 } },
  { name: 'missing EC2 state is never inferred stopped', input: base.filter(item => !item.series.startsWith('jarihana_ec2_state{')), expected: { a_ec2: -1 } },
  { name: 'target B does not override real Nginx route A', input: [...base, metric('jarihana_deployment_info', '1x10', 'run_id="123",sha="abc",old="A",target="B",mode="deploy"')], expected: { active_slot: 1, a_route: 1, b_route: -1 } },
  { name: 'terminal completion is closed despite expired lease', input: [...base, metric('jarihana_deployment_heartbeat_timestamp_seconds', '0x10')], expected: { deployment_phase: 6, lease_valid: 0, control_status: 2 } },
  { name: 'rollback completion is closed despite expired lease', input: replace('jarihana_deployment_phase', '8x10'), expected: { deployment_phase: 8, lease_valid: 0, control_status: 2 } },
  { name: 'needs attention takes precedence over expired lease', input: replace('jarihana_deployment_phase', '9x10'), expected: { deployment_phase: 9, lease_valid: 0, control_status: 3 } },
  { name: 'valid active lease means in progress', input: replace('jarihana_deployment_phase', '4x10').map(item => item.series.startsWith('jarihana_deployment_lease_valid{') ? { ...item, values: '1x10' } : item), expected: { deployment_phase: 4, lease_valid: 1, control_status: 1 } },
  { name: 'core marks expired active lease unknown with expired control status', input: replace('jarihana_deployment_phase', '-1x10'), expected: { deployment_phase: -1, lease_valid: 0, control_status: 0 } },
  { name: 'failed traffic poll is unknown not zero', input: replace('jarihana_nginx_traffic_collection_success', '0x10'), expected: { a_rps: -1 } },
  { name: 'old traffic observation is unknown despite active core', input: replace('jarihana_nginx_traffic_observed_at_seconds', '0x10'), expected: { a_rps: -1 } },
  { name: 'successful idle traffic is zero', input: replace('jarihana_nginx_requests_total', '0x10'), expected: { a_rps: 0 } },
  { name: 'unconfigured environment has no invented mapping', input: [], expected: { a_health: -1, a_ec2: -1, active_slot: -1, deployment_phase: -1, control_status: -1, a_rps: -1 }, mapping: 0 },
  { name: 'old instance EC2 cannot attach to new mapping', input: base.map(item => item.series.startsWith('jarihana_ec2_state{') ? { ...item, series: item.series.replace('i-actual-a', 'i-old-a') } : item), expected: { a_ec2: -1 } },
];

const devBase = [
  metric('jarihana_dev_actions_phase', '6x10'),
  metric('jarihana_dev_actions_collection_success', '1x10'),
  metric('jarihana_dev_actions_observed_timestamp_seconds', '0+30x10'),
];
const devCases = [
  { name: 'DEV successful actual Actions run', input: devBase, value: 6 },
  { name: 'DEV failed API cannot retain success', input: devBase.map(item => item.series.startsWith('jarihana_dev_actions_collection_success{') ? {...item,values:'0x10'} : item), value: -1 },
  { name: 'DEV frozen snapshot past 360 seconds', input: devBase.map(item => item.series.startsWith('jarihana_dev_actions_observed_timestamp_seconds{') ? {...item,values:'-100x10'} : item), value: -1 },
  { name: 'DEV future source timestamp is invalid', input: devBase.map(item => item.series.startsWith('jarihana_dev_actions_observed_timestamp_seconds{') ? {...item,values:'1000x10'} : item), value: -1 },
  { name: 'DEV phase samples stop despite other samples continuing', input: devBase.map(item => item.series.startsWith('jarihana_dev_actions_phase{') ? {...item,values:'6x6'} : item), value: -1 },
  { name: 'DEV missing source is unknown', input: [], value: -1 },
];
const yamlQuote = value => "'" + String(value).replaceAll("'", "''") + "'";
const allCases = [...cases, ...devCases.map(test => ({...test, expected:{}, directExpression:devQueries.dev_deploy_status}))];
const yaml = ['fuzzy_compare: true', 'evaluation_interval: 30s', 'tests:', ...allCases.flatMap(test => [
  '  - name: ' + yamlQuote(test.name), '    interval: 30s',
  ...(test.input.length ? ['    input_series:', ...test.input.flatMap(item => ['      - series: ' + yamlQuote(item.series), '        values: ' + yamlQuote(item.values)])] : ['    input_series: []']),
  '    promql_expr_test:',
  ...Object.entries({ ...Object.fromEntries(Object.entries(test.expected).map(([name, value]) => [queries[name], value])), ...(test.directExpression ? {[test.directExpression]:test.value} : {}), ...(test.mapping === undefined ? {} : { [`count(${mappingQuery}) or vector(0)`]: test.mapping }) }).flatMap(([expr, value]) => [
    '      - expr: ' + yamlQuote(render(expr)), '        eval_time: 5m', '        exp_samples:', "          - labels: '{}'", '            value: ' + value,
  ]),
]), ''].join('\n');
const fixture = resolve(evidence, 'promql-fixtures.yml');
writeFileSync(fixture, yaml);
chmodSync(fixture, 0o644);
const dashboard = JSON.parse(readFileSync(new URL('../provisioning/dashboards/json/jarihana-deployment.json', import.meta.url), 'utf8'));
validateDashboard(dashboard);
const dockerArgs = ['run', '--rm', '--entrypoint', 'promtool', '-v', evidence + ':/work:ro', 'prom/prometheus:v3.15.0', 'test', 'rules', '/work/promql-fixtures.yml'];
const result = spawnSync('docker', dockerArgs, { encoding: 'utf8' });
const output = (result.stdout ?? '') + (result.stderr ?? '');
writeFileSync(resolve(evidence, 'promtool.log'), output);
process.stdout.write(output);
writeFileSync(resolve(evidence, 'validation.json'), JSON.stringify({ passed: result.status === 0, scenarios: allCases.map(test => test.name), invocation: ['docker', ...dockerArgs], fixture, log: resolve(evidence, 'promtool.log'), structuralAssertions: ['native V2 dashboard UID retained', 'PROD default environment', 'conditional DEV/PROD rows', 'all native Canvas bindings resolve'] }, null, 2) + '\n');
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`${allCases.length} PromQL scenarios and Canvas structural checks passed.`);
