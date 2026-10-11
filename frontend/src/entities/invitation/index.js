import { z } from "zod";
import { localDateTimeSchema } from "../common/schemas.js";

const id = z.number().int().positive().safe();
export const invitationStatusSchema = z.enum(["VALID", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELED", "GROUP_ENDED"]);
const previewFields = {
  id,
  group: z.object({ id, name: z.string(), introduction: z.string() }),
  inviter: z.object({ id, crewName: z.string() }),
  createdAt: localDateTimeSchema,
  expiresAt: localDateTimeSchema.nullable(),
  status: invitationStatusSchema,
  canAccept: z.boolean()
};
export const invitationPreviewSchema = z.object({ ...previewFields, type: z.literal("LINK") });
export const invitationDetailSchema = z.object({
  ...previewFields,
  type: z.enum(["DIRECT", "LINK"]),
  canRevoke: z.boolean(),
  sharePath: z.string().nullable()
});
const acceptanceFields = { invitationId: id, groupId: id, groupMemberId: id, joinedAt: localDateTimeSchema };
export const invitationAcceptanceSchema = z.discriminatedUnion("result", [
  z.object({ ...acceptanceFields, result: z.literal("JOINED"), registrationOrigin: z.literal("INVITATION") }),
  z.object({ ...acceptanceFields, result: z.literal("ALREADY_JOINED"), registrationOrigin: z.null().optional() })
]);
export const isInvitationId = (value) => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
export const isInvitationToken = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
