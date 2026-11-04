import { AVATAR_PRESETS, avatarAppearanceKey, readAvatarAppearance } from '../../public/sparring-arena/src/avatar-appearance.js';

it('지원하지 않는 버전·파츠와 불완전한 외형은 기본 캐릭터로 돌아간다', () => {
  const valid = AVATAR_PRESETS[0].appearance;
  for (const invalid of [null, {}, { ...valid, version: 2 }, { ...valid, hair: 'https://example.com/model' }, { ...valid, skin: '#ff0000' }, { ...valid, glasses: undefined }]) {
    expect(readAvatarAppearance(invalid)).toBeNull();
  }
});

it('외형 키는 필드 순서와 관계없이 같고 역할·진영·임의 필드는 버린다', () => {
  const appearance = AVATAR_PRESETS[0].appearance;
  const reversed = Object.fromEntries(Object.entries(appearance).reverse());
  expect(avatarAppearanceKey(reversed)).toBe(avatarAppearanceKey(appearance));
  expect(readAvatarAppearance({ ...appearance, memberType: 'COACH', side: 'b', url: '/unexpected' })).toEqual(appearance);
});

it('초기 버전 1 외형에 눈썹·코·입이 없으면 기존 모양을 기본값으로 채운다', () => {
  const legacy = Object.fromEntries(Object.entries(AVATAR_PRESETS[0].appearance)
    .filter(([key]) => !['eyebrows', 'nose', 'mouth'].includes(key)));
  expect(readAvatarAppearance(legacy)).toEqual(AVATAR_PRESETS[0].appearance);
  expect(readAvatarAppearance({ ...legacy, mouth: 'unsupported' })).toBeNull();
});
