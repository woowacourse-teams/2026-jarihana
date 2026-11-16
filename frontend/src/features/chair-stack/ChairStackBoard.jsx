import { useEffect, useRef } from "react";
import { CHAIR_HEIGHT, fitCanvas, loadToySprites, paintChair, paintSideChair } from "./chairArt";
import { towerSurface, toyHeight, toyLanding } from "./toyGeometry";
import { AIM_LIMIT, clampAim, SCALE, swayAt } from "./motion";
import { drawPhysicsBoard, usesFlatChairArt, usesSideChairArt } from "./physicsBoard";
import { skyAppearance } from "./skyAppearance";

function aimLabel(aim) {
  if (aim === 0) return "가운데";
  return aim < 0 ? `왼쪽 ${-aim}칸` : `오른쪽 ${aim}칸`;
}

const unitFor = (width, height) => Math.min(width / 78, Math.max(0.5, (height - 26) / 103), 7);
const TOUCH_DRAG_THRESHOLD = 6;

function drawToyBoard(ctx, width, height, ink, { run, aim, orientation, phase, drop, collapse, now, reduced, surface }) {
  const unit = unitFor(width, height);
  const center = width / 2;
  const summit = run.placements.reduce((highest, piece) => Math.max(highest, piece.y + toyHeight(piece.orientation)), 0);
  const launch = summit + 12;
  const base = height - 14 + Math.max(0, launch - 67) * unit;
  const shift = run.active ? swayAt(run.motion, phase) : 0;
  if (base < height) {
    ctx.fillStyle = ink;
    ctx.fillRect(center - 15 * unit, base, 30 * unit, 3);
  }
  const collapseAge = collapse && !reduced ? (now - collapse.at) / 1000 : 0;
  run.placements.forEach((piece, index) => {
    const falling = run.failedLayer != null && index + 1 >= run.failedLayer && collapseAge > 0;
    const drift = falling ? (index % 2 === 0 ? -1 : 1) * collapseAge * 46 : 0;
    const x = center + (piece.x / SCALE + (reduced ? 0 : shift)) * unit + drift;
    const y = base - piece.y * unit + (falling ? collapseAge ** 2 * 470 : 0);
    if (y < 0 || y - toyHeight(piece.orientation) * unit > height) return;
    paintChair(ctx, x, y, unit, piece.chair.toy.color, piece.orientation, drift / 52);
  });

  if (run.active) {
    const contactPhase = drop ? drop.phaseMs + run.motion.fallMs : phase;
    const contact = toyLanding(surface, run.active.toy, orientation, aim, run.motion, contactPhase);
    const progress = drop ? Math.min(1, Math.max(0, now - drop.at) / run.motion.fallMs) : 0;
    const landing = base - contact.y * unit;
    const start = base - launch * unit;
    const x = center + aim * unit;
    const y = reduced && drop ? landing : start + (landing - start) * progress ** 2;
    if (!drop) {
      ctx.fillStyle = ink;
      for (const point of contact.contacts) {
        ctx.fillRect(center + point.x * unit, base - point.y * unit - 1, unit, 2);
      }
    }
    paintChair(ctx, x, y, unit, run.active.toy.color, orientation);
  } else if (collapse && collapseAge > 0) {
    const drift = collapseAge * 52;
    const landing = toyLanding(surface, collapse.chair.toy, collapse.orientation, collapse.x,
      collapse.motion, collapse.phaseMs + collapse.motion.fallMs);
    paintChair(ctx, center + collapse.x * unit + drift, base - landing.y * unit + collapseAge ** 2 * 490,
      unit, collapse.chair.toy.color, collapse.orientation, drift / 55);
  }
}

