import { updateTransport } from './transport.js';

export function fitArenaViewport(form) {
  const available = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--arena-available-height'));
  const stage = document.querySelector('.stage'), dock = form.parentElement;
  if (!stage || !Number.isFinite(available) || available <= 0) return;
  const topic = stage.querySelector('.topic');
  const mobile = innerWidth <= 700;
  const sceneTop = mobile && topic ? topic.offsetHeight + 48 : 0;
  stage.style.setProperty('--scene-top', `${sceneTop}px`);
  // Moving the desktop page up must not enlarge the 3D scene to fill the saved space.
  const top = Math.max(0, stage.getBoundingClientRect().top + window.scrollY);
  const dockStyle = getComputedStyle(dock), formStyle = getComputedStyle(form);
  const dockMargin = parseFloat(dockStyle.marginTop) || 0;
  const devices = form.querySelector('.composer-devices');
  const devicesStyle = devices && getComputedStyle(devices);
  const devicesMinHeight = devicesStyle && parseFloat(devicesStyle.getPropertyValue('--stage-composer-height') || devicesStyle.minHeight);
  const verticalSpace = style => ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
    .reduce((sum, property) => sum + (parseFloat(style[property]) || 0), 0);
  // Reserve the collapsed composer's space so opening a reply cannot resize the 3D scene.
  const dockHeight = Number.isFinite(devicesMinHeight)
    ? devicesMinHeight + verticalSpace(formStyle) + verticalSpace(dockStyle)
    : dock.offsetHeight;
  // A short viewport can scroll rather than hiding the stage or the composer.
  const minimum = mobile
    ? sceneTop + Math.max(240, Math.ceil(stage.clientWidth * 0.62 + 16))
    : 380 + Math.max(0, (topic?.offsetHeight || 0) - 100);
  const height = mobile ? minimum : Math.max(
    minimum, Math.floor(available - top - dockHeight - dockMargin - 8),
  );
  if (stage.style.height !== `${height}px`) stage.style.height = `${height}px`;
}

