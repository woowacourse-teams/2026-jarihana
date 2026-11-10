import { AVATAR_BASIC_APPEARANCE, AVATAR_OPTIONS, AVATAR_PRESETS, avatarAppearanceKey, readAvatarAppearance } from '../../public/sparring-arena/src/avatar-appearance.js';

it('지원하지 않는 버전과 외형 객체가 아니면 표시하지 않는다', () => {
  for (const invalid of [null, {}, { ...AVATAR_PRESETS[0].appearance, version: 2 }]) expect(readAvatarAppearance(invalid)).toBeNull();
});

it('모르는 파츠 하나만 기본값으로 바꾸고 나머지는 보존한다', () => {
  const current = AVATAR_PRESETS[0].appearance;
  for (const field of Object.keys(AVATAR_OPTIONS)) {
    expect(readAvatarAppearance({ ...current, [field]: 'futureValue' }))
      .toEqual({ ...current, [field]: AVATAR_BASIC_APPEARANCE[field] });
  }
  expect(readAvatarAppearance({ ...current, hair: 'crop' }).hair).toBe('bald');
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
  expect(readAvatarAppearance({ ...legacy, mouth: 'unsupported' }).mouth).toBe('flat');
});

it('기존 저장 외형은 흰 운동화를 유지하고 모르는 신발은 기본값으로 표시한다', () => {
  const current = AVATAR_PRESETS[0].appearance;
  const legacy = Object.fromEntries(Object.entries(current).filter(([key]) => !['shoes', 'shoeColor'].includes(key)));
  expect(readAvatarAppearance(legacy)).toEqual(current);
  expect(readAvatarAppearance({ ...current, shoes: 'unknown' })).toEqual(current);
  expect(readAvatarAppearance({ ...current, shoeColor: 'unknown' })).toEqual(current);
});

it('모자 없는 이전 저장값을 보존하고 모자·선글라스를 독립적으로 조합한다', () => {
  const current = AVATAR_PRESETS[0].appearance;
  const legacy = { ...current }; delete legacy.hat; delete legacy.hatColor;
  expect(readAvatarAppearance(legacy)).toEqual(current);
  expect(readAvatarAppearance({ ...current, hat: 'cap', hatColor: 'navy', glasses: 'sunglasses' }))
    .toEqual({ ...current, hat: 'cap', hatColor: 'navy', glasses: 'sunglasses' });
  expect(readAvatarAppearance({ ...current, hat: 'unknown' })).toEqual(current);
  expect(readAvatarAppearance({ ...current, hatColor: 'unknown' })).toEqual(current);
});
