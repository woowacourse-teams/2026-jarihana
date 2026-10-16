import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { syncStarredQueries } from './sync-starred-queries.mjs';

const presets = JSON.parse(await readFile(new URL('./queries.json', import.meta.url), 'utf8'));
const password = 'test-only-password';
const authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;

async function fixture(t, { history = [], override } = {}) {
  const calls = [];
  let nextId = 1000;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, path: url.pathname, search: url.searchParams, body, authorization: req.headers.authorization });
    const send = (value, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (override?.({ req, res, url, body, send })) return;
    if (req.headers.authorization !== authorization) return send({ message: 'Unauthorized' }, 401);
    if (req.method === 'GET') {
      const page = Number(url.searchParams.get('page'));
      const perPage = Number(url.searchParams.get('limit'));
      return send({ result: { page, perPage, totalCount: history.length, queryHistory: history.length === 0 ? null : history.slice((page - 1) * perPage, page * perPage) } });
    }
    if (req.method === 'POST' && url.pathname === '/api/query-history') {
      const entry = { uid: String(nextId++), comment: '', starred: false, ...body };
      history.push(entry);
      return send({ result: entry });
    }
    const entry = history.find((item) => item.uid === decodeURIComponent(url.pathname.split('/').at(-1)));
    if (!entry) return send({}, 404);
    if (req.method === 'PATCH') entry.comment = body.comment;
    else if (url.pathname.includes('/star/')) entry.starred = req.method === 'POST';
    else return send({}, 400);
    send({ result: entry });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { history, calls, grafanaUrl: `http://127.0.0.1:${server.address().port}` };
}

function run(f, selected = presets) {
  return syncStarredQueries({ grafanaUrl: f.grafanaUrl, password, presets: selected });
}

function entry(uid, comment = '사용자가 저장한 검색', starred = true) {
  return { uid, comment, starred, datasourceUid: 'loki', queries: [{ expr: '{service_name="other"}' }] };
}

test('manifest has twelve explicit dev/prod presets with all-host selectors and ECS levels', () => {
  assert.equal(presets.length, 12);
  assert.equal(new Set(presets.map((preset) => preset.key)).size, 12);
  for (const environment of ['dev', 'prod']) {
    const group = presets.filter((preset) => preset.key.startsWith(`${environment}-`));
    assert.equal(group.length, 6);
    for (const preset of group) {
      assert.ok(preset.expr.startsWith(`{service_name="jarihana",environment="${environment}",host_id=~".*"}`));
      if (preset.key.endsWith('-all')) assert.ok(!preset.expr.includes('|'));
      else assert.match(preset.expr, / \| json \| __error__="" \| log_level(?:=|=~)"(?:ERROR|WARN|INFO|DEBUG\|TRACE|WARN\|ERROR)"$/);
    }
  }
});

test('creates twelve admin stars from null empty history; repeat run makes no mutations and preserves unrelated history', async (t) => {
  const unrelated = entry('user');
  const f = await fixture(t);
  assert.deepEqual(await run(f), { created: 12, updated: 12, starred: 12, unstarred: 0, presets: 12 });
  f.history.unshift(structuredClone(unrelated));
  assert.equal(f.history.filter((item) => item.starred).length, 13);
  assert.deepEqual(f.history[0], unrelated);
  const before = structuredClone(f.history);
  f.calls.length = 0;
  assert.deepEqual(await run(f), { created: 0, updated: 0, starred: 0, unstarred: 0, presets: 12 });
  assert.deepEqual(f.history, before);
  assert.ok(f.calls.every((call) => call.method === 'GET' && call.authorization === authorization));
  assert.ok(f.calls.every((call) => call.search.get('from') === '0' && Number(call.search.get('to')) > 0));
});

test('reuses entries beyond page one, updates titles, and restores an unstarred preset', async (t) => {
  const f = await fixture(t);
  await run(f, presets.slice(0, 1));
  f.history[0].comment = `[jarihana:explore:${presets[0].key}] 이전 제목`;
  f.history[0].starred = false;
  f.history.unshift(...Array.from({ length: 101 }, (_, index) => entry(`unrelated-${index}`)));
  f.calls.length = 0;
  assert.deepEqual(await run(f, presets.slice(0, 1)), { created: 0, updated: 1, starred: 1, unstarred: 0, presets: 1 });
  assert.deepEqual(f.calls.filter((call) => call.method === 'GET').map((call) => call.search.get('page')), ['1', '2', '1', '2']);
  assert.ok(f.history.slice(0, 101).every((item) => item.starred && item.comment === '사용자가 저장한 검색'));
});

test('changed expressions star a replacement before unstar; unrelated matching queries stay unchanged', async (t) => {
  const f = await fixture(t);
  await run(f, presets.slice(0, 1));
  const original = f.history[0];
  const unrelated = { ...structuredClone(original), uid: 'unrelated-copy', comment: '내 검색' };
  f.history.push(unrelated);
  f.calls.length = 0;
  const changed = [{ ...presets[0], expr: `${presets[0].expr} |= "changed"` }];
  assert.deepEqual(await run(f, changed), { created: 1, updated: 1, starred: 1, unstarred: 1, presets: 1 });
  assert.equal(original.starred, false);
  assert.equal(unrelated.starred, true);
  assert.equal(unrelated.comment, '내 검색');
  const mutations = f.calls.filter((call) => call.method !== 'GET');
  assert.deepEqual(mutations.map((call) => call.method), ['POST', 'PATCH', 'POST', 'DELETE']);
  assert.ok(mutations.at(-1).path.includes('/star/'));
});

