import { characterVariant } from './character-motion.js';

const DISPLAY_SECONDS = 6.4;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function createCharacterDuel(stage, onSelect, onReveal) {
  const field = document.createElement('section');
  field.className = 'character-duel';
  field.setAttribute('aria-label', '마주 보는 두 의견');
  field.dataset.phPrivate = 'true';
  const versus = document.createElement('span');
  versus.className = 'duel-versus';
  versus.textContent = 'VS';
  versus.setAttribute('aria-hidden', 'true');
  const status = document.createElement('span');
  status.className = 'duel-status';
  status.textContent = '첫 한마디를 기다려요';
  const slots = ['left', 'right'].map((position, index) => {
    const slot = document.createElement('div');
    slot.className = `duel-contender ${position}`;
    slot.dataset.side = index ? 'b' : 'a';
    const bubble = document.createElement('button');
    bubble.className = 'duel-speech';
    bubble.type = 'button';
    bubble.dataset.phCaptureAttributeAction = 'sparring_capsule_select';
    bubble.hidden = true;
    const byline = document.createElement('span');
    byline.className = 'duel-byline';
    const author = document.createElement('strong');
    const context = document.createElement('span');
    byline.append(author, context);
    const text = document.createElement('span');
    text.className = 'duel-speech-text';
    bubble.append(byline, text);
    const figure = document.createElement('div');
    figure.className = 'duel-figure';
    figure.setAttribute('aria-hidden', 'true');
    const facing = document.createElement('div');
    facing.className = 'duel-facing';
    const sprite = document.createElement('div');
    sprite.className = 'duel-sprite';
    sprite.dataset.variant = String(index);
    sprite.dataset.pose = 'listen';
    for (const pose of ['listen', 'protest']) {
      const layer = document.createElement('span');
      layer.className = `duel-pose ${pose}`;
      sprite.append(layer);
    }
    facing.append(sprite); figure.append(facing);
    const ground = document.createElement('span');
    ground.className = 'duel-ground';
    ground.setAttribute('aria-hidden', 'true');
    slot.append(bubble, ground, figure); field.append(slot);
    return { slot, bubble, author, context, text, sprite, figure, post: null };
  });
  field.append(versus, status); stage.append(field);
  let posts = [], active = null, paused = false, disposed = false, initialized = false;
  const queue = [];
  const wake = () => stage.dispatchEvent(new Event('duelwake'));
  const pinned = () => field.contains(document.activeElement);

  for (const item of slots) {
    item.bubble.addEventListener('click', () => {
      if (item.post) onSelect(item.post.id);
    });
  }
  field.addEventListener('focusout', () => queueMicrotask(() => { if (!disposed) wake(); }));
  field.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.activeElement?.blur();
    if (active) active.elapsed = DISPLAY_SECONDS;
    wake();
  });

  function present(item, post, caption) {
    item.post = post;
    item.bubble.hidden = !post;
    item.slot.dataset.speaking = 'false';
    if (!post) return;
    item.slot.dataset.side = post.side;
    item.sprite.dataset.variant = String(characterVariant(post));
    item.author.textContent = post.name;
    item.context.textContent = caption;
    item.text.textContent = post.text;
    item.bubble.dataset.postId = post.id;
    item.bubble.setAttribute('aria-label', `${post.name}, ${caption}: ${post.text}. 눌러서 의견 보기`);
    item.bubble.dataset.phCaptureAttributeAction = active.post.replyTo ? 'sparring_clash_expand' : 'sparring_capsule_select';
  }

  function begin(post, fresh, reduced) {
    const other = post.replyTo ?? [...posts].reverse().find(item => item.side !== post.side && item.id !== post.id);
    const speaker = post.side === 'a' ? 0 : 1;
    active = { post, elapsed: 0, fresh, reduced, speaker, other: other ?? null };
    field.dataset.fresh = String(fresh);
    field.dataset.reduced = String(reduced);
    status.textContent = fresh ? post.replyTo ? '방금 받아친 말' : '방금 나온 한마디' : post.replyTo ? '지난 받아치기' : '지난 대화';
    present(slots[speaker], post, post.replyTo ? '받아친 말' : fresh ? '방금' : '지난 대화');
    present(slots[1 - speaker], other, post.replyTo ? '먼저 한 말' : '반대편 의견');
    onReveal(post, fresh);
    paint();
  }

  function paint() {
    if (!active) return;
    const time = active.elapsed;
    // Replies first show the actual original speaker, then the responding author.
    const first = active.post.replyTo ? 1 - active.speaker : active.speaker;
    const second = 1 - first;
    const turn = time < 1.4 ? first : time < 2.8 && slots[second].post ? second : active.speaker;
    const motionTime = time < 1.4 ? time : time - 1.4;
    const envelope = ease(motionTime / 0.18) * (1 - ease((motionTime - 0.95) / 0.45));
    field.dataset.turn = turn === 0 ? 'left' : 'right';
    field.dataset.phase = time >= 3.5 ? 'settled' : time < 1.4 ? 'argue' : 'reply';
    slots.forEach((item, index) => {
      const speaking = index === turn && !!item.post;
      const direction = index ? -1 : 1;
      const moving = !active.reduced && time < 2.8;
      const push = moving ? envelope * (speaking ? 18 : -8) : 0;
      const bounce = moving && speaking ? -Math.abs(Math.sin(motionTime * 13)) * envelope * 5 : 0;
      const tilt = moving ? envelope * (speaking ? -4 : Math.sin(motionTime * 17) * 3) : 0;
      item.slot.dataset.speaking = String(speaking);
      item.sprite.dataset.pose = speaking ? 'protest' : 'listen';
      item.figure.style.transform = `translate(${direction * push}px, ${bounce}px) rotate(${direction * tilt}deg)`;
    });
  }

  function start(post, fresh, reduced = false) {
    if (disposed || !post) return;
    if (fresh && (active?.post.id === post.id || queue.some(item => item.post.id === post.id))) return;
    if (pinned() || (fresh && active?.fresh && active.elapsed < DISPLAY_SECONDS)) {
      if (fresh) {
        queue.push({ post, fresh, reduced });
        if (queue.length > 12) queue.shift();
      }
      return;
    }
    begin(post, fresh, reduced);
  }

  return {
    updateState(nextPosts) {
      posts = nextPosts;
      if (!initialized) {
        initialized = true;
        if (posts.length) begin(posts.at(-1), false, matchMedia('(prefers-reduced-motion: reduce)').matches);
      }
    },
    start,
    step(delta, reduced = false) {
      if (!active || disposed) return;
      active.reduced = reduced;
      field.dataset.reduced = String(reduced);
      if (!paused && !pinned()) active.elapsed += delta;
      if (!paused && !pinned() && active.elapsed >= DISPLAY_SECONDS && queue.length) {
        const next = queue.shift();
        begin(next.post, next.fresh, reduced);
      }
      paint();
    },
    busy: () => pinned() || !!active && active.elapsed < DISPLAY_SECONDS || queue.length > 0,
    needsFrame: () => !paused && !pinned() && (!!active && active.elapsed < DISPLAY_SECONDS || queue.length > 0),
    stats: () => ({ duelCharacters: 2, duelPhase: field.dataset.phase ?? 'waiting', duelQueued: queue.length }),
    setPaused(value) { paused = value; field.dataset.paused = String(value); },
    dispose() { disposed = true; queue.length = 0; field.remove(); },
  };
}
