import { z } from "zod";
import { memberTypeSchema } from "../../entities/member";
import { captureEvent } from "../../shared/analytics";
import { apiClient } from "../../shared/api";

const id = z.number().int().positive();
const side = z.enum(["MINT", "CORAL"]);
export const topicSchema = z.object({
  id,
  title: z.string(),
  a: z.string(),
  b: z.string(),
  description: z.string(),
  representativeImageUrl: z.string().nullable().optional(),
  votesA: z.number().int().nonnegative(),
  votesB: z.number().int().nonnegative(),
  postCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  mySide: side.nullable(),
  createdAt: z.string(),
  closesAt: z.string().nullable().optional()
});
const replySchema = z.object({
  id,
  authorId: id,
  name: z.string(),
  memberType: memberTypeSchema,
  side,
  text: z.string()
});
export const postSchema = z.object({
  id,
  authorId: id,
  name: z.string(),
  memberType: memberTypeSchema,
  side,
  text: z.string(),
  createdAt: z.string(),
  replyTo: replySchema.nullable()
});
const page = (item) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable(), hasNext: z.boolean() });
const created = z.object({ id });
export const listSparrings = (searchParams) =>
  apiClient.request("sparrings", { searchParams, schema: page(topicSchema) });
export const getSparring = (topicId) =>
  apiClient.request(`sparrings/${topicId}`, { schema: topicSchema });
export const getSparringPosts = (topicId, searchParams) =>
  apiClient.request(`sparrings/${topicId}/posts`, { searchParams, schema: page(postSchema) });
export async function createSparring(json) {
  const result = await apiClient.request("sparrings", { method: "POST", json, schema: created });
  captureEvent("sparring_created");
  return result;
}
export async function voteSparring(topicId, selectedSide) {
  await apiClient.request(`sparrings/${topicId}/votes`, {
    method: "POST",
    json: { side: selectedSide }
  });
  captureEvent("sparring_vote_saved");
}
export async function postSparring(topicId, json) {
  const result = await apiClient.request(`sparrings/${topicId}/posts`, {
    method: "POST",
    json,
    schema: created
  });
  captureEvent("sparring_post_saved");
  return result;
}
export const revisionSchema = z.object({ revision: id });
