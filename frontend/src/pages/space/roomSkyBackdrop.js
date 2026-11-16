import * as THREE from "three";
import { roomSkyPalette } from "./roomSkyPalette";

export function frameRoomBackdrop(camera, activeCamera) {
  if (activeCamera.isPerspectiveCamera) {
    camera.copy(activeCamera);
  } else {
    camera.position.copy(activeCamera.position);
    camera.quaternion.copy(activeCamera.quaternion);
    camera.aspect = (activeCamera.right - activeCamera.left) / (activeCamera.top - activeCamera.bottom);
    camera.fov = 44;
    camera.zoom = 1;
    camera.view = null;
  }
  camera.near = 16;
  camera.far = 1200;
  camera.updateProjectionMatrix();
}

export function createRoomSkyBackdrop() {
  const uniforms = {
    zenith: { value: new THREE.Color() },
    middle: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    overcast: { value: 0 },
    night: { value: 0 },
    coverage: { value: 1 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    toneMapped: false,
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenith, middle, horizon;
      uniform float overcast, night, coverage;
      varying vec3 skyDirection;

      float hash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }

      void main() {
        vec3 dir = normalize(skyDirection);
        float elevation = dir.y;
        vec3 color = mix(horizon, middle, smoothstep(0.0, 0.39, abs(elevation)));
        color = mix(color, zenith, smoothstep(0.20, 0.90, abs(elevation)));

        if (elevation > 0.02) {
          vec2 cloudPlane = dir.xz / (elevation + 0.23);
          float density = noise(cloudPlane * 2.2) * 0.72 + noise(cloudPlane * 5.5 + 7.0) * 0.28;
          float cloud = smoothstep(mix(0.53, 0.30, overcast), mix(0.74, 0.62, overcast), density)
            * smoothstep(0.02, 0.22, elevation);
          vec3 cloudColor = mix(middle, vec3(1.0), mix(0.60, 0.025, night));
          color = mix(color, cloudColor, cloud * mix(0.54, 0.70, overcast));
        }

        gl_FragColor = vec4(color, coverage);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), material);
  mesh.name = "outdoor-world-sky";
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.visible = false;
  const stars = createStars();
  mesh.add(stars);
  let outdoors;

  return {
    mesh,
    update(light) {
      outdoors = light;
      stars.visible = light?.phase === "night" && light.weather === "clear";
      if (!light) return;
      const [top, mid, low] = roomSkyPalette(light);
      uniforms.zenith.value.set(top);
      uniforms.middle.value.set(mid);
      uniforms.horizon.value.set(low);
      uniforms.overcast.value = Number(light.weather !== "clear");
      uniforms.night.value = Number(light.phase === "night");
    },
    frame(camera, frontage, pixelRatio = 1) {
      mesh.visible = Boolean(outdoors) && !frontage;
      if (!mesh.visible) return;
      // Distant sky follows rotation, with no translation parallax.
      mesh.position.copy(camera.position);
      stars.material.uniforms.pixelRatio.value = pixelRatio;
      // The screen-space rain/snow particles can show through the sky behind the scene.
      uniforms.coverage.value = outdoors.weather === "rain" || outdoors.weather === "snow" ? 0.78 : 1;
    },
    dispose() {
      stars.geometry.dispose();
      stars.material.dispose();
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    }
  };
}

function createStars() {
  const count = 900;
  const radius = 1080;
  const positions = new Float32Array(count * 3);
  const brightness = new Float32Array(count);
  let seed = 20261111;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    const height = 0.08 + random() * 0.92;
    const angle = random() * Math.PI * 2;
    const horizontal = Math.sqrt(1 - height ** 2) * radius;
    positions.set([Math.cos(angle) * horizontal, height * radius, Math.sin(angle) * horizontal], i * 3);
    brightness[i] = random() ** 2 * THREE.MathUtils.smoothstep(height, 0.08, 0.24);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("brightness", new THREE.BufferAttribute(brightness, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
    vertexShader: `
      attribute float brightness;
      uniform float pixelRatio;
      varying float strength;
      void main() {
        strength = brightness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (2.0 + strength * 1.8) * pixelRatio;
      }`,
    fragmentShader: `
      varying float strength;
      void main() {
        float disc = 1.0 - smoothstep(0.12, 0.5, distance(gl_PointCoord, vec2(0.5)));
        gl_FragColor = vec4(0.69, 0.8, 1.0, disc * strength * 0.85);
        #include <colorspace_fragment>
      }`
  });
  const stars = new THREE.Points(geometry, material);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  stars.visible = false;
  return stars;
}
