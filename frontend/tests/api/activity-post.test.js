import {
  ACTIVITY_REACTION_EMOJIS,
  activityPostSchema,
  activityReactorPageSchema,
  describeActivityReactors,
  formatReactorMeta,
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
  fetchActivityReactors,
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

describe("activity reactors", () => {
  it("reads who reacted from the same reaction path, 30 at a time with a cursor", async () => {
    await fetchActivityReactors({ emoji: "HEART", target: { id: 7, type: "comment" } });
    await fetchActivityReactors({ cursor: "next", emoji: "HEART", target: { id: 3, type: "post" } });

    expect(apiRequest).toHaveBeenCalledWith(
      "activity-post-comments/7/reactions/HEART",
      expect.objectContaining({ schema: expect.any(Object), searchParams: { size: 30 } })
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "activity-posts/3/reactions/HEART",
      expect.objectContaining({ searchParams: { cursor: "next", size: 30 } })
    );
  });

  it("reads a reactor page with member details and defaults the missing ones", () => {
    const page = activityReactorPageSchema.parse({
      count: 2,
      emoji: "HEART",
      reactors: [{ crewName: "바다", mine: false }]
    });

    expect(page).toEqual({
      count: 2,
      emoji: "HEART",
      hasNext: false,
      nextCursor: null,
      reactors: [{ avatarUrl: null, course: null, crewName: "바다", generation: null, memberType: null, mine: false }]
    });
  });

  it("labels each reactor with the cohort and course, or as a coach", () => {
    expect(formatReactorMeta({ course: "FRONTEND", generation: 8, memberType: "CREW" })).toBe("8기 프론트엔드");
    expect(formatReactorMeta({ course: null, generation: 7, memberType: "CREW" })).toBe("7기");
    expect(formatReactorMeta({ course: null, generation: null, memberType: "COACH" })).toBe("코치");
    expect(formatReactorMeta({ course: null, generation: null, memberType: "CREW" })).toBe("크루");
  });

  it("summarizes reactors with me first and counts the rest", () => {
    const reactors = [
      { crewName: "바다", mine: false },
      { crewName: "구름", mine: true }
    ];

    expect(describeActivityReactors({ count: 2, reactors }, "하트")).toBe("나, 바다가 하트를 남겼어요");
    expect(describeActivityReactors({ count: 5, reactors }, "하트")).toBe("나, 바다 외 3명이 하트를 남겼어요");
    expect(describeActivityReactors({ count: 1, reactors: [{ crewName: "하늘빛", mine: false }] }, "하트"))
      .toBe("하늘빛이 하트를 남겼어요");
    expect(describeActivityReactors({ count: 0, reactors: [] }, "하트")).toBeNull();
    expect(describeActivityReactors({ count: 5, reactors }, "하트", 1)).toBe("나 외 4명이 하트를 남겼어요");
  });

  it("shows at most ten names", () => {
    const reactors = Array.from({ length: 12 }, (_, index) => ({ crewName: `크루${index}`, mine: false }));

    expect(describeActivityReactors({ count: 30, reactors }, "하트")).toBe(
      "크루0, 크루1, 크루2, 크루3, 크루4, 크루5, 크루6, 크루7, 크루8, 크루9 외 20명이 하트를 남겼어요"
    );
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
