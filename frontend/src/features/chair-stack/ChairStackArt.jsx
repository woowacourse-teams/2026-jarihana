import { useEffect, useRef } from "react";
import {
  fitCanvas, loadToySprites, paintChair, paintSideChair, paintPhysicsChair, TOY_HEIGHT
} from "./chairArt";
import { toyHeight } from "./toyGeometry";

export function ChairStackArt({ chair, physicsPiece, orientation = chair?.orientation ?? 0, catalog = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    let active = true;
    const render = () => {
      if (!active) return;
      const { ctx, width, height } = fitCanvas(canvas);
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (physicsPiece) {
        const { angle, widthScale, heightScale, verticalShear } = physicsPiece;
        const chairWidth = 1.4 * widthScale;
        const chairHeight = (2.4 + 1.4 * Math.abs(verticalShear)) * heightScale;
        const w = Math.abs(Math.cos(angle)) * chairWidth + Math.abs(Math.sin(angle)) * chairHeight;
        const h = Math.abs(Math.sin(angle)) * chairWidth + Math.abs(Math.cos(angle)) * chairHeight;
        paintPhysicsChair(ctx, width / 2, height / 2, Math.min(width / w, height / h) * 0.9, physicsPiece, angle);
        return;
      }
      if (!catalog) {
        paintChair(ctx, width / 2, height * 0.95, Math.min(width / TOY_HEIGHT, height / toyHeight(orientation) * 0.9),
          chair?.toy?.color ?? "red", orientation);
        return;
      }
      const unit = Math.min(width / 70, height / 64);
      const x = width / 2;
      const y = height * 0.93;
      paintSideChair(ctx, x - 8 * unit, y, unit, "blue");
      paintSideChair(ctx, x + 5 * unit, y - 2 * unit, unit, "green");
      paintSideChair(ctx, x - 1 * unit, y - 14 * unit, unit, "yellow", Math.PI / 2 - 0.14);
      paintSideChair(ctx, x + 3 * unit, y - 26 * unit, unit, "red", Math.PI + 0.13);
      paintSideChair(ctx, x - 3 * unit, y - 43 * unit, unit, "blue", -Math.PI / 2 - 0.12);
    };
    const sideProfile = catalog || physicsPiece?.sideProfile;
    if (sideProfile || !physicsPiece?.flat) void loadToySprites().then(render);
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [catalog, chair, orientation, physicsPiece]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
