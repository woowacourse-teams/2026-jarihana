import { assetScale, localToWorld } from "./assetCustomization.js";
import { capabilitiesFor } from "./roomCapabilities.js";

function curvedHeight(z, y, radiusY, centerZ, radiusZ) {
  return y + radiusY * Math.sqrt(Math.max(0, 1 - ((z - centerZ) / radiusZ) ** 2));
}

function seatHeight(kind, seat, hipBack) {
  if (kind === "beanbag") return Math.max(
    curvedHeight(hipBack, 0.33, 0.32, 0, 0.6),
    curvedHeight(hipBack, 0.56, 0.07, 0.1, 0.32)
  );
  if (kind === "roundChair") return Math.max(
    curvedHeight(hipBack, 0.3, 0.22, 0, 0.64),
    curvedHeight(hipBack, 0.49, 0.13, 0.06, 0.48)
  );
  return seat.y;
}

// The server owns the seat and its floor elevation. Fit only the visible avatar to the model.
export function seatedAvatarPlacement(item, slot, elevation) {
  const { seats, seatFit } = capabilitiesFor(item.kind);
  const seat = seats[slot];
  const { x, y, z } = assetScale(item);
  const scale = Math.min(1, x, y, z) * seatFit.maxScale;
  const forward = Math.max(seat.z * z, seatFit.front * z - 0.4 * scale);
  const hipBack = (forward - 0.14 * scale) / z;
  const height = seatHeight(item.kind, seat, hipBack);
  return {
    position: { ...localToWorld(item, seat.x, forward / z), y: elevation + height * y + seat.avatarOffsetY * scale + 0.005 },
    scale
  };
}

export function fitSeatedAvatar(item, seat) {
  const anchor = item && capabilitiesFor(item.kind).seats?.[seat.slot];
  if (!anchor) return { position: seat.position, scale: 1 };
  const elevation = seat.position.y - anchor.y * (item.scaleY ?? 1) - anchor.avatarOffsetY;
  return seatedAvatarPlacement(item, seat.slot, elevation);
}
