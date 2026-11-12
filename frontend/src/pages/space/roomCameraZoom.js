export const DEFAULT_ROOM_ZOOM = 0.7;

export function scaleRoomZoom(value, factor) {
  const next = value * factor;
  return next > 0 && Number.isFinite(next) && Number.isFinite(1 / next) ? next : value;
}