export function revealComposer(form) {
  fitArenaViewport(form);
  // Desktop keeps the arena still; the composer opens in place.
  if (innerWidth > 700) return;
  const rect = form.getBoundingClientRect();
  const host = window.frameElement;
  const offset = host?.getBoundingClientRect().top ?? 0;
  const viewportHeight = host ? window.parent.innerHeight : innerHeight;
  if (rect.top + offset < 0 || rect.bottom + offset > viewportHeight) {
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function alignTopicRow() {
  if (innerWidth <= 1000) return;
  const topic = document.querySelector('.topic'), title = topic?.querySelector('h1');
  const labels = [...document.querySelectorAll('.vote-flag strong')];
  if (!title || labels.length !== 2) return;
  const stage = topic.parentElement.getBoundingClientRect();
  const bounds = labels.map(label => label.getBoundingClientRect());
  const centers = bounds.map((rect, index) => rect.y + rect.height / 2
    - (parseFloat(labels[index].parentElement.style.getPropertyValue('--claim-row-shift')) || 0));
  const row = (centers[0] + centers[1]) / 2;
  const centerX = stage.x + stage.width / 2;
  const width = Math.max(160, Math.min(640, 2 * (Math.min(centerX - bounds[0].right, bounds[1].left - centerX) - 24)));
  topic.style.setProperty('--topic-row-width', `${width}px`);
  topic.style.setProperty('--topic-row-top', `${row - stage.y - title.offsetHeight / 2}px`);
  labels.forEach((label, index) => label.parentElement.style.setProperty('--claim-row-shift', `${row - centers[index]}px`));
}

export function setupComposer(form) {
  const dock = form.parentElement;
  let frame = 0;
  const transitions = new Map();
  function position() {
    frame = 0;
    const editing = window.parent === window && innerWidth <= 700 && document.activeElement?.matches('textarea');
    if (editing) {
      if (!form.classList.contains('keyboard-docked')) dock.style.minHeight = `${dock.offsetHeight}px`;
      form.classList.add('keyboard-docked');
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
      form.style.top = `${Math.max(viewport?.offsetTop ?? 0, bottom - form.offsetHeight - 8)}px`;
    } else {
      form.classList.remove('keyboard-docked'); form.style.top = ''; dock.style.minHeight = '';
    }
    fitArenaViewport(form);
    alignTopicRow();
    updateTransport(form);
    if (transitions.size) schedule();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(position); }
  form.addEventListener('transitionrun', event => {
    if (!event.target.closest('.composer-devices')) return;
    if (!transitions.has(event.target)) transitions.set(event.target, new Set());
    transitions.get(event.target).add(event.propertyName);
    schedule();
  });
  function endTransition(event) {
    const properties = transitions.get(event.target);
    if (!properties) return;
    properties.delete(event.propertyName);
    if (!properties.size) transitions.delete(event.target);
    schedule();
  }
  form.addEventListener('transitionend', endTransition);
  form.addEventListener('transitioncancel', endTransition);
  form.addEventListener('focusin', schedule);
  form.addEventListener('focusout', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  const layoutObserver = new ResizeObserver(schedule);
  [form, document.querySelector('.topic'), ...document.querySelectorAll('.vote-flag strong')].forEach(element => layoutObserver.observe(element));
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(schedule).observe(form, { attributes: true, attributeFilter: ['data-side'] });
  new MutationObserver(schedule).observe(document.querySelector('#scene'), { attributes: true, attributeFilter: ['data-pipe-anchors'] });
  form.querySelectorAll('[type=submit]').forEach(button => button.addEventListener('pointerdown', event => {
    if (document.activeElement?.matches('textarea')) event.preventDefault();
  }));
  form.querySelectorAll('.composer-avatar').forEach(button => button.addEventListener('pointerdown', event => {
    if (document.activeElement?.matches('textarea')) event.preventDefault();
  }));
  schedule();
}

export function animateCapsuleSend(form, post, launch) {
  const scene = document.querySelector('#scene');
  const sceneRect = scene.getBoundingClientRect();
  const availableBottom = form.classList.contains('keyboard-docked')
    ? form.getBoundingClientRect().top - 12
    : innerHeight - form.offsetHeight - 24;
  if (sceneRect.bottom < 80 || sceneRect.top > availableBottom) {
    launch(); return;
  }
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches) { launch(); return; }
  const currentRoute = updateTransport(form);
  const route = document.querySelector(`.transport-pipes [data-route="${post.side}"] .pipe-flow`) ?? currentRoute;
  if (!route) { launch(); return; }
  const device = form.querySelector(`[data-composer-side="${post.side}"]`) ?? form;
  const avatar = device.querySelector('.composer-avatar')?.getBoundingClientRect();
  const diameter = Number(device.dataset.capsuleDiameter);
  if (avatar?.height && diameter > 0) {
    let finished = false, cancelShip;
    let speech;
    function finish() {
      if (finished) return;
      finished = true;
      motion.removeEventListener('change', reduce);
      speech?.remove();
      launch();
    }
    function reduce(event) { if (event.matches) { cancelShip?.(); finish(); } }
    const detail = { post: { ...post }, route, origin: { x: avatar.x, y: avatar.y, width: avatar.width, height: avatar.height }, diameter, onArrive: finish, handled: false };
    scene.dispatchEvent(new CustomEvent('capsuleship', { detail }));
    if (detail.handled) {
      cancelShip = detail.cancel;
      if (finished) return;
      motion.addEventListener('change', reduce);
      const field = device.querySelector('.composer-field').getBoundingClientRect();
      speech = document.createElement('span');
      speech.className = 'sent-speech'; speech.setAttribute('aria-hidden', 'true'); speech.textContent = post.text;
      const colors = getComputedStyle(device);
      for (const name of ['--inlet-soft', '--inlet-dark']) speech.style.setProperty(name, colors.getPropertyValue(name));
      Object.assign(speech.style, { left: `${field.x}px`, top: `${field.y}px`, maxWidth: `${Math.max(60, field.width)}px` });
      form.append(speech);
      const animation = speech.animate([
        { opacity: 1, transform: 'translate(0,0) scale(1)' },
        { opacity: 0, transform: `translate(${avatar.x + avatar.width / 2 - field.x}px,${avatar.y + avatar.height / 2 - field.y}px) scale(.12)` },
      ], { duration: 350, easing: 'cubic-bezier(.4,0,.8,1)', fill: 'forwards' });
      animation.finished.then(() => speech.remove(), () => speech.remove());
      return () => { finished = true; motion.removeEventListener('change', reduce); cancelShip?.(); animation.cancel(); speech.remove(); };
    }
  }
  const button = device.querySelector('[type=submit]') ?? device.querySelector('#send'), rect = button.getBoundingClientRect();
  const mouth = device.querySelector('.inlet-mouth').getBoundingClientRect();
  const token = document.createElement('span'), capsule = device.querySelector('.send-capsule').cloneNode(true);
  const direction = post.side === 'b' ? 1 : -1;
  const startX = rect.x + rect.width / 2, startY = rect.y + rect.height / 2;
  const inletX = mouth.x + mouth.width / 2 - startX, inletY = mouth.y + mouth.height / 2 - startY;
  token.className = 'inlet-token'; token.setAttribute('aria-hidden', 'true');
  const colors = getComputedStyle(device);
  for (const name of ['--inlet-color', '--inlet-glass', '--inlet-dark']) {
    token.style.setProperty(name, colors.getPropertyValue(name));
  }
  Object.assign(token.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const paper = capsule.querySelector('.capsule-paper');
  paper.textContent = post.text.slice(0, 12);
  token.append(capsule); form.append(token);
  paper.animate([
    { opacity: 0, transform: `translate(${-direction * 26}px,-22px) rotate(${-direction * 12}deg)` },
    { opacity: 1, transform: 'translate(0,0) rotate(0)' },
  ], { duration: 140, easing: 'ease-in', fill: 'both' });
  const pose = (x, y, scale, angle) => `translate(${x}px,${y}px) scale(${scale}) rotate(${angle}deg)`;
  const scale = (diameter || mouth.height * 0.8) / rect.width;
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
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    motion.removeEventListener('change', reduce);
    token.remove(); launch();
  }
  function reduce(event) {
    if (!event.matches) return;
    animation.cancel(); finish();
  }
  motion.addEventListener('change', reduce);
  animation.finished.then(finish, finish);
  return () => {
    finished = true;
    motion.removeEventListener('change', reduce);
    animation.cancel(); token.remove();
  };
}
