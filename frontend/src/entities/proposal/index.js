import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateTimeSchema } from "../common/schemas.js";

/** 서버 `ProposalCategory` 선언 순서와 같다. 목록의 분야 필터 순서이기도 하다. */
export const PROPOSAL_CATEGORIES = Object.freeze([
  { code: "STUDY", label: "스터디" },
  { code: "CULTURE", label: "문화" },
  { code: "SPORT", label: "운동" },
  { code: "ETC", label: "기타" }
]);

/** 서버 `ProposalTimeSlot` 선언 순서와 같다. */
export const PROPOSAL_TIME_SLOTS = Object.freeze([
  { code: "WEEKDAY_MORNING", label: "평일 아침" },
  { code: "WEEKDAY_EVENING", label: "평일 저녁" },
  { code: "WEEKEND_MORNING", label: "주말 오전" },
  { code: "WEEKEND_AFTERNOON", label: "주말 오후" }
]);

/** 서버 `ProposalMeetingMode` 선언 순서와 같다. */
export const PROPOSAL_MEETING_MODES = Object.freeze([
  { code: "ONLINE", label: "온라인" },
  { code: "OFFLINE", label: "오프라인" }
]);

export const PROPOSAL_TITLE_MAX_LENGTH = 50;
export const PROPOSAL_CONTENT_MAX_LENGTH = 1000;
export const PROPOSAL_MOOD_OPTION_MAX_COUNT = 3;
export const PROPOSAL_MOOD_OPTION_MAX_LENGTH = 20;
export const PROPOSAL_COMMENT_MAX_LENGTH = 300;

const labelOf = (items, code) => items.find((item) => item.code === code)?.label ?? code;

export const proposalCategoryLabel = (code) => labelOf(PROPOSAL_CATEGORIES, code);
export const proposalTimeSlotLabel = (code) => labelOf(PROPOSAL_TIME_SLOTS, code);
export const proposalMeetingModeLabel = (code) => labelOf(PROPOSAL_MEETING_MODES, code);

const codesOf = (items) => items.map((item) => item.code);

export const proposalCategorySchema = z.enum(codesOf(PROPOSAL_CATEGORIES));
export const proposalTimeSlotSchema = z.enum(codesOf(PROPOSAL_TIME_SLOTS));
export const proposalMeetingModeSchema = z.enum(codesOf(PROPOSAL_MEETING_MODES));

const countSchema = z.number().int().nonnegative();

export const proposalSummarySchema = z.object({
  id: entityIdSchema,
  category: proposalCategorySchema,
  title: z.string().min(1),
  content: z.string(),
  authorNickname: z.string().min(1),
  authorAvatarUrl: z.string().nullable().default(null),
  interestCount: countSchema,
  commentCount: countSchema,
  interested: z.boolean(),
  createdAt: localDateTimeSchema
});

export const proposalPageSchema = cursorPageSchema(proposalSummarySchema);

const myInterestSchema = z.object({
  timeSlots: z.array(proposalTimeSlotSchema).default([]),
  meetingModes: z.array(proposalMeetingModeSchema).default([]),
  moodIndexes: z.array(z.number().int().nonnegative()).default([])
});

export const proposalDetailSchema = z.object({
  id: entityIdSchema,
  category: proposalCategorySchema,
  title: z.string().min(1),
  content: z.string(),
  authorNickname: z.string().min(1),
  authorAvatarUrl: z.string().nullable().default(null),
  createdAt: localDateTimeSchema,
  moodOptions: z.array(z.string()).default([]),
  interestCount: countSchema,
  commentCount: countSchema,
  timeSlotCounts: z.array(z.object({ timeSlot: proposalTimeSlotSchema, count: countSchema })),
  meetingModeCounts: z.array(z.object({ meetingMode: proposalMeetingModeSchema, count: countSchema })),
  moodCounts: z.array(countSchema).default([]),
  myInterest: myInterestSchema.nullable().default(null),
  canDelete: z.boolean()
});

export const proposalCreateResponseSchema = z.object({ id: entityIdSchema });

export const proposalCommentSchema = z.object({
  id: entityIdSchema,
  authorNickname: z.string().min(1),
  authorAvatarUrl: z.string().nullable().default(null),
  content: z.string().min(1),
  createdAt: localDateTimeSchema,
  canDelete: z.boolean()
});

export const proposalCommentPageSchema = cursorPageSchema(proposalCommentSchema);

export const proposalCommentCreateResponseSchema = z.object({ id: entityIdSchema });

/** 응답 조건이 하나도 없으면 목록에서 마음만 보낸 응답이다. */
export function hasInterestConditions(interest) {
  return Boolean(
    interest && (interest.timeSlots.length || interest.meetingModes.length || interest.moodIndexes.length)
  );
}

/** "30분 전"처럼 보여 주고, 일주일이 지나면 날짜로 보여 준다. */
export function formatProposalTime(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  const minutes = Math.floor((now.getTime() - created.getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" }).format(created);
}

/**
 * 제안 작성 입력을 서버와 같은 규칙으로 검사한다. 앞뒤 공백을 지운 값과 필드별 오류를 돌려준다.
 */
export function validateProposalForm({ category, title, content, moodOptions }) {
  const values = {
    category,
    title: title.trim(),
    content: content.trim(),
    moodOptions: moodOptions.map((option) => option.trim()).filter(Boolean)
  };
  const errors = {};
  if (!values.category) errors.category = "분야를 골라 주세요.";
  if (!values.title) errors.title = "제목을 입력해 주세요.";
  else if (values.title.length > PROPOSAL_TITLE_MAX_LENGTH) errors.title = "제목은 50자 이하여야 해요.";
  if (!values.content) errors.content = "내용을 입력해 주세요.";
  else if (values.content.length > PROPOSAL_CONTENT_MAX_LENGTH) errors.content = "내용은 1000자 이하여야 해요.";
  if (values.moodOptions.some((option) => option.length > PROPOSAL_MOOD_OPTION_MAX_LENGTH)) {
    errors.moodOptions = "분위기 선택지는 20자 이하여야 해요.";
  } else if (new Set(values.moodOptions).size !== values.moodOptions.length) {
    errors.moodOptions = "분위기 선택지가 서로 겹치지 않아야 해요.";
  } else if (values.moodOptions.length > PROPOSAL_MOOD_OPTION_MAX_COUNT) {
    errors.moodOptions = "분위기 선택지는 3개까지 정할 수 있어요.";
  }
  return { errors, values };
}
