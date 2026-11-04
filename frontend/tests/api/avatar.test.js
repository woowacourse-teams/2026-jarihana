import { AVATAR_BASIC_APPEARANCE } from "../../public/sparring-arena/src/avatar-appearance.js";
import { apiRequest } from "../../src/shared/api/index.js";
import { avatarSchema, getMyAvatar, saveMyAvatar, deleteMyAvatar } from "../../src/features/avatar/api.js";

jest.mock("../../src/shared/api/index.js", () => ({ apiRequest: jest.fn() }));

it("내 아바타 전용 경로에 외형만 저장하고 삭제한다", async () => {
  await getMyAvatar();
  expect(apiRequest).toHaveBeenLastCalledWith("members/me/avatar", expect.objectContaining({ schema: avatarSchema }));
  await saveMyAvatar(AVATAR_BASIC_APPEARANCE);
  expect(apiRequest).toHaveBeenLastCalledWith("members/me/avatar", { method: "PUT", json: { appearance: AVATAR_BASIC_APPEARANCE } });
  await deleteMyAvatar();
  expect(apiRequest).toHaveBeenLastCalledWith("members/me/avatar", { method: "DELETE" });
});

it("응답과 저장에서 지원하지 않는 버전·파츠를 거부한다", () => {
  expect(avatarSchema.safeParse({ customized: false, appearance: AVATAR_BASIC_APPEARANCE }).success).toBe(true);
  expect(avatarSchema.safeParse({ customized: true, appearance: { ...AVATAR_BASIC_APPEARANCE, hair: "unknown" } }).success).toBe(false);
  expect(() => saveMyAvatar({ ...AVATAR_BASIC_APPEARANCE, version: 2 })).toThrow();
});
