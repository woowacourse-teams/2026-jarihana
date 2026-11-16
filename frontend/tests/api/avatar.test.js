import { AVATAR_BASIC_APPEARANCE } from "../../public/sparring-arena/src/avatar-appearance.js";
import { apiRequest } from "../../src/shared/api/index.js";
import { avatarSchema, getMyAvatar, saveMyAvatar, deleteMyAvatar } from "../../src/features/avatar/api.js";

jest.mock("../../src/shared/api/index.js", () => ({ apiRequest: jest.fn() }));

it("내 아바타 전용 경로에 외형만 저장하고 삭제한다", async () => {
  await getMyAvatar();
  expect(apiRequest).toHaveBeenLastCalledWith("members/me/avatar", expect.objectContaining({ schema: avatarSchema }));
  await saveMyAvatar(AVATAR_BASIC_APPEARANCE, 7);
  expect(apiRequest).toHaveBeenLastCalledWith("members/me/avatar", { method: "PUT", json: { expectedMemberId: 7, appearance: AVATAR_BASIC_APPEARANCE } });
  await deleteMyAvatar(7);
  expect(apiRequest).toHaveBeenLastCalledWith("members/me/avatar", { method: "DELETE", searchParams: { expectedMemberId: 7 } });
});

it("응답의 모르는 파츠는 대체하고 저장의 모르는 파츠와 버전은 거부한다", () => {
  expect(avatarSchema.safeParse({ customized: false, appearance: AVATAR_BASIC_APPEARANCE }).success).toBe(true);
  expect(avatarSchema.parse({ customized: true, appearance: { ...AVATAR_BASIC_APPEARANCE, hair: "unknown" } }).appearance).toEqual(AVATAR_BASIC_APPEARANCE);
  expect(() => saveMyAvatar({ ...AVATAR_BASIC_APPEARANCE, hair: "unknown" })).toThrow();
  expect(() => saveMyAvatar({ ...AVATAR_BASIC_APPEARANCE, version: 2 })).toThrow();
});

it("신발·모자 필드가 없던 서버 응답도 기존 기본값으로 읽으며 모르는 값은 기본값으로 읽는다", () => {
  const legacy = { ...AVATAR_BASIC_APPEARANCE };
  for (const field of ["shoes", "shoeColor", "hat", "hatColor", "bag", "bagColor", "handheld"]) delete legacy[field];
  expect(avatarSchema.parse({ customized: true, appearance: legacy }))
    .toEqual({ customized: true, appearance: AVATAR_BASIC_APPEARANCE });
  expect(avatarSchema.parse({ customized: true, appearance: { ...legacy, hat: "unknown" } }).appearance).toEqual(AVATAR_BASIC_APPEARANCE);
});


it("새 응답 필드는 버리고 알려진 파츠를 보존하며 저장에는 추가 필드를 허용하지 않는다", () => {
  const future = { ...AVATAR_BASIC_APPEARANCE, hair: "flowing", hat: "futureHat", handheld: "futureItem", newPart: "new" };
  const response = avatarSchema.parse({ customized: true, appearance: future, newMetadata: true });
  expect(response).toEqual({ customized: true, appearance: { ...AVATAR_BASIC_APPEARANCE, hair: "flowing" } });
  expect(() => saveMyAvatar(future)).toThrow();
  expect(avatarSchema.safeParse({ customized: true, appearance: { ...future, version: 2 } }).success).toBe(false);
});
