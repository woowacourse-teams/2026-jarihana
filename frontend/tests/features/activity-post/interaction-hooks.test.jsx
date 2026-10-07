import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";

import {
  addActivityReaction,
  createActivityComment,
  removeActivityReaction
} from "../../../src/features/activity-post/api.js";
import {
  activityPostKeys,
  useCreateActivityComment,
  useToggleActivityReaction
} from "../../../src/features/activity-post/hooks.js";
import { captureEvent } from "../../../src/shared/analytics/index.js";

jest.mock("../../../src/features/activity-post/api.js");
jest.mock("../../../src/shared/analytics/index.js", () => ({ captureEvent: jest.fn() }));

const post = {
  commentCount: 1,
  group: { id: 41, joined: true, name: "우아한 스터디", recruiting: false, status: "ACTIVE", type: "STUDY" },
  id: 2,
  reactions: [{ count: 1, emoji: "FIRE", reacted: false }]
};
const feedKey = activityPostKeys.feed({ groupId: null, mine: false, viewerKey: 9 });

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  queryClient.setQueryData(feedKey, { pageParams: [null], pages: [{ hasNext: false, items: [post], nextCursor: null }] });
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

const feedPost = (queryClient) => queryClient.getQueryData(feedKey).pages[0].items[0];

beforeEach(() => jest.clearAllMocks());

it("adds a post reaction optimistically and records the success event", async () => {
  // Given
  addActivityReaction.mockResolvedValue(undefined);
  const { queryClient, wrapper } = setup();
  const { result } = renderHook(() => useToggleActivityReaction(), { wrapper });

  // When
  await act(() => result.current.mutateAsync({
    emoji: "THUMBS_UP",
    post,
    reacted: false,
    target: { id: 2, type: "post" },
    viewerRelation: "member"
  }));

  // Then
  expect(addActivityReaction).toHaveBeenCalledWith({ id: 2, type: "post" }, "THUMBS_UP");
  expect(feedPost(queryClient).reactions).toEqual([
    { count: 1, emoji: "THUMBS_UP", reacted: true },
    { count: 1, emoji: "FIRE", reacted: false }
  ]);
  expect(captureEvent).toHaveBeenCalledWith("activity_reaction_added", {
    activity_post_id: 2,
    emoji: "thumbs_up",
    group_id: 41,
    target_type: "post",
    viewer_relation: "member"
  });
});

it("reloads the feed from the server when removing a reaction fails", async () => {
  // Given
  removeActivityReaction.mockRejectedValue(new Error("network"));
  const { queryClient, wrapper } = setup();
  const invalidate = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  const { result } = renderHook(() => useToggleActivityReaction(), { wrapper });

  // When
  await act(async () => {
    await expect(result.current.mutateAsync({
      emoji: "FIRE",
      post: { ...post, reactions: [{ count: 1, emoji: "FIRE", reacted: true }] },
      reacted: true,
      target: { id: 2, type: "post" },
      viewerRelation: "member"
    })).rejects.toThrow("network");
  });

  // Then
  expect(invalidate).toHaveBeenCalledWith({ queryKey: activityPostKeys.feeds() });
  expect(captureEvent).not.toHaveBeenCalled();
});

it("counts a new comment on the feed card and refreshes that post's comments", async () => {
  // Given
  createActivityComment.mockResolvedValue({ id: 7 });
  const { queryClient, wrapper } = setup();
  const invalidate = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  const { result } = renderHook(() => useCreateActivityComment(), { wrapper });

  // When
  await act(() => result.current.mutateAsync({ content: "반가워요", post, viewerRelation: "non_member" }));

  // Then
  expect(createActivityComment).toHaveBeenCalledWith(2, "반가워요");
  expect(feedPost(queryClient).commentCount).toBe(2);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: activityPostKeys.comments(2) });
  expect(captureEvent).toHaveBeenCalledWith("activity_comment_created", {
    activity_post_id: 2,
    group_id: 41,
    viewer_relation: "non_member"
  });
});