test('failed replacement leaves the previous star and rerun resumes without another creation', async (t) => {
  let failStar = false;
  const f = await fixture(t, { override: ({ req, url, send }) => {
    if (failStar && req.method === 'POST' && url.pathname.includes('/star/')) { send({}, 500); return true; }
  } });
  await run(f, presets.slice(0, 1));
  const original = f.history[0];
  const changed = [{ ...presets[0], expr: `${presets[0].expr} |= "replacement"` }];
  failStar = true;
  await assert.rejects(run(f, changed), /HTTP 500/);
  assert.equal(original.starred, true);
  failStar = false;
  assert.deepEqual(await run(f, changed), { created: 0, updated: 0, starred: 1, unstarred: 1, presets: 1 });
  assert.equal(f.history.length, 2);
});

test('interruption after creation resumes using its stable query key without adopting user queries', async (t) => {
  let failPatch = true;
  const f = await fixture(t, { override: ({ req, send }) => {
    if (failPatch && req.method === 'PATCH') { send({}, 500); return true; }
  } });
  await assert.rejects(run(f, presets.slice(0, 1)), /HTTP 500/);
  assert.equal(f.history.length, 1);
  assert.equal(f.history[0].comment, '');
  const userQuery = structuredClone(f.history[0]);
  userQuery.uid = 'user-query';
  delete userQuery.queries[0].key;
  f.history.unshift(userQuery);
  failPatch = false;
  assert.deepEqual(await run(f, presets.slice(0, 1)), { created: 0, updated: 1, starred: 1, unstarred: 0, presets: 1 });
  assert.equal(f.history.length, 2);
  assert.equal(userQuery.comment, '');
  assert.equal(userQuery.starred, false);
});

test('a successful mutation response without persisted stars fails final readback', async (t) => {
  let reads = 0;
  const f = await fixture(t, { override: ({ req, send }) => {
    if (req.method === 'GET' && ++reads === 2) {
      send({ result: { page: 1, perPage: 100, totalCount: 0, queryHistory: [] } });
      return true;
    }
  } });
  await assert.rejects(run(f, presets.slice(0, 1)), /readback did not match/);
});

test('HTTP auth failures and malformed responses fail before mutation, without server body disclosure', async (t) => {
  for (const [name, override, expected] of [
    ['auth', ({ send }) => send({ message: password }, 401), /HTTP 401/],
    ['JSON', ({ res }) => res.end(password), /invalid JSON/],
    ['pagination', ({ send }) => send({ result: { queryHistory: [] } }), /invalid query history pagination/],
    ['null nonempty history', ({ send }) => send({ result: { page: 1, perPage: 100, totalCount: 1, queryHistory: null } }), /invalid query history pagination/],
    ['null history with invalid page', ({ send }) => send({ result: { page: 0, perPage: 100, totalCount: 0, queryHistory: null } }), /invalid query history pagination/],
    ['entry', ({ send }) => send({ result: { page: 1, perPage: 100, totalCount: 1, queryHistory: [{}] } }), /invalid query history entry/],
  ]) {
    await t.test(name, async (subtest) => {
      const f = await fixture(subtest, { override: (request) => { override(request); return true; } });
      await assert.rejects(run(f), (error) => expected.test(error.message) && !error.message.includes(password));
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].method, 'GET');
    });
  }
});

test('redirects never forward admin credentials', async (t) => {
  const destination = await fixture(t);
  const f = await fixture(t, { override: ({ res }) => {
    res.writeHead(302, { Location: destination.grafanaUrl }); res.end(); return true;
  } });
  await assert.rejects(run(f), /redirect/);
  assert.equal(destination.calls.length, 0);
});

test('invalid configuration is rejected before requests', async () => {
  await assert.rejects(syncStarredQueries({ password: '' }), /GRAFANA_ADMIN_PASSWORD/);
  await assert.rejects(syncStarredQueries({ password, grafanaUrl: 'http://admin:secret@localhost' }), /without credentials/);
  await assert.rejects(syncStarredQueries({ password, presets: [{ title: 'missing key', expr: '{}' }] }), /unique keys/);
  await assert.rejects(syncStarredQueries({ password, presets: [presets[0], presets[0]] }), /unique keys/);
});

test('CLI exits nonzero without exposing credentials on an authentication failure', async (t) => {
  const f = await fixture(t, { override: ({ send }) => { send({ message: password }, 401); return true; } });
  const child = spawn(process.execPath, [new URL('./sync-starred-queries.mjs', import.meta.url).pathname], {
    env: { ...process.env, GRAFANA_URL: f.grafanaUrl, GRAFANA_ADMIN_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'close');
  assert.equal(code, 1);
  assert.match(output, /HTTP 401/);
  assert.ok(!output.includes(password) && !output.includes(authorization));
});
