import { historyWalkPose, WALKOUT_SECONDS } from './history-walk.js';
import { placeSpeechBubbles } from './speech-layout.js';

const ENTRY_SECONDS = WALKOUT_SECONDS;
const EXIT_SECONDS = 0.18;
const TURN_SECONDS = 3.2;

export function createHistoryConversation(stage, onSelect, onReveal, visuals) {
  const field = document.createElement('section');
  field.className = 'history-conversation';
  field.setAttribute('aria-label', '미끄럼틀에서 나온 지난 대화');
  field.dataset.phPrivate = 'true';
  const slots = ['a', 'a', 'b', 'b'].map((side, index) => {
    const slot = document.createElement('div');
    slot.className = 'history-character';
    slot.dataset.side = side;
    slot.hidden = true;
    slot.setAttribute('aria-hidden', 'true');
    field.append(slot);
    return { side, index: index % 2, slot, post: null, pending: null,
      order: 0, elapsed: 0, departure: null, origin: null, revealed: false };
  });

  const bubbles = slots.map(character => {
    const side = character.side;
    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'history-conversation-speech';
    bubble.dataset.side = side;
    bubble.dataset.phCaptureAttributeAction = 'sparring_reply_start';
    bubble.hidden = true;
    const byline = document.createElement('span');
    byline.className = 'history-conversation-byline';
    const author = document.createElement('strong');
    const context = document.createElement('span');
    const action = document.createElement('span');
    action.className = 'speech-reply-action';
    action.textContent = '↩ 받아치기';
    byline.append(author, context, action);
    const text = document.createElement('span');
    text.className = 'history-conversation-text';
    bubble.append(byline, text); field.append(bubble);
    const item = { side, character, bubble, author, context, text, post: null };
    bubble.addEventListener('click', () => { if (item.post) onSelect(item.post.id); });
    return item;
  });
  stage.append(field);

  let layout = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 }, worldLeft: { x: 0, y: 0, z: 0 }, worldRight: { x: 0, y: 0, z: 0 }, width: 0 };
  let sequence = 0, turnElapsed = 0, speakingSide = 'a';
  let paused = false, visible = true, reduced = false, disposed = false;
  const pinned = () => field.contains(document.activeElement);
  const wake = () => { if (!disposed) stage.dispatchEvent(new Event('historywake')); };
  const latest = side => slots.filter(item => item.side === side && item.post && item.elapsed >= ENTRY_SECONDS && item.departure === null)
    .sort((a, b) => b.order - a.order)[0];

  field.addEventListener('focusout', () => queueMicrotask(wake));
  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') { document.activeElement?.blur(); wake(); }
  });

  function begin(item, entry) {
    item.post = entry.post;
    item.origin = entry.origin;
    item.order = entry.order;
    item.elapsed = reduced ? ENTRY_SECONDS : 0;
    item.departure = null;
    item.pending = null;
    item.revealed = false;
    item.slot.hidden = false;
    item.slot.dataset.postId = String(entry.post.id);
  }

  function paint() {
    for (const item of [...slots].sort((a, b) => a.order - b.order)) {
      if (!item.post || item.elapsed < ENTRY_SECONDS || item.revealed || item.departure !== null) continue;
      item.revealed = true;
      speakingSide = item.side;
      turnElapsed = 0;
      onReveal(item.post, false);
    }
    const shown = { a: latest('a'), b: latest('b') };
    const speaker = shown[speakingSide] ?? shown.a ?? shown.b;
    field.dataset.reduced = String(reduced);
    field.dataset.speakingId = speaker ? String(speaker.post.id) : '';

    for (const [index, item] of slots.entries()) {
      if (!item.post || !visible) { visuals.hide(index); continue; }
      const center = item.side === 'a' ? layout.worldLeft : layout.worldRight;
      const direction = item.side === 'a' ? 1 : -1;
      const destination = { ...center, x: center.x + direction * (item.index === 0 ? 0.9 : -0.9) };
      const frame = historyWalkPose({ origin: item.origin, destination, elapsed: item.elapsed,
        side: item.side, speaking: item === speaker, time: turnElapsed, reduced,
        departure: item.departure === null ? 0 : item.departure / EXIT_SECONDS });
      visuals.draw(index, item.post, frame.position, 1, frame.pose, frame.yaw);
      const point = visuals.project(frame.position);
      item.speechAnchor = visuals.project({ ...frame.position, y: frame.position.y + 2.1 * frame.pose.scale });
      item.slot.style.left = point.x + 'px';
      item.slot.style.top = point.y + 'px';
      item.slot.dataset.speaking = String(item === speaker);
      item.slot.dataset.phase = item.departure === null ? frame.phase : 'leaving';
    }

    const visibleBubbles = [];
    for (const item of bubbles) {
      const character = item.character;
      item.post = character.post && character.elapsed >= ENTRY_SECONDS && character.departure === null ? character.post : null;
      item.bubble.hidden = !item.post || !visible;
      if (item.bubble.hidden) continue;
      if (item.bubble.dataset.postId !== String(item.post.id)) delete item.bubble.dataset.replySelected;
      item.bubble.dataset.postId = String(item.post.id);
      item.bubble.dataset.speaking = String(character === speaker);
      if (item.author.textContent !== item.post.name) item.author.textContent = item.post.name;
      const caption = item.post.replyTo ? '지난 받아치기' : '지난 한마디';
      if (item.context.textContent !== caption) item.context.textContent = caption;
      if (item.text.textContent !== item.post.text) item.text.textContent = item.post.text;
      item.bubble.setAttribute('aria-label', `${item.post.name}, ${item.context.textContent}: ${item.post.text}. 눌러서 받아치기`);
      item.bubble.style.maxWidth = Math.max(0, Math.min(280, layout.width - 16)) + 'px';
      visibleBubbles.push(item);
    }
    const measurements = visibleBubbles.map(item => ({
      headX: item.character.speechAnchor.x, headY: item.character.speechAnchor.y - 12,
      width: item.bubble.offsetWidth || Math.min(240, Math.max(0, layout.width / 2 - 16)),
      height: item.bubble.offsetHeight || 64,
      direction: (item.side === 'a' ? -1 : 1) * (item.character.index === 0 ? -1 : 1),
    }));
    const positions = placeSpeechBubbles(measurements, layout.width);
    visibleBubbles.forEach((item, index) => {
      const width = measurements[index].width;
      item.bubble.style.left = positions[index].center + 'px';
      item.bubble.style.top = item.character.speechAnchor.y - 12 + 'px';
      item.bubble.style.setProperty('--history-bubble-width', width + 'px');
      item.bubble.style.setProperty('--history-tail-x', positions[index].tail + 'px');
    });
  }

  return {
    emerge(post, origin, nextReduced = false) {
      if (disposed || !post || pinned()) return false;
      reduced = nextReduced;
      const existing = slots.find(item => item.post?.id === post.id || item.pending?.post.id === post.id);
      if (existing) {
        if (existing.pending?.post.id === post.id) existing.pending.post = post;
        else {
          existing.post = post; existing.order = ++sequence; speakingSide = existing.side; turnElapsed = 0;
          if (existing.elapsed >= ENTRY_SECONDS && existing.departure === null) onReveal(post, false);
        }
        paint();
        return true;
      }
      const side = post.side === 'b' ? 'b' : 'a';
      const candidates = slots.filter(item => item.side === side);
      const item = candidates.find(candidate => !candidate.post)
        ?? [...candidates].sort((a, b) => (a.pending?.order ?? a.order) - (b.pending?.order ?? b.order))[0];
      const entry = { post, origin: { ...origin }, order: ++sequence };
      if (item.post && !reduced) { item.pending = entry; item.departure = 0; }
      else begin(item, entry);
      paint(); wake();
      return true;
    },
    step(delta, nextReduced = false) {
      if (disposed || paused || !visible || pinned()) return;
      reduced = nextReduced;
      for (const item of slots) {
        if (!item.post) continue;
        if (item.pending) {
          item.departure += delta;
          if (reduced || item.departure >= EXIT_SECONDS) begin(item, item.pending);
        } else item.elapsed = reduced ? ENTRY_SECONDS : Math.min(ENTRY_SECONDS, item.elapsed + delta);
      }
      if (!reduced) {
        turnElapsed += delta;
        if (turnElapsed >= TURN_SECONDS) {
          const other = speakingSide === 'a' ? 'b' : 'a';
          if (latest(other)) speakingSide = other;
          turnElapsed = 0;
        }
      }
      paint();
    },
    setLayout(next) { layout = next; paint(); },
    setPaused(value) { paused = value; field.dataset.paused = String(value); },
    setVisible(value) {
      visible = value;
      if (!value && pinned()) document.activeElement?.blur();
      field.hidden = !value;
      paint();
    },
    pinned,
    needsFrame: () => !disposed && !paused && visible && !pinned()
      && slots.some(item => item.post && (item.pending || item.elapsed < ENTRY_SECONDS || !reduced)),
    stats: () => ({ historyCharacters: slots.filter(item => item.post).length,
      historyPostIds: slots.filter(item => item.post).map(item => item.post.id),
      historySpeakingId: (latest(speakingSide) ?? latest('a') ?? latest('b'))?.post.id ?? null,
      historyArriving: slots.filter(item => item.post && (item.pending || item.elapsed < ENTRY_SECONDS)).length }),
    dispose() { disposed = true; slots.forEach((_, index) => visuals.hide(index)); field.remove(); },
  };
}
