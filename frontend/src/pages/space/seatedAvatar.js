import { assetScale, localToWorld } from "./assetCustomization.js";
import { placedItemElevation } from "./roomState.js";
import seatModelAnchors from "./seatModelAnchors.json";

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

export function seatedAvatarPlacement(item, slot, room) {
  const model = item && seatModelAnchors[item.kind];
  const seat = model?.seats[slot];
  if (!seat) return null;
  const { seatFit } = model;
  const { x, y, z } = assetScale(item);
  const scale = Math.min(1, x, y, z) * seatFit.maxScale;
  const forward = Math.max(seat.z * z, seatFit.front * z - 0.4 * scale);
  const hipBack = (forward - 0.14 * scale) / z;
  const height = seatHeight(item.kind, seat, hipBack);
  return {
    position: { ...localToWorld(item, seat.x, forward / z),
      y: placedItemElevation(item, room) + height * y + seat.avatarOffsetY * scale + 0.005 },
    scale, slot, localX: seat.x, yaw: seat.yaw - item.rotation * Math.PI / 2
  };
}

export function fitSeatedAvatar(room, seat) {
  const furniture = room?.items.find((asset) => asset.id === seat.assetId);
  return seatedAvatarPlacement(furniture, seat.slot, room);
}
