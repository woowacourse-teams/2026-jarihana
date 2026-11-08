export function createReplayQueue(requestHistory = () => {}) {
  const recent = new Map();
  const completed = new Set();
  let previousIds = new Set(), newestId = 0, initialized = false;
  let history = [], page = null, requestedPage = null, recentTurns = 0;

  function prefetch() {
    if (page === null || history.length > 2 || requestedPage === page || history.some(post => recent.has(post.id))) return;
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
      // Posts present on entry belong to the per-side archive, not the live queue.
      else if (initialized && !previousIds.has(post.id) && (!Number.isFinite(Number(post.id)) || Number(post.id) > newestId)) enqueue(post);
    }
    newestId = Math.max(newestId, ...posts.map(post => Number(post.id)).filter(Number.isFinite));
    previousIds = new Set(posts.map(post => post.id));
    initialized = true;
    if (older && (page === null || older.page > page)) {
      page = older.page;
      history.push(...older.posts);
    }
    prefetch();
  }

  function take(freshOnly = false, id = null) {
    const next = [...recent.values()].find(item => (id === null || item.post.id === id)
      && (!freshOnly || item.fresh) && item.readyAt <= performance.now());
    // Pending live posts cannot stall other archive posts or repeat in this cycle.
    const historyIndex = history.findIndex(post => !recent.has(post.id));
    const historyReady = historyIndex !== -1;
    let selection = null;
    if (next && (id !== null || freshOnly || recentTurns < 2 || !historyReady)) {
      recent.delete(next.post.id);
      history = history.filter(post => post.id !== next.post.id);
      completed.add(next.post.id);
      if (completed.size > 256) completed.delete(completed.values().next().value);
      recentTurns = Math.min(2, recentTurns + 1);
      selection = { post: next.post, fresh: next.fresh };
    } else if (id === null && !freshOnly && historyReady) {
      recentTurns = 0;
      selection = { post: history.splice(historyIndex, 1)[0], fresh: false };
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
