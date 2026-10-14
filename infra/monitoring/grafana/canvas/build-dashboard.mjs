import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dashboardDir = new URL('../provisioning/dashboards/json/', import.meta.url);
const flow = JSON.parse(readFileSync(new URL('jarihana-canvas.json', dashboardDir), 'utf8'));
const targets = structuredClone(flow.panels.find(panel => panel.type === 'andrewbmchugh-flow-panel').targets)
  .filter(item => !item.refId.startsWith('POOL_'));
const target = name => {
  const result = targets.find(item => item.legendFormat === name);
  if (!result) throw new Error('Missing topology metric: ' + name);
  return result;
};
const fresh = selector => `(${selector} and (time() - timestamp(${selector}) < 150))`;
const liveness = 'probe_success{job="jarihana-liveness",environment="$environment"}';
targets.splice(targets.findIndex(item => item.legendFormat === 'db_connection_health'), 0,
  { ...structuredClone(target('app_health')), refId: 'Liveness', legendFormat: 'app_liveness', expr: `min(${fresh(liveness)}) or vector(-1)` },
);
for (const name of ['http_flow', 'db_flow']) {
  const rate = target(name).expr;
  target(name).expr = '(clamp_max(2 + 2 * ln(1 + (' + rate + ')), 9) * ((' + rate + ') > bool 0)) * ${motion}';
}
const C = {
  bg: '#0b111b', host: '#111e30', app: '#14243a', pool: '#1a2940',
  line: '#2e425c', text: '#e8effa', muted: '#a6b6cc',
  blue: '#7abaff', purple: '#c0a4ff', good: '#55d8b0',
  warning: '#ffc06e', bad: '#ff7586', unknown: '#8593a8',
};
const elements = [];
const overview = '/d/jarihana-overview?var-environment=${environment}&from=${__from}&to=${__to}';
const link = (title, url = overview) => [{ title, url, targetBlank: false, oneClick: true }];
function element(name, type, x, y, w, h, config, extra = {}) {
  const item = {
    name, type, placement: { left: x, top: y, width: w, height: h, rotation: 0 },
    constraint: { horizontal: 'left', vertical: 'top' },
    background: { color: { fixed: 'transparent' } },
    border: { width: 0, radius: 12, color: { fixed: C.line } },
    config, ...extra,
  };
  elements.push(item);
  return item;
}
function shape(name, x, y, w, h, color, radius = 12) {
  return element(name, 'rectangle', x, y, w, h,
    { text: { mode: 'fixed', fixed: '' } },
    { background: { color: { fixed: color } }, border: { width: 0, radius, color: { fixed: C.line } } });
}
function text(name, value, x, y, w, h = 28, size = 18, color = C.muted, align = 'left', links) {
  return element(name, 'rectangle', x, y, w, h,
    { text: { mode: 'fixed', fixed: value }, color: { fixed: color }, size: Math.max(18, size), align, valign: 'middle' },
    links ? { links } : {});
}
function metric(name, field, x, y, w, h = 42, size = 32, align = 'left', links) {
  return element(name, 'metric-value', x, y, w, h,
    { text: { mode: 'field', field, fixed: '' }, color: { field, fixed: C.text }, size: Math.max(18, size), align, valign: 'middle' },
    links ? { links } : {});
}
function icon(name, path, x, y, w, h, color, links, state) {
  return element(name, 'icon', x, y, w, h,
    { path: { mode: 'fixed', fixed: 'img/icons/unicons/' + path + '.svg' }, fill: state ? { field: state, fixed: color } : { fixed: color } },
    links ? { links } : {});
}
function connect(from, to, health, activity, dashed = false) {
  from.connections = [
    { source: { x: 1, y: 0 }, target: { x: -1, y: 0 }, targetName: to.name, path: 'straight',
      color: { field: health, fixed: C.unknown }, size: { fixed: 1.5, min: 0, max: 2 },
      direction: { mode: 'fixed', fixed: 'forward' }, lineStyle: { style: dashed ? 'dashed' : 'solid', animate: false } },
    { source: { x: 1, y: 0 }, target: { x: -1, y: 0 }, targetName: to.name, path: 'straight',
      color: { field: health, fixed: C.unknown }, size: { field: activity, fixed: 0, min: 0, max: 9 },
      direction: { mode: 'field', field: activity, fixed: 'none' }, lineStyle: { style: 'dotted', animate: true } },
  ];
}
shape('artboard', 0, 0, 1480, 820, C.bg, 0);
text('eyebrow', 'JARIHANA   /   SERVICE OPERATIONS', 40, 26, 800, 24, 15, C.blue);
text('heading', '서비스 요청과 자원 상태', 40, 60, 980, 44, 30, C.text);
text('refresh-note', '5초 갱신 · 헬스체크 60초', 1100, 34, 340, 28, 17, C.muted, 'right');
text('scope-note', '호출량·지연시간: 최근 2분', 1080, 69, 360, 28, 17, C.muted, 'right');

