import * as THREE from 'three';
import { createCapsuleBatch } from './capsule-batch.js';
import { nozzlePose } from './physics.js';
import { characterPose } from './character-motion.js';

// Linked opinions share one collision; the representative vote capsules stay intact.
export function createClash(scene, container, camera, onReveal = () => {}, { onImpact = null, onImpactComplete = null } = {}) {
  const batch = createCapsuleBatch(scene, 2);
  const bodies = [0, 1].map(() => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }));
  const impactPoint = new THREE.Vector3(0, -0.2, 0.3), projected = new THREE.Vector3(), rotation = new THREE.Euler();
  const flightDuration = 0.78, squeezeDuration = 0.12, rubDuration = 0.9, burstDuration = 0.7, fadeDuration = 0.48;
  batch.hide(0); batch.hide(1);
  const layer = document.createElement('div'); layer.className = 'clash-field';
  const flights = [0, 1].map(() => { const marker = document.createElement('span'); marker.className = 'clash-flight'; marker.hidden = true; layer.append(marker); return marker; });
  const shock = document.createElement('div'); shock.className = 'clash-shock'; shock.hidden = true; shock.setAttribute('aria-hidden', 'true'); layer.append(shock);
  const impact = document.createElement('div'); impact.className = 'clash-impact'; impact.hidden = true;
  impact.setAttribute('role', 'region'); impact.setAttribute('aria-label', '맞붙은 두 의견');
  if (onImpactComplete) impact.setAttribute('aria-hidden', 'true');
  const burst = document.createElement('div'); burst.className = 'clash-pop'; burst.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) {
    const piece = document.createElement('i'); piece.className = i < 6 ? 'clash-puff' : 'clash-confetti';
    const angle = i * Math.PI / 3 + (i < 6 ? 0 : Math.PI / 6);
    const radius = i < 6 ? 55 : 112;
    piece.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * radius * 0.7}px`);
    piece.style.setProperty('--spin', `${i % 2 ? -75 : 75}deg`);
    piece.style.setProperty('--piece-color', i % 2 ? 'var(--coral)' : 'var(--mint)');
    burst.append(piece);
  }
  const flash = document.createElement('span'); flash.className = 'clash-flash'; flash.textContent = '퐁!'; burst.append(flash);
  const versus = document.createElement('span'); versus.className = 'clash-versus'; versus.textContent = 'VS'; versus.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.className = 'clash-label';
  const close = document.createElement('button'); close.dataset.phCaptureAttributeAction = 'sparring_clash_close'; close.type = 'button'; close.className = 'clash-close'; close.textContent = '×'; close.setAttribute('aria-label', '두 의견 닫기');
  const cards = document.createElement('div'); cards.className = 'clash-voices';
  impact.append(burst, versus, label, close, cards); layer.append(impact); container.append(layer);
  let active = null, pinned = false;
  const queue = [];
  function point(position) {
    projected.copy(position).project(camera);
    return { x: (projected.x + 1) * container.clientWidth / 2, y: (1 - projected.y) * container.clientHeight / 2 };
  }
  function reposition() {
    impactPoint.set(0, -0.2, 0.3);
    if (!matchMedia('(max-width: 700px)').matches) {
      const sceneTop = container.getBoundingClientRect().top;
      const controls = container.parentElement.querySelectorAll('.vote-option,.pipe-meter');
      const bottom = Math.max(...[...controls].map(node => node.getBoundingClientRect().bottom - sceneTop));
      // Leave room above the collision for both comic balloons and the pipe labels.
      const minimumY = bottom + 150;
      if (point(impactPoint).y < minimumY) {
        const direction = new THREE.Vector3(0, 1 - minimumY / container.clientHeight * 2, 0.5)
          .unproject(camera).sub(camera.position).normalize();
        impactPoint.copy(camera.position).addScaledVector(direction, (0.3 - camera.position.z) / direction.z);
      }
    }
    const p = point(impactPoint);
    impact.style.left = shock.style.left = `${p.x}px`; impact.style.top = shock.style.top = `${p.y}px`;
    const edge = point(new THREE.Vector3(impactPoint.x + 8.5, impactPoint.y, impactPoint.z));
    shock.style.setProperty('--shock-size', `${Math.abs(edge.x - p.x) * 2}px`);
  }
  function clear() {
    active = null; pinned = false; impact.hidden = shock.hidden = true; impact.style.opacity = '';
    batch.hide(0); batch.hide(1); flights.forEach(marker => { marker.hidden = true; });
    container.dataset.clashState = 'idle';
  }
  function dismiss(wake = true) {
    if (!active || active.exitElapsed !== null) return;
    active.exitElapsed = 0; pinned = false;
    container.dataset.clashState = 'fading';
    if (wake) container.dispatchEvent(new CustomEvent('clashwake'));
  }
  close.addEventListener('click', dismiss);
  impact.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(); });
  function pipeSide(post, index) {
    return index === 0 && post.side === active.post.side ? (post.side === 'a' ? 'b' : 'a') : post.side;
  }
  function card(post, caption, position) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.phCaptureAttributeAction = 'sparring_clash_expand'; button.className = `clash-voice ${post.side} ${position}`;
    button.setAttribute('aria-expanded', 'false');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    shape.setAttribute('viewBox', '0 0 320 160'); shape.setAttribute('preserveAspectRatio', 'none');
    shape.setAttribute('aria-hidden', 'true'); shape.classList.add('clash-balloon');
    const contour = 'M34 12 C96 0 222 2 271 15 C298 22 299 49 297 80 C295 106 282 116 269 120 L314 150 L246 132 C181 145 78 148 32 130 C9 121 5 103 7 75 C8 42 8 19 34 12 Z';
    for (const className of ['balloon-depth', 'balloon-face']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', contour); path.setAttribute('class', className); shape.append(path);
    }
    const meta = document.createElement('span'); meta.className = 'clash-byline';
    const chair = document.createElement('i'); chair.className = 'chair-logo'; chair.setAttribute('aria-hidden', 'true'); chair.append(document.createElement('i'));
    const author = document.createElement('span'); author.textContent = post.name;
    const role = document.createElement('small'); role.textContent = caption;
    meta.append(chair, author, role);
    const text = document.createElement('strong'); text.textContent = post.text;
    const hint = document.createElement('small'); hint.className = 'sr-only'; hint.textContent = '누르면 전체 의견을 펼치고 닫을 때까지 유지합니다';
    button.append(shape, meta, text, hint);
    button.addEventListener('focus', () => { if (active) { pinned = true; active.exitElapsed = null; impact.style.opacity = ''; container.dataset.clashState = 'pair'; } });
    button.addEventListener('click', () => {
      pinned = true; button.classList.toggle('expanded');
      button.setAttribute('aria-expanded', String(button.classList.contains('expanded')));
      hint.textContent = button.classList.contains('expanded') ? '전체 의견을 보는 중. 닫을 때까지 유지합니다' : '누르면 전체 의견을 펼칩니다. 닫을 때까지 유지합니다';
    });
    return button;
  }
  function showPair() {
    if (!active || active.shown) return;
    active.shown = true;
    label.textContent = active.fresh ? '받아치기' : '지난 받아치기';
    cards.replaceChildren(...[active.post.replyTo, active.post].map((post, i) => card(post, i ? '받아친 말' : '먼저 한 말', pipeSide(post, i) === 'a' ? 'first' : 'second')));
    impact.classList.toggle('reduced', active.reduced);
    reposition(); impact.hidden = false;
    container.dataset.clashState = 'pair';
    onReveal(active.post, active.fresh);
  }
  function showImpact() {
    if (!active || active.shown) return;
    active.shown = true;
    versus.hidden = label.hidden = close.hidden = cards.hidden = true;
    impact.classList.toggle('reduced', active.reduced);
    reposition(); impact.hidden = false;
    container.dataset.clashState = 'impact';
  }
  function start(post, fresh, reduced = false) {
    if (!post.replyTo) return;
    queue.push({ post, fresh, reduced });
    if (fresh && active && !active.fresh && !pinned) dismiss();
    if (!active) next();
  }
  function next() {
    const item = queue.shift();
    if (!item) return;
    active = { ...item, elapsed: 0, shown: false, contacted: false, transferred: false, exitElapsed: null };
    container.dataset.clashState = 'flying';
    if (item.reduced && !onImpactComplete) showPair();
  }
  function step(delta) {
    if (!active) { next(); if (!active) return; }
    active.elapsed += delta;
    const collisionAt = flightDuration + squeezeDuration;
    const afterImpact = active.elapsed - collisionAt;
    if (onImpactComplete && !active.reduced && !active.contacted && active.elapsed >= flightDuration) {
      active.contacted = true;
      container.dataset.clashState = 'pressing';
      reposition(); shock.hidden = false;
      onImpact?.({ post: active.post, fresh: active.fresh, point: { x: impactPoint.x, y: impactPoint.y, z: impactPoint.z } });
    }
    if (active.contacted) {
      const waveProgress = Math.min(1, Math.max(0, (active.elapsed - flightDuration) / 0.85));
      shock.style.setProperty('--wave-progress', String(waveProgress));
      shock.style.opacity = String(1 - waveProgress);
    }
    if (onImpactComplete && active.reduced) {
      const selection = { post: active.post, fresh: active.fresh };
      clear();
      onImpactComplete(selection);
      next();
      return;
    }
    if (onImpactComplete && afterImpact >= 0) {
      flights.forEach(marker => { marker.hidden = true; });
      if (afterImpact < rubDuration) {
        const strength = Math.min(1, afterImpact / 0.12);
        const fall = 3.4 * Math.pow(afterImpact / rubDuration, 2);
        const push = Math.sin(afterImpact * 9) * 0.09 * strength;
        const shudder = Math.sin(afterImpact * 31) * strength;
        [active.post.replyTo, active.post].forEach((post, index) => {
          const sign = pipeSide(post, index) === 'a' ? -1 : 1;
          bodies[index].position.copy(impactPoint);
          bodies[index].position.x += sign * (0.58 + push);
          bodies[index].position.y += sign * shudder * 0.12 - fall;
          rotation.set(5 + shudder * 0.12, 2, sign * (5 + shudder * 0.25));
          bodies[index].quaternion.setFromEuler(rotation);
          batch.draw(index, { body: bodies[index], post, phase: 'rolling', elapsed: active.elapsed }, 1.72 + Math.abs(shudder) * 0.08);
        });
        return;
      }
      const burstTime = afterImpact - rubDuration;
      showImpact();
      container.dataset.clashState = 'burst';
      const burstPoint = point(new THREE.Vector3().copy(impactPoint).addScaledVector(new THREE.Vector3(0, -1, 0), 3.4));
      impact.style.left = `${burstPoint.x}px`; impact.style.top = `${burstPoint.y}px`;
      if (!active.transferred) {
        active.transferred = true;
        batch.hide(0); batch.hide(1);
        onImpactComplete({ post: active.post, fresh: active.fresh });
      }
      if (burstTime >= burstDuration) { clear(); next(); }
      return;
    }
    if (!active.reduced && afterImpact < 0) {
      const time = Math.min(1, active.elapsed / flightDuration);
      const progress = time;
      const squeeze = active.elapsed < flightDuration ? 0 : Math.sin(Math.min(1, (active.elapsed - flightDuration) / squeezeDuration) * Math.PI);
      [active.post.replyTo, active.post].forEach((post, index) => {
        const side = pipeSide(post, index), sign = side === 'a' ? -1 : 1;
        const mouth = new THREE.Vector3(...nozzlePose(side).mouth);
        bodies[index].position.copy(mouth).lerp(impactPoint, progress);
        bodies[index].position.x += sign * 0.58 * Math.max(0, progress);
        rotation.set(progress * 5, progress * 2, progress * sign * 5);
        bodies[index].quaternion.setFromEuler(rotation);
        batch.draw(index, { body: bodies[index], post, phase: 'rolling', elapsed: active.elapsed }, 1.8 - squeeze * 0.2);
        const p = point(bodies[index].position), marker = flights[index];
        marker.className = `clash-flight side-${post.side} pipe-${side}`;
        marker.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${1 - squeeze * 0.3}, ${1 + squeeze * 0.2})`;
        marker.style.opacity = Math.min(1, time * 6);
        marker.hidden = afterImpact >= 0;
      });
    } else {
      flights.forEach(marker => { marker.hidden = true; }); showPair();
      const opening = active.reduced ? 1 : Math.min(1, afterImpact / 0.42);
      const emergence = opening * opening * (3 - 2 * opening);
      const mobile = matchMedia('(max-width: 700px)').matches;
      const center = point(impactPoint);
      [active.post.replyTo, active.post].forEach((post, index) => {
        const sign = pipeSide(post, index) === 'a' ? -1 : 1;
        bodies[index].position.copy(impactPoint);
        bodies[index].position.x += sign * 0.58;
        if (mobile) {
          bodies[index].position.x += sign * emergence * 0.9;
          bodies[index].position.y += emergence * 0.05;
        } else {
          // Keep faces below the balloon tails and in front of the vote capsules.
          const ray = new THREE.Vector3((center.x + sign * 84) / container.clientWidth * 2 - 1, 1 - (center.y + 130) / container.clientHeight * 2, 0.5).unproject(camera).sub(camera.position).normalize();
          const landing = camera.position.clone().addScaledVector(ray, (3.2 - camera.position.z) / ray.z);
          bodies[index].position.lerp(landing, emergence);
        }
        bodies[index].quaternion.identity();
        const pose = characterPose({ phase: 'open', elapsed: Math.min(2.2, Math.max(0, afterImpact)), fresh: active.fresh, mine: post.name === '나', reduced: active.reduced });
        pose.shrink = active.exitElapsed === null ? 1 : Math.max(0, 1 - active.exitElapsed / fadeDuration);
        batch.draw(index, { body: bodies[index], post, characterPose: pose, characterYaw: -sign * 0.45 }, 1.8 - emergence * 0.45, opening, true);
      });
    }
    if (active.elapsed >= (active.reduced ? 6 : collisionAt + 6) && !pinned) dismiss(false);
    if (active.exitElapsed !== null) {
      active.exitElapsed += delta;
      impact.style.opacity = Math.max(0, 1 - active.exitElapsed / fadeDuration);
      if (active.exitElapsed >= fadeDuration) { clear(); next(); }
    }
  }
  return { start, step, reposition, busy: () => !!active || queue.length > 0, needsFrame: () => !!active && (!pinned || active.exitElapsed !== null), stats: () => ({ clashCharacters: active?.shown && !onImpactComplete ? 2 : 0 }), dispose() { queue.length = 0; clear(); layer.remove(); } };
}
