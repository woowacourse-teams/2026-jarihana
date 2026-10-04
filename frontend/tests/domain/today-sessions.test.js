import { fetchGroups } from "../../src/features/group/api.js";
import { fetchTodaySessions, getSeoulDate } from "../../src/features/group/todaySessions.js";

jest.mock("../../src/features/group/api.js", () => ({ fetchGroups: jest.fn() }));

const session = (id, startTime) => ({
  id,
  type: "SESSION",
  status: "ACTIVE",
  activeRecruitment: null,
  sessionSchedule: { sessionDate: "2026-09-27", startTime, endTime: "23:00:00" }
});

beforeEach(() => jest.resetAllMocks());

it("uses the Seoul calendar day across the UTC date boundary", () => {
  expect(getSeoulDate(new Date("2026-09-26T14:59:59Z"))).toBe("2026-09-26");
  expect(getSeoulDate(new Date("2026-09-26T15:00:00Z"))).toBe("2026-09-27");
});

it("loads every date-filtered page and sorts sessions by start time without requiring recruitment", async () => {
  fetchGroups
    .mockResolvedValueOnce({ items: [session(3, "19:00:00")], hasNext: true, nextCursor: "older" })
    .mockResolvedValueOnce({
      items: [session(2, "10:00:00"), session(1, "10:00:00"), session(3, "19:00:00")],
      hasNext: false,
      nextCursor: null
    });

  const groups = await fetchTodaySessions("2026-09-27");

  expect(groups.map(({ id }) => id)).toEqual([1, 2, 3]);
  expect(fetchGroups).toHaveBeenNthCalledWith(1, {
    type: "SESSION",
    status: "ACTIVE",
    sessionDate: "2026-09-27",
    size: 100,
    cursor: undefined
  });
  expect(fetchGroups).toHaveBeenNthCalledWith(2, {
    type: "SESSION",
    status: "ACTIVE",
    sessionDate: "2026-09-27",
    size: 100,
    cursor: "older"
  });
});

it("returns an empty day without inventing sessions", async () => {
  fetchGroups.mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
  await expect(fetchTodaySessions("2026-09-27")).resolves.toEqual([]);
});

it.each([null, "same"])(
  "rejects a broken cursor %s instead of presenting an incomplete plan",
  async (nextCursor) => {
    fetchGroups
      .mockResolvedValueOnce({ items: [session(1, "10:00:00")], hasNext: true, nextCursor: "same" })
      .mockResolvedValueOnce({ items: [session(2, "12:00:00")], hasNext: true, nextCursor });
    await expect(fetchTodaySessions("2026-09-27")).rejects.toMatchObject({
      code: "INVALID_RESPONSE"
    });
    expect(fetchGroups).toHaveBeenCalledTimes(2);
  }
);

it("reports a later-page error instead of declaring the partial day complete", async () => {
  fetchGroups
    .mockResolvedValueOnce({ items: [session(1, "10:00:00")], hasNext: true, nextCursor: "older" })
    .mockRejectedValueOnce(new Error("offline"));
  await expect(fetchTodaySessions("2026-09-27")).rejects.toThrow("offline");
});
