import * as THREE from 'three';
import { createCapsules } from './capsules.js';
import { createCharacterDuel } from './character-duel.js';
import { TANK, nozzlePose } from './physics.js';
import { studioMaterial, createStudioEnvironment } from './studio-materials.js';

const PIPE_LENGTH = 2.35;

export function createArena(container, onSelect, onReveal) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xffffff, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  scene.environment = createStudioEnvironment(renderer);
  container.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, -5.5, 19);
  camera.lookAt(0, -1.5, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcd8ca, 0.35));
  const sun = new THREE.DirectionalLight(0xfff8ec, 2.3);
  sun.position.set(-4, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -13, near: 0.5, far: 35 });
  sun.shadow.normalBias = 0.03; sun.shadow.bias = -0.0001; scene.add(sun);
  const light = new THREE.DirectionalLight(0xe9faff, 0.5); light.position.set(5, 4, -5); scene.add(light);

  const height = TANK.rim - TANK.bottom;
  const halfWidth = TANK.width / 2, halfDepth = TANK.depth / 2;
  const glass = studioMaterial({ color: 0xd1eee7, transparent: true, opacity: 0.06, roughness: 0.24, side: THREE.DoubleSide, depthWrite: false });
  const rimMaterial = studioMaterial({ color: 0xd9e8dd, roughness: 0.45 });
  const edgeMaterial = studioMaterial({ color: 0xc7dcd2, roughness: 0.45 });
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
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  for (const x of [-halfWidth + 0.12, halfWidth - 0.12]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.045, height - 0.3), shine);
    strip.position.set(x, (TANK.rim + TANK.bottom) / 2, halfDepth + 0.03); scene.add(strip);
  }
  box([TANK.width + 0.3, 0.15, TANK.depth + 0.2], [0, TANK.bottom - 0.08, 0], rimMaterial);

  function pipe(side, color) {
    const pose = nozzlePose(side), direction = new THREE.Vector3(...pose.direction).normalize();
    const length = PIPE_LENGTH;
    const group = new THREE.Group();
    group.position.copy(new THREE.Vector3(...pose.mouth).addScaledVector(direction, -length / 2));
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    const material = studioMaterial({ color, roughness: 0.42, emissive: color, emissiveIntensity: 0 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, length, 36, 1, true), material);
    tube.rotation.x = Math.PI / 2; tube.castShadow = true; group.add(tube);
    const dark = studioMaterial({ color: side === 'a' ? 0x235f53 : 0x905143, roughness: 0.65, side: THREE.DoubleSide });
    const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, length, 36, 1, true), dark);
    inside.rotation.x = Math.PI / 2; group.add(inside);
    for (const z of [-length / 2, length / 2]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.095, 10, 36), material); lip.position.z = z; group.add(lip);
    }
    scene.add(group);
    return { group, material, until: 0 };
  }
  const pipes = { a: pipe('a', 0x2ac1bc), b: pipe('b', 0xed6a5a) };
  const capsules = createCapsules(scene, onSelect, post => container.dispatchEvent(new CustomEvent('capsuleready', { detail: { id: post.id } })));
  const stage = container.parentElement;
  const duel = createCharacterDuel(stage, onSelect, onReveal);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let releaseClock = 0, pipeClock = 0, allowPausedRelease = false, spillQueue = 0;
  let disposed = false, controlKey = '', frame = 0, awakeUntil = 0, last = performance.now(), isVisible = true, paused = false, statsAt = 0;
  function syncMotionPause() { duel.setPaused((paused && !allowPausedRelease) || !isVisible || document.hidden); }
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
    if (!paused && !reduced.matches) {
      pipeClock += delta;
      if (pipeClock >= 0.18) {
        pipeClock = 0;
        const side = capsules.replayPipe();
        if (side) pipes[side].until = Math.max(pipes[side].until, now + 220);
      }
    }
    releaseClock += delta;
    const waiting = capsules.stats();
    const priority = waiting.queuedId !== null;
    const userSpill = spillQueue > 0;
    const due = reduced.matches || releaseClock >= (priority ? 0.55 : userSpill ? 0.75 : 7);
    if ((!paused || allowPausedRelease) && !duel.busy() && due && (priority || userSpill || (!paused && !reduced.matches))) {
      const selection = priority ? (waiting.drawReady ? capsules.takeForDraw() : null) : userSpill ? capsules.takeHistorical() : capsules.takeForDraw();
      if (selection) {
        if (userSpill && !priority) spillQueue--;
        duel.start(selection.post, selection.fresh, reduced.matches);
        releaseClock = 0;
      }
    }
    if (!paused || allowPausedRelease) duel.step(delta, reduced.matches);
    if (paused && !capsules.stats().pendingFresh && !spillQueue && !duel.needsFrame()) {
      allowPausedRelease = false;
      syncMotionPause();
    }
    for (const item of Object.values(pipes)) {
      const pulse = reduced.matches ? 0 : Math.min(1, Math.max(0, (item.until - now) / 600));
      item.material.emissiveIntensity = pulse * 0.5;
      item.group.scale.set(1 + pulse * 0.13, 1 + pulse * 0.13, 1);
    }
    renderer.render(scene, camera);
    syncControls();
    if (now - statsAt > 250) {
      statsAt = now;
      container.dataset.renderStats = JSON.stringify({ ...capsules.stats(), ...duel.stats(), spillQueue, draws: renderer.info.render.calls, geometries: renderer.info.memory.geometries });
      container.dataset.flowState = reduced.matches ? 'reduced' : paused ? 'paused' : 'running';
    }
    const pendingRelease = (waiting.pendingFresh || spillQueue) && !duel.busy();
    if ((!paused && !reduced.matches) || ((allowPausedRelease || (!paused && reduced.matches)) && (pendingRelease || duel.needsFrame())) || now < awakeUntil) frame = requestAnimationFrame(tick);
  }
  function syncControls() {
    const stats = capsules.stats(), busy = duel.busy();
    const detail = { phase: busy ? 'open' : 'idle', ready: stats.drawReady && !busy, pending: stats.pendingFresh > 0 };
    const key = JSON.stringify(detail);
    if (key !== controlKey) { controlKey = key; container.dispatchEvent(new CustomEvent('slidestate', { detail })); }
  }
  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.aspect = aspect; camera.fov = 48; camera.zoom = 1; camera.clearViewOffset();
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const corners = [];
    for (const x of [-halfWidth, halfWidth]) for (const y of [TANK.bottom, TANK.rim]) for (const z of [-halfDepth, halfDepth]) {
      corners.push(new THREE.Vector3(x, y, z).project(camera));
    }
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const projectedWidth = (Math.max(...xs) - Math.min(...xs)) * width / 2;
    const projectedHeight = (maxY - minY) * height / 2;
    camera.zoom = Math.min(width * 0.8 / projectedWidth, height * 0.7 / projectedHeight);
    const centerY = (minY + maxY) * camera.zoom / 2;
    camera.setViewOffset(width, height, 0, (0.18 - centerY) * height / 2, width, height);
    function project(position) {
      const p = new THREE.Vector3(...position).project(camera);
      return { x: (p.x + 1) * width / 2, y: container.offsetTop + (1 - p.y) * height / 2 };
    }
    const anchors = {};
    for (const side of ['a', 'b']) {
      const pose = nozzlePose(side);
      const rear = new THREE.Vector3(...pose.mouth).addScaledVector(new THREE.Vector3(...pose.direction).normalize(), -PIPE_LENGTH);
      anchors[side] = project(rear.toArray());
      const station = stage.querySelector('#station-' + side), p = project(nozzlePose(side).mouth);
      if (station) {
        station.style.left = p.x + 'px'; station.style.top = p.y + 'px';
        const body = pipes[side].group.position;
        const stamp = project([body.x, body.y - 0.25, body.z + 0.8]);
        const meter = station.querySelector('.pipe-meter');
        meter.style.left = (stamp.x - p.x) + 'px'; meter.style.top = (stamp.y - p.y) + 'px';
      }
    }
    container.dataset.pipeAnchors = JSON.stringify(anchors);
    const floor = project([-TANK.width / 2 + 2.5, TANK.bottom, TANK.depth / 2]);
    const caption = stage.querySelector('.tank-caption');
    if (caption) { caption.style.left = floor.x + 'px'; caption.style.top = (floor.y + 10) + 'px'; }
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
  renderer.domElement.addEventListener('click', event => {
    if (capsules.pick(event, renderer.domElement, camera)) { allowPausedRelease = paused; wake(); }
  });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); container.dispatchEvent(new CustomEvent('sceneerror')); });
  resize();
  return {
    dispose() {
      disposed = true; suspend();
      sizeObserver.disconnect(); visibilityObserver.disconnect();
      reduced.removeEventListener('change', wake);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('sparringassetsready', wake);
      stage.removeEventListener('duelwake', duelWake);
      duel.dispose();
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean)) {
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
    launch(post) {
      allowPausedRelease = paused;
      if (post.replyTo) {
        duel.start(post, true, reduced.matches);
        releaseClock = 0;
        pipes.a.until = pipes.b.until = performance.now() + 1000;
      } else {
        capsules.launch(post, { reduced: reduced.matches });
        pipes[post.side].until = performance.now() + 600;
      }
      wake();
    },
    celebrate(id) { if (!reduced.matches) capsules.nudge(id); wake(); },
    updateState(posts, balance) { capsules.updateState(posts, balance); duel.updateState(posts); wake(); },
    setPaused(value) { paused = value; allowPausedRelease = false; capsules.setPaused(value); wake(); },
    setMode(next) { capsules.setMode(next); for (const item of Object.values(pipes)) item.group.visible = next === 'pressure'; resize(); },
  };
}
