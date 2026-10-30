import { z } from "zod";

export const arenaActions = [
  "sparring_vote",
  "sparring_composer_toggle",
  "sparring_post_submit",
  "sparring_message_edit",
  "sparring_reply_cancel",
  "sparring_reply_start",
  "sparring_history_locate",
  "sparring_flow_toggle",
  "sparring_capsule_release",
  "sparring_history_more",
  "sparring_history_filter",
  "sparring_history_select",
  "sparring_capsule_select",
  "sparring_clash_expand",
  "sparring_clash_replay",
  "sparring_clash_close"
];
const base = { channel: z.literal("jarihana-sparring") };
const rpc = { ...base, kind: z.literal("command"), requestId: z.string().max(80) };
export const arenaMessageSchema = z.union([
  z.object({ ...base, kind: z.literal("ready") }),
  z.object({ ...base, kind: z.literal("scene"), status: z.enum(["ready", "error"]) }),
  z.object({ ...base, kind: z.literal("reveal") }),
  z.object({ ...base, kind: z.literal("interaction"), action: z.enum(arenaActions) }),
  z.object({ ...base, kind: z.literal("height"), height: z.number().min(200).max(50000) }),
  z.object({ ...rpc, action: z.literal("vote"), payload: z.object({ side: z.enum(["a", "b"]) }) }),
  z.object({
    ...rpc,
    action: z.literal("post"),
    payload: z.object({
      text: z.string().min(1).max(160),
      replyToId: z.string().nullable(),
      postId: z.string().uuid()
    })
  }),
  z.object({
    ...rpc,
    action: z.literal("history"),
    payload: z.object({ mine: z.boolean(), reset: z.boolean() })
  }),
  z.object({ ...rpc, action: z.literal("login"), payload: z.object({}) })
]);
export function arenaPost(post) {
  return {
    ...post,
    id: String(post.id),
    authorId: String(post.authorId),
    side: post.side === "MINT" ? "a" : "b",
    createdAt: Date.parse(`${post.createdAt}+09:00`),
    replyToId: post.replyTo ? String(post.replyTo.id) : null,
    replyTo: post.replyTo
      ? {
          ...post.replyTo,
          id: String(post.replyTo.id),
          authorId: String(post.replyTo.authorId),
          side: post.replyTo.side === "MINT" ? "a" : "b"
        }
      : null
  };
}
