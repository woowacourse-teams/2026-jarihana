export function createReplayQueue(requestHistory = () => {}) {
  const recent = new Map();
  const completed = new Set();
  let previousIds = new Set(), newestId = 0;
  let history = [], page = null, requestedPage = null, recentTurns = 0;

  function prefetch() {
    if (page === null || history.length > 2 || requestedPage === page) return;
    requestedPage = page;
    requestHistory(page);
  }

  function enqueue(post, readyAt = 0, fresh = false) {
    if (completed.has(post.id)) return;
    recent.set(post.id, { post, readyAt, fresh });
  }

  function update(posts, older) {
    for (const post of posts) {
      const pending = recent.get(post.id);
      if (pending) pending.post = post;
      else if (!previousIds.has(post.id) && (!Number.isFinite(Number(post.id)) || Number(post.id) > newestId)) enqueue(post);
    }
    newestId = Math.max(newestId, ...posts.map(post => Number(post.id)).filter(Number.isFinite));
    previousIds = new Set(posts.map(post => post.id));
    if (older && (page === null || older.page > page)) {
      page = older.page;
      history.push(...older.posts);
    }
    prefetch();
  }

  function take(freshOnly = false) {
    const next = [...recent.values()].find(item => (!freshOnly || item.fresh) && item.readyAt <= performance.now());
    // A new archive cycle may overlap the recent queue; finish those first plays before repeating them.
    const historyReady = history.length && !history.some(post => recent.has(post.id));
    let selection = null;
    if (next && (freshOnly || recentTurns < 2 || !historyReady)) {
      recent.delete(next.post.id);
      completed.add(next.post.id);
      if (completed.size > 256) completed.delete(completed.values().next().value);
      recentTurns = Math.min(2, recentTurns + 1);
      selection = { post: next.post, fresh: next.fresh };
    } else if (!freshOnly && historyReady) {
      recentTurns = 0;
      selection = { post: history.shift(), fresh: false };
    }
    prefetch();
    return selection;
  }

  return {
    update, enqueue, take,
    remove(id) { recent.delete(id); completed.add(id); },
    settle() { for (const item of recent.values()) { item.fresh = false; item.readyAt = 0; } },
    freshReady: () => [...recent.values()].some(item => item.fresh && item.readyAt <= performance.now()),
    stats: () => ({ recentPending: recent.size, historyPending: history.length, historyPage: page, recentTurns }),
  };
}
