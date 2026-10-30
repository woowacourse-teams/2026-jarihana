import { postSchema } from "./api.js";
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

it.each(["sparring_composer_toggle", "sparring_clash_replay"])("forwards %s as a stable interaction", (action) => {
  expect(arenaMessageSchema.safeParse({
    channel: "jarihana-sparring", kind: "interaction", action
  }).success).toBe(true);
});
