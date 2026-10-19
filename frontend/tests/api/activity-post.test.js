import {
  ACTIVITY_REACTION_EMOJIS,
  activityPostSchema,
  toggleActivityReaction
} from "../../src/entities/activity-post/index.js";
import {
  addActivityReaction,
  createActivityComment,
  createActivityPost,
  deleteActivityComment,
  deleteActivityPost,
  fetchActivityComments,
  fetchActivityPosts,
  modifyActivityPost,
  removeActivityReaction
} from "../../src/features/activity-post/api.js";
import { apiRequest } from "../../src/shared/api/index.js";

jest.mock("../../src/shared/api/index.js", () => ({ apiRequest: jest.fn() }));

describe("activity post API", () => {
  beforeEach(() => apiRequest.mockReset());

  it("requests the public activity feed with the optional mine filter and cursor", async () => {
    await fetchActivityPosts({ cursor: "encoded-cursor", groupId: 41, mine: true, size: 10 });

    expect(apiRequest).toHaveBeenCalledWith(
      "groups/41/activity-posts",
      expect.objectContaining({
        searchParams: { cursor: "encoded-cursor", mine: true, size: 10 }
      })
    );
  });

  it("creates one photo post in its selected group", async () => {
    const values = {
      activityDate: "2026-08-19",
      caption: "함께한 하루",
      imageKey: "groups/tmp/photo.webp"
    };

    await createActivityPost(41, values);

    expect(apiRequest).toHaveBeenCalledWith(
      "groups/41/activity-posts",
      expect.objectContaining({ method: "post", json: values })
    );
  });

  it("updates and hides posts through their resource routes", async () => {
    const values = { activityDate: "2026-08-18", caption: null };

    await modifyActivityPost(55, values);
    await deleteActivityPost(55);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "activity-posts/55",
      expect.objectContaining({ method: "put", json: values, schema: expect.any(Object) })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "activity-posts/55",
      expect.objectContaining({ method: "delete", schema: expect.any(Object) })
    );

    for (const [, options] of apiRequest.mock.calls) {
      expect(options.schema.safeParse(null).success).toBe(true);
    }
  });

  it("reads and writes comments through the post comment routes", async () => {
    await fetchActivityComments({ cursor: "next", postId: 55 });
    await createActivityComment(55, "반가워요");
    await deleteActivityComment(7);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "activity-posts/55/comments",
      expect.objectContaining({ searchParams: { cursor: "next", size: 20 }, schema: expect.any(Object) })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "activity-posts/55/comments",
      expect.objectContaining({ json: { content: "반가워요" }, method: "post" })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(3, "activity-post-comments/7", { method: "delete" });
  });

  it("toggles reactions on posts and comments with the emoji code in the path", async () => {
    await addActivityReaction({ id: 55, type: "post" }, "HEART");
    await removeActivityReaction({ id: 7, type: "comment" }, "HEART");

    expect(apiRequest).toHaveBeenNthCalledWith(1, "activity-posts/55/reactions/HEART", { method: "put" });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "activity-post-comments/7/reactions/HEART", {
      method: "delete"
    });
  });
});

describe("activity reactions", () => {
  it("offers only the heart reaction for now", () => {
    expect(ACTIVITY_REACTION_EMOJIS).toEqual([{ code: "HEART", label: "하트" }]);
  });

  it("defaults missing counts and skips emoji the screen does not know", () => {
    const parsed = activityPostSchema.parse({
      activityDate: "2026-08-18",
      authorNickname: "가온",
      canModify: false,
      caption: null,
      createdAt: "2026-08-19T10:00:00",
      group: { id: 41, name: "우아한 스터디", status: "ACTIVE", type: "STUDY" },
      id: 2,
      imageUrl: "photos/2.jpg",
      reactions: [
        { count: 2, emoji: "THUMBS_UP", reacted: false },
        { count: 1, emoji: "HEART", reacted: true }
      ]
    });

    expect(parsed.commentCount).toBe(0);
    expect(parsed.group).toEqual(expect.objectContaining({ joined: false, recruiting: false }));
    expect(parsed.reactions).toEqual([{ count: 1, emoji: "HEART", reacted: true }]);
  });

  it("counts my heart once and drops the badge when its count reaches zero", () => {
    const others = [{ count: 2, emoji: "HEART", reacted: false }];

    expect(toggleActivityReaction([], "HEART", true)).toEqual([{ count: 1, emoji: "HEART", reacted: true }]);
    expect(toggleActivityReaction(others, "HEART", true)).toEqual([{ count: 3, emoji: "HEART", reacted: true }]);
    expect(toggleActivityReaction([{ count: 1, emoji: "HEART", reacted: true }], "HEART", false)).toEqual([]);
    expect(toggleActivityReaction(others, "HEART", false)).toBe(others);
  });
});
