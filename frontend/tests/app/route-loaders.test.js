import { QueryClient } from "@tanstack/react-query";

import { createGroupBrowseLoader, createGroupDetailLoader, shouldRevalidateGroupBrowse } from "../../src/app/routeLoaders.js";
import { fetchGroup, fetchGroups } from "../../src/features/group/api.js";
import { groupKeys } from "../../src/features/group/hooks.js";

jest.mock("../../src/features/group/api.js", () => ({ fetchGroup: jest.fn(), fetchGroups: jest.fn() }));

let client;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  jest.clearAllMocks();
});
afterEach(() => client.clear());

test("detail navigation waits for real data using the same string key as the page", async () => {
  let release;
  fetchGroup.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  const loader = createGroupDetailLoader(client);
  const completed = jest.fn();
  const navigation = loader({ params: { groupId: "10" } }).then(completed);
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  release({ id: 10, name: "함께 공부해요", description: "실제 상세 정보" });
  await navigation;
  expect(client.getQueryData(groupKeys.detail("10"))).toMatchObject({ description: "실제 상세 정보" });
  await loader({ params: { groupId: "10" } });
  expect(fetchGroup).toHaveBeenCalledTimes(1);
});

test("failed detail navigation preserves the error for the existing page retry UI", async () => {
  const error = new Error("offline");
  fetchGroup.mockRejectedValue(error);
  await expect(createGroupDetailLoader(client)({ params: { groupId: "10" } })).resolves.toBeNull();
  expect(client.getQueryState(groupKeys.detail("10"))).toMatchObject({ status: "error", error });
  expect(fetchGroup).toHaveBeenCalledTimes(1);
});

const browseKey = (filters = {}) => groupKeys.list({
  keyword: undefined, type: undefined, status: "ACTIVE", recruiting: undefined, size: 12, ...filters
});
const browseRequest = (search = "") => ({ request: { url: `http://localhost/groups${search}` } });

test("browse navigation waits for the first page and shares the infinite query cache", async () => {
  let release;
  fetchGroups.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  const loader = createGroupBrowseLoader(client);
  const completed = jest.fn();
  const navigation = loader(browseRequest("?keyword=%20react%20&type=STUDY&recruiting=false")).then(completed);
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  const page = { items: [{ id: 10 }], nextCursor: "next", hasNext: true };
  release(page);
  await navigation;
  expect(fetchGroups).toHaveBeenCalledWith({ keyword: "react", type: "STUDY", status: "ACTIVE", recruiting: false, size: 12, cursor: null });
  expect(client.getQueryData(browseKey({ keyword: "react", type: "STUDY", recruiting: false })))
    .toEqual({ pages: [page], pageParams: [null] });
});

test("returning to a cached browse list keeps all pages without waiting for a refresh", async () => {
  const cached = { pages: [{ items: [{ id: 1 }], nextCursor: "next", hasNext: true }, { items: [{ id: 2 }], hasNext: false }], pageParams: [null, "next"] };
  client.setQueryData(browseKey(), cached, { updatedAt: Date.now() - 60_000 });
  await expect(createGroupBrowseLoader(client)(browseRequest())).resolves.toBeNull();
  expect(fetchGroups).not.toHaveBeenCalled();
  expect(client.getQueryData(browseKey())).toEqual(cached);
});

test.each([
  ["?type=invalid&status=unknown&recruiting=maybe", {}],
  ["?type=CLUB&status=ENDED&recruiting=true", { type: "CLUB", status: "ENDED" }],
  ["?type=SESSION&recruiting=true", { type: "SESSION", recruiting: true }]
])("browse loader normalizes URL filters: %s", async (search, filters) => {
  fetchGroups.mockResolvedValue({ items: [], hasNext: false });
  await createGroupBrowseLoader(client)(browseRequest(search));
  expect(client.getQueryData(browseKey(filters))).toMatchObject({ pages: [{ items: [] }] });
});

test("failed browse loading reaches the existing error UI and can be retried", async () => {
  const error = new Error("offline");
  fetchGroups.mockRejectedValueOnce(error).mockResolvedValueOnce({ items: [], hasNext: false });
  const loader = createGroupBrowseLoader(client);
  await expect(loader(browseRequest())).resolves.toBeNull();
  expect(client.getQueryState(browseKey())).toMatchObject({ status: "error", error });
  await loader(browseRequest());
  expect(client.getQueryState(browseKey())).toMatchObject({ status: "success" });
  expect(fetchGroups).toHaveBeenCalledTimes(2);
});

test("in-page filter changes keep query-driven loading instead of blocking navigation", () => {
  const currentUrl = new URL("http://localhost/groups");
  expect(shouldRevalidateGroupBrowse({ currentUrl, nextUrl: new URL("http://localhost/groups?type=STUDY"), defaultShouldRevalidate: true })).toBe(false);
  expect(shouldRevalidateGroupBrowse({ currentUrl, nextUrl: currentUrl, defaultShouldRevalidate: true })).toBe(true);
});
