import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { createRoomRendering } from "./roomRendering";

jest.mock("three/addons/postprocessing/EffectComposer.js", () => ({ EffectComposer: jest.fn(() => ({
  passes: [], addPass(pass) { this.passes.push(pass); }, setSize: jest.fn(), render: jest.fn(), dispose: jest.fn()
})) }));
jest.mock("three/addons/postprocessing/RenderPass.js", () => ({ RenderPass: jest.fn((scene, camera) => ({ camera, dispose: jest.fn() })) }));
jest.mock("three/addons/postprocessing/UnrealBloomPass.js", () => ({ UnrealBloomPass: jest.fn((size, strength, radius, threshold) => ({
  strength, radius, threshold, renderTargetsHorizontal: [{ texture: {} }], dispose: jest.fn()
})) }));
jest.mock("three/addons/postprocessing/OutputPass.js", () => ({ OutputPass: jest.fn(() => ({ render: jest.fn(), dispose: jest.fn() })) }));
jest.mock("three/addons/postprocessing/SavePass.js", () => ({ SavePass: jest.fn(() => ({ renderTarget: { texture: {} }, dispose: jest.fn() })) }));
jest.mock("three/addons/postprocessing/ShaderPass.js", () => ({ ShaderPass: jest.fn((shader) => ({ ...shader, uniforms: Object.fromEntries(Object.entries(shader.uniforms).map(([key, uniform]) => [key, { value: uniform.value && typeof uniform.value === "object" ? { ...uniform.value } : uniform.value }])), dispose: jest.fn() })) }));

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  const runtime = createRoomRendering({}, scene, camera);
  const composer = EffectComposer.mock.results.at(-1).value;
  return { scene, camera, runtime, composer, passes: composer.passes };
}

test("captures untouched beauty coverage before effects and restores it after display conversion", () => {
  const { runtime, composer, scene, camera, passes: [beauty, coverage, bloom, output, alpha] } = setup();
  runtime.resize(1200, 800);
  runtime.render(camera, { shadows: true, lamps: 100 });
  expect(composer.passes).toHaveLength(5);
  expect(beauty.camera).toBe(camera);
  expect(alpha.uniforms.tBeauty.value).toBe(coverage.renderTarget.texture);
  expect(alpha.uniforms.tBloom.value).toBe(bloom.renderTargetsHorizontal[0].texture);
  expect(alpha.fragmentShader).toContain("max(coverage, halo)");
  expect(scene.background).toBeNull();
  expect(bloom).toMatchObject({ strength: 0.075, radius: 0.15, threshold: 4.2 });
  expect(output).toBeDefined();
  expect(composer.setSize).toHaveBeenCalledWith(1200, 800);
  runtime.dispose();
  for (const pass of composer.passes) expect(pass.dispose).toHaveBeenCalledTimes(1);
  expect(composer.dispose).toHaveBeenCalledTimes(1);
});

test("switches walking camera projection and adjusts bloom to the lamp setting", () => {
  const { runtime, camera, passes: [beauty, , bloom, , alpha] } = setup();
  const perspective = new THREE.PerspectiveCamera();
  runtime.render(perspective, { lamps: 50 });
  expect(beauty.camera).toBe(perspective);
  expect(bloom.strength).toBe(0.0375);
  runtime.render(camera, { lamps: 0 });
  expect(beauty.camera).toBe(camera);
  expect(bloom.enabled).toBe(false);
  expect(alpha.uniforms.bloomEnabled.value).toBe(0);
});

test("draws the horizon behind the near scene before capturing their shared coverage", () => {
  const scene = new THREE.Scene();
  const backdrop = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  const horizonCamera = new THREE.PerspectiveCamera();
  const runtime = createRoomRendering({}, scene, camera, backdrop, horizonCamera);
  const { passes } = EffectComposer.mock.results.at(-1).value;
  expect(passes[0].camera).toBe(horizonCamera);
  expect(passes[1]).toMatchObject({ camera, clear: false, clearDepth: true });
  expect(passes[2].renderTarget.texture).toBe(passes.at(-1).uniforms.tBeauty.value);
  runtime.dispose();
});

