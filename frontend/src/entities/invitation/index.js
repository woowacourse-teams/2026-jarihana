import { z } from "zod";
import { cursorPageSchema, localDateTimeSchema } from "../common/schemas.js";
import { courseSchema, memberTypeSchema } from "../member/index.js";

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

export const createdInvitationSchema = z.object({
  id, groupId: id, type: z.enum(["DIRECT", "LINK"]), targetMemberId: id.nullable(),
  createdAt: localDateTimeSchema, expiresAt: localDateTimeSchema.nullable(),
  status: invitationStatusSchema, sharePath: z.string(), reused: z.boolean()
});
export const invitationCandidatePageSchema = cursorPageSchema(z.object({
  memberId: id, crewName: z.string(), generation: z.number().int().positive().nullable(),
  memberType: memberTypeSchema, course: courseSchema.nullable()
}));
export const issuedInvitationPageSchema = cursorPageSchema(z.object({
  id, type: z.enum(["DIRECT", "LINK"]), group: z.object({ id, name: z.string() }),
  inviter: z.object({ id, crewName: z.string() }), createdAt: localDateTimeSchema,
  expiresAt: localDateTimeSchema.nullable(), status: invitationStatusSchema, canRevoke: z.boolean()
}));
export const revokedInvitationSchema = z.object({
  id, revokedAt: localDateTimeSchema, status: z.literal("CANCELED")
});
