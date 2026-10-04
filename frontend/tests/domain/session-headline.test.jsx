import { act, renderHook } from "@testing-library/react";

import {
  sessionHeadline,
  sessionHeroPeriod,
  useSessionHero,
  useSessionHeadline
} from "../../src/pages/groups/home/useSessionHeadline.js";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-27T10:59:50+09:00"));
  jest.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it.each([
  ["00:00:00", "안 자요? 잘됐네. 공범 구하던 참인데."],
  ["05:59:59", "안 자요? 잘됐네. 공범 구하던 참인데."],
  ["06:00:00", "이 시간에 접속? 갓생인가요, 밤샘인가요?"],
  ["10:59:59", "이 시간에 접속? 갓생인가요, 밤샘인가요?"],
  ["11:00:00", "밥 먹을 사람 구함. ‘아무거나’ 금지."],
  ["12:59:59", "밥 먹을 사람 구함. ‘아무거나’ 금지."],
  ["13:00:00", "혼자 졸면 낮잠, 같이 졸면 스터디."],
  ["16:59:59", "혼자 졸면 낮잠, 같이 졸면 스터디."],
  ["17:00:00", "오늘도 집 가서 유튜브랑 약속 있으세요?"],
  ["18:59:59", "오늘도 집 가서 유튜브랑 약속 있으세요?"],
  ["19:00:00", "안 자요? 잘됐네. 공범 구하던 참인데."],
  ["23:59:59", "안 자요? 잘됐네. 공범 구하던 참인데."]
])("uses the Seoul time slot at %s", (time, expected) => {
  expect(sessionHeadline(new Date(`2026-09-27T${time}+09:00`), 0)).toBe(expected);
});

it("offers all headline variants within each time slot", () => {
  for (const [hour, count] of [
    [3, 5],
    [9, 5],
    [12, 6],
    [16, 7],
    [18, 8]
  ]) {
    const now = new Date(`2026-09-27T${String(hour).padStart(2, "0")}:00:00+09:00`);
    const headlines = Array.from({ length: count }, (_, index) =>
      sessionHeadline(now, (index + 0.5) / count)
    );
    expect(headlines.every((headline) => typeof headline === "string" && headline.length > 0)).toBe(
      true
    );
    expect(new Set(headlines).size).toBe(count);
  }
});