// The tinted host area contains the application and its JDBC pool; RDS stays outside.
shape('host-boundary', 512, 154, 580, 518, C.host, 22);
text('host-label', '백엔드 호스트', 542, 174, 248, 28, 20, C.text);
text('host-sub', 'EC2 · 환경 내 호스트 집계', 782, 177, 280, 24, 15, C.muted, 'right');
shape('app-boundary', 532, 220, 540, 276, C.app, 16);
text('application-label', '애플리케이션', 554, 234, 124, 26, 16, C.blue);
metric('service-health', 'app_health', 682, 234, 118, 26, 16, 'right');
text('pool-label', '앱의 커넥션 풀', 825, 234, 222, 26, 16, C.purple);
shape('pool-surface', 810, 277, 238, 198, C.pool, 14);

const client = icon('client-node', 'browser', 84, 282, 116, 112, C.muted);
const api = icon('api-node', 'server', 558, 282, 112, 112, C.blue, link('백엔드 상세 보기'), 'app_liveness');
const poolAnchor = shape('pool-connection-anchor', 810, 306, 238, 64, 'transparent', 0);
const databaseNode = icon('database-node', 'database', 1290, 282, 110, 112, C.purple, link('DB 연결 상세 보기'), 'db_health');
connect(client, api, 'app_health', 'http_flow');
connect(api, poolAnchor, 'db_connection_health', 'db_flow', true);
connect(poolAnchor, databaseNode, 'db_connection_health', 'db_flow');
text('jdbc-label', 'JDBC', 696, 292, 94, 24, 15, C.muted, 'center');

text('client-title', '사용자', 48, 422, 188, 36, 27, C.text, 'center');
text('client-sub', '브라우저 · 앱', 48, 462, 188, 26, 17, C.muted, 'center');
text('api-title', '자리하나 API', 550, 407, 240, 34, 24, C.text, 'left', link('백엔드 상세 보기'));
text('api-sub', 'Spring Boot', 550, 447, 130, 25, 16, C.muted);
metric('api-health', 'app_liveness', 674, 447, 118, 25, 16, 'right');
text('database-title', 'PostgreSQL', 1244, 422, 196, 36, 26, C.text, 'center');
text('database-sub', 'RDS · 외부 데이터베이스', 1216, 462, 240, 26, 16, C.muted, 'center');
metric('database-health', 'db_health', 1216, 510, 240, 30, 20, 'center');
text('database-health-note', 'Alloy → DB 직접 검사', 1216, 545, 240, 24, 15, C.muted, 'center');
text('database-scope-note', '모니터링 계정 기준', 1216, 580, 240, 24, 15, C.muted, 'center');

text('http-label', 'HTTP 요청', 246, 243, 240, 28, 19, C.blue, 'center');
metric('http-request-rate', 'http_rps', 240, 277, 246, 46, 34, 'center');
text('latency-heading', '응답 시간', 262, 379, 218, 26, 17, C.muted);
text('http-p95-label', 'p95', 262, 423, 92, 24, 17, C.blue);
text('http-p99-label', 'p99', 380, 423, 106, 24, 17, C.purple);
metric('http-p95-value', 'http_p95', 256, 453, 128, 42, 28);
metric('http-p99-value', 'http_p99', 376, 453, 130, 42, 28);
text('http-error-label', '5xx / 초', 262, 522, 118, 28, 17, C.muted);
metric('http-errors', 'http_5xx', 380, 519, 120, 32, 20);
text('http-scope', 'Actuator 요청 제외', 250, 559, 245, 24, 15, C.muted);

