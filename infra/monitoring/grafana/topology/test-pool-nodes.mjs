import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { buildPoolNodes } from './pool-nodes.mjs';

// Pass the Flow plugin's Math.js browser bundle; no repository dependency is added.
if (!process.argv[2]) throw new Error('Usage: node test-pool-nodes.mjs /path/to/mathjs.cjs [preview-directory]');
const math = createRequire(import.meta.url)(resolve(process.argv[2]));
const pool = buildPoolNodes();
assert.equal([...pool.svg.matchAll(/data-pool-replay="false"/g)].length, 100, 'Flow requires driven custom attributes to exist in the original SVG');
assert.equal([...pool.svg.matchAll(/class="pool-home"/g)].length, 100, 'every connection has a stationary home');
assert.equal([...pool.svg.matchAll(/class="pool-edge"/g)].length, 100, 'every connection has a dedicated edge');
assert.equal([...pool.svg.matchAll(/class="pool-slot"/g)].length, 100, 'each visual slot is a native SVG link');
assert.equal([...pool.svg.matchAll(/class="pool-hit pool-edge-hit"/g)].length, 100, 'each edge has a wide transparent hit path');
assert.equal([...pool.svg.matchAll(/<use\b/g)].length, 0, 'hit targets do not depend on SVG use elements surviving sanitization');
assert.match(pool.svg, /<rect width="488" height="96"/);
assert.match(pool.svg, /집계 표현 · 개별 ID 아님 \| 클릭 \/ Enter: 풀 상세/);
function calculate(active, idle, max, previousActive = active, previousMax = max, completed = null, previousCompleted = null, elementName = 'circle') {
  const scope = {
    data: { db_active: active, db_idle: idle, db_max: max, db_active_previous: previousActive, db_max_previous: previousMax, db_completed: completed, db_completed_previous: previousCompleted },
    utils: {
      variablesReplace: (value) => value
        .replaceAll('${environment}', 'dev')
        .replaceAll('${__from}', '111')
        .replaceAll('${__to}', '222'),
    },
  };
  for (const formula of pool.bespoke.formulas) math.evaluate(formula, scope);
  return pool.bespoke.drives.filter(drive => drive.elementName === elementName).map((drive) => Object.fromEntries(
    Object.entries(drive.attribsSet).map(([key, formula]) => [key, String(math.evaluate(formula, scope))]),
  ));
}
const positions = (node) => [...node.style.matchAll(/--pool-(?:from|to)-x:([\d.-]+)px/g)].map((match) => Number(match[1]));
const visible = (nodes) => nodes.filter((node) => node.visibility === 'visible');
const visualEdges = (nodes) => nodes.filter((_, index) => index % 2 === 0);
const hitEdges = (nodes) => nodes.filter((_, index) => index % 2 === 1);
const fixtureInputs = {
  idle: [0, 10, 10, 0, 10, null, null],
  borrow: [3, 7, 10, 0, 10, null, null],
  held: [3, 7, 10, 3, 10, null, null],
  oneHeld: [1, 9, 10, 3, 10, 22, 20],
  returned: [0, 10, 10, 3, 10, null, null],
  unknown: [-1, -1, -1, 3, 10, null, null],
  unknownOccupancy: [-1, -1, 10, -1, 10, null, null],
  uncreated: [0, 0, 10, 0, 10, null, null],
  shortUse: [0, 10, 10, 0, 10, 21, 20],
  burst: [0, 10, 10, 0, 10, 120, 20],
};
const fixtures = Object.fromEntries(Object.entries(fixtureInputs).map(([name, args]) => [name, calculate(...args)]));
assert.equal(visible(fixtures.idle).length, 10);
assert.equal(visible(fixtures.borrow).filter((node) => node['data-pool-state'] === 'active').length, 3);
const heldAnchors = calculate(...fixtureInputs.held, 'a');
assert.equal(visible(heldAnchors).length, 10, 'native links are keyboard reachable for every visible slot');
assert.equal(heldAnchors[0].href, '/d/jarihana-canvas?viewPanel=4&var-environment=dev&from=111&to=222');
assert.equal(heldAnchors[0].tabindex, '0');
assert.equal(heldAnchors[0]['data-state'], 'active');
assert.equal(heldAnchors[3]['data-state'], 'idle');
assert.match(heldAnchors[0]['aria-label'], /시각 슬롯 1/);
assert.match(heldAnchors[0]['aria-label'], /집계 보기이며 물리 커넥션 ID가 아닙니다/);
assert.equal(calculate(0, 0, 10, 0, 10, null, null, 'a')[0]['data-state'], 'uncreated');
assert.equal(calculate(-1, -1, 10, -1, 10, null, null, 'a')[0]['data-state'], 'unknown');
assert.equal(calculate(-1, -1, -1, -1, -1, null, null, 'a')[0].tabindex, '-1');
for (let index = 0; index < 3; index++) {
  const [departFrom, departTo] = positions(fixtures.borrow[index]);
  assert.equal(departFrom, 0);
  assert.ok(departTo > 0, 'borrowed connections move toward DB');
  assert.deepEqual(positions(fixtures.held[index]), [departTo, departTo], 'held connections do not replay');
  assert.deepEqual(positions(fixtures.returned[index]), [departTo, 0], 'returned connections move home');
}
assert.deepEqual(positions(fixtures.borrow[3]), [0, 0], 'idle connections stay home');
assert.equal(visible(fixtures.unknown).length, 0, 'missing metrics cannot fabricate a return');
for (const node of calculate(3, 7, 10, -1).slice(0, 3)) {
  const [from, to] = positions(node);
  assert.equal(from, to, 'missing previous metrics must not fabricate a checkout');
}
for (const node of calculate(3, 17, 20, 0, 10).slice(0, 3)) {
  const [from, to] = positions(node);
  assert.equal(from, to, 'capacity changes must not fabricate a checkout');
}
assert.deepEqual(positions(calculate(0, 0, 10, 3)[0]), [0, 0], 'closed connections are not returned connections');
assert.equal(visible(calculate(0, 125, 125)).length, 100, 'large pools keep the documented display bound');
const replayed = (nodes) => visible(nodes).filter((node) => node['data-pool-replay'] === 'true');
assert.equal(replayed(fixtures.shortUse).length, 1, 'a completed use replays even when both active samples are zero');
assert.equal(fixtures.shortUse[0]['data-pool-state'], 'idle', 'replay never changes the current occupancy');
assert.match(fixtures.shortUse[0].style, /animation:pool-replay /);
assert.equal(replayed(fixtures.burst).length, 10, 'burst playback is bounded by idle connections');
assert.equal(replayed(calculate(0, 10, 10, 0, 10, 21, 21)).length, 0, 'no new completed use means no playback');
assert.equal(replayed(calculate(0, 10, 10, 0, 10, 1, 21)).length, 0, 'counter resets cannot fabricate activity');
assert.equal(replayed(calculate(0, 10, 10, 0, 10, 21, null)).length, 0, 'missing historical counters cannot fabricate activity');
assert.equal(replayed(calculate(-1, -1, 10, 0, 10, 21, 20)).length, 0, 'missing occupancy stops playback');
assert.equal(replayed(calculate(0, 20, 20, 0, 10, 21, 20)).length, 0, 'capacity changes stop playback');
assert.equal(replayed(calculate(10, 0, 10, 10, 10, 21, 20)).length, 0, 'occupied connections stay at the DB');
assert.equal(replayed(calculate(0, 10, 10, 3, 10, 23, 20)).length, 0, 'observed returns are not also replayed');
assert.equal(replayed(calculate(3, 7, 10, 3, 10, 25, 20)).length, 5, 'playback uses only idle slots');
const staggered = calculate(0, 10, 10, 0, 10, 25, 20);
assert.deepEqual(staggered.flatMap((node, index) => node['data-pool-replay'] === 'true' ? [index + 1] : []), [1, 2, 3, 6, 7], 'playback interleaves the upper and lower slots');
const delay = node => Number(node.style.match(/linear ([\d.]+)s both/)[1]);
assert.equal(new Set(replayed(staggered).map(delay)).size, 5, 'each playback dot departs at a different time');
assert.ok(Math.max(...replayed(fixtures.burst).map(delay)) <= 1.2, 'stagger fits between 5-second dashboard refreshes');
for (const node of visible(fixtures.held).filter(node => node['data-pool-state'] === 'active')) {
  const x = Number(node.cx) + positions(node)[1];
  assert.equal(x, 1066, 'borrowed connections stop at the DB entrance');
  assert.ok(x + 3.5 <= 1070, 'connection dots stay outside the DB silhouette');
}
assert.ok(pool.bespoke.drives.filter(drive => drive.elementName === 'ellipse').every(drive => !('style' in drive.attribsSet)), 'home slots never animate');
assert.match(pool.svg, /@keyframes pool-borrow/);
assert.match(pool.svg, /@keyframes pool-return/);
assert.match(pool.svg, /var\(--pool-trip-y\)/, 'round trips move vertically as well as horizontally');
const heldPathDrives = calculate(...fixtureInputs.held, 'path');
const heldEdges = visible(visualEdges(heldPathDrives));
const heldHitEdges = visible(hitEdges(heldPathDrives));
assert.equal(heldEdges.length, 10);
assert.equal(heldHitEdges.length, 10, 'transparent hit paths share visual edge visibility');
assert.deepEqual(heldHitEdges.map(edge => edge.d), heldEdges.map(edge => edge.d), 'hit paths follow the same curve as visible edges');
assert.equal(new Set(heldEdges.map(edge => edge.d)).size, 10, 'connections have distinct paths');
for (let index = 0; index < heldEdges.length; index++) {
  const path = heldEdges[index].d.match(/-?[\d.]+/g).map(Number);
  const node = fixtures.held[index];
  assert.deepEqual(path.slice(0, 2), [Number(node.cx), Number(node.cy)], 'edge begins at its own home slot');
  const tripX = Number(node.style.match(/--pool-trip-x:([\d.-]+)px/)[1]);
  const tripY = Number(node.style.match(/--pool-trip-y:([\d.-]+)px/)[1]);
  assert.deepEqual(path.slice(-2), [Number(node.cx) + tripX, Number(node.cy) + tripY], 'dot reaches its own edge endpoint');
}
assert.equal(heldEdges.filter(edge => edge.stroke === '#4dd7ba').length, 3);
assert.equal(visible(visualEdges(calculate(...fixtureInputs.oneHeld, 'path'))).filter(edge => edge.stroke === '#4dd7ba').length, 1);
assert.deepEqual(positions(fixtures.oneHeld[0]), [429, 429], '3 to 1 retains the remaining connection at DB');
assert.deepEqual(positions(fixtures.oneHeld[1]), [429, 0]);
assert.deepEqual(positions(fixtures.oneHeld[2]), [429, 0]);
assert.ok(visible(fixtures.held).every(node => Math.abs(Number(node.cx) - 5.2 - 631) < 1), 'home rings touch the backend right boundary');
assert.ok(heldEdges.every(edge => edge.d.includes('850 160 M1038 160 C1050 160')), 'slot curves leave the shared trunk clear and split only before the DB');
const borrowFrames = pool.svg.match(/@keyframes pool-borrow \{(.*?)\}\}/)[1];
assert.match(borrowFrames, /40% \{transform:translate\(213\.000px,calc\(var\(--pool-merge-y\) \* 1\.00000 \+ var\(--pool-trip-y\) \* 0\.00000\)\)/, 'motion reaches the trunk start at its centerline');
assert.match(borrowFrames, /90% \{transform:translate\(401\.000px,calc\(var\(--pool-merge-y\) \* 1\.00000 \+ var\(--pool-trip-y\) \* 0\.00000\)\)/, 'motion crosses the full shared trunk on its centerline');
assert.match(borrowFrames, /100% \{transform:translate\(429\.000px,calc\(var\(--pool-merge-y\) \* 0\.00000 \+ var\(--pool-trip-y\) \* 1\.00000\)\)/, 'motion ends at its own DB-side slot');
assert.equal(replayed(fixtures.oneHeld).length, 0, 'the two observed returns are not replayed again');
assert.equal(visible(visualEdges(calculate(0, 0, 10, 0, 10, null, null, 'path'))).filter(edge => edge['stroke-dasharray'] === '3 5').length, 10);
assert.equal(visible(calculate(-1, -1, -1, -1, -1, null, null, 'path')).length, 0);
console.log('PASS: pool state/geometry, motion/replay, missing data, capacity bound, native links, hidden-slot focus and environment/time substitution');

// Optional isolated UI fixture exercises the real SVG/CSS without touching Grafana data.
if (process.argv[3]) {
  const directory = resolve(process.argv[3]);
  const svg = readFileSync(new URL('./map.svg', import.meta.url), 'utf8');
  const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const scenarios = Object.fromEntries(Object.entries(fixtureInputs).map(([name, args]) => {
    const driven = Object.fromEntries(['a', 'path', 'ellipse', 'circle'].map(tag => [tag, calculate(...args, tag)]));
    const positions = { a: 0, path: 0, ellipse: 0, circle: 0 };
    // Keep the production anchors, hit targets and tooltips in the fixture.
    const elements = pool.svg.replace(/<(a|path|ellipse|circle)\b([^>]*?)(\/?)>/g, (_, tag, attributes, closing) => {
      for (const [key, value] of Object.entries(driven[tag][positions[tag]++])) {
        attributes = attributes.replace(new RegExp(`\\s${key}="[^"]*"`, 'g'), '');
        attributes += ` ${key}="${escape(value)}"`;
      }
      return `<${tag}${attributes}${closing}>`;
    });
    return [name, svg.replace('<!-- pool-connection-nodes -->', elements)];
  }));
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'index.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><title>커넥션 이동 검증</title><style>body{background:#101620;color:#e6edf7;font-family:sans-serif;margin:24px}button{padding:10px 18px;margin:8px;background:#24354c;color:white;border:1px solid #536880;border-radius:6px}svg{width:100%;height:auto}#fixture-label{color:#f6ba6a}</style><h2>커넥션 이동 검증 · 합성 지표</h2><p>운영 데이터가 아닌 검증용 화면입니다. 대여(사용 3·유휴 7) → 유지 → 반납(사용 0·유휴 10)</p><nav>${Object.keys(fixtures).map(name => '<button data-state="' + name + '">' + name + '</button>').join('')}</nav><p id="fixture-label"></p><div id="preview"></div><script>const scenarios=${JSON.stringify(scenarios).replaceAll('<', '\\u003c')};function show(name){document.getElementById('preview').innerHTML=scenarios[name];document.getElementById('fixture-label').textContent=name;document.getElementById('cell-pool-status').textContent='';}document.querySelectorAll('button').forEach(button=>button.onclick=()=>show(button.dataset.state));show('idle');</script></html>`);
  console.log('UI fixture: ' + join(directory, 'index.html'));
}
