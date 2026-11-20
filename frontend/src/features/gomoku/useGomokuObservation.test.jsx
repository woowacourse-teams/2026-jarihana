import { act, renderHook, waitFor } from "@testing-library/react";
import { useGomokuObservation } from "./useGomokuObservation";
import { gomokuApi } from "./api";

jest.mock("../auth", () => ({
  useAuth: () => ({ member: { id: 3 }, status: "authenticated", sessionVersion: 1 })
}));
jest.mock("./api", () => ({ gomokuApi: { observe: jest.fn(), leaveObservation: jest.fn() } }));
const participationId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  gomokuApi.observe.mockResolvedValue({ participationId, chatStartSequence: "8" });
  gomokuApi.leaveObservation.mockResolvedValue();
});

test("refresh reuses the tab's request key and server participation", async () => {
  const first = renderHook(() => useGomokuObservation("7"));
  await waitFor(() => expect(first.result.current.participationId).toBe(participationId));
  const requestId = gomokuApi.observe.mock.calls[0][1];
  expect(JSON.parse(sessionStorage.getItem("gomoku-observation:3:7"))).toEqual({
    requestId,
    participationId
  });
  first.unmount();
  const second = renderHook(() => useGomokuObservation("7"));
  await waitFor(() => expect(second.result.current.participationId).toBe(participationId));
  expect(gomokuApi.observe.mock.calls[1][1]).toBe(requestId);
  expect(gomokuApi.leaveObservation).not.toHaveBeenCalled();
});

test("failed leave preserves admission and successful leave starts a fresh visit next time", async () => {
  const first = renderHook(() => useGomokuObservation("7"));
  await waitFor(() => expect(first.result.current.participationId).toBe(participationId));
  const requestId = gomokuApi.observe.mock.calls[0][1];
  gomokuApi.leaveObservation.mockRejectedValueOnce(new Error("offline"));
  await act(async () => expect(await first.result.current.leave()).toBe(false));
  expect(first.result.current.error).toContain("종료하지 못했어요");
  expect(sessionStorage.getItem("gomoku-observation:3:7")).not.toBeNull();
  await act(async () => expect(await first.result.current.leave()).toBe(true));
  expect(sessionStorage.getItem("gomoku-observation:3:7")).toBeNull();
  first.unmount();
  const second = renderHook(() => useGomokuObservation("7"));
  await waitFor(() => expect(second.result.current.participationId).toBe(participationId));
  expect(gomokuApi.observe.mock.calls[1][1]).not.toBe(requestId);
});

test("concurrent leave clicks send one request and a late admission cannot overwrite another room", async () => {
  let complete;
  gomokuApi.observe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const first = renderHook(() => useGomokuObservation("7"));
  await waitFor(() => expect(gomokuApi.observe).toHaveBeenCalledTimes(1));
  first.unmount();
  const second = renderHook(() => useGomokuObservation("8"));
  await waitFor(() => expect(second.result.current.participationId).toBe(participationId));
  await act(async () => complete({ participationId, chatStartSequence: "8" }));
  expect(JSON.parse(sessionStorage.getItem("gomoku-observation:3:7"))).not.toHaveProperty(
    "participationId"
  );
  let finishLeave;
  gomokuApi.leaveObservation.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishLeave = resolve;
      })
  );
  let leaving;
  await act(async () => {
    leaving = second.result.current.leave();
    expect(await second.result.current.leave()).toBe(false);
  });
  expect(gomokuApi.leaveObservation).toHaveBeenCalledTimes(1);
  await act(async () => {
    finishLeave();
    await leaving;
  });
});
