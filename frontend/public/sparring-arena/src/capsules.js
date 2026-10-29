import { createCapsuleBatch } from './capsule-batch.js';
import { createCapsulePhysics, CAPACITY, RADIUS } from './physics.js';
import { voteColors } from './vote-colors.js';

export function createCapsules(scene, onSelect, onReady) {
  const batch = createCapsuleBatch(scene, CAPACITY), physics = createCapsulePhysics();
  physics.settle();
  let posts = [], ratio = 0.5, mode = 'pressure', paused = false, initialized = false, populated = false;
  let cursor = 0, historyExchanges = 0, pipeReplays = 0, selectedForDraw = null;
  let pipeCredit = 0;
  const replayCounts = { a: 0, b: 0 };
  const pipeCursors = { a: 0, b: 0 };
  const pending = [];
  function historical() {
    if (!posts.length) return null;
    historyExchanges++;
    return posts[cursor++ % posts.length];
  }
  function draw() {
    physics.entries.forEach((entry, index) => {
      if (!populated) batch.hide(index);
      else batch.draw(index, entry, RADIUS / 0.48 * (entry.fresh && !entry.revealed ? 1.28 : 1));
    });
  }
  function updateState(nextPosts, votes) {
    posts = nextPosts; ratio = votes.ratio; populated = votes.total > 0;
    const colors = voteColors(CAPACITY, votes);
    physics.entries.forEach((entry, i) => {
      entry.visualSide = colors[i] ?? 'a';
      if (!initialized || !entry.fresh) {
        const matching = posts.filter(post => post.side === entry.visualSide);
        entry.post = matching[i % matching.length] ?? { id: 'vote-' + i, side: entry.visualSide, name: '', text: '' };
      }
    });
    initialized = true; draw();
  }
  function launch(post, { reduced = false } = {}) {
    physics.launch(post, { mode, fresh: true, speed: speedFor(post.side) });
    pending.push({ post, fresh: true });
    if (reduced || paused) physics.settle(1);
    draw();
  }
  function speedFor(side) { return 9 + 6 * (side === 'a' ? ratio : 1 - ratio); }
  function replayPipe() {
    pipeCredit += 0.18 + ratio * 0.64;
    const preferred = pipeCredit >= 1 ? 'a' : 'b';
    if (preferred === 'a') pipeCredit -= 1;
    const sides = [preferred, preferred === 'a' ? 'b' : 'a'];
    for (const side of sides) {
      const matching = posts.filter(post => post.side === side);
      if (!matching.length || !physics.entries.some(entry => entry.visualSide === side)) continue;
      const post = matching[pipeCursors[side]++ % matching.length];
      if (!physics.launch(post, { mode, skipProtected: true, speed: speedFor(side) })) continue;
      pipeReplays++;
      replayCounts[side]++;
      return side;
    }
    return null;
  }
  function step(delta, reduced = false) {
    if (!paused && !reduced) physics.step(delta);
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
    if (pending.length) return pending.shift();
    if (selectedForDraw) { const post = selectedForDraw; selectedForDraw = null; return { post, fresh: false }; }
    return takeHistorical();
  }
  function takeHistorical() { const post = historical(); return post ? { post, fresh: false } : null; }
  function nudge(id) {
    const entry = physics.entries.find(entry => entry.post?.id === id);
    if (entry) { entry.body.wakeUp(); entry.body.velocity.y += 1; }
  }
  function presentation() { return { tracking: physics.entries.filter(entry => entry.fresh && physics.world.time - entry.born < 4.5).sort((a, b) => b.born - a.born).slice(0, 4) }; }
  function stats() {
    return { ...physics.stats(), capsules: CAPACITY, visibleCapsules: populated ? CAPACITY : 0,
      mintCapsules: populated ? physics.entries.filter(entry => entry.visualSide === 'a').length : 0,
      coralCapsules: populated ? physics.entries.filter(entry => entry.visualSide === 'b').length : 0,
      historyExchanges, pipeReplays, pipeReplaysA: replayCounts.a, pipeReplaysB: replayCounts.b, speedA: speedFor('a'), speedB: speedFor('b'), pendingFresh: pending.length, drawReady: initialized,
      queuedId: pending[0]?.post.id ?? selectedForDraw?.id ?? null, mintShare: ratio, mode, paused };
  }
  return { updateState, launch, replayPipe, step, pick, nudge, presentation, stats, takeForDraw, takeHistorical, takeCollision: physics.takeCollision,
    setMode(next) { mode = next; }, setPaused(value) { paused = value; } };
}
