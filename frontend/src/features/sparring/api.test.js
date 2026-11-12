import { AVATAR_PRESETS } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { avatarPoolsSchema, postSchema, streamSchema } from "./api.js";
import { arenaMessageSchema } from "./arenaBridge.js";

const post = {
  id: 1, authorId: 1, name: "테스트", memberType: "CREW", side: "MINT",
  text: "내 생각", createdAt: "2026-10-30T12:00:00", replyTo: null
};

it.each(["BOOTCAMP", "PROFESSIONAL"])("accepts %s posts and reply parents after membership expansion", (memberType) => {
  expect(postSchema.parse({
    ...post, memberType,
    replyTo: { ...post, id: 2, memberType }
  })).toMatchObject({ memberType, replyTo: { memberType } });
});

it("keeps both author appearances and tolerates a missing or unsupported avatar in a post", () => {
  const mint = AVATAR_PRESETS[0].appearance;
  const coral = AVATAR_PRESETS[1].appearance;
  const replyTo = { ...post, id: 2, side: "CORAL", appearance: coral };
  expect(postSchema.parse({ ...post, appearance: { ...mint, extra: "ignored" }, replyTo })).toMatchObject({
    appearance: mint, replyTo: { appearance: coral }
  });
  expect(postSchema.parse(post).appearance).toBeUndefined();
  expect(postSchema.parse({ ...post, appearance: { version: 2 } }).appearance).toBeNull();
});

it("bounds the decorative pools independently and omits unsupported avatars", () => {
  const appearance = AVATAR_PRESETS[0].appearance;
  expect(avatarPoolsSchema.parse({ mint: [appearance, { version: 2 }], coral: [] })).toEqual({ mint: [appearance], coral: [] });
  expect(avatarPoolsSchema.safeParse({ mint: Array(9).fill(appearance), coral: [] }).success).toBe(false);
});

it.each(["sparring_composer_toggle", "sparring_clash_replay"])("forwards %s as a stable interaction", (action) => {
  expect(arenaMessageSchema.safeParse({
    channel: "jarihana-sparring", kind: "interaction", action
  }).success).toBe(true);
});


it("accepts unbounded SSE message batches with the same post contract as HTTP", () => {
  const posts = Array.from({ length: 1000 }, (_, index) => ({ ...post, id: index + 1 }));
  expect(streamSchema.parse({ revision: 1001, votesA: 1, votesB: 0, postCount: 1000, posts }).posts).toHaveLength(1000);
  expect(streamSchema.safeParse({ revision: 2, votesA: 1, votesB: 0, postCount: 1, posts: [{ ...post, authorId: null }] }).success).toBe(false);
});
