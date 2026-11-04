import { z } from "zod";
import { AVATAR_OPTIONS } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { apiRequest } from "../../shared/api/index.js";

export const appearanceSchema = z.object({
  version: z.literal(1),
  ...Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([key, choices]) => [key, z.enum(choices)]))
}).strict();
export const avatarSchema = z.object({ customized: z.boolean(), appearance: appearanceSchema }).strict();

export const getMyAvatar = ({ signal } = {}) => apiRequest("members/me/avatar", { signal, schema: avatarSchema });
export const saveMyAvatar = (appearance) => apiRequest("members/me/avatar", {
  method: "PUT", json: { appearance: appearanceSchema.parse(appearance) }
});
export const deleteMyAvatar = () => apiRequest("members/me/avatar", { method: "DELETE" });