function drawBoard(ctx, width, height, { ink, platformTop }, { run, aim, orientation, adjustment, phase, drop, collapse, now, reduced, surface, replay, followCamera }) {
  ctx.clearRect(0, 0, width, height);
  if (run?.physics) {
    drawPhysicsBoard(ctx, width, height, { ink, platformTop },
      { scene: run.physics, aim, adjustment, replay, now, unit: unitFor(width, height), followCamera });
    return;
  }
  followCamera((run?.placements.length ?? 0) * 1.4);
  if (run?.toyMode) {
    drawToyBoard(ctx, width, height, ink, { run, aim, orientation, phase, drop, collapse, now, reduced, surface });
    return;
  }
  const unit = unitFor(width, height);
  const step = CHAIR_HEIGHT * unit;
  const count = run?.placements.length ?? 0;
  const base = height - 16 + Math.max(0, count - 5) * step;
  const top = base - count * step;
  const shift = run && !run.finished ? swayAt(run.motion, phase) : 0;
  const center = width / 2;
  const platform = base <= height;

  if (platform) {
    ctx.fillStyle = ink;
    ctx.fillRect(center - 15 * unit, base, 30 * unit, 3);
  }

  const collapseAge = collapse && !reduced ? (now - collapse.at) / 1000 : 0;
  const fail = run?.failedLayer;
  run?.placements.forEach((piece, index) => {
    const falling = fail != null && index + 1 >= fail && collapseAge > 0;
    const deformation = reduced ? 0 : shift * (index + 1) / count;
    const drift = falling ? (index % 2 === 0 ? -1 : 1) * collapseAge * 48 : 0;
    const y = base - index * step + (falling ? collapseAge ** 2 * 470 : 0);
    if (y < -step || y - step > height) return;
    paintChair(ctx, center + (piece.x / SCALE + deformation) * unit + drift, y, unit,
      piece.chair.toy?.color ?? "red", 0, falling ? drift / 45 : 0, piece.chair.width);
  });

  if (run?.active) {
    const x = center + aim * unit;
    const support = run.placements.at(-1);
    const left = support ? support.x / SCALE + support.chair.left + shift : -15;
    const right = support ? support.x / SCALE + support.chair.right + shift : 15;
    const distance = 17 * unit;
    const progress = drop ? Math.min(1, Math.max(0, now - drop.at) / run.motion.fallMs) : 0;
    const y = top - distance * (1 - progress ** 2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center + left * unit, top - 1);
    ctx.lineTo(center + right * unit, top - 1);
    ctx.stroke();
    paintChair(ctx, x, reduced && drop ? top : y, unit, run.active.toy?.color ?? "red", 0, 0, run.active.width);
  } else if (collapse && fail && collapseAge > 0) {
    const drift = collapseAge * 52;
    paintChair(ctx, center + collapse.x * unit + drift, top + collapseAge ** 2 * 490,
      unit, collapse.chair.toy?.color ?? "red", 0, drift / 55, collapse.chair.width);
  } else if (!run) {
    paintSideChair(ctx, center, base, unit, "red");
  }
}

