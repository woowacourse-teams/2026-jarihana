import { paintPhysicsChair } from "./chairArt";

export function playbackDuration(frames) {
  return Math.min(frames.at(-1)?.atMs ?? 0, 2800);
}

export function usesFlatChairArt(scene) {
  return scene?.active?.flat ?? scene?.chairs[0]?.piece.flat;
}

export function usesSideChairArt(scene) {
  return scene?.active?.sideProfile ?? scene?.chairs[0]?.piece.sideProfile;
}

function replayPoses(replay, now) {
  const { frames, duration, startedAt } = replay;
  const elapsed = Math.min(1, Math.max(0, now - startedAt) / duration) * frames.at(-1).atMs;
  const index = frames.findIndex((frame) => frame.atMs >= elapsed);
  if (index <= 0) return (index === 0 ? frames[0] : frames.at(-1)).poses;
  const from = frames[index - 1];
  const to = frames[index];
  const progress = (elapsed - from.atMs) / (to.atMs - from.atMs);
  return to.poses.map((pose, i) => {
    const before = from.poses[i];
    const delta = pose.angle - before.angle;
    const angle = before.angle + Math.atan2(Math.sin(delta), Math.cos(delta)) * progress;
    return {
      x: before.x + (pose.x - before.x) * progress,
      y: before.y + (pose.y - before.y) * progress,
      angle
    };
  });
}

function halfHeight(piece) {
  return Math.abs(Math.cos(piece.angle)) * 1.2 * piece.heightScale
    + Math.abs(Math.sin(piece.angle)) * 0.7 * piece.widthScale;
}

export function drawPhysicsBoard(ctx, width, height, { ink, platformTop }, { scene, aim, adjustment, replay, now, unit, followCamera }) {
  const pixelsPerMeter = unit * 10;
  const center = width / 2;
  const active = scene.active && adjustment
    ? { ...scene.active, angle: -adjustment.angleDegrees * Math.PI / 180, mirror: adjustment.mirrored }
    : scene.active;
  const poses = replay ? replayPoses(replay, now) : scene.chairs.map((chair) => chair.pose);
  const pieces = scene.chairs.map((chair) => chair.piece);
  if (replay && active) pieces.push(active);
  const launchY = active ? scene.launchY + halfHeight(active) - halfHeight(scene.active) : 0;
  const focus = active ? launchY : poses.reduce((highest, pose) => Math.max(highest, pose.y), 0);
  const base = height - 14 + Math.max(0, followCamera(focus) - 7.5) * pixelsPerMeter;

  const showPlatformTop = usesSideChairArt(scene) || !usesFlatChairArt(scene);
  const depth = showPlatformTop ? 0.54 * pixelsPerMeter : 0;
  if (base - depth < height) {
    const left = center - scene.platformHalfWidth * pixelsPerMeter;
    const right = center + scene.platformHalfWidth * pixelsPerMeter;
    const inset = 0.2 * pixelsPerMeter;
    if (depth > 0) {
      ctx.fillStyle = platformTop;
      ctx.beginPath();
      ctx.moveTo(left, base);
      ctx.lineTo(left + inset, base - depth);
      ctx.lineTo(right - inset, base - depth);
      ctx.lineTo(right, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = ink;
    ctx.fillRect(left, base, right - left, 3);
  }
  poses.forEach((pose, index) => {
    const y = base - pose.y * pixelsPerMeter;
    if (y < -pixelsPerMeter * 1.6 || y > height + pixelsPerMeter * 1.6) return;
    paintPhysicsChair(ctx, center + pose.x * pixelsPerMeter, y, pixelsPerMeter, pieces[index], pose.angle);
  });

  if (!replay && active) {
    const x = center + aim * unit;
    const y = base - launchY * pixelsPerMeter;
    paintPhysicsChair(ctx, x, y, pixelsPerMeter, active, active.angle);
  }
}
