import * as THREE from "three";

const SKY_DISTANCE = 1050;
const ORB_SPAN = 128;
const ORB_COLORS = { dawn: "#ffe8b4", day: "#fff4ce", dusk: "#ffe8b4", night: "#e3e8f7" };

export function createRoomSkyOrb() {
  const direction = new THREE.Vector3();
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color() }, moon: { value: 0 } },
    vertexShader: `
      varying vec2 orbUv;
      void main() {
        orbUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 tint;
      uniform float moon;
      varying vec2 orbUv;
      void main() {
        float radius = length(orbUv - 0.5);
        float disc = 1.0 - smoothstep(0.17 - moon * 0.035, 0.18 - moon * 0.035, radius);
        float halo = (1.0 - smoothstep(0.16, 0.49, radius)) * mix(0.44, 0.25, moon);
        float crater = 1.0 - smoothstep(0.026, 0.034, distance(orbUv, vec2(0.54, 0.46)));
        float brightness = mix(0.28, mix(1.55, 1.12, moon), disc) * (1.0 - 0.15 * crater * moon);
        gl_FragColor = vec4(tint * brightness, max(disc, halo));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false
  });
  const orb = new THREE.Mesh(new THREE.PlaneGeometry(ORB_SPAN, ORB_SPAN), material);
  orb.name = "outdoor-sun-moon";
  orb.renderOrder = -6;
  orb.visible = false;

  return {
    orb,
    update(outdoors, lightPosition, frontage) {
      orb.visible = !frontage && outdoors?.weather === "clear";
      if (!orb.visible) return;
      direction.copy(lightPosition).normalize();
      material.uniforms.tint.value.set(ORB_COLORS[outdoors.phase]);
      material.uniforms.moon.value = Number(outdoors.phase === "night");
    },
    frame(camera) {
      if (!orb.visible) return;
      // Cancel camera translation for a body at infinity. The fixed direction still responds to rotation.
      orb.position.copy(direction).multiplyScalar(SKY_DISTANCE).add(camera.position);
      orb.quaternion.copy(camera.quaternion);
    },
    dispose() {
      orb.geometry.dispose();
      material.dispose();
      orb.removeFromParent();
    }
  };
}
