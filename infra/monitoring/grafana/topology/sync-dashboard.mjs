import { readFileSync, writeFileSync } from 'node:fs';
import { buildPoolNodes } from './pool-nodes.mjs';

// Keep the editable SVG and Flow mappings embedded in the provisioned dashboard.
const dashboardUrl = new URL('../provisioning/dashboards/json/jarihana-canvas.json', import.meta.url);
const dashboard = JSON.parse(readFileSync(dashboardUrl, 'utf8'));
const panel = dashboard.panels.find((panel) => panel.type === 'andrewbmchugh-flow-panel');
if (!panel) throw new Error('Flow panel missing from the topology dashboard');
const target = (name) => {
  const result = panel.targets.find((item) => item.legendFormat === name);
  if (!result) throw new Error(`Topology metric missing: ${name}`);
  return result;
};
const fresh = (selector) => `(${selector} and (time() - timestamp(${selector}) < 150))`;
const database = 'pg_up{job="jarihana-postgres",environment="$environment"}';
const databaseScrape = 'up{job="jarihana-postgres",environment="$environment"}';
const connection = 'probe_success{job="jarihana-database",environment="$environment"}';
const liveness = 'probe_success{job="jarihana-liveness",environment="$environment"}';
target('db_health').expr = `min(${fresh(database)} and on(job,instance,environment,host_id) (${fresh(databaseScrape)} == 1)) or vector(-1)`;
const connectionHealth = {
  ...target('db_health'),
  refId: 'DbConnection',
  legendFormat: 'db_connection_health',
  expr: `min(${fresh(connection)} and on(environment,host_id) (${fresh(liveness)} == 1)) or vector(-1)`,
};
const connectionIndex = panel.targets.findIndex((item) => item.legendFormat === connectionHealth.legendFormat);
if (connectionIndex < 0) panel.targets.push(connectionHealth);
else panel.targets[connectionIndex] = connectionHealth;
const backend = 'up{job="jarihana-backend",environment="$environment"}';
const backendHealthy = `(min(${backend} and (time() - timestamp(${backend}) < 30)) == 1)`;
const jdbcLabels = 'job="jarihana-backend",environment="$environment"';
const jdbcRate = (metric) => {
  const selector = `${metric}{${jdbcLabels}}`;
  return `(rate(${selector}[2m]) and (time() - timestamp(${selector}) < 30))`;
};
target('db_rps').expr = `(sum(${jdbcRate('jdbc_query_seconds_count')}) and on() ${backendHealthy}) or vector(-1)`;
target('db_p95').expr = `((1000 * histogram_quantile(0.95, sum by(le) (${jdbcRate('jdbc_query_seconds_bucket')})) >= 0) and on() ${backendHealthy}) or vector(-1)`;
target('db_flow').expr = `(clamp_min((${target('db_rps').expr}), 0) * ((${connectionHealth.expr}) == bool 1)) or vector(0)`;
panel.targets = panel.targets.filter(item => item.legendFormat !== 'tempo_health');
panel.description = '아이콘은 사용자·앱·DB를 나타냅니다. 움직이는 점은 최근 2분 평균 호출량에 따라 빨라집니다. 0건 또는 확인 불가면 정지합니다. 실제 패킷 재생은 아닙니다. 화면 갱신 5초, 앱 지표 수집 5초, 헬스체크 10초. DB 아이콘은 Alloy의 PostgreSQL 직접 접속 검사, DB 연결선은 백엔드 Actuator의 DB 연결 검사입니다. DB 호출량·p95는 앱의 JDBC 실행 지표입니다.';
dashboard.links = dashboard.links.filter(link => link.title !== '트레이스');
for (const item of dashboard.panels) {
  if (item.id === 8) item.targets = item.targets.filter(query => query.refId !== 'tempo_health');
}
const active = panel.targets.find((target) => target.legendFormat === 'db_active');
if (!active) throw new Error('Pool metric missing: db_active');
const completed = {
  ...active,
  refId: 'POOL_COMPLETED',
  legendFormat: 'db_completed',
  expr: active.expr.replaceAll('hikaricp_connections_active', 'hikaricp_connections_usage_seconds_count'),
};
const completedIndex = panel.targets.findIndex((target) => target.legendFormat === completed.legendFormat);
if (completedIndex < 0) panel.targets.push(completed);
else panel.targets[completedIndex] = completed;
for (const [metric, refId] of [['db_active', 'POOL_PREV_ACTIVE'], ['db_max', 'POOL_PREV_MAX'], ['db_completed', 'POOL_PREV_COMPLETED']]) {
  const current = panel.targets.find((target) => target.legendFormat === metric);
  if (!current) throw new Error(`Pool metric missing: ${metric}`);
  const previous = {
    ...current,
    refId,
    legendFormat: `${metric}_previous`,
    expr: current.expr.replace(/((?:hikaricp_connections_(?:active|max|usage_seconds_count)|up)\{[^}]+\})/g, '$1 offset 5s'),
  };
  const index = panel.targets.findIndex((target) => target.legendFormat === previous.legendFormat);
  if (index < 0) panel.targets.push(previous);
  else panel.targets[index] = previous;
}
const poolNodes = buildPoolNodes();
const svg = readFileSync(new URL('./map.svg', import.meta.url), 'utf8').trimEnd();
if (!svg.includes('<!-- pool-connection-nodes -->')) throw new Error('Pool nodes placeholder missing');
panel.options.svg = svg.replace('<!-- pool-connection-nodes -->', poolNodes.svg);
const panelConfig = JSON.parse(readFileSync(new URL('./panel-config.yaml', import.meta.url), 'utf8'));
panelConfig.cells['pool-node'].bespoke = poolNodes.bespoke;
panel.options.panelConfig = JSON.stringify(panelConfig, null, 2);
writeFileSync(dashboardUrl, `${JSON.stringify(dashboard, null, 2)}\n`);
