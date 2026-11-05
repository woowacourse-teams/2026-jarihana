import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuth } from "../../src/features/auth";
import { getPeperoDayStatus } from "../../src/features/pepero-day/api";
import { usePeperoDayStatus } from "../../src/features/pepero-day/hooks";

jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/features/pepero-day/api", () => ({
  ...jest.requireActual("../../src/features/pepero-day/api"),
  getPeperoDayStatus: jest.fn()
}));

const HOUR = 60 * 60 * 1000;
const status = (overrides) => ({
  closesAt: "2026-11-12T10:00:00",
  gameRoomOpen: false,
  gameRoomOpensAt: "2026-11-12T13:00:00",
  opensAt: "2026-11-11T00:00:00",
  ...overrides
});

// 서버가 보는 지금 시각으로 상태를 계산해 돌려준다.
function serverStatus() {
  const now = Date.now();
  const serverTime = new Date(now + 9 * HOUR).toISOString().slice(0, 19);
  if (now < Date.parse("2026-11-11T00:00:00+09:00")) return status({ serverTime, status: "UPCOMING" });
  if (now < Date.parse("2026-11-12T10:00:00+09:00")) return status({ serverTime, status: "OPEN" });
  return status({ serverTime, status: "CLOSED" });
}

async function advance(millis) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(millis);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(0);
  useAuth.mockReturnValue({ member: null, status: "anonymous" });
  getPeperoDayStatus.mockImplementation(async () => serverStatus());
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("opens and closes on time even when the first boundary was more than a day away", async () => {
  // Given: 11월 9일 12시에 연 탭을 그대로 둔다. 여는 시각까지 36시간 남았다.
  jest.setSystemTime(new Date("2026-11-09T12:00:00+09:00"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => usePeperoDayStatus(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  });
  await advance(0);
  expect(result.current.data.status).toBe("UPCOMING");

  // When: 하루 뒤 한 번 다시 받고, 그때 남은 12시간을 예약한다. 요청은 경계 뒤 0~3초 사이에 나간다.
  await advance(24 * HOUR);
  expect(getPeperoDayStatus).toHaveBeenCalledTimes(2);
  expect(result.current.data.status).toBe("UPCOMING");
  await advance(12 * HOUR + 3000);

  // Then
  expect(result.current.data.status).toBe("OPEN");

  // When: 열린 뒤 닫는 시각까지 34시간이 남았다.
  await advance(34 * HOUR + 3000);

  // Then
  expect(result.current.data.status).toBe("CLOSED");
});
