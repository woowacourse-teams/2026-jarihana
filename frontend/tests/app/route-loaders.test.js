import { QueryClient } from "@tanstack/react-query";

import { createGroupDetailLoader } from "../../src/app/routeLoaders.js";
import { fetchGroup } from "../../src/features/group/api.js";
import { groupKeys } from "../../src/features/group/hooks.js";

jest.mock("../../src/features/group/api.js", () => ({ fetchGroup: jest.fn() }));

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