it.each([
  ["10:59:50", "이 시간에 접속? 갓생인가요, 밤샘인가요?", "밥 먹을 사람 구함. ‘아무거나’ 금지."],
  ["12:59:50", "밥 먹을 사람 구함. ‘아무거나’ 금지.", "혼자 졸면 낮잠, 같이 졸면 스터디."],
  ["16:59:50", "혼자 졸면 낮잠, 같이 졸면 스터디.", "오늘도 집 가서 유튜브랑 약속 있으세요?"],
  ["18:59:50", "오늘도 집 가서 유튜브랑 약속 있으세요?", "안 자요? 잘됐네. 공범 구하던 참인데."]
])("keeps the chosen headline on rerender and updates after %s", (time, before, after) => {
  jest.setSystemTime(new Date(`2026-09-27T${time}+09:00`));
  const { result, rerender, unmount } = renderHook(() => useSessionHeadline());
  expect(result.current).toBe(before);
  Math.random.mockReturnValue(0.999);
  rerender();
  expect(result.current).toBe(before);
  act(() => jest.advanceTimersByTime(60_000));
  expect(result.current).toBe(after);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it.each(["focus", "visibilitychange"])(
  "refreshes immediately on %s after a suspended tab returns",
  (event) => {
    const { result } = renderHook(() => useSessionHeadline());
    jest.setSystemTime(new Date("2026-09-27T19:00:00+09:00"));
    act(() => (event === "focus" ? window : document).dispatchEvent(new Event(event)));
    expect(result.current).toBe("안 자요? 잘됐네. 공범 구하던 참인데.");
  }
);

it.each(["00:00:00", "05:59:59", "19:00:00", "23:59:59"])(
  "uses the campus-specific headline only after a Pangyo match at %s",
  (time) => {
    const now = new Date(`2026-09-27T${time}+09:00`);
    expect(sessionHeadline(now, 0.5, true)).toBe("왜 아직 집 안 갔어요?");
    expect(sessionHeadline(now, 0.5, false)).not.toBe("왜 아직 집 안 갔어요?");
  }
);

it.each(["06:00:00", "12:00:00", "15:00:00", "18:59:59"])(
  "keeps daytime headlines at %s even inside the campus",
  (time) => {
    const now = new Date(`2026-09-27T${time}+09:00`);
    expect(sessionHeadline(now, 0.5, true)).toBe(sessionHeadline(now, 0.5, false));
  }
);

it("updates immediately when a campus match arrives or expires", () => {
  jest.setSystemTime(new Date("2026-09-27T19:00:00+09:00"));
  const { result, rerender } = renderHook(({ isAtPangyo }) => useSessionHeadline(isAtPangyo), {
    initialProps: { isAtPangyo: false }
  });
  const original = result.current;
  rerender({ isAtPangyo: true });
  expect(result.current).toBe("왜 아직 집 안 갔어요?");
  rerender({ isAtPangyo: false });
  expect(result.current).toBe(original);
});


it.each([
  ["2026-09-27T05:59:59.999+09:00", "night"],
  ["2026-09-27T06:00:00+09:00", "day"],
  ["2026-09-27T16:59:59.999+09:00", "day"],
  ["2026-09-27T17:00:00+09:00", "sunset"],
  ["2026-09-27T19:59:59.999+09:00", "sunset"],
  ["2026-09-27T20:00:00+09:00", "night"],
  ["2026-09-28T00:00:00+09:00", "night"],
  ["2026-09-27T08:00:00Z", "sunset"],
  ["2026-09-27T04:00:00-07:00", "night"]
])("selects the hero background by Seoul time for %s", (instant, expected) => {
  expect(sessionHeroPeriod(new Date(instant))).toBe(expected);
});

it.each([
  ["05:59:59.900", "night", "day"],
  ["16:59:59.900", "day", "sunset"],
  ["19:59:59.900", "sunset", "night"]
])("updates the background and copy exactly at the boundary after %s", (time, before, after) => {
  jest.setSystemTime(new Date(`2026-09-27T${time}+09:00`));
  const { result, rerender, unmount } = renderHook(() => useSessionHero());
  expect(result.current).toEqual({ headline: sessionHeadline(new Date(), 0), period: before });
  Math.random.mockReturnValue(0.999);
  rerender();
  act(() => jest.advanceTimersByTime(99));
  expect(result.current.period).toBe(before);
  act(() => jest.advanceTimersByTime(1));
  expect(result.current).toEqual({ headline: sessionHeadline(new Date(), 0), period: after });
  expect(jest.getTimerCount()).toBe(1);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it.each(["focus", "visibilitychange"])(
  "refreshes both hero values and rearms the boundary timer on %s",
  (event) => {
    jest.setSystemTime(new Date("2026-09-27T16:10:00+09:00"));
    const { result, unmount } = renderHook(() => useSessionHero());
    expect(result.current.period).toBe("day");
    jest.setSystemTime(new Date("2026-09-27T19:59:59.900+09:00"));
    act(() => (event === "focus" ? window : document).dispatchEvent(new Event(event)));
    expect(result.current).toEqual({
      headline: sessionHeadline(new Date(), 0),
      period: "sunset"
    });
    expect(jest.getTimerCount()).toBe(1);
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toEqual({ headline: sessionHeadline(new Date(), 0), period: "night" });
    unmount();
    act(() => (event === "focus" ? window : document).dispatchEvent(new Event(event)));
    expect(jest.getTimerCount()).toBe(0);
  }
);
