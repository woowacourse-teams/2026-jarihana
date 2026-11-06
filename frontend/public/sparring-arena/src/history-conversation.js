import { historyWalkPose, historyExitPose, WALKOUT_SECONDS, EXIT_SECONDS } from './history-walk.js';
import { placeSpeechBubbles } from './speech-layout.js';
import { createSpeechCue } from './speech-cue.js';
import { createCharacterGrab } from './character-grab.js';
import { createCheerAssignments, historyCheerPose, CHEER_TRANSITION_SECONDS } from './history-cheer.js';
import { createBrawlAssignments, brawlFormationSpot, historyBrawlPose, stepBrawlMotions, brawlLocomotionPose, brawlDepthScale } from './history-brawl.js';
import { smoothBrawlFrame } from './brawl-transition.js';
import { heldReactionPose } from './held-reactions.js';
import { releasedCharacterPose, landingDuration } from './character-landing.js';

const ENTRY_SECONDS = WALKOUT_SECONDS;
const CHARACTERS_PER_SIDE = 4;
export const BRAWL_PER_SIDE = 8;
export const HISTORY_MODEL_CAPACITY = BRAWL_PER_SIDE * 4;
const TURN_SECONDS = 1.8;
const PICKUP_SECONDS = .22;

function sameAuthor(left, right) {
  return left?.authorId != null && left.authorId !== '' && right?.authorId != null
    && String(left.authorId) === String(right.authorId) && left.side === right.side;
}

