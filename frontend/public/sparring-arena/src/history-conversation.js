import { historyWalkPose, historyExitPose, WALKOUT_SECONDS, EXIT_SECONDS } from './history-walk.js';
import { placeSpeechBubbles } from './speech-layout.js';
import { createSpeechCue } from './speech-cue.js';

const ENTRY_SECONDS = WALKOUT_SECONDS;
export const HISTORY_MODEL_CAPACITY = 8;
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
    return { side, index: index % 2, slot, post: null,
      order: 0, elapsed: 0, origin: null, revealed: false, frame: null, departure: null };
  });

  const departures = Array(HISTORY_MODEL_CAPACITY - slots.length).fill(null);
  const arrivals = [];

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
    const cue = createSpeechCue(bubble, action);
    byline.append(author, context, action);
    const text = document.createElement('span');
    text.className = 'history-conversation-text';
    bubble.append(byline, text); field.append(bubble);
    const item = { side, character, bubble, author, context, text, cue, post: null };
    bubble.addEventListener('click', () => { if (item.post) { cue.dismiss(); onSelect(item.post.id); } });
    return item;
  });
  stage.append(field);

  let layout = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 }, worldLeft: { x: 0, y: 0, z: 0 }, worldRight: { x: 0, y: 0, z: 0 }, width: 0 };
  let sequence = 0, turnElapsed = 0, speakingSide = 'a';
  let paused = false, visible = true, speechVisible = true, reduced = false, disposed = false;
  const pinned = () => field.contains(document.activeElement);
  const wake = () => { if (!disposed) stage.dispatchEvent(new Event('historywake')); };
  const latest = side => slots.filter(item => item.side === side && item.post && !item.departure && item.elapsed >= ENTRY_SECONDS)
    .sort((a, b) => b.order - a.order)[0];
  const leaving = () => [...departures.filter(Boolean), ...slots.filter(item => item.departure)];
  function exitDestination(side) {
    const center = side === 'a' ? layout.worldLeft : layout.worldRight;
    return layout[side === 'a' ? 'exitLeft' : 'exitRight']
      ?? { ...center, x: center.x + (side === 'a' ? -12 : 12) };
  }

  field.addEventListener('focusout', () => queueMicrotask(wake));
  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') { document.activeElement?.blur(); wake(); }
  });

  function begin(item, entry) {
    item.post = entry.post;
    item.origin = entry.origin;
    item.order = entry.order;
    item.elapsed = reduced ? ENTRY_SECONDS : 0;
    item.revealed = false;
    item.slot.hidden = false;
    item.slot.dataset.postId = String(entry.post.id);
  }

  function admit() {
    while (arrivals.length) {
      const entry = arrivals[0];
      // A replay of someone still walking out waits until their departure finishes.
      if (leaving().some(item => item.post.id === entry.post.id)) break;
      const candidates = slots.filter(item => !item.departure && item.side === (entry.post.side === 'b' ? 'b' : 'a')
        && (!item.post || reduced || item.elapsed >= ENTRY_SECONDS));
      const item = candidates.find(candidate => !candidate.post)
        ?? [...candidates].sort((a, b) => a.order - b.order)[0];
      if (!item) break;
      if (item.post && !reduced) {
        const index = departures.indexOf(null);
        if (index < 0) break;
        departures[index] = { post: item.post, side: item.side, origin: item.frame, elapsed: 0 };
      }
      arrivals.shift();
      begin(item, entry);
      paint();
    }
  }

  function paint() {
    for (const item of [...slots].sort((a, b) => a.order - b.order)) {
      if (!item.post || item.departure || item.elapsed < ENTRY_SECONDS || item.revealed) continue;
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
      if (!item.post) { visuals.hide(index); continue; }
      const center = item.side === 'a' ? layout.worldLeft : layout.worldRight;
      const direction = item.side === 'a' ? 1 : -1;
      const destination = { ...center, x: center.x + direction * (item.index === 0 ? 1 : -1) * (layout.characterGap ?? 0.9) };
      const frame = item.departure
        ? historyExitPose({ ...item.departure, destination: exitDestination(item.side), reduced })
        : historyWalkPose({ origin: item.origin, destination, elapsed: item.elapsed,
        side: item.side, speaking: item === speaker, time: turnElapsed, reduced, standingScale: layout.characterScale });
      item.frame = frame;
      if (!visible) { visuals.hide(index); continue; }
      visuals.draw(index, item.post, frame.position, 1, frame.pose, frame.yaw);
      const point = visuals.project(frame.position);
      item.speechAnchor = visuals.project({ ...frame.position, y: frame.position.y + 2.1 * frame.pose.scale });
      item.slot.style.left = point.x + 'px';
      item.slot.style.top = point.y + 'px';
      item.slot.dataset.speaking = String(item === speaker);
      item.slot.dataset.phase = frame.phase;
    }

    for (const [offset, item] of departures.entries()) {
      const index = slots.length + offset;
      if (!item || !visible) { visuals.hide(index); continue; }
      const frame = historyExitPose({ origin: item.origin, destination: exitDestination(item.side), elapsed: item.elapsed, reduced });
      visuals.draw(index, item.post, frame.position, 1, frame.pose, frame.yaw);
    }

    const visibleBubbles = [];
    for (const item of bubbles) {
      const character = item.character;
      item.post = character.post && !character.departure && character.elapsed >= ENTRY_SECONDS ? character.post : null;
      item.bubble.hidden = !item.post || !visible || !speechVisible;
      if (item.bubble.hidden) continue;
      if (item.bubble.dataset.postId !== String(item.post.id)) delete item.bubble.dataset.replySelected;
      item.bubble.dataset.postId = String(item.post.id);
      item.cue.present(item.post.id);
      item.bubble.dataset.speaking = String(character === speaker);
      if (item.author.textContent !== item.post.name) item.author.textContent = item.post.name;
      const caption = item.post.replyTo ? '지난 받아치기' : '지난 한마디';
      if (item.context.textContent !== caption) item.context.textContent = caption;
      if (item.text.textContent !== item.post.text) item.text.textContent = item.post.text;
      item.bubble.setAttribute('aria-label', `${item.post.name}, ${item.context.textContent}: ${item.post.text}. 눌러서 받아치기`);
      item.bubble.style.setProperty('--history-available-width', Math.max(0, (layout.width - 26) / 2) + 'px');
      visibleBubbles.push(item);
    }
    field.dataset.bubbleCount = String(visibleBubbles.length);
    const measurements = visibleBubbles.map(item => ({
      headX: item.character.speechAnchor.x, headY: item.character.speechAnchor.y - 12,
      width: item.bubble.offsetWidth || Math.min(240, Math.max(0, layout.width / 2 - 16)),
      height: item.bubble.offsetHeight || 64,
      direction: (item.side === 'a' ? -1 : 1) * (item.character.index === 0 ? -1 : 1),
    }));
    const stageBounds = stage.getBoundingClientRect();
    const obstacles = [...(stage.parentElement?.querySelectorAll('.composer-avatar[aria-expanded="false"] .composer-hint, .composer-device[data-expanded="true"] .composer-field') ?? [])]
      .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({ left: rect.left - stageBounds.left, right: rect.right - stageBounds.left,
        top: rect.top - stageBounds.top, bottom: rect.bottom - stageBounds.top }));
    const positions = placeSpeechBubbles(measurements, layout.width, obstacles);
    visibleBubbles.forEach((item, index) => {
      const width = measurements[index].width;
      item.bubble.style.left = positions[index].center + 'px';
      item.bubble.style.top = positions[index].bottom + 'px';
      item.bubble.style.setProperty('--speech-depth', String(2 + positions.filter(position => position.bottom < positions[index].bottom).length));
      item.bubble.style.setProperty('--history-bubble-width', width + 'px');
      item.bubble.style.setProperty('--history-tail-x', positions[index].tail + 'px');
      item.cue.layout(width, measurements[index].height, positions[index].tail, positions[index].tailTip, positions[index].tailHeight);
    });
  }

  return {
    emerge(post, origin, nextReduced = false) {
      if (disposed || !post || pinned()) return false;
      reduced = nextReduced;
      const existing = slots.find(item => !item.departure && item.post?.id === post.id);
      if (existing) {
        existing.post = post; existing.order = ++sequence; speakingSide = existing.side; turnElapsed = 0;
        if (existing.elapsed >= ENTRY_SECONDS) onReveal(post, false);
        paint();
        return true;
      }
      const waiting = arrivals.find(entry => entry.post.id === post.id);
      if (waiting) waiting.post = post;
      else arrivals.push({ post, origin: { ...origin }, order: ++sequence });
      admit();
      wake();
      return true;
    },
    leaveAll(nextReduced = false) {
      if (disposed) return;
      reduced = nextReduced;
      arrivals.length = 0;
      if (pinned()) document.activeElement?.blur();
      if (reduced) departures.fill(null);
      for (const item of slots) {
        if (!item.post) continue;
        if (reduced) { item.post = null; item.departure = null; item.slot.hidden = true; }
        else item.departure ??= { origin: item.frame, elapsed: 0 };
      }
      paint();
      wake();
    },
    step(delta, nextReduced = false) {
      if (disposed || paused || !visible || pinned()) return;
      reduced = nextReduced;
      for (const [index, item] of departures.entries()) {
        if (!item) continue;
        item.elapsed += delta;
        if (reduced || item.elapsed >= EXIT_SECONDS) {
          departures[index] = null;
          visuals.hide(slots.length + index);
        }
      }
      for (const item of slots) {
        if (item.departure) {
          item.departure.elapsed += delta;
          if (reduced || item.departure.elapsed >= EXIT_SECONDS) {
            item.post = null; item.departure = null; item.slot.hidden = true;
          }
          continue;
        }
        if (item.post) item.elapsed = reduced ? ENTRY_SECONDS : Math.min(ENTRY_SECONDS, item.elapsed + delta);
      }
      if (arrivals.length) { paint(); admit(); }
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
    setVisible(value, { speech = value } = {}) {
      if (visible === value && speechVisible === speech) return;
      visible = value;
      speechVisible = speech;
      if ((!value || !speech) && pinned()) document.activeElement?.blur();
      field.hidden = !value;
      paint();
    },
    pinned,
    canAccept: () => !arrivals.length && !slots.some(item => item.departure) && departures.includes(null),
    needsFrame: () => !disposed && !paused && visible && !pinned()
      && (arrivals.length > 0 || departures.some(Boolean) || slots.some(item => item.post && (item.elapsed < ENTRY_SECONDS || !reduced))),
    stats: () => ({ historyCharacters: slots.filter(item => item.post && !item.departure).length,
      historyPostIds: slots.filter(item => item.post && !item.departure).map(item => item.post.id),
      historySpeakingId: (latest(speakingSide) ?? latest('a') ?? latest('b'))?.post.id ?? null,
      historyLeaving: leaving().length,
      historyLeavingPostIds: leaving().map(item => item.post.id),
      historyArriving: arrivals.length + leaving().length + slots.filter(item => item.post && !item.departure && item.elapsed < ENTRY_SECONDS).length }),
    dispose() { disposed = true; arrivals.length = 0; departures.fill(null);
      for (let index = 0; index < HISTORY_MODEL_CAPACITY; index++) visuals.hide(index);
      field.remove(); },
  };
}