text('pool-name', 'HikariCP', 830, 294, 200, 26, 20, C.text);
metric('pool-utilization', 'db_usage', 830, 326, 200, 48, 36);
text('pool-utilization-label', '사용 / 최대 연결 비율', 830, 376, 200, 24, 15, C.muted);
const poolColumns = [
  { name: 'active', label: '사용', field: 'db_active', x: 826 },
  { name: 'idle', label: '유휴', field: 'db_idle', x: 880 },
  { name: 'max', label: '최대', field: 'db_max', x: 934 },
  { name: 'pending', label: '대기', field: 'db_pending', x: 988 },
];
for (const col of poolColumns) {
  text('pool-' + col.name + '-label', col.label, col.x, 413, 52, 20, 14, C.muted, 'center');
  metric('pool-' + col.name + '-value', col.field, col.x, 438, 52, 28, 22, 'center');
}

text('db-rate-label', 'DB 호출', 1104, 243, 158, 28, 19, C.purple, 'center');
metric('db-rate', 'db_rps', 1102, 277, 166, 46, 29, 'center');
text('db-p95-label', 'DB p95', 1104, 379, 160, 26, 17, C.muted, 'center');
metric('db-p95-value', 'db_p95', 1104, 413, 160, 40, 29, 'center');
metric('db-connection-health', 'db_connection_health', 1098, 457, 176, 24, 16, 'center');
text('db-scope-1', '앱의 DB 호출 시간', 1098, 483, 176, 24, 14, C.muted, 'center');
text('db-scope-2', '예약 작업 포함', 1098, 509, 176, 24, 14, C.muted, 'center');

text('cpu-label', 'CPU', 550, 544, 130, 28, 18, C.muted);
text('memory-label', '메모리', 820, 544, 220, 28, 18, C.muted);
metric('cpu-value', 'cpu', 550, 577, 242, 54, 44);
metric('memory-value', 'memory', 820, 577, 242, 54, 44);
text('host-resource-note', '호스트 기준 · 80% 주의 / 90% 긴급', 550, 638, 512, 22, 15, C.muted);

text('collection-label', '앱 지표 수집', 40, 734, 130, 26, 16);
metric('collection-value', 'app_metrics', 174, 734, 150, 26, 16);
const stores = [
  ['Prometheus', 'prometheus_health', 354],
  ['Loki', 'loki_health', 754],
  ['Grafana', 'grafana_health', 1160],
];
for (const [name, field, x] of stores) {
  text(field + '-label', name, x, 734, 130, 26, 16);
  metric(field + '-value', field, x + 134, 734, 132, 26, 16);
}
text('motion-note', '점선: 호출 방향 · 굵기: 호출량 · 0건/장애/확인 불가 시 정지', 40, 784, 860, 22, 15);
text('interaction-note', '노드 클릭 → 상세 분석   |   Ctrl + 휠 → 확대', 900, 784, 540, 22, 15, C.muted, 'right');

