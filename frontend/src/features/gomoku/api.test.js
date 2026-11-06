import { apiClient } from "../../shared/api";
import { gomokuApi } from "./api";

jest.mock("../../shared/api", () => ({ apiClient: { request: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

test("lobby explicitly requests summaries on first and subsequent search pages", async () => {
  const signal = new AbortController().signal;
  apiClient.request.mockResolvedValue({ items: [], nextCursor: null, hasNext: false });

  await gomokuApi.list(null, "", signal);
  await gomokuApi.list("next-page", "가을", signal);

  expect(apiClient.request).toHaveBeenNthCalledWith(1, "games/gomoku/rooms", expect.objectContaining({
    signal,
    searchParams: { view: "summary", size: 20 }
  }));
  expect(apiClient.request).toHaveBeenNthCalledWith(2, "games/gomoku/rooms", expect.objectContaining({
    signal,
    searchParams: { view: "summary", size: 20, cursor: "next-page", keyword: "가을" }
  }));
});
