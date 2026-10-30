import * as THREE from 'three';
import { createCapsules } from './capsules.js';
import { whenCharacterAssetsReady } from './characters.js';
import { createCharacterDuel } from './character-duel.js';
import { createHistoryConversation } from './history-conversation.js';
import { createWalkingCharacters } from './walking-characters.js';
import { createCapsuleReveals } from './capsule-reveals.js';
import { createClash } from './clash.js';
import { createDispenser } from './dispenser.js';
import { TRAY } from './dispenser-physics.js';
import { TANK, RADIUS, FRESH_CAPSULE_SCALE, nozzlePose } from './physics.js';
import { studioMaterial, createStudioEnvironment } from './studio-materials.js';
import { createTransportScene } from './transport-scene.js';
import { addPipeRings, createPipeSurfaces } from './pipe-surfaces.js';

const PIPE_LENGTH = 2.35;

export function createArena(container, onSelect, onReveal, onReply = onSelect) {
  let assetsLoaded = false, layoutReady = false, presented = false, resolveReady;
  const firstFrame = new Promise(resolve => { resolveReady = resolve; });
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0xffffff, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  scene.environment = createStudioEnvironment(renderer);
  container.append(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 100);
  camera.position.set(0, 5, 24);
  camera.lookAt(0, 0, 0);
  const renderCamera = camera.clone();
  const transportScene = createTransportScene(scene.environment);
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  renderer.domElement.classList.add('arena-renderer');
  let renderWidth = 0, renderHeight = 0;
  function renderFrame() {
    renderer.info.reset();
    const width = document.documentElement.clientWidth, height = innerHeight;
    if (renderWidth !== width || renderHeight !== height) {
      renderWidth = width; renderHeight = height;
      renderer.setSize(width, height, false);
    }
    const bounds = container.getBoundingClientRect();
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    renderer.render(transportScene.back, transportScene.camera);
    renderer.clearDepth();
    // Extend the lower clipping edge without changing the framing used by UI anchors.
    const viewportHeight = Math.max(bounds.height, height - bounds.top);
    const view = camera.view;
    renderCamera.copy(camera);
    renderCamera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY,
      view.width, view.height * viewportHeight / bounds.height);
    renderer.setViewport(bounds.x, height - bounds.top - viewportHeight, bounds.width, viewportHeight);
    renderer.render(scene, renderCamera);
    renderer.clearDepth();
    renderer.setViewport(0, 0, width, height);
    renderer.render(transportScene.front, transportScene.camera);
    if (!presented && assetsLoaded && layoutReady) {
      presented = true;
      resolveReady();
    }
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe5e7eb, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(-4, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -13, near: 0.5, far: 35 });
  sun.shadow.normalBias = 0.03; sun.shadow.bias = -0.0001; scene.add(sun);
  const light = new THREE.DirectionalLight(0xe9faff, 0.5); light.position.set(5, 4, -5); scene.add(light);

  const height = TANK.rim - TANK.bottom;
  const halfWidth = TANK.width / 2, halfDepth = TANK.depth / 2;
  const glass = studioMaterial({ color: 0xffffff, transparent: true, opacity: 0.015, roughness: 0.08, envMapIntensity: 0.15, side: THREE.DoubleSide, depthWrite: false });
  const rimMaterial = studioMaterial({ color: 0xf1f3f5, roughness: 0.45 });
  const edgeMaterial = studioMaterial({ color: 0xd9dfe3, roughness: 0.45 });
  function box(size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); scene.add(mesh);
  }
  for (const sign of [-1, 1]) {
    box([TANK.width, height, 0.035], [0, (TANK.rim + TANK.bottom) / 2, sign * halfDepth], glass);
    box([0.035, height, TANK.depth], [sign * halfWidth, (TANK.rim + TANK.bottom) / 2, 0], glass);
    for (const y of [TANK.rim, TANK.rim - 0.13]) {
      const thickness = y === TANK.rim ? 0.1 : 0.04;
      box([TANK.width + 0.08, thickness, thickness], [0, y, sign * halfDepth], rimMaterial);
      box([thickness, thickness, TANK.depth + 0.08], [sign * halfWidth, y, 0], rimMaterial);
    }
    for (const z of [-halfDepth, halfDepth]) {
      box([0.04, height, 0.04], [sign * halfWidth, (TANK.rim + TANK.bottom) / 2, z], edgeMaterial);
    }
  }
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  for (const x of [-halfWidth + 0.12, halfWidth - 0.12]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.045, height - 0.3), shine);
    strip.position.set(x, (TANK.rim + TANK.bottom) / 2, halfDepth + 0.03); scene.add(strip);
  }

  function pipe(side, color) {
    const pose = nozzlePose(side), direction = new THREE.Vector3(...pose.direction).normalize();
    const length = PIPE_LENGTH;
    const group = new THREE.Group();
    group.position.copy(new THREE.Vector3(...pose.mouth).addScaledVector(direction, -length / 2));
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    const surfaces = createPipeSurfaces(color), material = surfaces.solid;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, length, 36, 1, true), surfaces.wall);
    tube.rotation.x = Math.PI / 2; tube.castShadow = true; group.add(tube);
    const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, length, 36, 1, true), surfaces.inner);
    inside.rotation.x = Math.PI / 2; group.add(inside);
    for (const z of [-length / 2, length / 2]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.095, 10, 36), material); lip.position.z = z; group.add(lip);
    }
    addPipeRings(group, new THREE.LineCurve3(new THREE.Vector3(0, 0, length / 2), new THREE.Vector3(0, 0, -length / 2)), 1.6, material);
    scene.add(group);
    return { group, material, until: 0 };
  }
  const pipes = { a: pipe('a', 0x2ac1bc), b: pipe('b', 0xed6a5a) };
  const capsules = createCapsules(scene, onSelect, post => container.dispatchEvent(new CustomEvent('capsuleready', { detail: { id: post.id } })));
  const ready = whenCharacterAssetsReady().then(() => {
    assetsLoaded = true;
    wake();
    return firstFrame;
  });
  const stage = container.parentElement;
  const duel = createCharacterDuel(stage, onReply, onReveal);
  const duelField = stage.querySelector('.character-duel');
  duelField.hidden = true;
  const historyModels = createWalkingCharacters(scene, 4);
  const history = createHistoryConversation(stage, onReply, onReveal, {
    ...historyModels,
    project: point => project([point.x, point.y, point.z]),
  });
  const reveals = createCapsuleReveals(container, onReply);
  const clash = createClash(scene, container, camera, () => {}, {
    onImpact: ({ point }) => { if (!reduced.matches) capsules.shockwave(point); },
    onImpactComplete: startGroup
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let groupId = 0, outputQueue = [], outputClock = 0, seeded = false;
  const replyQueue = [];
  const launchedIds = new Set(), transports = new Set();
  const dispenser = createDispenser(scene, () => {}, {
    onOpened(entry) {
      if (entry.groupId !== groupId) return;
      const origin = () => project([entry.body.position.x, entry.body.position.y + 0.25, entry.body.position.z]);
      if (entry.kind === 'history') history.emerge(entry.post, entry.characterOrigin, reduced.matches);
      else duel.emerge(entry.role, origin, reduced.matches);
    }
  });
  function project(position) {
    const p = new THREE.Vector3(...position).project(camera);
    return { x: (p.x + 1) * container.clientWidth / 2, y: container.offsetTop + (1 - p.y) * container.clientHeight / 2 };
  }
  function startGroup(selection) {
    const participants = duel.prepare(selection.post, selection.fresh, reduced.matches);
    if (!participants.length) return;
    if (selection.fresh) capsules.queueReplay(selection.post);
    duelField.hidden = false;
    dispenser.clearAll();
    groupId++;
    const outputs = participants.map(participant => ({ ...participant, fresh: selection.fresh, groupId }));
    outputQueue = selection.post.replyTo && dispenser.startPair(outputs, reduced.matches) ? [] : outputs;
    outputClock = 1;
    releaseClock = 0;
  }
  function startSelection(selection) {
    if (selection.transport) {
      startTransport(selection.transport, () => startSelection({ ...selection, transport: null }), selection.settle);
      return;
    }
    if (!selection.post.replyTo || !selection.fresh && !selection.replayClash) {
      duel.clear();
      duelField.hidden = true;
      history.setVisible(true);
      outputQueue.push({ post: selection.post, fresh: false, kind: 'history', groupId });
      outputClock = 1;
      releaseClock = 0;
      return;
    }
    // Keep the earlier slide presentation intact until it is finished, then replace it.
    outputQueue = [];
    groupId++;
    dispenser.clearAll();
    duel.clear();
    duelField.hidden = true;
    history.setVisible(false);
    clash.reposition();
    clash.start(selection.post, selection.fresh, reduced.matches);
    clash.step(0);
    pipes.a.until = pipes.b.until = performance.now() + 1000;
    releaseClock = 0;
  }
  function startTransport(transport, arrive, settle = () => {}) {
    const delivery = { cancel: null, settle };
    transports.add(delivery);
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      transports.delete(delivery);
      try { if (!disposed) { arrive(); wake(); } }
      finally { settle(); }
    };
    try { delivery.cancel = transport(complete); }
    catch { complete(); }
  }
  let releaseClock = 0, pipeClock = 0, allowPausedRelease = false, spillQueue = 0;
  let disposed = false, controlKey = '', frame = 0, awakeUntil = 0, last = performance.now(), isVisible = true, paused = false, statsAt = 0;
  function syncMotionPause() {
    const stopped = (paused && !allowPausedRelease) || !isVisible || document.hidden;
    duel.setPaused(stopped);
    history.setPaused(stopped);
  }
  function wake() {
    if (disposed) return;
    syncMotionPause();
    awakeUntil = performance.now() + (reduced.matches ? 80 : 5000); statsAt = -Infinity;
    container.dataset.flowState = reduced.matches ? 'reduced' : paused ? 'paused' : 'running';
    if (!frame && isVisible && !document.hidden) { last = performance.now() - 34; frame = requestAnimationFrame(tick); }
  }
  function tick(now) {
    frame = 0;
    if (disposed || !isVisible || document.hidden) return;
    if (now - last < 1000 / 30) { frame = requestAnimationFrame(tick); return; }
    const delta = Math.min((now - last) / 1000, 0.05); last = now;
    capsules.step(delta, reduced.matches);
    transportScene.step(delta);
    if (!paused && !reduced.matches && !clash.busy() && !replyQueue.length && !transports.size) {
      pipeClock += delta;
      if (pipeClock >= 0.10) {
        pipeClock = 0;
        const side = capsules.replayPipe();
        if (side) pipes[side].until = Math.max(pipes[side].until, now + 220);
      }
    }
    releaseClock += delta;
    const waiting = capsules.stats();
    const priority = waiting.queuedId !== null || replyQueue.length > 0;
    const userSpill = spillQueue > 0;
    const due = !!replyQueue[0]?.transport || reduced.matches || releaseClock >= (priority ? 0.55 : userSpill ? 0.1 : 1.8);
    const canMove = (!paused || allowPausedRelease) && !duel.pinned() && !history.pinned();
    const replaceReady = duel.canReplace(false) && !outputQueue.length &&
      dispenser.readyForNext(true, reduced.matches);
    if (canMove && !clash.busy() && !transports.size && replaceReady && due && (priority || userSpill || (!paused && !reduced.matches))) {
      const selection = replyQueue.length ? replyQueue.shift() : waiting.queuedId !== null ? (waiting.drawReady ? capsules.takeForDraw() : null) : capsules.takeHistorical();
      if (selection) {
        if (userSpill && !priority) spillQueue--;
        startSelection(selection);
      }
    }
    if (canMove) {
      outputClock += delta;
      if (outputQueue.length && (reduced.matches || outputClock >= 0.45) && dispenser.readyForNext(true, reduced.matches)) {
        if (dispenser.start(outputQueue[0], reduced.matches)) { outputQueue.shift(); outputClock = 0; }
      }
      dispenser.step(delta, reduced.matches);
      duel.step(delta, reduced.matches);
      history.step(delta, reduced.matches);
      clash.step(delta);
    }
    if (!reduced.matches && !duelField.hidden && duel.canReplace(false) && !clash.busy()) {
      duel.clear(); duelField.hidden = true; history.setVisible(true);
    }
    reveals.update([], capsules.presentation().tracking, camera);
    const outputActive = outputQueue.length > 0 || dispenser.outputs().length > 0;
    if (paused && !replyQueue.length && !transports.size && !spillQueue && !outputActive && !duel.needsFrame() && !history.stats().historyArriving && !clash.busy()) {
      allowPausedRelease = false;
      syncMotionPause();
    }
    for (const item of Object.values(pipes)) {
      const pulse = reduced.matches ? 0 : Math.min(1, Math.max(0, (item.until - now) / 600));
      item.material.emissiveIntensity = pulse * 0.5;
      item.group.scale.set(1 + pulse * 0.13, 1 + pulse * 0.13, 1);
    }
    renderFrame();
    syncControls();
    if (now - statsAt > 250) {
      statsAt = now;
      container.dataset.renderStats = JSON.stringify({ ...capsules.stats(), ...dispenser.stats(), ...duel.stats(), ...history.stats(), ...clash.stats(), outputQueued: outputQueue.length, replyQueued: replyQueue.length, spillQueue, draws: renderer.info.render.calls, geometries: renderer.info.memory.geometries });
      container.dataset.flowState = reduced.matches ? 'reduced' : paused ? 'paused' : 'running';
    }
    const pendingRelease = (waiting.queuedId !== null || replyQueue.length || spillQueue) && !clash.busy() && duel.canReplace(false);
    if ((!paused && !reduced.matches) || ((allowPausedRelease || (!paused && reduced.matches)) && (pendingRelease || outputActive || duel.needsFrame() || history.needsFrame() || clash.needsFrame())) || now < awakeUntil) frame = requestAnimationFrame(tick);
  }
  function syncControls() {
    const stats = capsules.stats(), busy = duel.busy() || clash.busy();
    const detail = { phase: dispenser.stats().outputRolling ? 'rolling' : busy ? 'open' : 'idle', ready: stats.drawReady && !busy, pending: replyQueue.length > 0 };
    const key = JSON.stringify(detail);
    if (key !== controlKey) { controlKey = key; container.dispatchEvent(new CustomEvent('slidestate', { detail })); }
  }
  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    const aspect = width / height;
    camera.left = -10 * aspect; camera.right = 10 * aspect;
    camera.top = 10; camera.bottom = -10; camera.zoom = 1; camera.clearViewOffset();
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const corners = [];
    for (const x of [-halfWidth, halfWidth]) for (const y of [TANK.bottom, TANK.rim]) for (const z of [-halfDepth, halfDepth]) {
      corners.push(new THREE.Vector3(x, y, z).project(camera));
    }
    const xs = corners.map(p => p.x);
    const ys = corners.map(p => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const projectedWidth = (Math.max(...xs) - Math.min(...xs)) * width / 2;
    const projectedHeight = (maxY - minY) * height / 2;
    camera.zoom = Math.min(width * 0.8 / projectedWidth, height * 0.66 / projectedHeight);
    const centerY = (minY + maxY) * camera.zoom / 2;
    const desktopOffset = width > 1000 ? 36 : 0;
    camera.setViewOffset(width, height, 0, (0.24 - centerY) * height / 2 - desktopOffset, width, height);
    const anchors = {};
    for (const side of ['a', 'b']) {
      const pose = nozzlePose(side), direction = new THREE.Vector3(...pose.direction).normalize();
      const rear = new THREE.Vector3(...pose.mouth).addScaledVector(direction, -PIPE_LENGTH);
      const rearPoint = project(rear.toArray()), mouthPoint = project(pose.mouth);
      const axisX = mouthPoint.x - rearPoint.x, axisY = mouthPoint.y - rearPoint.y;
      const axisLength = Math.hypot(axisX, axisY);
      const crossSection = new THREE.Vector3().crossVectors(direction, camera.position.clone().sub(rear)).normalize().multiplyScalar(0.8);
      const rimA = project(rear.clone().add(crossSection).toArray());
      const rimB = project(rear.clone().sub(crossSection).toArray());
      anchors[side] = {
        ...rearPoint, mouth: mouthPoint,
        capsuleDiameter: Math.abs(project([RADIUS * FRESH_CAPSULE_SCALE * 2, 0, 0]).x - project([0, 0, 0]).x),
        direction: { x: axisX / axisLength, y: axisY / axisLength },
        width: Math.hypot(rimA.x - rimB.x, rimA.y - rimB.y)
      };
      const station = stage.querySelector('#station-' + side), p = project(nozzlePose(side).mouth);
      if (station) {
        station.style.left = p.x + 'px'; station.style.top = p.y + 'px';
        station.style.setProperty('--station-x', p.x + 'px');
        station.style.setProperty('--station-y', p.y + 'px');
        station.style.setProperty('--stage-width', width + 'px');
        const body = pipes[side].group.position;
        const stamp = project([body.x, body.y - 0.25, body.z + 0.8]);
        const meter = station.querySelector('.pipe-meter');
        meter.style.left = (stamp.x - p.x) + 'px'; meter.style.top = (stamp.y - p.y) + 'px';
      }
    }
    container.dataset.pipeAnchors = JSON.stringify(anchors);
    const landingZ = 10.1;
    const landingY = TRAY.y + (TRAY.frontY - TRAY.y) * (landingZ - TRAY.back) / (TRAY.front - TRAY.back) + 0.12;
    const worldDestinations = [-4.4, 4.4].map(x => ({ x, y: landingY, z: landingZ }));
    const destinations = worldDestinations.map(point => project([point.x, point.y, point.z]));
    duel.setLayout(destinations);
    const historyZ = landingZ;
    const historyY = TRAY.y + (TRAY.frontY - TRAY.y) * (historyZ - TRAY.back) / (TRAY.front - TRAY.back) + 0.12;
    const historySpread = TRAY.frontWidth * 0.22;
    const historyWorld = [-historySpread, historySpread].map(x => ({ x, y: historyY, z: historyZ }));
    const historyPoints = historyWorld.map(point => project([point.x, point.y, point.z]));
    history.setLayout({ left: historyPoints[0], right: historyPoints[1], worldLeft: historyWorld[0], worldRight: historyWorld[1], width });
    clash.reposition();
    if (clash.busy()) clash.step(0);
    wake();
  }
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(container);
  function suspend() { if (frame) cancelAnimationFrame(frame); frame = 0; syncMotionPause(); container.dataset.flowState = 'hidden'; }
  const visibilityObserver = new IntersectionObserver(entries => { isVisible = entries[0].isIntersecting; if (isVisible) wake(); else suspend(); });
  visibilityObserver.observe(stage);
  const visibilityChanged = () => { if (document.hidden) suspend(); else wake(); };
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('sparringassetsready', wake);
  reduced.addEventListener('change', wake);
  const duelWake = () => wake();
  stage.addEventListener('duelwake', duelWake);
  stage.addEventListener('historywake', duelWake);
  const clashWake = () => { allowPausedRelease = paused; wake(); };
  container.addEventListener('clashwake', clashWake);
  renderer.domElement.addEventListener('click', event => {
    if (capsules.pick(event, container, camera)) { allowPausedRelease = paused; wake(); }
  });
  const updateHoses = event => {
    transportScene.update(event.detail, document.documentElement.clientWidth, innerHeight);
    layoutReady = true;
    document.documentElement.classList.add('transport-webgl-ready');
    wake();
  };
  container.addEventListener('transportlayout', updateHoses);
  const shipCapsule = event => {
    if (disposed || !document.documentElement.classList.contains('transport-webgl-ready')) return;
    event.detail.handled = true;
    event.detail.cancel = transportScene.ship(event.detail);
    wake();
  };
  container.addEventListener('capsuleship', shipCapsule);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); document.documentElement.classList.remove('transport-webgl-ready'); container.dispatchEvent(new CustomEvent('sceneerror')); });
  resize();
  return {
    ready,
    dispose() {
      disposed = true; suspend();
      sizeObserver.disconnect(); visibilityObserver.disconnect();
      container.removeEventListener('transportlayout', updateHoses);
      container.removeEventListener('capsuleship', shipCapsule);
      transportScene.dispose();
      document.documentElement.classList.remove('transport-webgl-ready');
      reduced.removeEventListener('change', wake);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('sparringassetsready', wake);
      stage.removeEventListener('duelwake', duelWake);
      stage.removeEventListener('historywake', duelWake);
      container.removeEventListener('clashwake', clashWake);
      for (const delivery of transports) {
        try { delivery.cancel?.(); }
        finally { delivery.settle(); }
      }
      transports.clear();
      for (const selection of replyQueue) selection.settle?.();
      outputQueue = []; replyQueue.length = 0; dispenser.clearAll(); duel.dispose(); history.dispose(); reveals.dispose(); clash.dispose();
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat().filter(Boolean)) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
      textures.forEach(value => value.dispose()); scene.environment?.dispose(); sun.shadow.map?.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
    chooseSide(side) { pipes[side].until = performance.now() + 600; wake(); },
    spill() { spillQueue = Math.min(spillQueue + 1, 4); allowPausedRelease = paused; wake(); },
    replayReply(post) {
      if (!post.replyTo) return;
      if (!replyQueue.some(item => item.post.id === post.id)) replyQueue.push({ post, fresh: false, replayClash: true });
      allowPausedRelease = paused; wake();
    },
    launch(post, transport) {
      if (disposed || launchedIds.has(String(post.id))) return;
      launchedIds.add(String(post.id));
      if (launchedIds.size > 256) launchedIds.delete(launchedIds.values().next().value);
      let settle;
      const delivered = transport ? new Promise(resolve => { settle = resolve; }) : undefined;
      allowPausedRelease = paused;
      if (post.replyTo) replyQueue.push({ post, fresh: true, transport, settle });
      else {
        const arrive = () => {
          capsules.launch(post, { reduced: reduced.matches });
          pipes[post.side].until = performance.now() + 600;
        };
        if (transport) startTransport(transport, arrive, settle);
        else arrive();
      }
      wake();
      awakeUntil = performance.now() + 5000;
      return delivered;
    },
    celebrate(id) { if (!reduced.matches) capsules.nudge(id); wake(); },
    updateState(posts, balance) {
      capsules.updateState(posts, balance); duel.updateState(posts);
      if (!seeded) {
        seeded = true;
        if (posts.length) startSelection(capsules.takeHistorical());
      }
      wake();
    },
    setPaused(value) { paused = value; allowPausedRelease = false; capsules.setPaused(value); wake(); },
    setMode(next) { capsules.setMode(next); for (const item of Object.values(pipes)) item.group.visible = next === 'pressure'; resize(); },
  };
}