export function ChairStackBoard({ run, aim, orientation, adjustment, onAim, onDrop, disabled, phaseAt, drop, collapse, replay }) {
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas.closest(".chair-stack-stage");
    const style = getComputedStyle(canvas);
    const colors = {
      ink: (style.getPropertyValue("--chair-stack-platform-ink") || style.getPropertyValue("--color-brand-ink")).trim(),
      platformTop: style.getPropertyValue("--color-brand-soft").trim()
    };
    const surface = run?.toyMode ? towerSurface(run.placements) : null;
    let active = true;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dimensions;
    let frame;
    const render = (now) => {
      const { ctx, width, height } = dimensions;
      if (!ctx) return;
      const phase = drop ? drop.phaseMs + Math.min(run.motion.fallMs, Math.max(0, now - drop.at)) : phaseAt(now);
      let cameraMoving = false;
      const followCamera = (target) => {
        const altitude = (run?.placements.length ?? 0) * 100;
        const previous = cameraRef.current;
        const blend = !previous || previous.id !== run?.id || preference.matches
          ? 1
          : 1 - Math.exp(-Math.min(34, now - previous.now) / 110);
        const skyBlend = !previous || previous.id !== run?.id || preference.matches
          ? 1
          : 1 - Math.exp(-Math.min(34, now - previous.now) / 700);
        const focus = blend === 1 || Math.abs(target - previous.focus) < 0.03
          ? target : previous.focus + (target - previous.focus) * blend;
        const skyAltitude = skyBlend === 1 || Math.abs(altitude - previous.altitude) < 0.5
          ? altitude : previous.altitude + (altitude - previous.altitude) * skyBlend;
        cameraMoving = focus !== target || skyAltitude !== altitude;
        const rise = preference.matches ? 0 : 32 * focus / (focus + 12);
        if (rise !== previous?.rise) stage?.style.setProperty("--sky-rise", `-${rise}%`);
        if (skyAltitude !== previous?.altitude) {
          const appearance = skyAppearance(skyAltitude);
          stage?.style.setProperty("--sky-twilight-fade", appearance.twilight);
          stage?.style.setProperty("--sky-night-fade", appearance.night);
          stage?.style.setProperty("--sky-space-fade", appearance.space);
          stage?.style.setProperty("--sky-aurora-fade", appearance.aurora);
        }
        cameraRef.current = { id: run?.id, focus, altitude: skyAltitude, rise, now };
        return focus;
      };
      drawBoard(ctx, width, height, colors, {
        run, aim, orientation, adjustment, phase, drop, collapse, now, reduced: preference.matches, surface, replay, followCamera
      });
      const moving = !run?.physics && (drop ? now < drop.at + run.motion.fallMs : run?.motion.amplitude > 0);
      if (cameraMoving || (replay && now < replay.startedAt + replay.duration) || (run?.active && moving)
          || (collapse && !preference.matches && now - collapse.at < 850)) {
        frame = requestAnimationFrame(render);
      }
    };
    const resize = () => {
      dimensions = fitCanvas(canvas);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    resize();
    const sideProfile = !run || usesSideChairArt(run.physics);
    if (sideProfile || !usesFlatChairArt(run?.physics)) {
      void loadToySprites().then(() => { if (active) resize(); });
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    preference.addEventListener("change", resize);
    return () => {
      active = false;
      observer.disconnect();
      preference.removeEventListener("change", resize);
      cancelAnimationFrame(frame);
    };
  }, [run, aim, orientation, adjustment, phaseAt, drop, collapse, replay]);

  const updateAim = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    onAim(clampAim((event.clientX - bounds.left - bounds.width / 2) / unitFor(bounds.width, bounds.height)));
  };

  const playing = !!run?.active;
  return (
    <div
      className="chair-stack-board"
      data-ph-capture-attribute-action="chair_stack_position_select"
      role={playing ? "slider" : "img"}
      aria-label={playing ? "배치 위치" : "의자 쌓기 게임판"}
      aria-description={playing ? "게임판을 터치하거나 좌우로 밀어서 위치를 고르세요. 키보드는 방향키로 이동하고 스페이스로 놓을 수 있어요." : undefined}
      aria-valuemin={playing ? -AIM_LIMIT : undefined}
      aria-valuemax={playing ? AIM_LIMIT : undefined}
      aria-valuenow={playing ? aim : undefined}
      aria-valuetext={playing ? aimLabel(aim) : undefined}
      aria-disabled={playing && disabled ? true : undefined}
      tabIndex={playing ? 0 : undefined}
      onKeyDown={(event) => {
        if (disabled || !playing) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onAim(clampAim(aim + (event.key === "ArrowLeft" ? -1 : 1)));
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          onAim(event.key === "Home" ? -AIM_LIMIT : AIM_LIMIT);
        } else if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (!event.repeat) onDrop();
        }
      }}
      onPointerDown={(event) => {
        if (disabled || !playing || !event.isPrimary || event.button !== 0) return;
        const dragging = event.pointerType !== "touch";
        pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (dragging) updateAim(event);
      }}
      onPointerMove={(event) => {
        const pointer = pointerRef.current;
        if (disabled || !playing || pointer?.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - pointer.x);
        const dy = Math.abs(event.clientY - pointer.y);
        if (dx >= TOUCH_DRAG_THRESHOLD && dx > dy) pointer.dragging = true;
        if (pointer.dragging) updateAim(event);
      }}
      onPointerUp={(event) => {
        const pointer = pointerRef.current;
        if (pointer?.id !== event.pointerId) return;
        pointerRef.current = null;
        if (disabled || !playing) return;
        const travel = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
        if (pointer.dragging || travel < TOUCH_DRAG_THRESHOLD) updateAim(event);
      }}
      onLostPointerCapture={(event) => {
        if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
