import { CATALOG, ROOM_TEMPLATES, createInitialRoom, isMounted, isUnderlay } from "../../frontend/src/pages/space/roomState.js";
import { PLAYER, getRoomLayout } from "../../frontend/src/pages/space/roomLayout.js";
import { ASSET_SURFACES } from "../../frontend/src/pages/space/assetCustomization.js";

export const runtime = {
  version: 1,
  player: PLAYER,
  defaultRoom: createInitialRoom(),
  assets: Object.fromEntries(CATALOG.map((asset) => [asset.kind, {
    width: asset.width, depth: asset.depth, height: asset.height,
    mounted: isMounted({ kind: asset.kind }), underlay: isUnderlay({ kind: asset.kind }),
    connectedSurface: Boolean(asset.connectedSurface),
    walkableHeight: asset.walkableHeight ?? null,
    surfaces: ASSET_SURFACES[asset.kind] ?? []
  }])),
  layouts: Object.fromEntries([6, 7, 8, 9, 10, 11].flatMap((version) =>
    ROOM_TEMPLATES.map(({ id }) => [`${version}:${id}`, getRoomLayout(id, version)])))
};
