import { apiClient } from "../../shared/api";
import { catchUp, fetchAllRooms } from "./api";
jest.mock("../../shared/api", () => ({ apiClient: { request: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

test("catch-up exhausts every page using server cursors", async () => {
  apiClient.request.mockResolvedValueOnce({ items: [{ sequence: "11" }], nextCursor: "11", latestSequence: "13", hasNext: true })
    .mockResolvedValueOnce({ items: [{ sequence: "12" }, { sequence: "13" }], nextCursor: null, latestSequence: "13", hasNext: false });
  const pages = jest.fn();
  expect(await catchUp("1", "10", pages)).toBe("13");
  expect(apiClient.request.mock.calls.map(([, options]) => options.searchParams.afterSequence)).toEqual(["10", "11"]);
  expect(pages).toHaveBeenCalledTimes(2);
});

test("room pagination deduplicates moving rooms and rejects repeated cursors", async () => {
  apiClient.request.mockResolvedValueOnce({ items: [{ groupId: "1" }], hasNext: true, nextCursor: "next" })
    .mockResolvedValueOnce({ items: [{ groupId: "1" }, { groupId: "2" }], hasNext: false, nextCursor: null });
  expect(await fetchAllRooms()).toHaveLength(2);
  apiClient.request.mockResolvedValue({ items: [], hasNext: true, nextCursor: "same" });
  await expect(fetchAllRooms()).rejects.toThrow("Invalid chat list cursor");
});
