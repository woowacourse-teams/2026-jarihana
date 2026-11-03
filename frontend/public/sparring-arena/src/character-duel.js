import { characterVariant } from './character-motion.js';
import { placeSpeechBubbles } from './speech-layout.js';
import { createSpeechCue } from './speech-cue.js';
import { chairBattlePose, CHAIR_BATTLE_SECONDS } from './chair-battle-motion.js';

const ENTRY_SECONDS = 0.95;
const DISPLAY_SECONDS = CHAIR_BATTLE_SECONDS;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function createCharacterDuel(stage, onSelect, onReveal, visuals) {
  const field = document.createElement('section');
  field.className = 'character-duel';
  field.setAttribute('aria-label', '캡슐에서 나온 두 의견');
  field.dataset.phPrivate = 'true';
  const versus = document.createElement('span');
  versus.className = 'duel-versus';
  versus.textContent = 'VS';
  versus.hidden = true;
  versus.setAttribute('aria-hidden', 'true');
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
    const action = document.createElement('span');
    action.className = 'speech-reply-action';
    const cue = createSpeechCue(bubble, action);
    byline.append(author, context, action);
    const text = document.createElement('span');
    text.className = 'duel-speech-text';
    bubble.append(byline, text);
    const figure = document.createElement('div');
    figure.className = 'duel-figure';
    figure.setAttribute('aria-hidden', 'true');
    figure.hidden = true;
    const ground = document.createElement('span');
    ground.className = 'duel-ground';
    ground.setAttribute('aria-hidden', 'true');
    ground.hidden = true;
    slot.append(bubble, ground, figure); field.append(slot);
    return { slot, bubble, author, context, text, cue, figure, ground, post: null, arrival: null };
  });
  field.append(versus); stage.append(field);
  let posts = [], active = null, paused = false, disposed = false;
  let destinations = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  let stageWidth = stage.clientWidth;
  const wake = () => stage.dispatchEvent(new Event('duelwake'));
  const pinned = () => field.contains(document.activeElement);
  const landed = () => !!active && slots.every(item => !item.post || item.arrival?.elapsed >= ENTRY_SECONDS);

  for (const item of slots) item.bubble.addEventListener('click', () => { if (item.post) { item.cue.dismiss(); onSelect(item.post.id); } });
  field.addEventListener('focusout', () => queueMicrotask(() => { if (!disposed) wake(); }));
  field.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.activeElement?.blur();
    if (active && landed()) active.elapsed = DISPLAY_SECONDS;
    wake();
  });

  function present(item, post, caption) {
    item.post = post;
    delete item.bubble.dataset.replySelected;
    item.arrival = null;
    item.bubble.hidden = item.figure.hidden = item.ground.hidden = true;
    visuals?.hide(slots.indexOf(item));
    item.slot.dataset.speaking = 'false';
    if (!post) return;
    item.slot.dataset.side = post.side;
    item.figure.dataset.variant = String(characterVariant(post));
    item.author.textContent = post.name;
    item.context.textContent = caption;
    item.text.textContent = post.text;
    item.bubble.dataset.postId = post.id;
    item.cue.present(post.id);
    item.bubble.setAttribute('aria-label', `${post.name}, ${caption}: ${post.text}. 눌러서 받아치기`);
    item.bubble.dataset.phCaptureAttributeAction = 'sparring_reply_start';
  }

  function prepare(post, fresh, reduced = false) {
    if (disposed || !post || pinned()) return [];
    const other = post.replyTo ?? [...posts].reverse().find(item => item.side !== post.side && item.id !== post.id);
    const speaker = post.side === 'a' ? 0 : 1;
    active = { post, fresh, reduced, speaker, elapsed: 0, revealed: false };
    field.dataset.fresh = String(fresh);
    field.dataset.reduced = String(reduced);
    field.dataset.phase = 'rolling';
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
    const opposed = slots.every(item => item.post) && slots[0].post.side !== slots[1].post.side;
    const size = parseFloat(getComputedStyle(field).getPropertyValue('--duel-figure-size')) || 180;
    const distance = Math.abs(destinations[1].x - destinations[0].x);
    const motions = slots.map((_, index) => chairBattlePose({ time, index, speaker: active.speaker, opposed, reduced: active.reduced, size, distance }));
    const turn = motions[0].attacker ?? (time < 1.4 ? first : active.speaker);
    field.dataset.turn = turn === 0 ? 'left' : 'right';
    field.dataset.phase = !ready ? slots.some(item => item.arrival) ? 'emerging' : 'rolling' : motions[0].phase === 'settled' ? 'settled' : turn === first ? 'argue' : 'reply';
    field.dataset.chairPhase = ready ? motions[0].phase : 'arriving';
    versus.hidden = !ready || !slots.every(item => item.post) || ['thrust', 'slam', 'throw', 'recover'].includes(motions[0].phase);
    const visibleBubbles = [], chairBounds = [];
    slots.forEach((item, index) => {
      if (!item.arrival) return;
      const p = clamp(item.arrival.elapsed / ENTRY_SECONDS);
      const speaking = ready && index === turn;
      const motion = ready ? motions[index] : chairBattlePose({ index, opposed: false });
      const origin = item.arrival.origin();
      const end = destinations[index];
      const walk = ease((p - 0.18) / 0.82);
      const x = mix(origin.x, end.x, walk) + motion.x;
      item.slot.style.left = x + 'px';
      item.slot.style.top = (mix(origin.y, end.y, ease(p)) - Math.sin(p * Math.PI) * 56 + motion.y) + 'px';
      item.slot.dataset.speaking = String(speaking);
      item.figure.dataset.pose = motion.phase;
      item.figure.style.opacity = String(ease(p / 0.12));
      const scale = mix(0.18, 1, ease(p));
      item.figure.style.transform = `scale(${scale})`;
      const chair = visuals?.draw(index, item.post, { x, y: parseFloat(item.slot.style.top), size, scale, motion });
      if (chair) chairBounds.push(chair);
      item.ground.style.opacity = String(ease((p - 0.65) / 0.35));
      item.bubble.hidden = p < 1;
      if (stageWidth > 0 && !item.bubble.hidden) {
        item.bubble.style.setProperty('--duel-available-width', Math.max(0, (stageWidth - 26) / 2) + 'px');
        visibleBubbles.push({ item, x, headX: x,
          headY: parseFloat(item.slot.style.top) + size * 0.1 * motion.seated, direction: index ? 1 : -1 });
      }
      if (index === active.speaker && p >= 1 && !active.revealed) {
        active.revealed = true;
        onReveal(active.post, active.fresh);
      }
    });
    const measurements = visibleBubbles.map(({ item, headX, headY, direction }) => ({
      headX, headY: headY - item.figure.offsetHeight * 0.9 - 12,
      width: item.bubble.offsetWidth || Math.min(240, Math.max(0, stageWidth / 2 - 24)),
      height: item.bubble.offsetHeight || 64, direction,
    }));
    const positions = placeSpeechBubbles(measurements, stageWidth, chairBounds);
    visibleBubbles.forEach(({ item, x }, index) => {
      item.bubble.style.left = positions[index].center - x + 'px';
      item.bubble.style.top = positions[index].bottom - parseFloat(item.slot.style.top) + 'px';
      item.bubble.style.setProperty('--speech-depth', String(2 + positions.filter(position => position.bottom < positions[index].bottom).length));
      item.bubble.style.setProperty('--duel-bubble-width', measurements[index].width + 'px');
      item.bubble.style.setProperty('--duel-tail-x', positions[index].tail + 'px');
      item.cue.layout(measurements[index].width, measurements[index].height, positions[index].tail, positions[index].tailTip, positions[index].tailHeight);
    });
  }

  return {
    updateState(nextPosts) { posts = nextPosts; },
    clear() {
      active = null;
      for (const item of slots) present(item, null, '');
      versus.hidden = true;
      field.dataset.phase = field.dataset.chairPhase = 'waiting';
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
    setLayout(nextDestinations, width = stage.clientWidth) {
      destinations = nextDestinations;
      stageWidth = width;
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
    stats: () => ({ duelCharacters: slots.filter(item => item.arrival).length, duelPhase: field.dataset.phase ?? 'waiting', chairPhase: field.dataset.chairPhase ?? 'waiting', duelPostId: active?.post.id ?? null }),
    setPaused(value) { paused = value; field.dataset.paused = String(value); },
    dispose() { disposed = true; visuals?.dispose(); field.remove(); },
  };
}
