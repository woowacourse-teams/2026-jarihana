// Versioned, allowlisted appearance data shared by the arena and the portrait renderer.
// No member type, scene state, pose, URL or arbitrary geometry belongs in this contract.
export const AVATAR_OPTIONS = Object.freeze({
  hair: Object.freeze(['curly', 'parted', 'bob', 'long', 'flowing', 'bald']),
  skin: Object.freeze(['pearl', 'warm', 'tan', 'deep']),
  hairColor: Object.freeze(['ink', 'chestnut', 'copper', 'silver']),
  face: Object.freeze(['round', 'oval', 'wide']),
  eyes: Object.freeze(['round', 'slim', 'dot']),
  eyebrows: Object.freeze(['arched', 'straight', 'bold']),
  nose: Object.freeze(['round', 'small', 'wide']),
  mouth: Object.freeze(['smile', 'flat', 'open']),
  glasses: Object.freeze(['none', 'round', 'square', 'sunglasses']),
  outfit: Object.freeze(['mint', 'coral', 'cream', 'navy', 'lilac', 'ochre']),
  shoes: Object.freeze(['sneakers', 'slipOn', 'highTop']),
  shoeColor: Object.freeze(['white', 'ink', 'mint', 'coral']),
  hat: Object.freeze(['none', 'cap', 'bucket', 'beanie', 'beret']),
  hatColor: Object.freeze(['ink', 'cream', 'mint', 'coral', 'navy']),
  bag: Object.freeze(['none', 'backpack', 'crossbody', 'shoulder']),
  bagColor: Object.freeze(['ink', 'cream', 'mint', 'coral', 'navy']),
  handheld: Object.freeze(['none', 'hotCoffee', 'icedCoffee', 'book', 'laptop', 'phone']),
});
export const AVATAR_PALETTE = Object.freeze({
  skin: Object.freeze({ pearl: '#ffe0bf', warm: '#e9b383', tan: '#b97850', deep: '#75472f' }),
  hairColor: Object.freeze({ ink: '#292726', chestnut: '#61412f', copper: '#a45732', silver: '#c3c6cd' }),
  outfit: Object.freeze({ mint: '#52bca7', coral: '#e68c7e', cream: '#e8e5df', navy: '#3b526d', lilac: '#a69ac5', ochre: '#c49a45' }),
  shoeColor: Object.freeze({ white: '#f6f5f1', ink: '#292726', mint: '#52bca7', coral: '#e68c7e' }),
  hatColor: Object.freeze({ ink: '#292726', cream: '#e8e5df', mint: '#52bca7', coral: '#e68c7e', navy: '#3b526d' }),
  bagColor: Object.freeze({ ink: '#292726', cream: '#e8e5df', mint: '#52bca7', coral: '#e68c7e', navy: '#3b526d' }),
});
export const AVATAR_DEFAULT_PARTS = Object.freeze({ eyebrows: 'arched', nose: 'round', mouth: 'smile', shoes: 'sneakers', shoeColor: 'white', hat: 'none', hatColor: 'ink', bag: 'none', bagColor: 'ink', handheld: 'none' });
export const AVATAR_BASIC_APPEARANCE = Object.freeze({
  version: 1, hair: 'bald', skin: 'warm', hairColor: 'ink', face: 'round',
  eyes: 'dot', eyebrows: 'straight', nose: 'small', mouth: 'flat', glasses: 'none', outfit: 'cream',
  shoes: 'sneakers', shoeColor: 'white', hat: 'none', hatColor: 'ink',
  bag: 'none', bagColor: 'ink',
  handheld: 'none',
});
const make = (hair, skin, hairColor, face, eyes, glasses, outfit) => Object.freeze({
  version: 1, hair, skin, hairColor, face, eyes, glasses, outfit, ...AVATAR_DEFAULT_PARTS,
});
export const AVATAR_PRESETS = Object.freeze([
  Object.freeze({ id: 'mint', name: '곱슬머리와 민트', description: '동그란 얼굴 · 검정 곱슬머리', appearance: make('curly', 'warm', 'ink', 'round', 'round', 'none', 'mint') }),
  Object.freeze({ id: 'coral', name: '단발머리와 코랄', description: '타원형 얼굴 · 밤색 단발머리', appearance: make('bob', 'pearl', 'chestnut', 'oval', 'round', 'none', 'coral') }),
  Object.freeze({ id: 'cream', name: '긴 웨이브와 크림', description: '넓은 얼굴 · 어깨 아래로 푼 은빛 긴 웨이브', appearance: make('flowing', 'tan', 'silver', 'wide', 'slim', 'round', 'cream') }),
  Object.freeze({ id: 'navy', name: '가르마와 네이비', description: '타원형 얼굴 · 검정 가르마', appearance: make('parted', 'deep', 'ink', 'oval', 'round', 'square', 'navy') }),
  Object.freeze({ id: 'lilac', name: '긴 생머리와 라일락', description: '동그란 얼굴 · 구릿빛 긴 생머리', appearance: make('long', 'warm', 'copper', 'round', 'slim', 'round', 'lilac') }),
  Object.freeze({ id: 'ochre', name: '민머리와 머스터드', description: '넓은 얼굴 · 안경 없는 민머리', appearance: make('bald', 'deep', 'ink', 'wide', 'round', 'none', 'ochre') }),
]);

export function readAvatarAppearance(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  const result = { version: 1 };
  for (const [key, options] of Object.entries(AVATAR_OPTIONS)) {
    const choice = value[key];
    result[key] = options.includes(choice) ? choice
      : choice === undefined ? AVATAR_DEFAULT_PARTS[key] ?? AVATAR_BASIC_APPEARANCE[key]
        : AVATAR_BASIC_APPEARANCE[key];
  }
  return result;
}
export function avatarAppearanceKey(value) {
  const appearance = readAvatarAppearance(value);
  return appearance ? JSON.stringify(appearance) : '';
}
