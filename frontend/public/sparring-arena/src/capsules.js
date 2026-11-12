import { createCapsuleBatch } from './capsule-batch.js';
import { createCapsulePhysics, CAPACITY, RADIUS, FRESH_CAPSULE_SCALE } from './physics.js';
import { voteColors } from './vote-colors.js';
import { createReplayQueue } from './replay-queue.js';

const TANK_AVATAR_LIMIT = 24, PIPE_AVATAR_LIMIT = 4;

export function createCapsules(scene, onSelect, onReady, requestHistory) {
  const batch = createCapsuleBatch(scene, CAPACITY), physics = createCapsulePhysics();
  physics.settle();
  let posts = [], ratio = 0.5, mode = 'pressure', paused = false, initialized = false, populated = false;
  let historyExchanges = 0, pipeReplays = 0, selectedForDraw = null;
  let pipeCredit = 0.5;
  const replayCounts = { a: 0, b: 0 };
  const pipeCursors = { a: 0, b: 0 };
  let postsBySide = { a: [], b: [] };
  let avatarPools = { a: [], b: [] }, poolKey, tankDecorationsDirty = false;
  const tankAvatars = new Map(), pipeAvatars = new Map();
  const rendered = Array.from({ length: CAPACITY }, () => ({ visible: null }));
  const replay = createReplayQueue(requestHistory);
  const pendingLaunches = [];
  const queueReplay = (post, readyAt = performance.now() + 4500, fresh = false) => replay.enqueue(post, readyAt, fresh);
  function draw() {
    if (populated && tankDecorationsDirty) rebalanceTankAvatars();
    physics.entries.forEach((entry, index) => {
      const last = rendered[index];
      if (!populated) {
        if (last.visible !== false) batch.hide(index);
        last.visible = false;
        return;
      }
      const { post, body } = entry, { position: p, quaternion: q } = body;
      const decoration = pipeAvatars.get(entry) ?? tankAvatars.get(entry);
      const appearance = entry.fresh && !entry.revealed ? post?.appearance ?? null
        : decoration?.side === entry.visualSide ? decoration?.appearance ?? null : null;
      const size = RADIUS / 0.48 * (entry.fresh && !entry.revealed ? FRESH_CAPSULE_SCALE : 1);
      // Only the tank's packed pose is static; animated/open capsules must keep updating.
      const cacheable = entry.phase === undefined && entry.characterPose === undefined && !entry.parts;
      if (cacheable && last.cacheable && last.visible && last.post === post &&
          last.id === post?.id && last.name === post?.name && last.authorId === post?.authorId &&
          last.memberType === post?.memberType && last.postSide === post?.side && last.side === entry.visualSide &&
          last.fresh === entry.fresh && last.revealed === entry.revealed && last.appearance === appearance && last.size === size &&
          last.shellScale === entry.shellScale && last.yaw === entry.characterYaw &&
          last.x === p.x && last.y === p.y && last.z === p.z &&
          last.qx === q.x && last.qy === q.y && last.qz === q.z && last.qw === q.w) return;
      batch.draw(index, entry, size, 0, false, appearance);
      last.visible = true; last.cacheable = cacheable;
      last.post = post; last.id = post?.id; last.name = post?.name; last.authorId = post?.authorId;
      last.memberType = post?.memberType; last.postSide = post?.side; last.side = entry.visualSide;
      last.fresh = entry.fresh; last.revealed = entry.revealed; last.size = size;
      last.appearance = appearance;
      last.shellScale = entry.shellScale; last.yaw = entry.characterYaw;
      last.x = p.x; last.y = p.y; last.z = p.z;
      last.qx = q.x; last.qy = q.y; last.qz = q.z; last.qw = q.w;
    });
  }
  function refreshDecorations(nextPools, seedTank) {
    const key = JSON.stringify(nextPools ?? null);
    if (!seedTank && key === poolKey) return;
    poolKey = key;
    avatarPools = { a: nextPools?.a ?? [], b: nextPools?.b ?? [] };
    tankAvatars.clear();
    pipeAvatars.clear();
    tankDecorationsDirty = true;
  }
  function rebalanceTankAvatars() {
    tankDecorationsDirty = false;
    if (!avatarPools.a.length && !avatarPools.b.length) return;
    const slots = { a: [], b: [] };
    for (const entry of physics.entries) slots[entry.visualSide]?.push(entry);
    const quotas = voteColors(TANK_AVATAR_LIMIT, {
      total: CAPACITY, a: slots.a.length, b: slots.b.length, ratio: slots.a.length / CAPACITY,
    });
    for (const side of ['a', 'b']) {
      const entries = slots[side], pool = avatarPools[side];
      if (!pool.length) continue;
      const limit = Math.min(entries.length, quotas.filter(color => color === side).length);
      const assigned = [...tankAvatars].filter(([, avatar]) => avatar.side === side);
      if (assigned.length === limit && assigned.every(([entry]) => entry.visualSide === side)) continue;
      for (const [entry] of assigned) tankAvatars.delete(entry);
      for (let i = 0; i < limit; i++) {
        const entry = entries[Math.floor((i + 0.5) * entries.length / limit)];
        tankAvatars.set(entry, { side, appearance: pool[i % pool.length] });
      }
    }
  }
  function updateState(nextPosts, votes, history, nextPools) {
    const seedTank = !populated && votes.total > 0;
    posts = nextPosts; ratio = votes.ratio; populated = votes.total > 0;
    postsBySide = { a: [], b: [] };
    for (const post of posts) if (postsBySide[post.side]) postsBySide[post.side].push(post);
    replay.update(posts, history);
    if (seedTank) {
      const colors = voteColors(CAPACITY, votes);
      physics.entries.forEach((entry, i) => {
        entry.visualSide = colors[i];
        const matching = postsBySide[entry.visualSide];
        entry.post = matching[i % matching.length] ?? { id: 'vote-' + i, side: entry.visualSide, name: '', text: '' };
      });
      pipeCredit = 0.5;
    }
    if (populated) refreshDecorations(nextPools, seedTank);
    initialized = true; draw();
  }
  function launch(post, { reduced = false } = {}) {
    queueReplay(post, Infinity);
    pendingLaunches.push({ post, reduced });
    flushLaunches();
    draw();
  }
  function flushLaunches(reduceMotion = false) {
    while (pendingLaunches.length) {
      const ownIndex = pendingLaunches.findIndex(item => item.post.mine);
      const index = ownIndex < 0 ? 0 : ownIndex;
      const { post, reduced } = pendingLaunches[index];
      const entry = physics.launch(post, { mode, fresh: true, skipProtected: !(reduced || reduceMotion || paused), speed: speedFor(post.side) });
      if (!entry) return;
      // A recycled capsule can change sides even when the voter pools stay the same.
      tankDecorationsDirty = true;
      pendingLaunches.splice(index, 1);
      entry.flightUntil = performance.now() + 4500;
      queueReplay(post, entry.flightUntil);
      if (reduced || reduceMotion || paused) physics.settle(1);
    }
  }
  function speedFor(side) { return 9 + 6 * (side === 'a' ? ratio : 1 - ratio); }
  function replayPipe() {
    if (!populated) return null;
    const nextCredit = pipeCredit + ratio;
    const side = nextCredit >= 1 ? 'a' : 'b';
    const matching = postsBySide[side];
    // Votes keep the pipe flowing even before anyone on that side writes a message.
    const post = matching.length ? matching[pipeCursors[side] % matching.length]
      : { id: 'vote-' + side, side, name: '', text: '' };
    const entry = physics.launch(post, { mode, skipProtected: true, speed: speedFor(side) });
    if (!entry) return null;
    tankDecorationsDirty = true;
    const pool = avatarPools[side];
    pipeAvatars.delete(entry);
    if (pool.length) {
      pipeAvatars.set(entry, { side, appearance: pool[pipeCursors[side] % pool.length] });
      if (pipeAvatars.size > PIPE_AVATAR_LIMIT) pipeAvatars.delete(pipeAvatars.keys().next().value);
    }
    pipeCredit = nextCredit - (side === 'a' ? 1 : 0);
    pipeCursors[side]++;
    pipeReplays++;
    replayCounts[side]++;
    return side;
  }
  function step(delta, reduced = false) {
    if (!paused && !reduced) physics.step(delta);
    flushLaunches(reduced);
    for (const entry of physics.entries) {
      if (entry.fresh && !entry.revealed && entry.landedAt !== null) {
        entry.revealed = true;
        if (entry.post.name === '나') onReady(entry.post);
      }
    }
    draw();
  }
  function pick(event, canvas, camera) {
    const index = batch.pick(event, canvas, camera);
    if (index === null) return false;
    const post = physics.entries[index].post;
    if (!posts.some(item => item.id === post?.id)) return false;
    selectedForDraw = post; onSelect(post.id); return true;
  }
  function takeForDraw() {
    if (selectedForDraw) {
      const post = selectedForDraw; selectedForDraw = null;
      replay.remove(post.id);
      return { post, fresh: false };
    }
    return takeHistorical();
  }
  function takeHistorical(freshOnly = false, id = null) {
    const selection = replay.take(freshOnly, id);
    if (selection) historyExchanges++;
    return selection;
  }
  function nudge(id) {
    const entry = physics.entries.find(entry => entry.post?.id === id);
    if (entry) { entry.body.wakeUp(); entry.body.velocity.y += 1; }
  }
  function presentation() { return { tracking: physics.entries.filter(entry => entry.fresh && performance.now() < entry.flightUntil).sort((a, b) => b.flightUntil - a.flightUntil) }; }
  function controlState() { return { drawReady: initialized, queuedId: selectedForDraw?.id ?? null, freshReady: replay.freshReady() }; }
  function stats() {
    return { ...physics.stats(), ...replay.stats(), capsules: CAPACITY, visibleCapsules: populated ? CAPACITY : 0,
      mintCapsules: populated ? physics.entries.filter(entry => entry.visualSide === 'a').length : 0,
      coralCapsules: populated ? physics.entries.filter(entry => entry.visualSide === 'b').length : 0,
      historyExchanges, pipeReplays, pipeReplaysA: replayCounts.a, pipeReplaysB: replayCounts.b, speedA: speedFor('a'), speedB: speedFor('b'), drawReady: initialized,
      queuedId: selectedForDraw?.id ?? null, pendingReplays: replay.stats().recentPending, pendingLaunches: pendingLaunches.length, mintShare: ratio, mode, paused };
  }
  return { updateState, launch, queueReplay, replayPipe, step, pick, nudge, presentation, controlState, stats, takeForDraw, takeHistorical, takeCollision: physics.takeCollision,
    settleReplays: replay.settle,
    shockwave(point) { return populated && !paused ? physics.shockwave(point) : 0; },
    setMode(next) { mode = next; }, setPaused(value) { paused = value; } };
}
