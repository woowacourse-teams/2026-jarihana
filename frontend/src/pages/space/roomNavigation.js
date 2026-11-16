import { PLAYER, boundsForBox, contains, facilityBounds, getRoomLayout, overlaps } from "./roomLayout";
import { assetType, footprint, isMounted, isUnderlay, placedItemElevation } from "./roomState";

const pointBounds = ({ x, z }) => ({ minX: x, maxX: x, minZ: z, maxZ: z });
const stairHeight = (stairs, z) => (stairs.maxZ - z) / (stairs.maxZ - stairs.minZ) * stairs.height;
const collisionContexts = new WeakMap();

function collisionContext(room) {
  // Room edits replace the room snapshot, so all steps in one snapshot can reuse its geometry.
  const cached = collisionContexts.get(room);
  if (cached) return cached;

  const platforms = [], obstacles = [];
  for (const item of room.items) {
    const type = assetType(item);
    const bounds = boundsForBox({ ...item, ...footprint(item) });
    if (type?.walkableHeight) platforms.push({ bounds, level: item.level || 0, height: type.walkableHeight * (item.scaleY || 1) });
    if (!isUnderlay(item) && !isMounted(item)) {
      const bottom = placedItemElevation(item, room);
      obstacles.push({ bounds, bottom, top: bottom + (type?.height || 1.7) * (item.scaleY || 1) });
    }
  }
  const context = { layout: getRoomLayout(room), platforms, obstacles, facilities: facilityBounds(room) };
  collisionContexts.set(room, context);
  return context;
}

function floorHeight(position, { layout, platforms }) {
  if (layout.stairs && contains(layout.stairs, pointBounds(position))) return stairHeight(layout.stairs, position.z);
  const upper = layout.mezzanine && (position.y || 0) >= layout.mezzanine.height - 0.2 &&
    contains(layout.mezzanine, pointBounds(position));
  const base = upper ? layout.mezzanine.height : 0;
  const platformHeight = platforms.reduce((height, platform) => platform.level === (upper ? 1 : 0) &&
    contains(platform.bounds, pointBounds(position)) ? Math.max(height, platform.height) : height, 0);
  return base + platformHeight;
}

export function isWalkablePosition(position, room, radius = PLAYER.radius) {
  if (![position.x, position.z, position.y ?? 0, radius].every(Number.isFinite) || radius < 0) return false;
  return walkablePosition(position, collisionContext(room), radius);
}

export function walkFloorHeight(position, room) { return floorHeight(position, collisionContext(room)); }

function walkablePosition(position, context, radius = PLAYER.radius) {
  const { layout, obstacles, facilities } = context;
  const y = position.y ?? 0;
  const bounds = boundsForBox({ ...position, width: radius * 2, depth: radius * 2 });
  let areas = [layout.building, ...(layout.exterior || [layout.terrace || layout.entrance])];
  const elevated = Boolean(layout.mezzanine && (contains(layout.stairs, pointBounds(position)) || y >= layout.mezzanine.height - 0.2));
  if (Math.abs(floorHeight(position, context) - y) > 0.01) return false;
  if (layout.mezzanine) {
    if (elevated) areas = [layout.mezzanine, { ...layout.stairs, maxZ: layout.stairs.maxZ + radius }];
    if (layout.pillars.some((pillar) => overlaps(bounds, boundsForBox(pillar)))) return false;
    if (layout.stairRails.some((rail) => overlaps(bounds, boundsForBox(rail)))) return false;
    if (y >= layout.mezzanine.height - 0.2 &&
      layout.railings.some((rail) => overlaps(bounds, boundsForBox(rail)))) return false;
  }
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const z of [bounds.minZ, bounds.maxZ]) {
      if (!areas.some((area) => contains(area, { minX: x, maxX: x, minZ: z, maxZ: z }))) return false;
    }
  }
  if (!elevated && layout.terrace?.fixtures.some((fixture) => overlaps(bounds, boundsForBox(fixture)))) return false;
  if (layout.walls.some((wall) => overlaps(bounds, boundsForBox(wall)))) return false;
  if ((!elevated || y < 2.5) && facilities.some((area) => overlaps(bounds, area))) return false;
  return !obstacles.some(obstacle => obstacle.bottom < y + PLAYER.height && obstacle.top > y + 0.05 &&
    overlaps(bounds, obstacle.bounds));
}

export function moveWalker(position, delta, room, path) {
  if (![position.x, position.z, position.y ?? 0, delta.x, delta.z].every(Number.isFinite)) return { ...position };
  const context = collisionContext(room);
  const next = { ...position };
  next.y ??= 0;
  if (path && path.length === 0) path.push({ ...next });
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / 0.15));
  const dx = delta.x / steps;
  const dz = delta.z / steps;
  function tryStep(x, z) {
    const candidate = { ...next, x, z };
    {
      candidate.y = floorHeight(candidate, context);
      // Follow the staircase, but never teleport up or fall from a deck edge.
      if (Math.abs(candidate.y - next.y) > 0.4) return;
    }
    if (walkablePosition(candidate, context)) Object.assign(next, candidate);
  }
  for (let index = 0; index < steps; index += 1) {
    const before = { ...next };
    tryStep(next.x + dx, next.z);
    tryStep(next.x, next.z + dz);
    if (path && (next.x !== before.x || next.z !== before.z)) path.push({ ...next });
  }
  return next;
}
