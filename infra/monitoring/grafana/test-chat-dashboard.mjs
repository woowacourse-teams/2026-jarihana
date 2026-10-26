import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dashboard = JSON.parse(readFileSync(new URL('./provisioning/dashboards/json/jarihana-chat.json', import.meta.url)));
const panel = id => dashboard.panels.find(item => item.id === id);
const expand = (expr, env = 'dev', instance = '.*') => expr
  .replaceAll('$environment', env).replaceAll('${instance:regex}', instance)
  .replaceAll('$__rate_interval', '2m').replaceAll('$__range', '2m');
const expression = (id, env, instance) => expand(panel(id).targets[0].expr, env, instance);
assert.equal(dashboard.uid, 'jarihana-chat');
assert.equal(dashboard.refresh, '30s');
assert.equal(dashboard.panels.length, new Set(dashboard.panels.map(item => item.id)).size);
assert.deepEqual(dashboard.templating.list.find(v => v.name === 'environment').options.map(o => o.value), ['dev', 'prod']);
assert.match(dashboard.templating.list.find(v => v.name === 'instance').definition, /environment="\$environment"/);
assert.doesNotMatch(JSON.stringify(dashboard), /chat-local|localhost|127\.0\.0\.1|or vector\(0\)/);
const rules = [];
for (const item of dashboard.panels) {
  assert.equal(item.fieldConfig.defaults.noValue, '수집 없음');
  for (const target of item.targets) {
    assert.equal(target.datasource.uid, 'prometheus');
    assert.match(target.expr, /job="jarihana-backend"/);
    assert.match(target.expr, /environment="\$environment"/);
    assert.match(target.expr, /instance=~"\$\{instance:regex\}"/);
    for (const env of ['dev', 'prod']) {
      rules.push({ record: `chat_dashboard_query_${rules.length}`, expr: expand(target.expr, env) });
    }
  }
}

const labels = (env, instance) => `job="jarihana-backend",environment="${env}",instance="${instance}"`;
const input = [];
for (const [env, instance, sessions, listener, count, duration] of [
  ['dev', 'dev-a', 2, 1, 2, 0.5], ['dev', 'dev-b', 3, 0, 3, 0.75],
  ['prod', 'prod-a', 90, 1, 100, 50],
]) {
  const tags = labels(env, instance);
  input.push(
    { series: `up{${tags}}`, values: '1x12' },
    { series: `chat_listener_connected{${tags}}`, values: `${listener}x12` },
    { series: `chat_socket_sessions{${tags}}`, values: `${sessions}x12` },
    { series: `chat_message_write_seconds_count{${tags},outcome="committed"}`, values: `0+${count}x12` },
    { series: `chat_message_write_seconds_sum{${tags},outcome="committed"}`, values: `0+${duration}x12` },
  );
}
const sample = (expr, value, labels = '{}') => ({ expr, eval_time: '2m', exp_samples: [{ labels, value }] });
const tests = [{
  name: 'environment and instance filters isolate data and expose partial listener failure',
  interval: '10s', input_series: input,
  promql_expr_test: [
    sample(`count(${expression(1)})`, 2),
    sample(`min(${expression(2)})`, 0),
    sample(`sum(${expression(3)})`, 5),
    sample(`sum(${expression(3, 'prod')})`, 90),
    sample(`sum(${expression(3, 'dev', 'dev-a')})`, 2),
    sample(expression(4), 60, '{outcome="committed"}'),
    sample(expression(5), 0.5, '{outcome="committed"}'),
    sample(expression(6), 0.25, '{outcome="committed"}'),
  ],
}, {
  name: 'missing collection never becomes a healthy zero', interval: '10s', input_series: [],
  promql_expr_test: dashboard.panels.flatMap(p => p.targets.map(t => ({ expr: expand(t.expr), eval_time: '2m', exp_samples: [] }))),
}, {
  name: 'failed scrape hides old listener and session values', interval: '10s',
  input_series: input.filter(s => s.series.includes('instance="dev-a"')).map(s => s.series.startsWith('up{') ? { ...s, values: '0x12' } : s),
  promql_expr_test: [sample(`min(${expression(1)})`, 0), sample(expression(4), 24, '{outcome="committed"}'), ...[2, 3, 6].map(id => ({ expr: expression(id), eval_time: '2m', exp_samples: [] }))],
}, {
  name: 'remote write silence expires previously healthy values', interval: '10s', input_series: input,
  promql_expr_test: [1, 2, 3].map(id => ({ expr: expression(id), eval_time: '4m', exp_samples: [] })),
}, {
  name: 'idle transaction timer has no average', interval: '10s',
  input_series: input.map(s => s.series.includes('chat_message_write') ? { ...s, values: '0x12' } : s),
  promql_expr_test: [{ expr: expression(6), eval_time: '2m', exp_samples: [] }],
}];
for (const [operation, document] of [
  ['check', { groups: [{ name: 'chat_dashboard', rules }] }],
  ['test', { rule_files: [], fuzzy_compare: true, tests }],
]) {
  const result = spawnSync('docker', ['run', '--rm', '-i', '--entrypoint', 'promtool', 'prom/prometheus:v3.15.0', operation, 'rules', '/dev/stdin'], {
    input: JSON.stringify(document), encoding: 'utf8', timeout: 60_000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, `promtool ${operation} must pass`);
}
console.log(`PASS: ${rules.length} query checks; environment/instance isolation, partial failure, stale collection and idle timer`);