const props = (field, options) => ({
  matcher: { id: 'byName', options: field },
  properties: Object.entries({ displayName: field, ...options }).map(([id, value]) => ({ id, value })),
});
const thresholds = (...steps) => ({ mode: 'absolute', steps: [{ value: null, color: C.unknown }, ...steps.map(([value, color]) => ({ value, color }))] });
const unknown = [{ type: 'value', options: { '-1': { text: '—', color: C.unknown } } }];
const overrides = [];
for (const t of targets) {
  const name = t.legendFormat;
  let config = { decimals: 2, unit: 'none', mappings: unknown, thresholds: thresholds([0, C.text]) };
  if (name.endsWith('_health') || name === 'app_metrics' || name === 'app_liveness') {
    config = { decimals: 0, unit: 'none', mappings: [{ type: 'value', options: {
      '-1': { text: '확인 불가', color: C.unknown }, 0: { text: '연결 실패', color: C.bad }, 1: { text: '정상', color: C.good },
    } }], thresholds: thresholds([0, C.bad], [1, C.good]) };
    const labels = {
      app_health: ['서비스 이상', '서비스 정상'],
      app_liveness: ['응답 없음', '응답 중'],
      db_health: ['접속 실패', '접속 정상'],
      db_connection_health: ['앱 연결 실패', '앱 연결 정상'],
    }[name];
    if (labels) {
      config.mappings[0].options[0].text = labels[0];
      config.mappings[0].options[1].text = labels[1];
    }
    if (name === 'db_connection_health') config.mappings[0].options['-1'].text = '앱 연결 미확인';
    if (name === 'app_health') {
      config.mappings[0].options[0].color = C.warning;
      config.thresholds = thresholds([0, C.warning], [1, C.good]);
    }
  } else if (['cpu', 'memory', 'disk', 'db_usage'].includes(name)) {
    config = { ...config, unit: 'percent', decimals: 1, min: 0, max: 100, thresholds: thresholds([0, C.good], [80, C.warning], [90, C.bad]) };
  } else if (name.endsWith('_flow')) {
    config = { ...config, min: 0, max: 9 };
  } else if (['http_p95', 'http_p99', 'http_ms', 'db_p95'].includes(name)) {
    config = { ...config, unit: 'ms', decimals: 1, thresholds: thresholds([0, name === 'http_p99' ? C.purple : C.blue]) };
  } else if (['db_active', 'db_idle', 'db_max', 'db_pending'].includes(name)) {
    config = { ...config, decimals: 0, thresholds: name === 'db_pending' ? thresholds([0, C.good], [1, C.bad]) : thresholds([0, C.text]) };
  } else if (name === 'http_rps' || name === 'http_5xx') {
    config = { ...config, unit: 'reqps', thresholds: name === 'http_5xx' ? thresholds([0, C.good], [0.000001, C.bad]) : thresholds([0, C.text]) };
  } else if (name === 'db_rps') {
    config = { ...config, unit: 'ops' };
  }
  overrides.push(props(name, config));
}
const dashboard = {
  ...structuredClone(flow), id: null, uid: 'jarihana-canvas-native', title: '자리하나 · Canvas 관제도', version: 1,
  description: 'Grafana 기본 Canvas. HTTP 연결의 req/s·p95·p99, 앱의 HikariCP, 백엔드 호스트의 CPU·메모리를 소속에 맞게 배치합니다. 호출량·지연시간·CPU는 최근 2분, 나머지는 최근 유효한 수집값입니다.',
  tags: ['jarihana', 'observability', 'native-canvas'], editable: true,
  links: [{ title: '기존 Flow 보기', type: 'link', url: '/d/jarihana-canvas?var-environment=${environment}&from=${__from}&to=${__to}', targetBlank: false, icon: 'dashboard' }, ...structuredClone(flow.links)],
  templating: { list: [...structuredClone(flow.templating.list), {
    name: 'motion', label: '흐름 표시', type: 'custom', query: '재생 : 1, 정지 : 0',
    current: { text: '재생', value: '1' },
    options: [{ text: '재생', value: '1', selected: true }, { text: '정지', value: '0', selected: false }],
    multi: false, includeAll: false, hide: 0, skipUrlSync: false,
  }] },
  panels: [{
    id: 1, type: 'canvas', title: '서비스 관제도 · $environment', pluginVersion: '13.2.3',
    description: 'API 아이콘은 liveness, 서비스 상태는 DB 포함 종합 health, DB 아이콘은 Alloy의 PostgreSQL 직접 접속 검사입니다. API-풀-DB 연결선은 백엔드 Actuator의 DB 연결 검사로 색을 정하고, JDBC 호출량이 있을 때만 움직입니다. 각 검사는 60초 주기이며 150초 넘게 갱신되지 않으면 확인 불가입니다. DB 호출량·p95는 앱의 JDBC 실행 지표를 사용합니다. CPU는 2분 평균, 메모리는 최근 호스트 수집값입니다. 연결 풀은 앱 소유입니다. 점선 속도는 고정이며 호출량은 숫자와 굵기로 표시합니다.',
    gridPos: { x: 0, y: 0, w: 24, h: 23 }, datasource: { type: 'prometheus', uid: 'prometheus' },
    targets, fieldConfig: { defaults: { color: { mode: 'thresholds' }, noValue: '—', mappings: unknown, thresholds: thresholds() }, overrides },
    options: { inlineEditing: false, showAdvancedTypes: false, panZoom: true, zoomToContent: true, tooltip: { mode: 'single' },
      root: { name: 'Root', type: 'frame', background: { color: { fixed: 'transparent' } }, elements } },
  }],
};
writeFileSync(new URL('jarihana-canvas-native.json', dashboardDir), JSON.stringify(dashboard, null, 2) + '\n');
console.log('Built ' + fileURLToPath(new URL('jarihana-canvas-native.json', dashboardDir)));
