import { readFile } from 'node:fs/promises';

const manifestUrl = new URL('./queries.json', import.meta.url);
const historyPath = 'api/query-history';
const pageSize = 100;

export async function syncStarredQueries({
  grafanaUrl = process.env.GRAFANA_URL || 'http://127.0.0.1:3000',
  password = process.env.GRAFANA_ADMIN_PASSWORD,
  presets,
} = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('GRAFANA_ADMIN_PASSWORD is required');
  }
  let baseUrl;
  try {
    baseUrl = new URL(grafanaUrl);
  } catch {
    throw new Error('GRAFANA_URL must be an HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('GRAFANA_URL must be HTTP(S), without credentials, query, or fragment');
  }
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/`;
  presets ??= JSON.parse(await readFile(manifestUrl, 'utf8'));
  const keys = new Set();
  if (!Array.isArray(presets) || presets.length === 0) throw new Error('Query manifest must be a nonempty array');
  for (const preset of presets) {
    if (!preset || typeof preset.key !== 'string' || !/^[a-z0-9-]+$/.test(preset.key) || keys.has(preset.key) ||
        typeof preset.title !== 'string' || !preset.title.trim() ||
        typeof preset.expr !== 'string' || !preset.expr.trim()) {
      throw new Error('Query manifest requires unique keys, titles, and expressions');
    }
    keys.add(preset.key);
  }

  async function request(method, path, body) {
    let response;
    try {
      response = await fetch(new URL(path, baseUrl), {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(`Grafana ${method} request failed (network, timeout, or redirect)`);
    }
    if (!response.ok) throw new Error(`Grafana ${method} request returned HTTP ${response.status}`);
    try {
      const payload = await response.json();
      if (!payload?.result || typeof payload.result !== 'object') throw new Error();
      return payload.result;
    } catch {
      throw new Error(`Grafana ${method} returned an invalid JSON result`);
    }
  }

  function validateEntry(entry) {
    if (!entry || typeof entry.uid !== 'string' || !entry.uid ||
        typeof entry.datasourceUid !== 'string' || typeof entry.comment !== 'string' ||
        typeof entry.starred !== 'boolean' || !Array.isArray(entry.queries)) {
      throw new Error('Grafana returned an invalid query history entry');
    }
    return entry;
  }

  async function readHistory() {
    const history = [];
    const seen = new Set();
    const to = String(Date.now());
    for (let page = 1; ; page++) {
      const params = new URLSearchParams({ datasourceUid: 'loki', sort: 'time-asc', limit: String(pageSize), page: String(page), from: '0', to });
      const result = await request('GET', `${historyPath}?${params}`);
      if (!Array.isArray(result.queryHistory) || !Number.isInteger(result.totalCount) || result.totalCount < 0 ||
          result.page !== page || !Number.isInteger(result.perPage) || result.perPage <= 0) {
        throw new Error('Grafana returned invalid query history pagination');
      }
      for (const item of result.queryHistory) {
        const entry = validateEntry(item);
        if (seen.has(entry.uid)) throw new Error('Grafana query history pagination repeated an entry; retry synchronization');
        seen.add(entry.uid);
        history.push(entry);
      }
      if (history.length >= result.totalCount) return history;
      if (result.queryHistory.length === 0) throw new Error('Grafana query history pagination ended early');
    }
  }

  const history = await readHistory();
  const counts = { created: 0, updated: 0, starred: 0, unstarred: 0, presets: presets.length };
  const expected = [];
  for (const preset of presets) {
    const marker = `[jarihana:explore:${preset.key}]`;
    const comment = `${marker} ${preset.title}`;
    const target = {
      key: `jarihana:explore:${preset.key}`,
      refId: 'A', expr: preset.expr, queryType: 'range', editorMode: 'code',
      direction: 'backward', maxLines: 100, datasource: { type: 'loki', uid: 'loki' },
    };
    const isOwned = (entry) => entry.datasourceUid === 'loki' &&
      (entry.comment === marker || entry.comment.startsWith(`${marker} `));
    const owned = history.filter(isOwned);
    const matches = (entry) => entry.queries.length === 1 && Object.entries(target).every(([key, value]) =>
      key === 'datasource'
        ? entry.queries[0]?.datasource?.uid === value.uid && entry.queries[0]?.datasource?.type === value.type
        : entry.queries[0]?.[key] === value);
    let current = owned.find((entry) => entry.starred && matches(entry)) || owned.find(matches) ||
      history.find((entry) => entry.datasourceUid === 'loki' && entry.comment === '' && matches(entry));
    if (!current) {
      current = validateEntry(await request('POST', historyPath, { datasourceUid: 'loki', queries: [target] }));
      if (current.datasourceUid !== 'loki' || !matches(current)) throw new Error('Grafana did not create the requested query');
      counts.created++;
    }
    const uid = encodeURIComponent(current.uid);
    if (current.comment !== comment) {
      const updated = validateEntry(await request('PATCH', `${historyPath}/${uid}`, { comment }));
      if (updated.uid !== current.uid || updated.comment !== comment || !matches(updated)) {
        throw new Error('Grafana did not persist the query comment');
      }
      current = updated;
      counts.updated++;
    }
    if (!current.starred) {
      const starred = validateEntry(await request('POST', `${historyPath}/star/${uid}`));
      if (starred.uid !== current.uid || !starred.starred || starred.comment !== comment || !matches(starred)) {
        throw new Error('Grafana did not star the requested query');
      }
      current = starred;
      counts.starred++;
    }
    for (const obsolete of owned.filter((entry) => entry.uid !== current.uid && entry.starred)) {
      const unstarred = validateEntry(await request('DELETE', `${historyPath}/star/${encodeURIComponent(obsolete.uid)}`));
      if (unstarred.uid !== obsolete.uid || unstarred.starred) throw new Error('Grafana did not unstar the obsolete query');
      counts.unstarred++;
    }
    expected.push({ uid: current.uid, comment, matches, isOwned });
  }
  const persisted = await readHistory();
  for (const preset of expected) {
    const starred = persisted.filter((entry) => entry.starred && preset.isOwned(entry));
    if (starred.length !== 1 || starred[0].uid !== preset.uid || starred[0].comment !== preset.comment || !preset.matches(starred[0])) {
      throw new Error('Grafana query history readback did not match the requested starred presets');
    }
  }
  return counts;
}

if (import.meta.main) {
  try {
    console.log(`Explore starred queries synchronized: ${JSON.stringify(await syncStarredQueries())}`);
  } catch (error) {
    console.error(`Explore starred query synchronization failed: ${error.message}`);
    process.exitCode = 1;
  }
}
