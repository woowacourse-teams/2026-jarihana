import { z } from "zod";
import { apiRequest } from "../../../shared/api/index.js";

const joinSchema = z.object({ token: z.string().min(1).max(8192), expiresAt: z.number().finite(),
  websocketUrl: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "wss:" || (url.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  }) });

export function requestRoomAdmission(groupId, signal) {
  return apiRequest(`groups/${groupId}/space/join-token`, { method: "post", signal, schema: joinSchema });
}
