import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateSchema, localDateTimeSchema } from "../common/schemas.js";
import { groupStatusSchema, groupTypeSchema } from "../group/index.js";

/** 서버 `ReactionEmoji` 선언 순서와 같다. 배지와 고르기 창이 이 순서를 따른다. */
export const ACTIVITY_REACTION_EMOJIS = Object.freeze([
  { code: "THUMBS_UP", symbol: "👍", label: "좋아요" },
  { code: "SAD", symbol: "😢", label: "슬픔" },
  { code: "GRIN", symbol: "😄", label: "함박웃음" },
  { code: "HEART", symbol: "❤️", label: "하트" },
  { code: "EYES", symbol: "👀", label: "눈" },
  { code: "FIRE", symbol: "🔥", label: "불" },
  { code: "CHECK", symbol: "✅", label: "체크" },
  { code: "QUESTION", symbol: "❓", label: "물음표" },
  { code: "EXCLAMATION", symbol: "❗", label: "느낌표" }
]);

const reactionCodes = new Set(ACTIVITY_REACTION_EMOJIS.map((emoji) => emoji.code));

export function findReactionEmoji(code) {
  return ACTIVITY_REACTION_EMOJIS.find((emoji) => emoji.code === code) ?? null;
}

const activityReactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
  reacted: z.boolean()
});

// 화면이 모르는 이모지가 생겨도 응답 전체를 실패시키지 않고 그 배지만 건너뛴다.
const activityReactionsSchema = z
  .array(activityReactionSchema)
  .default([])
  .transform((reactions) => reactions.filter((reaction) => reactionCodes.has(reaction.emoji) && reaction.count > 0));

const activityPostGroupSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  type: groupTypeSchema,
  status: groupStatusSchema,
  recruiting: z.boolean().default(false),
  joined: z.boolean().default(false)
});

function normalizeImageUrl(imageUrl) {
  return /^https?:\/\//i.test(imageUrl) || imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
}

export const activityPostSchema = z.object({
  id: entityIdSchema,
  group: activityPostGroupSchema,
  authorNickname: z.string().min(1),
  imageUrl: z.string().min(1).transform(normalizeImageUrl),
  caption: z.string().max(50).nullable(),
  activityDate: localDateSchema,
  createdAt: localDateTimeSchema,
  canModify: z.boolean(),
  commentCount: z.number().int().nonnegative().default(0),
  reactions: activityReactionsSchema
});

export const activityPostPageSchema = cursorPageSchema(activityPostSchema);

export const activityPostCreateResponseSchema = z.object({ id: entityIdSchema });

export const ACTIVITY_COMMENT_MAX_LENGTH = 200;

export const activityCommentSchema = z.object({
  id: entityIdSchema,
  authorNickname: z.string().min(1),
  content: z.string().min(1),
  createdAt: localDateTimeSchema,
  canDelete: z.boolean(),
  reactions: activityReactionsSchema
});

export const activityCommentPageSchema = cursorPageSchema(activityCommentSchema);

export const activityCommentCreateResponseSchema = z.object({ id: entityIdSchema });

/**
 * 내 반응을 켜거나 끈 결과를 낙관적으로 계산한다. 개수가 0이 된 배지는 지우고 이모지 순서를 지킨다.
 */
export function toggleActivityReaction(reactions, emoji, nextReacted) {
  const current = reactions.find((reaction) => reaction.emoji === emoji);
  if (nextReacted) {
    if (current?.reacted) return reactions;
    const next = current
      ? reactions.map((reaction) =>
          reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, reacted: true } : reaction
        )
      : [...reactions, { emoji, count: 1, reacted: true }];
    const order = ACTIVITY_REACTION_EMOJIS.map((item) => item.code);
    return next.sort((left, right) => order.indexOf(left.emoji) - order.indexOf(right.emoji));
  }
  if (!current?.reacted) return reactions;
  return reactions
    .map((reaction) =>
      reaction.emoji === emoji ? { ...reaction, count: reaction.count - 1, reacted: false } : reaction
    )
    .filter((reaction) => reaction.count > 0);
}
