import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateSchema, localDateTimeSchema } from "../common/schemas.js";
import { groupStatusSchema, groupTypeSchema } from "../group/index.js";

/** 서버 `ReactionEmoji` 선언 순서와 같다. 피드는 우선 하트 하나만 반응으로 받는다. */
export const ACTIVITY_REACTION_EMOJIS = Object.freeze([{ code: "HEART", label: "하트" }]);

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
  authorAvatarUrl: z.string().nullable().default(null),
  content: z.string().min(1),
  createdAt: localDateTimeSchema,
  canDelete: z.boolean(),
  reactions: activityReactionsSchema
});

export const activityCommentPageSchema = cursorPageSchema(activityCommentSchema);

export const activityCommentCreateResponseSchema = z.object({ id: entityIdSchema });

export const activityReactorListSchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
  reactors: z.array(z.object({ crewName: z.string().min(1), mine: z.boolean() })).default([])
});

const REACTOR_NAME_LIMIT = 10;

// 마지막 글자에 받침이 있으면 "이", 없으면 "가"를 붙인다. 한글이 아니면 받침이 없는 것으로 본다.
function withSubjectParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinalConsonant = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasFinalConsonant ? "이" : "가"}`;
}

/**
 * Slack처럼 반응한 사람을 "나, 바다 외 3명이 하트를 남겼어요"로 요약한다. 내 반응은 맨 앞에 "나"로 둔다.
 */
export function describeActivityReactors({ count, reactors }, emojiLabel) {
  if (count === 0 || reactors.length === 0) return null;
  const names = [
    ...reactors.filter((reactor) => reactor.mine).map(() => "나"),
    ...reactors.filter((reactor) => !reactor.mine).map((reactor) => reactor.crewName)
  ].slice(0, REACTOR_NAME_LIMIT);
  const others = count - names.length;
  const subject = others > 0 ? `${names.join(", ")} 외 ${others}명` : names.join(", ");
  return `${withSubjectParticle(subject)} ${emojiLabel}를 남겼어요`;
}

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