function postAge(createdAt, now) {
  if (!Number.isFinite(createdAt)) return '';
  const minutes = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function createHistoryConversation(stage, onSelect, onReveal, visuals) {
  const field = document.createElement('section');
  field.className = 'history-conversation';
  field.setAttribute('aria-label', '마당에서 나누는 지난 대화');
  field.dataset.phPrivate = 'true';
  field.dataset.speechOverlap = 'false';
  const slots = Array.from({ length: BRAWL_PER_SIDE * 2 }, (_, index) => {
    const side = index < BRAWL_PER_SIDE ? 'a' : 'b';
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'history-character';
    slot.dataset.side = side;
    slot.hidden = true;
    slot.dataset.phCaptureAttributeAction = 'sparring_character_grab';
    slot.setAttribute('aria-pressed', 'false');
    slot.title = '누른 채 끌어서 옮기기 · 키보드: Enter로 집기, 방향키로 이동, Esc로 취소';
    field.append(slot);
    return { side, index: index % BRAWL_PER_SIDE, slot, post: null,
      order: 0, elapsed: 0, readElapsed: 0, origin: null, revealed: false, frame: null, departure: null, motion: null, cheerAmount: 0 };
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
    bubble.title = '클릭해서 받아치기 · 누른 채 끌어서 캐릭터 집기';
    bubble.hidden = true;
    const byline = document.createElement('span');
    byline.className = 'history-conversation-byline';
    const author = document.createElement('strong');
    const context = document.createElement('span');
    context.className = 'history-conversation-time';
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
  const hand = document.createElement('div');
  hand.className = 'history-grab-hand';
  hand.setAttribute('aria-hidden', 'true');
  hand.hidden = true;
  stage.ownerDocument.body.append(hand);
  stage.append(field);

  let layout = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 }, worldLeft: { x: 0, y: 0, z: 0 }, worldRight: { x: 0, y: 0, z: 0 }, width: 0 };
  let sequence = 0, turnElapsed = 0, readingElapsed = 0, speakingSide = 'a';
  let paused = false, visible = true, speechVisible = true, reduced = false, disposed = false;
  let cheering = false, cheerAmount = 0, cheerTime = 0, cheerAssignments = [];
  let brawling = false, brawlTime = 0, brawlAssignments = [];
  let speechOverlap = false;
  let characterLimits = { a: null, b: null };
  let hovered = null;
  const sideCapacity = side => characterLimits[side] ?? (brawling ? BRAWL_PER_SIDE : CHARACTERS_PER_SIDE);
  const pinned = () => !!grab.active() || field.contains(document.activeElement);
  const settling = () => slots.some(item => item.grab?.dropping);
  const wake = () => { if (!disposed) stage.dispatchEvent(new Event('historywake')); };
  const latest = side => slots.filter(item => item.side === side && item.post && !item.departure && item.elapsed >= ENTRY_SECONDS)
    .sort((a, b) => b.order - a.order)[0];
  const leaving = () => [...departures.filter(Boolean), ...slots.filter(item => item.departure)];
  const authorSlot = post => slots.find(item => !item.departure && sameAuthor(item.post, post));
  const invalidateMeasurements = () => { for (const item of bubbles) item.measurement = null; };
  const refreshMeasurements = () => {
    if (disposed) return;
    invalidateMeasurements(); paint(); wake();
  };
  const measurementObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    if (disposed) return;
    for (const entry of entries) {
      if (entry.target === stage) invalidateMeasurements();
      else {
        const item = bubbles.find(candidate => candidate.bubble === entry.target);
        if (item) item.measurement = null;
      }
    }
    paint(); wake();
  });
  measurementObserver?.observe(stage);
  for (const item of bubbles) measurementObserver?.observe(item.bubble);
  window.addEventListener('resize', refreshMeasurements);
  const fonts = stage.ownerDocument.fonts;
  fonts?.addEventListener('loadingdone', refreshMeasurements);
  fonts?.ready.then(refreshMeasurements);
  function exitDestination(side) {
    const center = side === 'a' ? layout.worldLeft : layout.worldRight;
    return layout[side === 'a' ? 'exitLeft' : 'exitRight']
      ?? { ...center, x: center.x + (side === 'a' ? -12 : 12) };
  }

  function followHand(held) {
    const head = visuals.unprojectHold(held.screen, held.reference);
    if (head && [head.x, head.y, head.z].every(Number.isFinite)) {
      held.position = { ...head, y: head.y - 2.08 * held.scale };
    }
  }

  function landingPosition(held, screen = held.screen) {
    const floor = visuals.unproject(screen, held.origin.y) ?? held.origin;
    const centerX = (layout.worldLeft.x + layout.worldRight.x) / 2;
    const centerZ = (layout.worldLeft.z + layout.worldRight.z) / 2 - 1;
    const z = Math.max(centerZ - (brawling ? 0.4 : 1.8), Math.min(centerZ + 6.8, floor.z));
    if (screen !== held.screen) {
      const ground = visuals.project({ x: centerX, y: held.origin.y, z });
      const target = visuals.unproject({ x: screen.x, y: ground.y }, held.origin.y) ?? floor;
      const halfWidth = layout.floorHalfWidth ?? 4.8;
      return { x: Math.max(-halfWidth, Math.min(halfWidth, target.x)), y: held.origin.y, z };
    }
    const halfWidth = 4.8 * brawlDepthScale(z, { cameraZ: layout.cameraZ, referenceZ: centerZ + 1 });
    return { x: Math.max(centerX - halfWidth, Math.min(centerX + halfWidth, floor.x)), y: held.origin.y, z };
  }

  function releaseFlight(held) {
    if (!held.pointerVelocity) return null;
    const freshness = Math.max(0, 1 - (performance.now() - held.lastMoveAt) / 120);
    const x = held.pointerVelocity.x * freshness, y = held.pointerVelocity.y * freshness;
    const speed = Math.hypot(x, y);
    if (speed < 350) return null;
    const limit = Math.min(1, 1800 / speed), vx = x * limit, vy = y * limit;
    const from = visuals.unprojectHold(held.screen, held.reference);
    const to = visuals.unprojectHold({ x: held.screen.x + vx * .05, y: held.screen.y + vy * .05 }, held.reference);
    if (!from || !to) return null;
    const velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (to[axis] - from[axis]) / .05 * .7]));
    if (!Object.values(velocity).every(Number.isFinite)) return null;
    const worldLimit = Math.min(1, 16 / Math.hypot(velocity.x, velocity.y, velocity.z));
    for (const axis of ['x', 'y', 'z']) velocity[axis] *= worldLimit;
    return {
      duration: .42 + Math.min(1, (speed - 350) / 1450) * .18,
      velocity,
      screen: { x: Math.max(28, Math.min(layout.width - 28, held.screen.x + vx * .18)),
        y: Math.max(48, Math.min(held.height - 112, held.screen.y + vy * .18)) },
    };
  }

  function paintDust(item, progress, bounds) {
    if (!item.dust) {
      item.dust = document.createElement('div');
      item.dust.className = 'history-landing-dust';
      item.dust.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < 6; index++) item.dust.append(document.createElement('i'));
      stage.ownerDocument.body.append(item.dust);
    }
    const point = visuals.project(item.grab.landing);
    const head = visuals.project({ ...item.grab.landing, y: item.grab.landing.y + 2.08 * item.grab.originalScale });
    const size = Math.max(.7, Math.min(1.6, Math.abs(point.y - head.y) / 44));
    item.dust.hidden = false;
    item.dust.style.left = bounds.left + point.x + 'px';
    item.dust.style.top = bounds.top + point.y + 'px';
    item.dust.style.opacity = String(.85 * (1 - progress) ** 1.5);
    for (const [index, puff] of [...item.dust.children].entries()) {
      const angle = index * Math.PI / 3;
      const spread = (8 + progress * 36) * size;
      puff.style.transform = `translate(${Math.cos(angle) * spread}px, ${Math.sin(angle) * spread * .3 - progress * 14 * size}px) scale(${size * (.7 + progress * .8)})`;
    }
  }

  function clearHover() {
    if (!hovered) return;
    if (hovered.motion) hovered.motion.yaw = hovered.frame.yaw;
    hovered.smoothedBrawl = { frame: hovered.frame, time: brawlTime };
    hovered.hover = null;
    hovered.slot.dataset.hovered = 'false';
    hovered = null;
  }

  function hoverContains(item, event) {
    const speech = bubbles.find(candidate => candidate.character === item).bubble;
    return [item.slot, speech].some(element => {
      if (element.hidden) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
  }

  function hoverCharacter(item, event) {
    if (event.pointerType === 'touch' || event.buttons || grab.active() || settling() || item.slot.disabled || !visible || !speechVisible || cheering || !item.frame) return;
    if (hovered === item || hovered && hoverContains(hovered, event)) return;
    clearHover();
    hovered = item;
    item.hover = { frame: { ...item.frame, pose: { ...item.frame.pose, speaking: false } }, time: 0 };
    item.slot.dataset.hovered = 'true';
    paint(); wake();
  }

  const grab = createCharacterGrab(field, {
    start(item, pointer) {
      if (!visible || !speechVisible || cheering || settling() || !item.post || item.departure || item.elapsed < ENTRY_SECONDS
        || !visuals.unproject || !visuals.unprojectHold) return false;
      const startFrame = { ...item.frame, position: { ...item.frame.position }, pose: { ...item.frame.pose } };
      clearHover();
      const origin = { ...item.frame.position, y: layout.worldLeft.y };
      const originalScale = item.frame.pose.scale;
      const reference = { ...origin, y: origin.y + 2.08 * originalScale };
      const head = visuals.project(reference), feet = visuals.project(origin);
      const height = stage.clientHeight || 900;
      const targetHeight = Math.max(160, Math.min(200, height * .25));
      const scale = originalScale * Math.max(2.4, Math.min(5, targetHeight / Math.max(1, feet.y - head.y)));
      item.grab = { position: { ...origin }, origin, reference, screen: pointer ?? { x: head.x, y: head.y - 40 },
        originalScale, scale, yaw: item.frame.yaw, time: 0, angle: 0, velocity: 0, dropping: false,
        shake: 0, agitation: 0, lastMoveAt: performance.now(), lastDx: 0, lastDy: 0,
        chair: brawling && item.frame.brawlStyle?.startsWith('chair-'), startFrame, pointerGrab: !!pointer,
        height };
      followHand(item.grab);
      field.dataset.grabbing = 'true';
      return true;
    },
    move(item, dx, dy) {
      const held = item.grab;
      const previousScreen = { ...held.screen };
      held.screen.x = Math.max(28, Math.min(layout.width - 28, held.screen.x + dx));
      held.screen.y = Math.max(48, Math.min(held.height - 112, held.screen.y + dy));
      held.velocity = reduced ? 0 : Math.max(-5, Math.min(5, held.velocity - dx * 0.055));
      const now = performance.now();
      const elapsed = Math.max(1 / 120, (now - held.lastMoveAt) / 1000);
      const speed = Math.hypot(dx, dy) / elapsed;
      const reversed = dx * held.lastDx + dy * held.lastDy < 0;
      if (held.pointerGrab) {
        const dt = Math.min(.05, elapsed);
        const velocity = { x: (held.screen.x - previousScreen.x) / dt, y: (held.screen.y - previousScreen.y) / dt };
        const amount = !held.pointerVelocity || reversed || elapsed > .12 ? 1 : 1 - Math.exp(-elapsed * 35);
        held.pointerVelocity = { x: (held.pointerVelocity?.x ?? 0) * (1 - amount) + velocity.x * amount,
          y: (held.pointerVelocity?.y ?? 0) * (1 - amount) + velocity.y * amount };
      }
      const strength = Math.max(0, Math.min(1, (speed - 200) / 1800));
      if (!reduced) held.shake = Math.max(held.shake, strength * (reversed ? 1 : 0.6));
      held.lastMoveAt = now; held.lastDx = dx; held.lastDy = dy;
      followHand(held);
    },
    end(item, cancelled) {
      if (!item.grab) return;
      const held = item.grab;
      const flight = cancelled || reduced || paused ? null : releaseFlight(held);
      const position = cancelled ? { ...held.origin } : landingPosition(held, flight?.screen);
      if (flight) {
        const distance = position.x - item.frame.position.x;
        const maximum = flight.velocity.x * distance > 0 ? 2 * Math.abs(distance) / flight.duration : 0;
        flight.velocity.x = Math.sign(flight.velocity.x) * Math.min(Math.abs(flight.velocity.x), maximum);
      }
      item.placement = position;
      if (item.motion) Object.assign(item.motion, { position, phase: 'idle', phaseTime: 0, recoilRemaining: 0,
        targetKey: undefined, returningFromThrow: !!flight });
      if (cancelled || reduced || paused) item.grab = null;
      else Object.assign(held, { landing: position, position: { ...item.frame.position }, scale: item.frame.pose.scale,
        lastFrame: item.frame, flight, dropping: true, time: 0 });
      if (!cancelled && document.activeElement === item.slot) item.slot.blur();
      field.dataset.grabbing = 'false';
    },
    wake: () => { paint(); wake(); },
  });
  const hoverListeners = slots.map(item => {
    grab.bind(item.slot, item);
    const speech = bubbles.find(candidate => candidate.character === item).bubble;
    grab.bind(speech, item, { dragOnly: true });
    const enter = event => hoverCharacter(item, event);
    const leave = event => {
      if (hovered !== item || hoverContains(item, event)) return;
      if (event.relatedTarget instanceof Node && (item.slot.contains(event.relatedTarget)
        || !speech.hidden && speech.contains(event.relatedTarget))) return;
      clearHover(); paint(); wake();
    };
    item.slot.addEventListener('pointerenter', enter);
    item.slot.addEventListener('pointerleave', leave);
    speech.addEventListener('pointerleave', leave);
    return () => { item.slot.removeEventListener('pointerenter', enter); item.slot.removeEventListener('pointerleave', leave);
      speech.removeEventListener('pointerleave', leave); };
  });
  const moveHover = event => {
    if (!hovered || event.pointerType === 'touch' || hoverContains(hovered, event)) return;
    clearHover();
    const next = event.target instanceof Node && slots.find(item => item.slot.contains(event.target));
    if (next) hoverCharacter(next, event);
    paint(); wake();
  };
  const blurHover = () => { clearHover(); paint(); wake(); };
  const hideHover = () => { if (document.hidden) blurHover(); };
  window.addEventListener('blur', blurHover);
  window.addEventListener('pointermove', moveHover);
  document.addEventListener('visibilitychange', hideHover);

  const focusChanged = () => { if (!disposed) { paint(); wake(); } };
  const focusLeft = () => queueMicrotask(focusChanged);
  field.addEventListener('focusin', focusChanged);
  field.addEventListener('focusout', focusLeft);
  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') { document.activeElement?.blur(); wake(); }
  });

  function begin(item, entry) {
    item.post = entry.post;
    item.origin = entry.origin;
    item.order = entry.order;
    item.elapsed = reduced ? ENTRY_SECONDS : 0;
    item.revealed = false;
    item.cheerAmount = 0;
    item.motion = null;
    item.smoothedBrawl = null;
    item.placement = null;
    item.grab = null;
    item.slot.hidden = false;
    item.slot.dataset.postId = String(entry.post.id);
  }

  function trimToCapacity() {
    for (const side of ['a', 'b']) {
      const excess = slots.filter(item => item.side === side && item.post && !item.departure)
        .sort((a, b) => b.order - a.order).slice(sideCapacity(side));
      for (const item of excess) {
        const bubble = bubbles.find(candidate => candidate.character === item).bubble;
        if (bubble.contains(document.activeElement)) document.activeElement.blur();
        if (reduced) { item.post = null; item.slot.hidden = true; }
        else item.departure = { origin: item.frame, elapsed: 0 };
      }
    }
  }

  function admit() {
    if (grab.active() || settling() || cheering || cheerAmount > 0) return;
    while (arrivals.length) {
      const entry = arrivals[0];
      // A replay of someone still walking out waits until their departure finishes.
      if (leaving().some(item => item.post.id === entry.post.id || sameAuthor(item.post, entry.post))) break;
      const existing = authorSlot(entry.post);
      if (existing) {
        // Bring this speaker's current bubble back before finishing its reading time.
        existing.order = entry.order;
        if (existing.elapsed < ENTRY_SECONDS || existing.readElapsed < TURN_SECONDS) { paint(); break; }
        arrivals.shift();
        existing.post = entry.post;
        existing.revealed = false;
        existing.slot.dataset.postId = String(entry.post.id);
        paint();
        continue;
      }
      const side = entry.post.side === 'b' ? 'b' : 'a';
      const sideCount = slots.filter(item => item.post && !item.departure && item.side === side).length;
      const candidates = slots.filter(item => !item.departure && !item.hover && item.side === side
        && (item.post || sideCount < sideCapacity(side))
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
    // Read surrounding geometry before moving characters/bubbles. In overlap mode
    // only the held claw blocks speech, so static obstacle measurements are unused.
    const stageBounds = stage.getBoundingClientRect();
    const obstacles = speechOverlap ? [] : [...(stage.parentElement?.querySelectorAll('.topic, .pipe-meter, .vote-flag, .composer-avatar[aria-expanded="false"] .composer-hint, .composer-device[data-expanded="true"] .composer-field') ?? [])]
      .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({ left: rect.left - stageBounds.left, right: rect.right - stageBounds.left,
        top: rect.top - stageBounds.top, bottom: rect.bottom - stageBounds.top }));
    for (const item of [...slots].sort((a, b) => a.order - b.order)) {
      if (!item.post || item.departure || item.elapsed < ENTRY_SECONDS || item.revealed) continue;
      item.revealed = true;
      item.readElapsed = 0;
      speakingSide = item.side;
      turnElapsed = 0;
      readingElapsed = 0;
      onReveal(item.post, false);
    }
    const shown = { a: latest('a'), b: latest('b') };
    const speaker = shown[speakingSide] ?? shown.a ?? shown.b;
    field.dataset.reduced = String(reduced);
    field.dataset.speakingId = speaker ? String(speaker.post.id) : '';
    const members = side => slots.filter(item => item.post && !item.departure && item.side === side);
    const ranks = { a: members('a'), b: members('b') };
    const focused = visible && speechVisible && !cheering
      ? slots.find(item => item.grab) ?? hovered ?? slots.find(item => !item.slot.disabled && item.slot === document.activeElement)
      : null;

    for (const [index, item] of slots.entries()) {
      item.slot.dataset.focused = String(item === focused);
      if (item.dust) item.dust.hidden = true;
      if (!item.post) { visuals.hide(index); continue; }
      const center = item.side === 'a' ? layout.worldLeft : layout.worldRight;
      const direction = item.side === 'a' ? 1 : -1;
      const gap = layout.characterGap ?? 0.9;
      const rank = Math.max(0, ranks[item.side].indexOf(item));
      const row = rank - (CHARACTERS_PER_SIDE - 1) / 2;
      const spot = brawling ? brawlFormationSpot(item.index, item.side, brawlAssignments[index], 0, true) : null;
      const destination = item.placement ?? (brawling ? { ...center,
        x: (layout.worldLeft.x + layout.worldRight.x) / 2 + spot.x,
        z: Math.max(center.z - 1.4, center.z - 0.2 + spot.z),
      } : { ...center,
        x: center.x - direction * rank * gap * 0.75,
        z: center.z + row * gap * 0.8 });
      let frame = item.departure
        ? historyExitPose({ ...item.departure, destination: exitDestination(item.side), reduced })
        : historyWalkPose({ origin: item.origin, destination, elapsed: item.elapsed,
        side: item.side, speaking: item === speaker, time: turnElapsed, reduced, standingScale: layout.characterScale });
      if (brawling && !item.departure && item.elapsed >= ENTRY_SECONDS) {
        item.motion ??= { position: { ...frame.position }, yaw: spot.yaw };
        frame.pose.scale *= brawlDepthScale(item.motion.position.z, { cameraZ: layout.cameraZ, referenceZ: center.z });
        frame = historyBrawlPose({ ...frame, position: item.motion.position, yaw: item.motion.yaw }, brawlAssignments[index], brawlTime, item.side, reduced, item.motion);
        if (!item.grab) frame = brawlLocomotionPose(frame, item.motion, brawlTime, reduced);
        frame = smoothBrawlFrame(item.smoothedBrawl?.frame, frame, brawlTime - (item.smoothedBrawl?.time ?? brawlTime), reduced);
        item.smoothedBrawl = { frame, time: brawlTime };
      } else if (!item.departure && item.elapsed >= ENTRY_SECONDS && item.cheerAmount > 0) {
        frame = historyCheerPose(frame, cheerAssignments[index], cheerTime, item.cheerAmount, item.side, reduced);
      }
      if (item.hover && !item.departure && !item.grab) {
        const origin = item.hover.frame;
        const facing = visuals.cameraFacing?.(origin.position) ?? 0;
        const turn = Math.atan2(Math.sin(facing - origin.yaw), Math.cos(facing - origin.yaw));
        const amount = reduced ? 1 : 1 - Math.exp(-item.hover.time * 18);
        frame = { ...origin, phase: 'hovered', yaw: origin.yaw + turn * amount };
      }
      if (item.grab && !item.departure) {
        const held = item.grab;
        if (held.dropping) frame = releasedCharacterPose(frame, held);
        else {
          frame = { ...frame, phase: 'held', yaw: 0, position: held.position,
            pose: { ...frame.pose, scale: held.scale, hanging: true, hangAngle: held.angle, lift: 0, speaking: false } };
          frame = heldReactionPose(frame, held.time, held.agitation, held.chair, reduced);
          const progress = reduced ? 1 : Math.min(1, held.time / PICKUP_SECONDS);
          const amount = progress * progress * (3 - 2 * progress);
          if (amount < 1) {
            const from = held.startFrame;
            frame.position = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis,
              from.position[axis] + (frame.position[axis] - from.position[axis]) * amount]));
            frame.yaw = from.yaw + Math.atan2(Math.sin(-from.yaw), Math.cos(-from.yaw)) * amount;
            for (const key of new Set([...Object.keys(from.pose), ...Object.keys(frame.pose)])) {
              if (typeof from.pose[key] === 'number' || typeof frame.pose[key] === 'number') {
                const start = from.pose[key] ?? 0, end = frame.pose[key] ?? 0;
                frame.pose[key] = start + (end - start) * amount;
              }
            }
          }
          frame.pose.hangBlend = amount;
          held.lastFrame = frame;
        }
      }
      item.frame = frame;
      if (!visible) { visuals.hide(index); continue; }
      visuals.draw(index, item.post, frame.position, 1, { ...frame.pose, focused: item === focused }, frame.yaw);
      if (!reduced && frame.pose.landingDust !== undefined) paintDust(item, frame.pose.landingDust, stageBounds);
      const point = visuals.project(frame.position);
      item.speechAnchor = visuals.project({ ...frame.position, y: frame.position.y + (2.1 - 0.2 * (frame.pose.seated ?? 0)) * frame.pose.scale });
      const bodyHeight = Math.max(24, Math.abs(point.y - item.speechAnchor.y));
      item.slot.style.width = Math.max(24, bodyHeight * 0.6) + 'px';
      item.slot.style.height = bodyHeight + 'px';
      item.slot.disabled = !!item.departure || item.elapsed < ENTRY_SECONDS || !speechVisible || cheering;
      item.slot.setAttribute('aria-label', `${item.post.name} 캐릭터 집기`);
      item.slot.style.left = point.x + 'px';
      item.slot.style.top = point.y + 'px';
      item.slot.dataset.speaking = String(item === speaker);
      item.slot.dataset.grabbed = String(grab.active() === item);
      item.slot.setAttribute('aria-pressed', String(grab.active() === item));
      item.slot.dataset.phase = frame.phase;
      item.slot.dataset.cheer = frame.phase === 'cheering' ? cheerAssignments[index].style : '';
      item.slot.dataset.brawlStyle = frame.brawlStyle ?? '';
      item.slot.dataset.heldReaction = frame.heldReaction ?? '';
      item.slot.dataset.agitation = item.grab?.agitation.toFixed(2) ?? '';
      item.slot.dataset.movement = frame.movementPhase ?? '';
    }

    for (const [offset, item] of departures.entries()) {
      const index = slots.length + offset;
      if (!item || !visible) { visuals.hide(index); continue; }
      const frame = historyExitPose({ origin: item.origin, destination: exitDestination(item.side), elapsed: item.elapsed, reduced });
      visuals.draw(index, item.post, frame.position, 1, frame.pose, frame.yaw);
    }

    const visibleBubbles = [], now = Date.now();
    for (const item of bubbles) {
      const character = item.character;
      item.post = character.post && !character.departure && character.elapsed >= ENTRY_SECONDS ? character.post : null;
      item.bubble.hidden = !item.post || !visible || !speechVisible || cheering || cheerAmount > 0;
      item.bubble.dataset.grabbed = String(grab.active() === character);
      item.bubble.dataset.focused = String(character === focused && !item.bubble.hidden);
      if (item.bubble.hidden) { item.measurement = null; continue; }
      if (item.bubble.dataset.postId !== String(item.post.id)) delete item.bubble.dataset.replySelected;
      item.bubble.dataset.postId = String(item.post.id);
      item.cue.present(item.post.id);
      item.bubble.dataset.speaking = String(character === speaker);
      if (item.author.textContent !== item.post.name) item.author.textContent = item.post.name;
      const caption = postAge(item.post.createdAt, now);
      if (item.context.textContent !== caption) item.context.textContent = caption;
      item.context.hidden = !caption;
      if (item.text.textContent !== item.post.text) item.text.textContent = item.post.text;
      item.bubble.setAttribute('aria-label', `${item.post.name}${caption ? `, ${caption}` : ''}: ${item.post.text}. 눌러서 받아치기`);
      visibleBubbles.push(item);
    }
    field.dataset.bubbleCount = String(visibleBubbles.length);
    field.dataset.dense = String(visibleBubbles.length > 4);
    field.dataset.crowded = String(visibleBubbles.length > 8);
    const columns = visibleBubbles.length > 8 && layout.width >= 600 ? 4 : 2;
    const availableWidth = Math.max(0, (layout.width - 16 - (columns - 1) * 10) / columns);
    for (const item of visibleBubbles) {
      const width = availableWidth + 'px';
      if (item.bubble.style.getPropertyValue('--history-available-width') !== width)
        item.bubble.style.setProperty('--history-available-width', width);
    }
    const measurements = visibleBubbles.map(item => {
      const key = JSON.stringify([layout.width, availableWidth, visibleBubbles.length,
        item.author.textContent, item.text.textContent, item.context.textContent, item.bubble.dataset.replySelected]);
      if (item.measurement?.key !== key) item.measurement = {
        key,
        width: item.bubble.offsetWidth || Math.min(layout.width <= 700 ? 150 : 240, availableWidth),
        height: item.bubble.offsetHeight || (layout.width <= 700 || visibleBubbles.length > 8 ? 44 : 64),
      };
      return {
        headX: item.character.speechAnchor.x, headY: item.character.speechAnchor.y - 12,
        width: item.measurement.width, height: item.measurement.height,
        direction: item.side === 'a' ? -1 : 1,
        region: speechOverlap ? undefined : item.side === 'a' ? { left: 8, right: layout.width / 2 - 5 }
          : { left: layout.width / 2 + 5, right: layout.width - 8 },
      };
    });
    const held = grab.active();
    hand.hidden = !held;
    if (held) {
      const head = held.frame.pose.hangBlend < 1
        ? visuals.project({ ...held.frame.position, y: held.frame.position.y + 2.08 * held.frame.pose.scale })
        : held.grab.screen;
      hand.style.left = stageBounds.left + head.x + 'px';
      hand.style.top = stageBounds.top + head.y + 'px';
      hand.style.setProperty('--grab-anger', held.grab.agitation);
      const claw = hand.getBoundingClientRect();
      obstacles.push({ left: claw.left - stageBounds.left, right: claw.right - stageBounds.left,
        top: claw.top - stageBounds.top, bottom: claw.bottom - stageBounds.top, blocking: true });
      const x = parseFloat(held.slot.style.left), y = parseFloat(held.slot.style.top);
      const halfWidth = parseFloat(held.slot.style.height) * 0.8 + 10;
      obstacles.push({ left: x - halfWidth, right: x + halfWidth,
        top: y - parseFloat(held.slot.style.height) - 10, bottom: y + 10 });
    }
    const positions = placeSpeechBubbles(measurements, layout.width, obstacles, {
      allowOverlap: speechOverlap,
      stageHeight: visibleBubbles.length > 8 || held ? stageBounds.height || stage.clientHeight : undefined,
    });
    visibleBubbles.forEach((item, index) => {
      const width = measurements[index].width;
      item.bubble.style.left = positions[index].center + 'px';
      item.bubble.style.top = positions[index].bottom + 'px';
      item.bubble.style.setProperty('--speech-depth', String(2 + positions.filter(position => position.bottom < positions[index].bottom).length));
      item.bubble.style.setProperty('--history-bubble-width', width + 'px');
      item.bubble.style.setProperty('--history-tail-x', positions[index].tail + 'px');
      item.cue.layout(width, measurements[index].height, positions[index].tail, positions[index].tailTip, positions[index].tailHeight, positions[index].tailAbove);
    });
  }

  return {
    setCharacterLimits(value, nextReduced = false) {
      if (disposed || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
        || !['a', 'b'].every(side => Object.hasOwn(value, side) && (value[side] === null
          || Number.isInteger(value[side]) && value[side] >= 1 && value[side] <= BRAWL_PER_SIDE))) return;
      if (value.a === characterLimits.a && value.b === characterLimits.b) return;
      grab.cancel(); clearHover();
      characterLimits = { a: value.a, b: value.b };
      reduced = nextReduced;
      trimToCapacity();
      paint(); wake();
    },
    setSpeechOverlap(value) {
      if (disposed || typeof value !== 'boolean' || speechOverlap === value) return;
      speechOverlap = value;
      field.dataset.speechOverlap = String(value);
      paint(); wake();
    },
    setBrawl(value, nextReduced = false) {
      if (disposed || brawling === value) return;
      grab.cancel(); clearHover();
      for (const item of slots) { item.grab = null; item.placement = null; item.smoothedBrawl = null; }
      brawling = value; reduced = nextReduced; field.dataset.brawl = String(value);
      if (value) {
        if (!brawlAssignments.length) brawlAssignments = createBrawlAssignments(slots.length);
        for (const item of slots) item.motion = null;
      }
      trimToCapacity();
      paint(); wake();
    },
    hasAuthor: post => !!authorSlot(post),
    setCheering(value, nextReduced = false) {
      if (disposed || cheering === value) return;
      grab.cancel(); clearHover();
      reduced = nextReduced;
      cheering = value;
      field.dataset.cheering = String(value);
      if (value) {
        if (pinned()) document.activeElement?.blur();
        if (cheerAmount === 0) {
          const assignments = createCheerAssignments(slots.filter(item => item.post).length);
          let index = 0;
          cheerAssignments = slots.map(item => item.post ? assignments[index++] : null);
          cheerTime = 0;
        }
      }
      if (reduced) cheerAmount = 0;
      paint();
      wake();
    },
    emerge(post, origin, nextReduced = false) {
      if (disposed || !post || (pinned() && !grab.active())) return false;
      reduced = nextReduced;
      const existing = slots.find(item => !item.departure && item.post?.id === post.id);
      if (existing) {
        existing.post = post; existing.order = ++sequence; speakingSide = existing.side; turnElapsed = 0;
        if (existing.elapsed >= ENTRY_SECONDS) { readingElapsed = 0; onReveal(post, false); }
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
      grab.cancel(); clearHover();
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
      if (disposed || paused || !visible || (pinned() && !grab.active() && !settling())) return;
      reduced = nextReduced;
      if (brawling && !reduced) brawlTime += delta;
      if (speechVisible && !cheering && cheerAmount === 0) {
        readingElapsed += delta;
        for (const item of bubbles) if (!item.bubble.hidden) item.character.readElapsed += delta;
      }
      if (cheering || cheerAmount > 0) cheerTime += delta;
      cheerAmount = reduced ? 0 : Math.max(0, Math.min(1,
        cheerAmount + (cheering ? 1 : -1) * delta / CHEER_TRANSITION_SECONDS));
      for (const [index, item] of departures.entries()) {
        if (!item) continue;
        item.elapsed += delta;
        if (reduced || item.elapsed >= EXIT_SECONDS) {
          departures[index] = null;
          visuals.hide(slots.length + index);
        }
      }
      for (const item of slots) {
        if (item.hover) item.hover.time += delta;
        if (item.grab) {
          item.grab.time += delta;
          item.grab.shake *= Math.exp(-delta * 1.8);
          item.grab.agitation += (item.grab.shake - item.grab.agitation) * (1 - Math.exp(-delta * 10));
          if (reduced) { item.grab.shake = 0; item.grab.agitation = 0; }
          if (item.grab.dropping && (reduced || item.grab.time >= landingDuration(item.grab))) {
            item.grab = null;
            item.smoothedBrawl = null;
          }
          else if (!item.grab.dropping) {
            const held = item.grab;
            for (let remaining = Math.min(delta, 0.1); remaining > 0;) {
              const dt = Math.min(remaining, 1 / 120);
              held.velocity += (-held.angle * 38 - held.velocity * 4.5) * dt;
              held.angle = Math.max(-0.65, Math.min(0.65, held.angle + held.velocity * dt));
              remaining -= dt;
            }
            if (reduced) { held.angle = 0; held.velocity = 0; }
          }
        }
        if (item.departure) {
          item.departure.elapsed += delta;
          if (reduced || item.departure.elapsed >= EXIT_SECONDS) {
            item.post = null; item.departure = null; item.slot.hidden = true;
          }
          continue;
        }
        if (item.post) {
          const wasSeated = item.elapsed >= ENTRY_SECONDS;
          item.elapsed = reduced ? ENTRY_SECONDS : Math.min(ENTRY_SECONDS, item.elapsed + delta);
          item.cheerAmount = reduced ? 0 : Math.max(0, Math.min(cheerAmount,
            item.cheerAmount + (cheering && wasSeated ? 1 : -1) * delta / CHEER_TRANSITION_SECONDS));
        }
      }
      if (brawling && !reduced) {
        const centerX = (layout.worldLeft.x + layout.worldRight.x) / 2;
        const centerZ = (layout.worldLeft.z + layout.worldRight.z) / 2 - 1;
        const actors = slots.flatMap((item, index) => item.post && !item.departure && !item.grab && !item.hover && item.elapsed >= ENTRY_SECONDS && item.motion
          ? [{ key: index, side: item.side, motion: item.motion, assignment: brawlAssignments[index] }] : []);
        stepBrawlMotions(actors, delta, { minX: centerX - 4.8, maxX: centerX + 4.8, minZ: centerZ - 0.4, maxZ: centerZ + 6.8,
          cameraZ: layout.cameraZ, referenceZ: centerZ + 1 });
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
    setLayout(next) { grab.cancel(); clearHover(); layout = next; invalidateMeasurements(); paint(); },
    setPaused(value) { if (value) { grab.cancel(); clearHover(); } paused = value; field.dataset.paused = String(value); paint(); },
    setVisible(value, { speech = value } = {}) {
      if (visible === value && speechVisible === speech) return;
      if (!value || !speech) { grab.cancel(); clearHover(); }
      visible = value;
      speechVisible = speech;
      if ((!value || !speech) && pinned()) document.activeElement?.blur();
      field.hidden = !value;
      paint();
    },
    pinned,
    isGrabbing: () => !!grab.active(),
    canReplace: () => !pinned() && !settling() && (reduced || !slots.some(item => item.post) ||
      !arrivals.length && !slots.some(item => item.post && !item.departure && item.elapsed < ENTRY_SECONDS) && readingElapsed >= TURN_SECONDS),
    canAccept: () => !grab.active() && !settling() && !cheering && cheerAmount === 0 && !arrivals.length && !slots.some(item => item.departure) && departures.includes(null),
    needsFrame: () => !disposed && !paused && visible && (!pinned() || settling())
      && (arrivals.length > 0 || departures.some(Boolean) || slots.some(item => item.post && (item.elapsed < ENTRY_SECONDS || !reduced))),
    stats: () => ({ historyCheering: cheering, historyCheerAmount: cheerAmount,
      historyGrabbedId: grab.active()?.post?.id ?? null,
      brawlEnabled: brawling, historyCapacityPerSide: brawling ? BRAWL_PER_SIDE : CHARACTERS_PER_SIDE,
      historyCapacityBySide: { a: sideCapacity('a'), b: sideCapacity('b') },
      historyParticipants: slots.filter(item => item.post && !item.departure).map(item => ({ authorId: item.post.authorId, postId: item.post.id, side: item.side })),
      historyCharacters: slots.filter(item => item.post && !item.departure).length,
      historyPostIds: slots.filter(item => item.post && !item.departure).map(item => item.post.id),
      historySpeakingId: (latest(speakingSide) ?? latest('a') ?? latest('b'))?.post.id ?? null,
      historyLeaving: leaving().length,
      historyLeavingPostIds: leaving().map(item => item.post.id),
      historyArriving: arrivals.length + leaving().length + slots.filter(item => item.post && !item.departure && item.elapsed < ENTRY_SECONDS).length }),
    dispose() { grab.dispose(); clearHover(); hoverListeners.forEach(remove => remove());
      measurementObserver?.disconnect(); window.removeEventListener('resize', refreshMeasurements);
      fonts?.removeEventListener('loadingdone', refreshMeasurements);
      window.removeEventListener('pointermove', moveHover);
      window.removeEventListener('blur', blurHover); document.removeEventListener('visibilitychange', hideHover);
      field.removeEventListener('focusin', focusChanged); field.removeEventListener('focusout', focusLeft);
      disposed = true; arrivals.length = 0; departures.fill(null);
      for (let index = 0; index < HISTORY_MODEL_CAPACITY; index++) visuals.hide(index);
      for (const item of slots) item.dust?.remove();
      hand.remove(); field.remove(); },
  };
}
