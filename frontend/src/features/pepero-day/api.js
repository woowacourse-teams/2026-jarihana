import { z } from "zod";

import { apiClient } from "../../shared/api";

const chocolateLevel = z.enum(["NONE", "THIN", "THICK"]);
const count = z.number().int().nonnegative();
// 서버 시각은 Asia/Seoul 기준의 오프셋 없는 날짜·시간 문자열이다.
const serviceDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/);

export const stickSchema = z.object({
  almonds: z.array(z.object({ cell: z.number().int().min(0).max(23), size: z.enum(["SMALL", "LARGE"]) })),
  cells: z.array(chocolateLevel).length(24),
  lengthCm: z.number().positive(),
  startPosition: z.number().min(0).max(12),
  totalMilligrams: z.number().int().positive()
});

export const eventStatusSchema = z.object({
  attemptsRefillAt: serviceDateTime,
  closesAt: serviceDateTime,
  gameRoomOpen: z.boolean(),
  gameRoomOpensAt: serviceDateTime,
  hourlyAttemptLimit: z.number().int().positive(),
  opensAt: serviceDateTime,
  remainingAttempts: count.nullable(),
  serverTime: serviceDateTime,
  status: z.enum(["UPCOMING", "OPEN", "CLOSED"])
});

const startRunSchema = z.object({
  attemptsRefillAt: serviceDateTime,
  remainingAttempts: count,
  round: z.number().int().positive(),
  runId: z.number().int().positive(),
  stick: stickSchema,
  timeLimitSeconds: z.number().int().positive()
});

const cutSchema = z.object({
  answerPosition: z.number(),
  errorRate: z.number().nonnegative(),
  finished: z.boolean(),
  nextStick: stickSchema.nullable(),
  round: z.number().int().positive(),
  score: count,
  timedOut: z.boolean(),
  totalScore: count
});

const rankingItemSchema = z.object({
  nickname: z.string(),
  rank: z.number().int().positive(),
  totalDurationMillis: count,
  totalScore: count
});

const rankingSchema = z.object({ items: z.array(rankingItemSchema), me: rankingItemSchema.nullable() });

export const getPeperoDayStatus = () => apiClient.request("events/pepero-day", { schema: eventStatusSchema });

export const startPeperoDayRun = () =>
  apiClient.request("events/pepero-day/runs", { method: "POST", schema: startRunSchema });

export const cutPeperoDayStick = (runId, round, position) =>
  apiClient.request(`events/pepero-day/runs/${runId}/cuts`, {
    json: { position, round },
    method: "POST",
    schema: cutSchema
  });

export const getPeperoDayRankings = () =>
  apiClient.request("events/pepero-day/rankings", { schema: rankingSchema });

// 기기 시간대와 관계없이 서버 시각을 한국 시간으로 읽는다.
export const parseServiceTime = (value) => Date.parse(`${value}+09:00`);

// 순위 도전 판을 게임 화면의 연결부로 바꾼다. 막대 생성과 판정은 모두 서버가 한다.
export function createRankedAdapter({ onStarted } = {}) {
  let runId = null;
  return {
    async cut(round, position) {
      return cutPeperoDayStick(runId, round, position);
    },
    async start() {
      const started = await startPeperoDayRun();
      runId = started.runId;
      onStarted?.(started);
      return { round: started.round, stick: started.stick };
    }
  };
}