test("moving frames draw the same scenes directly and settled frames restore effects", () => {
  const renderer = { autoClear: true, getRenderTarget: () => null, setRenderTarget: jest.fn(), clear: jest.fn(), clearDepth: jest.fn(), render: jest.fn() };
  const scene = new THREE.Scene();
  const backdrop = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  const horizon = new THREE.PerspectiveCamera();
  const runtime = createRoomRendering(renderer, scene, camera, backdrop, horizon);
  const composer = EffectComposer.mock.results.at(-1).value;
  const atmosphere = { shadows: true, lamps: 100 };

  runtime.render(camera, atmosphere, { moving: true });
  expect(renderer.clear).toHaveBeenCalledTimes(1);
  expect(renderer.render.mock.calls).toEqual([[backdrop, horizon], [scene, camera]]);
  expect(renderer.clearDepth.mock.invocationCallOrder[0]).toBeGreaterThan(renderer.render.mock.invocationCallOrder[0]);
  expect(renderer.clearDepth.mock.invocationCallOrder[0]).toBeLessThan(renderer.render.mock.invocationCallOrder[1]);
  expect(renderer.autoClear).toBe(true);
  expect(composer.render).not.toHaveBeenCalled();

  runtime.render(camera, atmosphere, { moving: true, preview: true });
  expect(renderer.render).toHaveBeenCalledTimes(2);
  expect(composer.render).toHaveBeenCalledTimes(1);
  expect(composer.passes.slice(2).map((pass) => pass.enabled)).toEqual([false, false, undefined, false]);

  runtime.render(camera, atmosphere);
  expect(composer.render).toHaveBeenCalledTimes(2);
  expect(composer.passes.slice(2).map((pass) => pass.enabled)).toEqual([true, true, undefined, true]);
  runtime.dispose();
});

test("reserves the flight buffer during warmup and reuses it at the visible resolution", () => {
  let warmViewport;
  const renderer = { autoClear: true, capabilities: { maxSamples: 4 }, shadowMap: { needsUpdate: true }, getRenderTarget: () => null,
    setRenderTarget: jest.fn((target) => { if (target) warmViewport = target.viewport.clone(); }),
    clear: jest.fn(), render: jest.fn(),
    getDrawingBufferSize: (size) => size.set(800, 450) };
  const camera = new THREE.OrthographicCamera();
  const runtime = createRoomRendering(renderer, new THREE.Scene(), camera);
  const composer = EffectComposer.mock.results.at(-1).value;
  const output = composer.passes.at(-2);

  runtime.prepareFlight(camera, 800, 450);
  const target = renderer.setRenderTarget.mock.calls[0][0];
  expect(target).toMatchObject({ width: 800, height: 450, samples: 2 });
  expect(EffectComposer.mock.calls.at(-1)[1].samples).toBe(2);
  expect(warmViewport.toArray()).toEqual([0, 0, 1, 1]);
  expect(target.viewport.toArray()).toEqual([0, 0, 800, 450]);
  expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(null);
  expect(renderer.shadowMap.needsUpdate).toBe(true);
  expect(output.render).not.toHaveBeenCalled();

  renderer.shadowMap.needsUpdate = false;
  renderer.render.mockImplementationOnce(() => {
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    renderer.shadowMap.needsUpdate = false;
  });
  runtime.prepareFlight(camera, 800, 450, { warmShadows: true });
  expect(renderer.shadowMap.needsUpdate).toBe(true);

  const disposeTarget = jest.spyOn(target, "dispose");
  runtime.render(camera, {}, { moving: true, flying: true });
  expect(target).toMatchObject({ width: 800, height: 450 });
  expect(disposeTarget).not.toHaveBeenCalled();
  expect(output.renderToScreen).toBe(true);
  expect(output.render).toHaveBeenCalledWith(renderer, null, target);
  expect(composer.render).not.toHaveBeenCalled();
  runtime.dispose();
});
