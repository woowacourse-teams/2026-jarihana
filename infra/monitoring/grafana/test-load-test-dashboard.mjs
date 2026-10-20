import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dashboard = JSON.parse(readFileSync(new URL('./provisioning/dashboards/json/jarihana-load-test.json', import.meta.url)));
const panel = id => dashboard.panels.find(item => item.id === id);
assert.equal(dashboard.uid, 'jarihana-load-test');
assert.equal(dashboard.panels.length, new Set(dashboard.panels.map(item => item.id)).size);
assert.doesNotMatch(JSON.stringify(dashboard), /jarihana_container_|k6_|\$database|testid|target_rps/);
const environment = dashboard.templating.list.find(item => item.name === 'environment');
assert.equal(environment.type, 'custom');
assert.equal(environment.query, 'dev,prod');
assert.deepEqual(environment.options.map(item => item.value), ['dev', 'prod']);
const host = dashboard.templating.list.find(item => item.name === 'host');
assert.match(host.definition, /jarihana-health.*environment="\$environment"/);
const expand = (expression, env) => expression.replaceAll('$__rate_interval', '2m')
  .replaceAll('$__range', '5m').replaceAll('${host:regex}', '.*').replaceAll('$environment', env);
const rules = [];
for (const id of [16, 17, 18]) {
  assert(panel(id).targets.every(target => target.interval === '1m'), 'DB rate windows must account for the 60-second scrape interval');
}
for (const env of ['dev', 'prod']) {
  for (const item of dashboard.panels) {
    for (const target of item.targets || []) {
      assert.equal(target.datasource.uid, 'prometheus');
      if (target.expr.includes('datname=')) assert.match(target.expr, /datname="jarihana_\$environment"/);
      rules.push({ record: 'load_dashboard_query_' + rules.length, expr: expand(target.expr, env) });
    }
  }
}

// Both environments and a monitoring-only host coexist; All must still isolate the selected app.
const input = [];
for (const [env, idle, available] of [['dev', 15, 25], ['prod', 24, 80], ['monitoring', 3, 1]]) {
  const labels = `job="jarihana-host",host_id="${env}-host"`;
  input.push(
    { series: `node_cpu_seconds_total{${labels},cpu="0",mode="idle"}`, values: `0+${idle}x10` },
    { series: `node_memory_MemAvailable_bytes{${labels}}`, values: `${available}x10` },
    { series: `node_memory_MemTotal_bytes{${labels}}`, values: '100x10' },
    { series: `up{${labels}}`, values: '1x10' },
  );
  if (env !== 'monitoring') {
    input.push(
      { series: `up{job="jarihana-health",host_id="${env}-host",environment="${env}"}`, values: '1x10' },
      { series: `jarihana_pg_activity_lock_waiting_sessions{job="jarihana-postgres",environment="${env}",datname="jarihana_${env}"}`, values: `${env === 'dev' ? 2 : 7}x10` },
      // The same RDS can expose other DBs: they must not contaminate this environment's panel.
      { series: `jarihana_pg_activity_lock_waiting_sessions{job="jarihana-postgres",environment="${env}",datname="unrelated"}`, values: '99x10' },
    );
  }
}
const tests = [];
for (const [env, cpu, memory, locks] of [['dev', 50, 75, 2], ['prod', 20, 20, 7]]) {
  tests.push({
    name: env + ' isolates CPU, memory and RDS database', interval: '30s', input_series: input,
    promql_expr_test: [
      { expr: expand(panel(2).targets[0].expr, env), eval_time: '5m', exp_samples: [{ labels: `{host_id="${env}-host"}`, value: cpu }] },
      { expr: expand(panel(3).targets[0].expr, env), eval_time: '5m', exp_samples: [{ labels: `{host_id="${env}-host",job="jarihana-host"}`, value: memory }] },
      { expr: expand(panel(14).targets[0].expr, env), eval_time: '5m', exp_samples: [{ labels: `jarihana_pg_activity_lock_waiting_sessions{environment="${env}",datname="jarihana_${env}",job="jarihana-postgres"}`, value: locks }] },
    ],
  });
}
tests.push({
  name: 'missing host collection stays no data', interval: '30s',
  input_series: input.filter(item => !item.series.startsWith('up{job="jarihana-host"')),
  promql_expr_test: [2, 3].map(id => ({ expr: expand(panel(id).targets[0].expr, 'dev'), eval_time: '5m', exp_samples: [] })),
});
for (const [operation, document] of [['check', { groups: [{ name: 'load_dashboard', rules }] }], ['test', { rule_files: [], fuzzy_compare: true, tests }]]) {
  const args = operation === 'check' ? ['check', 'rules', '/dev/stdin'] : ['test', 'rules', '/dev/stdin'];
  const result = spawnSync('docker', ['run', '--rm', '-i', '--entrypoint', 'promtool', 'prom/prometheus:v3.15.0', ...args], {
    input: JSON.stringify(document), encoding: 'utf8', timeout: 60_000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, 'promtool ' + operation + ' must pass');
}
console.log(`PASS: ${rules.length} query checks; dev/prod host and DB isolation; missing data remains missing`);
