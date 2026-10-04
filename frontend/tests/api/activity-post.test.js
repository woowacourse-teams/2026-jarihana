import {
  createActivityPost,
  deleteActivityPost,
  fetchActivityPosts,
  modifyActivityPost
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
});
