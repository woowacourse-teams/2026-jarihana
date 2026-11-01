import * as THREE from 'three';

const smooth = (from, to, value) => {
  const t = THREE.MathUtils.clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

// Layout and delivery keep their base camera; only the rendered world follows a reply.
export function createClashCamera() {
  let enabled = false, activeId = null, seenId = null, cooldown = 0, fromPipe = false;
  let shot = null, handoff = null, phase = null, intensity = 0, slideIntensity = 0;
  const target = new THREE.Vector3(), position = new THREE.Vector3(), endPosition = new THREE.Vector3();
  const slideOrigin = new THREE.Vector3();
  function reset() { activeId = null; intensity = 0; fromPipe = false; phase = null; handoff = null; }
  return {
    setEnabled(value) { enabled = value === true; if (!enabled) reset(); },
    reset,
    intensity: () => intensity,
    timeScale(frame) {
      return activeId === frame?.id && frame.elapsed >= frame.contactAt * 0.88 && frame.elapsed < frame.contactAt ? 0.65 : 1;
    },
    update(base, frame, delta, reduced = false) {
      cooldown = Math.max(0, cooldown - delta);
      if (frame && frame.id !== seenId) {
        seenId = frame.id;
        if (enabled && !reduced && !cooldown && frame.phase !== 'slide' && frame.fresh && frame.mine && frame.elapsed < 0.12) activeId = frame.id;
      }
      if (!enabled || reduced || !frame || frame.id !== activeId) { reset(); return base; }
      const transport = frame.phase === 'transport', slide = frame.phase === 'slide';
      const end = frame.releaseAt;
      if (!transport && frame.elapsed >= end) { reset(); cooldown = 3; return base; }
      if (slide) {
        if (phase !== 'slide') {
          handoff = shot.clone(); slideOrigin.copy(frame.follow); slideIntensity = intensity;
          phase = 'slide';
        }
        const progress = smooth(0, end, frame.elapsed);
        intensity = slideIntensity * (1 - progress);
        shot.copy(base);
        shot.position.lerpVectors(handoff.position, base.position, progress);
        position.copy(frame.follow).sub(slideOrigin).multiplyScalar(1 - progress);
        shot.position.add(position);
        shot.quaternion.copy(handoff.quaternion).slerp(base.quaternion, progress);
        shot.zoom = THREE.MathUtils.lerp(handoff.zoom, base.zoom, progress);
        if (base.view?.enabled) shot.setViewOffset(base.view.fullWidth, base.view.fullHeight,
          THREE.MathUtils.lerp(handoff.view?.offsetX ?? 0, base.view.offsetX, progress),
          THREE.MathUtils.lerp(handoff.view?.offsetY ?? 0, base.view.offsetY, progress), base.view.width, base.view.height);
        shot.updateProjectionMatrix(); shot.updateMatrixWorld();
        return shot;
      }
      if (transport) fromPipe = true;
      else if (phase === 'transport' && shot) handoff = shot.clone();
      phase = transport ? 'transport' : 'clash';
      intensity = transport ? smooth(0, 0.45, frame.elapsed)
        : (fromPipe ? 1 : smooth(0, 0.22, frame.elapsed)) * (1 - 0.2 * smooth(frame.contactAt + 0.3, end, frame.elapsed));
      if (!intensity) return base;
      if (!shot || shot.type !== base.type) shot = base.clone();
      shot.copy(base);
      const portrait = (base.isPerspectiveCamera ? base.aspect : (base.right - base.left) / (base.top - base.bottom)) < 1;
      target.copy(frame.follow);
      // Dolly along the normal viewing axis instead of orbiting around the hose.
      position.set(0, 0, portrait ? 8 : 5.5).applyQuaternion(base.quaternion).add(target);
      if (!transport) {
        const turn = smooth(frame.contactAt * 0.55, frame.contactAt + 0.08, frame.elapsed);
        target.lerp(frame.opponent, turn * 0.5);
        endPosition.set(0, 0, portrait ? 9 : 6.2).applyQuaternion(base.quaternion).add(target);
        position.lerp(endPosition, turn);
        const hit = frame.elapsed - frame.contactAt;
        if (hit >= 0 && hit < 0.18) {
          const force = (1 - hit / 0.18) * 0.12;
          position.x += Math.sin(hit * 95) * force;
          position.y += Math.sin(hit * 72) * force * 0.5;
        }
      }
      shot.position.lerp(position, intensity);
      shot.quaternion.copy(base.quaternion);
      const closeZoom = base.isPerspectiveCamera ? 1.08 : (base.top - base.bottom) / (portrait ? 9 : 6);
      shot.zoom = THREE.MathUtils.lerp(base.zoom, closeZoom, intensity);
      const view = base.view;
      if (view?.enabled) shot.setViewOffset(view.fullWidth, view.fullHeight,
        view.offsetX * (1 - intensity), view.offsetY * (1 - intensity), view.width, view.height);
      if (handoff && frame.elapsed < 0.18) {
        const blend = smooth(0, 0.18, frame.elapsed);
        shot.position.lerpVectors(handoff.position, shot.position, blend);
        shot.quaternion.copy(handoff.quaternion).slerp(base.quaternion, blend);
      }
      shot.updateProjectionMatrix(); shot.updateMatrixWorld();
      return shot;
    },
  };
}
