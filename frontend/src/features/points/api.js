import { z } from "zod";
import { apiClient } from "../../shared/api";

const endpoint = "members/me/points";
const count = z.number().int().nonnegative();
const localTime = z.string().datetime({ local: true });
const quota = z.object({ limit: count, completed: count, pending: count, remaining: count });
const weeklyQuota = z.object({ reason: z.string(), label: z.string(), quota });
const summary = z.object({
  enabled: z.boolean(),
  balance: count,
  processing: z.boolean(),
  gomokuWeekly: quota,
  activityPostWeekly: quota,
  weeklyQuotas: z.array(weeklyQuota).optional(),
  resetsAt: localTime
}).transform((data) => ({
  ...data,
  weeklyQuotas: data.weeklyQuotas ?? [
    { reason: "GOMOKU_WIN", label: "오목 승리", quota: data.gomokuWeekly },
    { reason: "ACTIVITY_POST", label: "사진 활동기록", quota: data.activityPostWeekly }
  ]
}));
const item = z.object({
  id: z.string(),
  reason: z.string(),
  label: z.string().nullish(),
  amount: count,
  occurredAt: localTime,
  status: z.enum(["PENDING", "COMPLETED", "SKIPPED", "NEEDS_REVIEW"]),
  skipReason: z.string().nullable(),
  completedAt: localTime.nullable()
});

export const pointsApi = {
  summary: (signal) => apiClient.request(endpoint, { schema: summary, signal }),
  history: (cursor, signal) => apiClient.request(`${endpoint}/transactions`, {
    schema: z.object({ items: z.array(item), nextCursor: z.string().nullable(), hasNext: z.boolean() }),
    searchParams: cursor ? { cursor } : {},
    signal
  }),
  claim: (signal) => apiClient.request(`${endpoint}/first-join-claim`, {
    method: "POST", schema: z.object({ queued: z.boolean() }), authRetry: false, signal
  })
};
