import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SavePass } from "three/addons/postprocessing/SavePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Optical glow is limited to HDR emitters; the room itself remains sharp.
export function createRoomRendering(renderer, scene, camera, backdropScene, backdropCamera) {
  // Default framebuffer antialiasing does not apply to these offscreen scene passes.
  const samples = Math.min(renderer.capabilities?.maxSamples ?? 0, 2);
  const sceneTarget = { type: THREE.HalfFloatType, samples };
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, sceneTarget));
  const beauty = new RenderPass(scene, camera);
  const backdrop = backdropScene && new RenderPass(backdropScene, backdropCamera);
  if (backdrop) {
    // Both passes share coverage, but the near scene has its own depth buffer contents.
    beauty.clear = false;
    beauty.clearDepth = true;
  }
  const glowStrength = 0.075;
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), glowStrength, 0.15, 4.2);
  const output = new OutputPass();
  // Preserve coverage before bloom, whose fullscreen passes overwrite alpha.
  const coverage = new SavePass();
  const restoreAlpha = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tBeauty: { value: null },
      tBloom: { value: null }, bloomEnabled: { value: 1 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse, tBeauty, tBloom;
      uniform float bloomEnabled; varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        float coverage = texture2D(tBeauty, vUv).a;
        vec3 glow = texture2D(tBloom, vUv).rgb * bloomEnabled;
        float halo = clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
        gl_FragColor = vec4(color.rgb, max(coverage, halo));
      }`
  });
  // ShaderPass clones texture uniforms; render-target textures must retain identity.
  restoreAlpha.uniforms.tBeauty.value = coverage.renderTarget.texture;
  restoreAlpha.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
  const passes = [backdrop, beauty, coverage, bloom, output, restoreAlpha].filter(Boolean);
  for (const pass of passes) composer.addPass(pass);
  const flightTarget = new THREE.WebGLRenderTarget(1, 1, sceneTarget);
  const flightSize = new THREE.Vector2();

  function renderLayers(activeCamera, target) {
    const previousTarget = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.setRenderTarget(target);
      renderer.clear();
      if (backdrop) {
        renderer.render(backdropScene, backdropCamera);
        renderer.clearDepth();
      }
      renderer.render(scene, activeCamera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = autoClear;
    }
  }

  return {
    resize(w, h) { composer.setSize(w, h); },
    compile(activeCamera) {
      const previousTarget = renderer.getRenderTarget();
      try {
        // Compile for the same linear HDR output used by every room render path.
        renderer.setRenderTarget(flightTarget);
        return Promise.all([
          renderer.compileAsync(scene, activeCamera),
          backdrop && renderer.compileAsync(backdropScene, backdropCamera)
        ]);
      } finally { renderer.setRenderTarget(previousTarget); }
    },
    prepareAssets(activeCamera, width, height) {
      const hidden = [];
      const culled = [];
      scene.traverse((object) => {
        if (!object.visible && !object.isLight) { hidden.push(object); object.visible = true; }
        if (object.frustumCulled) { culled.push(object); object.frustumCulled = false; }
      });
      try {
        // Upload hidden floors and exterior assets before releasing the loading screen.
        this.prepareFlight(activeCamera, width, height, { warmShadows: true });
      } finally {
        hidden.forEach((object) => { object.visible = false; });
        culled.forEach((object) => { object.frustumCulled = true; });
      }
    },
    prepareFlight(activeCamera, width, height, { warmShadows = false } = {}) {
      flightTarget.setSize(width, height);
      // Reserve the full-size HDR target in idle time while warming shaders over one pixel.
      flightTarget.viewport.set(0, 0, 1, 1);
      const shadowUpdate = renderer.shadowMap.needsUpdate;
      renderer.shadowMap.needsUpdate = warmShadows;
      try {
        // Submit an offscreen frame so shaders, geometry and textures are ready for the first visible move.
        renderLayers(activeCamera, flightTarget);
      } finally {
        flightTarget.viewport.set(0, 0, width, height);
        // A shadow warmup used a different presentation. Restore the map on the next frame.
        renderer.shadowMap.needsUpdate = shadowUpdate || warmShadows;
      }
    },
    render(activeCamera, atmosphere, { moving = false, flying = false, preview = false } = {}) {
      if (flying || (moving && !preview)) {
        // Keep motion on the warmed linear material path; direct screen rendering needs different shaders.
        renderer.getDrawingBufferSize(flightSize);
        flightTarget.setSize(flightSize.x, flightSize.y);
        renderLayers(activeCamera, flightTarget);
        output.renderToScreen = true;
        output.render(renderer, null, flightTarget);
        return;
      }
      beauty.camera = activeCamera;
      // Keep the preview on its existing framebuffer and shader path during an orbit.
      const showGlow = !moving;
      coverage.enabled = restoreAlpha.enabled = showGlow;
      bloom.enabled = showGlow && atmosphere.lamps > 0;
      bloom.strength = glowStrength * Math.min(1, atmosphere.lamps / 100);
      restoreAlpha.uniforms.bloomEnabled.value = bloom.enabled ? 1 : 0;
      composer.render();
    },
    dispose() {
      flightTarget.dispose();
      for (const pass of passes) pass.dispose();
      composer.dispose();
    }
  };
}
