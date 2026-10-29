import { updateTransport } from './transport.js';

export function setupComposer(form) {
  const input = form.querySelector('textarea'), dock = form.parentElement;
  let frame = 0;
  function position() {
    frame = 0;
    const editing = window.parent === window && innerWidth <= 700 && document.activeElement === input;
    if (editing) {
      if (!form.classList.contains('keyboard-docked')) dock.style.minHeight = `${dock.offsetHeight}px`;
      form.classList.add('keyboard-docked');
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
      form.style.top = `${Math.max(viewport?.offsetTop ?? 0, bottom - form.offsetHeight - 8)}px`;
    } else {
      form.classList.remove('keyboard-docked'); form.style.top = ''; dock.style.minHeight = '';
    }
    updateTransport(form);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(position); }
  form.addEventListener('focusin', schedule);
  form.addEventListener('focusout', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  new ResizeObserver(schedule).observe(form);
  new MutationObserver(schedule).observe(form, { attributes: true, attributeFilter: ['data-side'] });
  new MutationObserver(schedule).observe(document.querySelector('#scene'), { attributes: true, attributeFilter: ['data-pipe-anchors'] });
  form.querySelector('[type=submit]').addEventListener('pointerdown', event => {
    if (document.activeElement === input) event.preventDefault();
  });
  schedule();
}

export function animateCapsuleSend(form, post, launch) {
  const scene = document.querySelector('#scene');
  const sceneRect = scene.getBoundingClientRect();
  const availableBottom = form.classList.contains('keyboard-docked')
    ? form.getBoundingClientRect().top - 12
    : innerHeight - form.offsetHeight - 24;
  if (sceneRect.bottom < 80 || sceneRect.top > availableBottom) {
    window.scrollBy({ top: sceneRect.bottom - availableBottom, behavior: 'instant' });
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { launch(); return; }
  const route = updateTransport(form);
  if (!route) { launch(); return; }
  const button = form.querySelector('#send'), rect = button.getBoundingClientRect();
  const mouth = form.querySelector('.inlet-mouth').getBoundingClientRect();
  const token = document.createElement('span'), capsule = form.querySelector('.send-capsule').cloneNode(true);
  const direction = post.side === 'b' ? 1 : -1;
  const startX = rect.x + rect.width / 2, startY = rect.y + rect.height / 2;
  const inletX = mouth.x + mouth.width / 2 - startX, inletY = mouth.y + mouth.height / 2 - startY;
  token.className = 'inlet-token'; token.setAttribute('aria-hidden', 'true');
  token.style.setProperty('--inlet-color', getComputedStyle(form).getPropertyValue('--inlet-color'));
  Object.assign(token.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const paper = capsule.querySelector('.capsule-paper');
  paper.textContent = post.text.slice(0, 12);
  token.append(capsule); form.append(token);
  paper.animate([
    { opacity: 0, transform: `translate(${-direction * 26}px,-22px) rotate(${-direction * 12}deg)` },
    { opacity: 1, transform: 'translate(0,0) rotate(0)' },
  ], { duration: 140, easing: 'ease-in', fill: 'both' });
  const pose = (x, y, scale, angle) => `translate(${x}px,${y}px) scale(${scale}) rotate(${angle}deg)`;
  const scale = innerWidth <= 700 ? 0.28 : 0.45;
  const frames = [
    { opacity: 1, transform: pose(0, 0, 1, 0) },
    { opacity: 1, transform: pose(0, 2, 0.92, -direction * 8), offset: 0.15 },
    { opacity: 1, transform: pose(inletX, inletY, scale, direction * 40), offset: 0.28 },
  ];
  const length = route.getTotalLength();
  for (let i = 1; i <= 40; i++) {
    const point = route.getPointAtLength(length * i / 40);
    frames.push({ opacity: 1, transform: pose(point.x - startX, point.y - startY, scale, direction * (40 + i * 9)), offset: 0.28 + 0.72 * i / 40 });
  }
  const animation = token.animate(frames, { duration: Math.max(700, Math.min(1100, length * 0.85)), easing: 'linear' });
  animation.finished.catch(() => {}).then(() => { token.remove(); launch(); });
}
