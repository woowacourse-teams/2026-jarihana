import { act, renderHook } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { useTodaySessions } from "../../src/features/group/useTodaySessions.js";

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(() => ({ data: [], isLoading: false })),
  useInfiniteQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn()
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-26T14:59:50Z"));
});
afterEach(() => jest.useRealTimers());

it("changes the query key after Seoul midnight while the page stays open", () => {
  const { result, unmount } = renderHook(() => useTodaySessions());
  expect(result.current.date).toBe("2026-09-26");
  act(() => jest.advanceTimersByTime(30_000));
  expect(result.current.date).toBe("2026-09-27");
  expect(useQuery).toHaveBeenLastCalledWith(
    expect.objectContaining({
      queryKey: ["groups", "list", "today", "2026-09-27"],
      refetchIntervalInBackground: false
    })
  );
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it("refreshes the calendar day immediately when a suspended tab becomes visible", () => {
  const { result } = renderHook(() => useTodaySessions());
  jest.setSystemTime(new Date("2026-09-28T02:00:00Z"));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(result.current.date).toBe("2026-09-28");
});
