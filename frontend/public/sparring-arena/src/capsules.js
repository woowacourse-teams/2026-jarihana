import { createCapsuleBatch } from './capsule-batch.js';
import { createCapsulePhysics, CAPACITY, RADIUS, FRESH_CAPSULE_SCALE } from './physics.js';
import { voteColors } from './vote-colors.js';

export function createCapsules(scene, onSelect, onReady) {
  const batch = createCapsuleBatch(scene, CAPACITY), physics = createCapsulePhysics();
  physics.settle();
  let posts = [], ratio = 0.5, mode = 'pressure', paused = false, initialized = false, populated = false;
  let cursor = 0, historyExchanges = 0, pipeReplays = 0, selectedForDraw = null;
  let pipeCredit = 0.5;
  const replayCounts = { a: 0, b: 0 };
  const pipeCursors = { a: 0, b: 0 };
  const liveReplays = new Map();
  function queueReplay(post, readyAt = performance.now() + 4500) {
    if (!liveReplays.has(post.id)) liveReplays.set(post.id, { post, readyAt });
  }
  function historical() {
    const ready = [...liveReplays.values()].find(item => item.readyAt <= performance.now());
    if (ready) {
      liveReplays.delete(ready.post.id);
      historyExchanges++;
      return ready.post;
    }
    for (let i = 0; i < posts.length; i++) {
      const post = posts[cursor++ % posts.length];
      // Keep the pipe speech visible before this same message leaves via the slide.
      if (liveReplays.has(post.id)) continue;
      historyExchanges++;
      return post;
    }
    return null;
  }
  function draw() {
    physics.entries.forEach((entry, index) => {
      if (!populated) batch.hide(index);
      else batch.draw(index, entry, RADIUS / 0.48 * (entry.fresh && !entry.revealed ? FRESH_CAPSULE_SCALE : 1));
    });
  }
  function updateState(nextPosts, votes) {
    const seedTank = !populated && votes.total > 0;
    posts = nextPosts; ratio = votes.ratio; populated = votes.total > 0;
    if (seedTank) {
      const colors = voteColors(CAPACITY, votes);
      physics.entries.forEach((entry, i) => {
        entry.visualSide = colors[i];
        const matching = posts.filter(post => post.side === entry.visualSide);
        entry.post = matching[i % matching.length] ?? { id: 'vote-' + i, side: entry.visualSide, name: '', text: '' };
      });
      pipeCredit = 0.5;
    }
    initialized = true; draw();
  }
  function launch(post, { reduced = false } = {}) {
    const entry = physics.launch(post, { mode, fresh: true, speed: speedFor(post.side) });
    entry.flightUntil = performance.now() + 4500;
    queueReplay(post, entry.flightUntil);
    if (reduced || paused) physics.settle(1);
    draw();
  }
  function speedFor(side) { return 9 + 6 * (side === 'a' ? ratio : 1 - ratio); }
  function replayPipe() {
    if (!populated) return null;
    const nextCredit = pipeCredit + ratio;
    const side = nextCredit >= 1 ? 'a' : 'b';
    const matching = posts.filter(post => post.side === side);
    // Votes keep the pipe flowing even before anyone on that side writes a message.
    const post = matching.length ? matching[pipeCursors[side] % matching.length]
      : { id: 'vote-' + side, side, name: '', text: '' };
    if (!physics.launch(post, { mode, skipProtected: true, speed: speedFor(side) })) return null;
    pipeCredit = nextCredit - (side === 'a' ? 1 : 0);
    pipeCursors[side]++;
    pipeReplays++;
    replayCounts[side]++;
    return side;
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
    if (selectedForDraw) {
      const post = selectedForDraw; selectedForDraw = null;
      liveReplays.delete(post.id);
      return { post, fresh: false };
    }
    return takeHistorical();
  }
  function takeHistorical() { const post = historical(); return post ? { post, fresh: false } : null; }
  function nudge(id) {
    const entry = physics.entries.find(entry => entry.post?.id === id);
    if (entry) { entry.body.wakeUp(); entry.body.velocity.y += 1; }
  }
  function presentation() { return { tracking: physics.entries.filter(entry => entry.fresh && performance.now() < entry.flightUntil).sort((a, b) => b.flightUntil - a.flightUntil).slice(0, 4) }; }
  function stats() {
    return { ...physics.stats(), capsules: CAPACITY, visibleCapsules: populated ? CAPACITY : 0,
      mintCapsules: populated ? physics.entries.filter(entry => entry.visualSide === 'a').length : 0,
      coralCapsules: populated ? physics.entries.filter(entry => entry.visualSide === 'b').length : 0,
      historyExchanges, pipeReplays, pipeReplaysA: replayCounts.a, pipeReplaysB: replayCounts.b, speedA: speedFor('a'), speedB: speedFor('b'), drawReady: initialized,
      queuedId: selectedForDraw?.id ?? null, pendingReplays: liveReplays.size, mintShare: ratio, mode, paused };
  }
  return { updateState, launch, queueReplay, replayPipe, step, pick, nudge, presentation, stats, takeForDraw, takeHistorical, takeCollision: physics.takeCollision,
    shockwave(point) { return populated && !paused ? physics.shockwave(point) : 0; },
    setMode(next) { mode = next; }, setPaused(value) { paused = value; } };
}
