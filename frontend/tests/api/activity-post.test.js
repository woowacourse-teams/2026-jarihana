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
    await addActivityReaction({ id: 55, type: "post" }, "THUMBS_UP");
    await removeActivityReaction({ id: 7, type: "comment" }, "QUESTION");

    expect(apiRequest).toHaveBeenNthCalledWith(1, "activity-posts/55/reactions/THUMBS_UP", { method: "put" });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "activity-post-comments/7/reactions/QUESTION", {
      method: "delete"
    });
  });
});

describe("activity reactions", () => {
  it("supports the nine emoji in the server order", () => {
    expect(ACTIVITY_REACTION_EMOJIS.map((emoji) => emoji.symbol)).toEqual([
      "👍", "😢", "😄", "❤️", "👀", "🔥", "✅", "❓", "❗"
    ]);
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
        { count: 2, emoji: "UNKNOWN", reacted: false },
        { count: 1, emoji: "HEART", reacted: true }
      ]
    });

    expect(parsed.commentCount).toBe(0);
    expect(parsed.group).toEqual(expect.objectContaining({ joined: false, recruiting: false }));
    expect(parsed.reactions).toEqual([{ count: 1, emoji: "HEART", reacted: true }]);
  });

  it("keeps emoji order when adding and drops a badge whose count reaches zero", () => {
    const reactions = [{ count: 1, emoji: "FIRE", reacted: false }];

    const added = toggleActivityReaction(reactions, "THUMBS_UP", true);
    const removed = toggleActivityReaction(
      [{ count: 1, emoji: "THUMBS_UP", reacted: true }, ...reactions],
      "THUMBS_UP",
      false
    );

    expect(added).toEqual([{ count: 1, emoji: "THUMBS_UP", reacted: true }, ...reactions]);
    expect(removed).toEqual(reactions);
    expect(toggleActivityReaction(reactions, "FIRE", false)).toBe(reactions);
  });
});
