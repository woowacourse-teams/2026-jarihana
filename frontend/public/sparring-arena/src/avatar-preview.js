import * as THREE from 'three';
import { createWalkingCharacters } from './walking-characters.js';
import { readAvatarAppearance } from './avatar-appearance.js';
import { createStudioEnvironment } from './studio-materials.js';

// One model factory for live full-body previews and fixed, transparent face images.
export function createAvatarPreview(container, { platformColor = 0xf7f8ed, lightweight = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lightweight ? 1.25 : 1.7));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = !lightweight;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xffffff, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  if (!lightweight) scene.environment = createStudioEnvironment(renderer);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe5e7eb, lightweight ? 2.2 : 0.7));
  const sun = new THREE.DirectionalLight(0xfff5e9, 2.6);
  sun.position.set(-4, 10, 7); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -2, near: 0.5, far: 25 });
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.normalBias = 0.006; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe9faff, 0.5); fill.position.set(5, 4, -5); scene.add(fill);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.91, 1, 0.12, 64), lightweight
    ? new THREE.MeshLambertMaterial({ color: platformColor }) : new THREE.MeshStandardMaterial({ color: platformColor, roughness: 0.9 }));
  platform.position.y = -0.06; platform.receiveShadow = true; scene.add(platform);
  const camera = new THREE.OrthographicCamera(-1.7, 1.7, 2.5, -0.25, 0.1, 30);
  camera.position.set(0, 1.75, 8); camera.lookAt(0, 1, 0);
  const portraitCamera = new THREE.OrthographicCamera(-0.75, 0.75, 0.75, -0.75, 0.1, 15);
  portraitCamera.position.set(0, 1.72, 6); portraitCamera.lookAt(0, 1.72, 0);
  // The small, idle MyPage card uses the same geometry with inexpensive lighting.
  const models = createWalkingCharacters(scene, 1, { lightweight }), origin = new THREE.Vector3();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let appearance = null, pose = 'idle', yaw = 0, frame = 0, disposed = false, visible = true;
  let width = 1, height = 1;
  function draw(time = 0) {
    if (disposed) return;
    const moving = !reduced.matches;
    const packed = pose === 'packed';
    const state = packed ? { crouch: 0.9, leftArm: -0.95, rightArm: -0.95, head: 0.04 }
      : { stride: pose === 'walk' && moving ? Math.sin(time * 5) : 0,
        stepLift: 0.05, speaking: pose === 'talk' && moving, time };
    models.draw(0, { appearance }, origin, 1, state, yaw);
    renderer.render(scene, camera);
  }
  function animate(now) {
    frame = 0; draw(now / 1000);
    if (!disposed && visible && !document.hidden && !reduced.matches && (pose === 'walk' || pose === 'talk')) frame = requestAnimationFrame(animate);
  }
  function refresh() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!disposed && visible && !document.hidden) animate(performance.now());
  }
  function resize() {
    width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
    const span = 1.5;
    camera.left = -span * width / height; camera.right = span * width / height;
    camera.top = span; camera.bottom = -span; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); refresh();
  }
  const observer = new ResizeObserver(resize); observer.observe(container);
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; refresh(); }); intersection.observe(container);
  document.addEventListener('visibilitychange', refresh); reduced.addEventListener('change', refresh);
  const contextLost = event => { event.preventDefault(); container.dispatchEvent(new Event('avatarerror')); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize();
  return {
    setAppearance(value) { appearance = readAvatarAppearance(value); refresh(); },
    setPose(value) { if (['idle', 'walk', 'talk', 'packed'].includes(value)) { pose = value; refresh(); } },
    setRotation(degrees) { yaw = THREE.MathUtils.degToRad(degrees); refresh(); },
    portrait(value, size = 256) {
      const normalized = readAvatarAppearance(value);
      if (!normalized) throw new Error('캐릭터 외형을 확인해 주세요.');
      const ratio = renderer.getPixelRatio();
      try {
        renderer.setPixelRatio(1); renderer.setSize(size, size, false); platform.visible = false;
        models.draw(0, { appearance: normalized }, origin, 1, {}, 0);
        renderer.render(scene, portraitCamera);
        return renderer.domElement.toDataURL('image/png');
      } finally {
        platform.visible = true; renderer.setPixelRatio(ratio); renderer.setSize(width, height, false); draw();
      }
    },
    dispose() {
      disposed = true; if (frame) cancelAnimationFrame(frame);
      observer.disconnect(); intersection.disconnect();
      reduced.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set(), materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat().filter(Boolean)) materials.add(material);
        if (object.isInstancedMesh) object.dispose();
      });
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
      scene.environment?.dispose(); sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
