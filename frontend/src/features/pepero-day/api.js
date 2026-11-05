import { z } from "zod";

import { apiClient } from "../../shared/api";

const chocolateLevel = z.enum(["NONE", "THIN", "THICK"]);
const count = z.number().int().nonnegative();
// 서버 시각은 Asia/Seoul 기준의 오프셋 없는 날짜와 시간 문자열이다.
const serviceDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/);

export const stickSchema = z.object({
  almonds: z.array(z.object({ cell: z.number().int().min(0).max(23), size: z.enum(["SMALL", "LARGE"]) })),
  cells: z.array(chocolateLevel).length(24),
  lengthCm: z.number().positive(),
  startPosition: z.number().min(0).max(12),
  totalMilligrams: z.number().int().positive()
});

export const eventStatusSchema = z.object({
  closesAt: serviceDateTime,
  gameRoomOpen: z.boolean(),
  gameRoomOpensAt: serviceDateTime,
  opensAt: serviceDateTime,
  serverTime: serviceDateTime,
  status: z.enum(["UPCOMING", "OPEN", "CLOSED"])
});

// 판을 시작하거나 다음 막대를 받은 응답이다. remainingMillis는 서버가 정한 제한 시간 마감까지 남은 시간이다.
const roundStickSchema = z.object({
  remainingMillis: count,
  round: z.number().int().positive(),
  runId: z.number().int().positive(),
  stick: stickSchema,
  timeLimitSeconds: z.number().int().positive()
});

const cutSchema = z.object({
  answerPosition: z.number(),
  errorRate: z.number().nonnegative(),
  finished: z.boolean(),
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

// 순위표마다 순위 도전 경로가 다르다. 이벤트 기간의 순위와 게임방으로 옮긴 뒤의 순위는 따로 매긴다.
const BOARD_PATHS = Object.freeze({ event: "events/pepero-day", room: "games/stick-halving" });

export const getPeperoDayStatus = () => apiClient.request("events/pepero-day", { schema: eventStatusSchema });

export const startRankedRun = (board = "event") =>
  apiClient.request(`${BOARD_PATHS[board]}/runs`, { method: "POST", schema: roundStickSchema });

export const issueRankedRound = (board, runId, round) =>
  apiClient.request(`${BOARD_PATHS[board]}/runs/${runId}/rounds`, {
    json: { round },
    method: "POST",
    schema: roundStickSchema
  });

export const cutRankedStick = (board, runId, round, position) =>
  apiClient.request(`${BOARD_PATHS[board]}/runs/${runId}/cuts`, {
    json: { position, round },
    method: "POST",
    schema: cutSchema
  });

export const getPeperoDayRankings = () =>
  apiClient.request("events/pepero-day/rankings", { schema: rankingSchema });

export const getStickHalvingRoomRankings = () =>
  apiClient.request("games/stick-halving/rankings", { schema: rankingSchema });

// 기기 시간대와 관계없이 서버 시각을 한국 시간으로 읽는다.
export const parseServiceTime = (value) => Date.parse(`${value}+09:00`);

// 순위 도전 판을 게임 화면의 연결부로 바꾼다. 막대 생성과 판정은 모두 서버가 한다.
// 다음 막대는 결과를 본 뒤 받아야 서버가 그때부터 제한 시간을 잰다.
export function createRankedAdapter({ board = "event", onStarted } = {}) {
  let runId = null;
  const toRound = ({ remainingMillis, round, stick }) => ({ remainingMillis, round, stick });
  return {
    async cut(round, position) {
      return cutRankedStick(board, runId, round, position);
    },
    async next(round) {
      return toRound(await issueRankedRound(board, runId, round));
    },
    async start() {
      const started = await startRankedRun(board);
      runId = started.runId;
      onStarted?.(started);
      return toRound(started);
    }
  };
}
