import { TOY_HEIGHT, TOY_WIDTH } from "./chairArt";
import { SCALE, swayAt } from "./motion";

const profiles = new Map();

export function toyHeight(orientation) {
  return (orientation & 1) ? TOY_WIDTH : TOY_HEIGHT;
}

function profile(toy, orientation) {
  if (profiles.has(orientation)) return profiles.get(orientation);
  const turns = orientation & 3;
  const width = (turns & 1) ? TOY_HEIGHT : TOY_WIDTH;
  const height = toyHeight(orientation);
  const bottom = Array(width).fill(height);
  const top = Array(width).fill(0);

  toy.rows.forEach((row, y) => {
    for (let x = 0; x < TOY_WIDTH; x++) {
      if (!(row & (1 << x))) continue;
      const fx = (orientation & 4) ? TOY_WIDTH - 1 - x : x;
      const fy = (orientation & 8) ? TOY_HEIGHT - 1 - y : y;
      const column = [fx, TOY_HEIGHT - 1 - fy, TOY_WIDTH - 1 - fx, fy][turns];
      const fromTop = [fy, fx, TOY_HEIGHT - 1 - fy, TOY_WIDTH - 1 - fx][turns];
      bottom[column] = Math.min(bottom[column], height - 1 - fromTop);
      top[column] = Math.max(top[column], height - fromTop);
    }
  });
  const shape = { bottom, top, width };
  profiles.set(orientation, shape);
  return shape;
}

export function towerSurface(placements) {
  const surface = new Map();
  for (let x = -15; x < 15; x++) surface.set(x, 0);
  for (const piece of placements) {
    const shape = profile(piece.chair.toy, piece.orientation);
    const start = piece.x / SCALE - shape.width / 2;
    shape.top.forEach((y, column) => {
      if (!y) return;
      const x = start + column;
      surface.set(x, Math.max(surface.get(x) ?? -Infinity, piece.y + y));
    });
  }
  return surface;
}

export function toyLanding(surface, toy, orientation, aim, motion, phase) {
  const shift = Math.round(swayAt(motion, phase));
  const shape = profile(toy, orientation);
  const start = aim - shift - shape.width / 2;
  const touching = [];
  let bottom = -Infinity;
  shape.bottom.forEach((y, index) => {
    const supportY = surface.get(start + index);
    if (shape.top[index] && supportY !== undefined) {
      bottom = Math.max(bottom, supportY - y);
      touching.push({ x: start + index + shift, y: supportY, bottom: supportY - y });
    }
  });
  return { y: Number.isFinite(bottom) ? bottom : -12, contacts: touching.filter((point) => point.bottom === bottom) };
}
