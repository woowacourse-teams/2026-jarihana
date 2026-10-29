import { characterVariant } from './character-motion.js';

const ENTRY_SECONDS = 0.95;
const DISPLAY_SECONDS = 6.4;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function createCharacterDuel(stage, onSelect, onReveal) {
  const field = document.createElement('section');
  field.className = 'character-duel';
  field.setAttribute('aria-label', '캡슐에서 나온 두 의견');
  field.dataset.phPrivate = 'true';
  const versus = document.createElement('span');
  versus.className = 'duel-versus';
  versus.textContent = 'VS';
  versus.hidden = true;
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
    figure.hidden = true;
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
    ground.hidden = true;
    slot.append(bubble, ground, figure); field.append(slot);
    return { slot, bubble, author, context, text, sprite, figure, ground, post: null, arrival: null };
  });
  field.append(versus, status); stage.append(field);
  let posts = [], active = null, paused = false, disposed = false;
  let destinations = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const wake = () => stage.dispatchEvent(new Event('duelwake'));
  const pinned = () => field.contains(document.activeElement);
  const landed = () => !!active && slots.every(item => !item.post || item.arrival?.elapsed >= ENTRY_SECONDS);

  for (const item of slots) item.bubble.addEventListener('click', () => { if (item.post) onSelect(item.post.id); });
  field.addEventListener('focusout', () => queueMicrotask(() => { if (!disposed) wake(); }));
  field.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.activeElement?.blur();
    if (active && landed()) active.elapsed = DISPLAY_SECONDS;
    wake();
  });

  function present(item, post, caption) {
    item.post = post;
    item.arrival = null;
    item.bubble.hidden = item.figure.hidden = item.ground.hidden = true;
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

  function prepare(post, fresh, reduced = false) {
    if (disposed || !post || pinned()) return [];
    const other = post.replyTo ?? [...posts].reverse().find(item => item.side !== post.side && item.id !== post.id);
    const speaker = post.side === 'a' ? 0 : 1;
    active = { post, fresh, reduced, speaker, elapsed: 0, revealed: false };
    field.dataset.fresh = String(fresh);
    field.dataset.reduced = String(reduced);
    field.dataset.phase = 'rolling';
    status.textContent = reduced ? '캡슐을 여는 중' : '캡슐이 내려오는 중';
    versus.hidden = true;
    present(slots[speaker], post, post.replyTo ? '받아친 말' : fresh ? '방금' : '지난 대화');
    present(slots[1 - speaker], other, post.replyTo ? '먼저 한 말' : '반대편 의견');
    // Roles remain distinct even when both opinions belong to the same side.
    const first = post.replyTo ? 1 - speaker : speaker;
    return [first, 1 - first].filter(role => slots[role].post).map(role => ({ role, post: slots[role].post }));
  }

  function paint() {
    if (!active) return;
    const ready = landed();
    const time = active.elapsed;
    const first = active.post.replyTo ? 1 - active.speaker : active.speaker;
    const second = 1 - first;
    const turn = active.reduced ? active.speaker : time < 1.4 ? first : time < 2.8 && slots[second].post ? second : active.speaker;
    const motionTime = time < 1.4 ? time : time - 1.4;
    const envelope = ease(motionTime / 0.18) * (1 - ease((motionTime - 0.95) / 0.45));
    field.dataset.turn = turn === 0 ? 'left' : 'right';
    field.dataset.phase = !ready ? slots.some(item => item.arrival) ? 'emerging' : 'rolling' : time >= 3.5 ? 'settled' : time < 1.4 ? 'argue' : 'reply';
    if (ready) status.textContent = active.fresh ? active.post.replyTo ? '방금 받아친 말' : '방금 나온 한마디' : active.post.replyTo ? '지난 받아치기' : '지난 대화';
    else if (slots.some(item => item.arrival)) status.textContent = '캡슐에서 나오는 중';
    versus.hidden = !ready || !slots.every(item => item.post);
    slots.forEach((item, index) => {
      if (!item.arrival) return;
      const p = clamp(item.arrival.elapsed / ENTRY_SECONDS);
      const direction = index ? -1 : 1;
      const speaking = ready && index === turn;
      const moving = ready && !active.reduced && time < 2.8;
      const push = moving ? envelope * (speaking ? 18 : -8) : 0;
      const bounce = moving && speaking ? -Math.abs(Math.sin(motionTime * 13)) * envelope * 5 : 0;
      const tilt = moving ? envelope * (speaking ? -4 : Math.sin(motionTime * 17) * 3) : 0;
      const origin = item.arrival.origin();
      const end = destinations[index];
      const walk = ease((p - 0.18) / 0.82);
      item.slot.style.left = mix(origin.x, end.x, walk) + 'px';
      item.slot.style.top = (mix(origin.y, end.y, ease(p)) - Math.sin(p * Math.PI) * 56) + 'px';
      item.slot.dataset.speaking = String(speaking);
      item.sprite.dataset.pose = speaking ? 'protest' : 'listen';
      item.figure.style.opacity = String(ease(p / 0.12));
      item.figure.style.transform = `translate(${direction * push}px, ${bounce}px) rotate(${direction * tilt}deg) scale(${mix(0.18, 1, ease(p))})`;
      item.ground.style.opacity = String(ease((p - 0.65) / 0.35));
      item.bubble.hidden = p < 1;
      if (index === active.speaker && p >= 1 && !active.revealed) {
        active.revealed = true;
        onReveal(active.post, active.fresh);
      }
    });
  }

  return {
    updateState(nextPosts) { posts = nextPosts; },
    clear() {
      active = null;
      for (const item of slots) present(item, null, '');
      versus.hidden = true;
      field.dataset.phase = 'waiting';
      status.textContent = '첫 한마디를 기다려요';
    },
    prepare,
    emerge(role, origin, reduced = false) {
      const item = slots[role];
      if (disposed || !active || !item?.post || item.arrival) return;
      active.reduced = reduced;
      item.arrival = { elapsed: reduced ? ENTRY_SECONDS : 0, origin: typeof origin === 'function' ? origin : () => origin };
      item.figure.hidden = item.ground.hidden = false;
      if (reduced) active.elapsed = DISPLAY_SECONDS;
      paint();
    },
    setLayout(nextDestinations) {
      destinations = nextDestinations;
      const centerX = (destinations[0].x + destinations[1].x) / 2;
      const centerY = (destinations[0].y + destinations[1].y) / 2;
      field.style.setProperty('--duel-center-x', centerX + 'px');
      field.style.setProperty('--duel-center-y', centerY + 'px');
      paint();
    },
    step(delta, reduced = false) {
      if (!active || disposed || paused || pinned()) return;
      active.reduced = reduced;
      field.dataset.reduced = String(reduced);
      const wasReady = landed();
      for (const item of slots) if (item.arrival) item.arrival.elapsed = reduced ? ENTRY_SECONDS : item.arrival.elapsed + delta;
      if (reduced) active.elapsed = DISPLAY_SECONDS;
      else if (wasReady) active.elapsed += delta;
      paint();
    },
    pinned,
    canReplace(priority = false) { return !pinned() && (!active || landed() && active.elapsed >= DISPLAY_SECONDS || priority && !active.fresh); },
    busy: () => pinned() || !!active && (!landed() || active.elapsed < DISPLAY_SECONDS),
    needsFrame: () => !paused && !pinned() && !!active && (!landed() || active.elapsed < DISPLAY_SECONDS),
    stats: () => ({ duelCharacters: slots.filter(item => item.arrival).length, duelPhase: field.dataset.phase ?? 'waiting', duelPostId: active?.post.id ?? null }),
    setPaused(value) { paused = value; field.dataset.paused = String(value); },
    dispose() { disposed = true; field.remove(); },
  };
}
