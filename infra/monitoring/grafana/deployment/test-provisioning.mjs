import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { output, buildDashboard } from './build-dashboard.mjs';

const image = 'grafana/grafana:13.2.3';
const name = `jarihana-dashboard-check-${randomUUID()}`;
const provider = fileURLToPath(new URL('../provisioning/dashboards/jarihana.yaml', import.meta.url));
function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `docker exited ${result.status}`);
  return result.stdout.trim();
}

let started = false;
try {
  docker('run', '--detach', '--pull=never', '--name', name,
    '-p', '127.0.0.1::3000',
    '-e', 'GF_AUTH_ANONYMOUS_ENABLED=true', '-e', 'GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer',
    '-e', `GF_SECURITY_ADMIN_PASSWORD=${randomUUID()}`,
    '-e', 'GF_ANALYTICS_REPORTING_ENABLED=false', '-e', 'GF_ANALYTICS_CHECK_FOR_UPDATES=false',
    '-e', 'GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false',
    '-v', `${provider}:/etc/grafana/provisioning/dashboards/jarihana.yaml:ro`,
    '-v', `${fileURLToPath(output)}:/etc/grafana/provisioning/dashboards/json/jarihana-deployment.json:ro`, image);
  started = true;
  const address = docker('port', name, '3000/tcp');
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const base = `http://${address}`;
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error;
    }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(ready, 'Isolated Grafana did not become ready');
  const response = await fetch(`${base}/apis/dashboard.grafana.app/v2/namespaces/default/dashboards/jarihana-deployment`, { signal: AbortSignal.timeout(10000) });
  const body = await response.text();
  assert.equal(response.status, 200, body.slice(0, 200));
  const resource = JSON.parse(body);
  const expected = buildDashboard();
  assert.equal(resource.metadata.name, expected.metadata.name);
  assert.equal(resource.spec.layout.kind, 'RowsLayout');
  assert.equal(resource.spec.variables[0].spec.current.value, 'prod');
  assert.equal(Object.keys(resource.spec.elements).length, 24);
  for (const [key, panel] of Object.entries(expected.spec.elements)) {
    assert.deepEqual(resource.spec.elements[key].spec.vizConfig, panel.spec.vizConfig, `${key}: visual config changed during provisioning`);
    assert.deepEqual(resource.spec.elements[key].spec.data, panel.spec.data, `${key}: query changed during provisioning`);
  }
  console.log('PASS Grafana 13.2.3 V2 file provisioning: 24 panels, queries, Canvas geometry and PROD default');
} catch (error) {
  if (started) process.stderr.write(docker('logs', name));
  throw error;
} finally {
  if (started) docker('rm', '--force', name);
}
