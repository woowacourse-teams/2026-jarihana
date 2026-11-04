import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const captured = spawnSync('bash', ['-c', `
  set -euo pipefail
  source "$1/infra/blue-green-deploy/scripts/actions/coordinator.sh"
  CONFIG=$(cat "$1/infra/blue-green-deploy/controller/full-coordinator.example.json")
  ENVIRONMENT=dev
  bg_scalar() {
    printf '%s\\n' "$1" >&2
    case "$1" in
      *status=*) echo 0;;
      *seconds_count*) echo 120;;
      *seconds_sum*) echo 12;;
      *) echo 1;;
    esac
  }
  bg_metrics A
`, 'http-metrics-test', root], { encoding: 'utf8' });
if (captured.error) throw captured.error;
assert.equal(captured.status, 0, captured.stderr);
const queries = captured.stderr.trim().split('\n');
assert.equal(queries.length, 5, 'capture the five queries executed by bg_metrics');
const [requests, errors, duration] = queries.slice(2);

const series = (metric, values, tags = {}) => ({
  series: `${metric}{${Object.entries({
    job: 'jarihana-backend', environment: 'dev', host_id: 'dev-a',
    uri: '/groups', status: '200', ...tags,
  }).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(',')}}`,
  values,
});
const traffic = (countStep, timeStep, tags = {}) => [
  series('http_server_requests_seconds_count', `0+${countStep}x12`, tags),
  series('http_server_requests_seconds_sum', `0+${timeStep}x12`, tags),
];
const legacyHttp = traffic(10, 1);
const legacySse = traffic(1, 120, { uri: '/sparrings/{topicId}/events' });
const labelledHttp = traffic(10, 1, { response_type: 'http' });
const labelledSse = traffic(1, 120, { uri: '/notifications/live', response_type: 'sse' });
const cases = [
  ['legacy 120-second SSE does not raise HTTP latency', [...legacyHttp, ...legacySse], [120, 0, 12]],
  ['labelled SSE on any route is excluded', [...labelledHttp, ...labelledSse], [120, 0, 12]],
  ['mixed old and new metrics are counted once', [
    ...legacyHttp, ...legacySse,
    ...traffic(10, 1, { response_type: 'http', instance: 'new' }), ...labelledSse,
  ], [240, 0, 24]],
  ['JSON rejection on an SSE route remains an HTTP error', [
    ...labelledHttp,
    ...traffic(1, 1, { uri: '/sparrings/{topicId}/events', response_type: 'http', status: '503' }),
  ], [132, 12, 24]],
  ['slow HTTP requests remain in the deployment check', traffic(10, 20, { response_type: 'http' }), [120, 0, 240]],
  ['HTTP failures remain in numerator and denominator', [
    ...labelledHttp, ...traffic(2, 2, { response_type: 'http', status: '500' }),
  ], [144, 24, 36]],
  ['SSE label wins over an ordinary route name', [
    ...legacyHttp, ...traffic(1, 120, { response_type: 'sse' }),
  ], [120, 0, 12]],
  ['SSE-only traffic preserves initialized idle HTTP metrics', [
    ...traffic(0, 0, { response_type: 'http' }), ...labelledSse, ...legacySse,
  ], [0, 0, 0]],
  ['missing HTTP metrics remain unknown', [...labelledSse], [null, 0, null]],
  ['other environments and hosts cannot affect the candidate', [
    ...legacyHttp, ...traffic(10, 1200, { host_id: 'dev-b', status: '500' }),
    ...traffic(10, 1200, { environment: 'prod', status: '500' }),
  ], [120, 0, 12]],
];
const document = {
  evaluation_interval: '10s', fuzzy_compare: true,
  tests: cases.map(([name, input_series, expected]) => ({
    name, interval: '10s', input_series,
    promql_expr_test: [requests, errors, duration].map((expr, index) => ({
      expr, eval_time: '2m',
      exp_samples: expected[index] === null ? [] : [{ labels: '{}', value: expected[index] }],
    })),
  })),
};
const result = spawnSync('docker', [
  'run', '--rm', '-i', '--entrypoint', 'promtool', 'prom/prometheus:v3.15.0',
  'test', 'rules', '/dev/stdin',
], { input: JSON.stringify(document), encoding: 'utf8', timeout: 60_000 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
assert.equal(result.status, 0, 'deployment HTTP/SSE PromQL regression tests must pass');
console.log(`PASS: ${cases.length} deployment HTTP/SSE scenarios using the queries executed by bg_metrics`);
