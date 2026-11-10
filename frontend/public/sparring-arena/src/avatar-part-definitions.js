// Stable ids, labels, traits and geometry recipes share one registry.
const define = (label, traits = {}, build = null) => ({ label, traits: Object.freeze(traits), build });
const definitions = {
  hair: {
    curly: define("곱슬머리", {"shape": "avatarCurly", "longBack": false}, null),
    parted: define("가르마", {"shape": "avatarParted", "longBack": false}, null),
    bob: define("단발머리", {"shape": "avatarBob", "longBack": false}, null),
    long: define("긴 생머리", {"shape": "avatarLong", "longBack": true}, null),
    flowing: define("긴 웨이브", {"shape": "avatarFlowing", "longBack": true}, null),
    bald: define("민머리", {"shape": null, "longBack": false}, null),
  },
  skin: {
    pearl: define("밝은 피부", {}, null),
    warm: define("따뜻한 피부", {}, null),
    tan: define("갈색 피부", {}, null),
    deep: define("짙은 피부", {}, null),
  },
  hairColor: {
    ink: define("검정", {}, null),
    chestnut: define("밤색", {}, null),
    copper: define("구릿빛", {}, null),
    silver: define("은빛", {}, null),
  },
  face: {
    round: define("동그란 얼굴", {"scale": [1.16, 1.13, 1.1]}, null),
    oval: define("타원형 얼굴", {"scale": [1.07, 1.22, 1.1]}, null),
    wide: define("넓은 얼굴", {"scale": [1.27, 1.08, 1.1]}, null),
  },
  eyes: {
    round: define("동그란 눈", {"scale": [0.033, 0.052, 0.024]}, null),
    slim: define("가는 눈", {"scale": [0.039, 0.025, 0.023]}, null),
    dot: define("작은 눈", {"scale": [0.028, 0.033, 0.023]}, null),
  },
  eyebrows: {
    arched: define("아치형 눈썹", {"scale": [1, 1, 1]}, null),
    straight: define("일자 눈썹", {"scale": [1, 0.13, 1]}, null),
    bold: define("짙은 눈썹", {"scale": [1.14, 1.5, 1.4]}, null),
  },
  nose: {
    round: define("둥근 코", {"scale": [0.047, 0.047, 0.058]}, null),
    small: define("작은 코", {"scale": [0.033, 0.034, 0.041]}, null),
    wide: define("넓은 코", {"scale": [0.06, 0.039, 0.048]}, null),
  },
  mouth: {
    smile: define("미소", {}, null),
    flat: define("일자 입", {}, null),
    open: define("동그란 입", {}, null),
  },
  glasses: {
    none: define("안경 없음", {}, null),
    round: define("둥근 안경", {"frame": "roundGlasses", "width": 1, "tinted": false}, buildGlasses),
    square: define("네모 안경", {"frame": "squareGlasses", "width": 1, "tinted": false}, buildGlasses),
    sunglasses: define("선글라스", {"frame": "squareGlasses", "width": 1.12, "tinted": true}, buildGlasses),
  },
  outfit: {
    mint: define("민트", {}, null),
    coral: define("코랄", {}, null),
    cream: define("크림", {}, null),
    navy: define("네이비", {}, null),
    lilac: define("라일락", {}, null),
    ochre: define("머스터드", {}, null),
  },
  shoes: {
    sneakers: define("운동화", {}, buildShoe),
    slipOn: define("슬립온", {"slipOn": true}, buildShoe),
    highTop: define("하이탑", {"highTop": true}, buildShoe),
  },
  shoeColor: {
    white: define("흰색", {}, null),
    ink: define("검정", {}, null),
    mint: define("민트", {}, null),
    coral: define("코랄", {}, null),
  },
  hat: {
    none: define("모자 없음", {}, null),
    cap: define("캡", {"coversUpperHair": true, "crown": "avatarCapCrown", "trim": "avatarCapBrim", "trimMaterial": "hat", "decoration": {"position": [0, 0.515, -0.025], "scale": [0.035, 0.018, 0.035]}}, buildHat),
    bucket: define("버킷햇", {"coversUpperHair": true, "crown": "avatarBucketCrown", "trim": "avatarBucketBrim", "trimMaterial": "hat"}, buildHat),
    beanie: define("비니", {"coversUpperHair": true, "crown": "avatarBeanieCrown", "trim": "avatarBeanieCuff", "trimMaterial": "hatTrim"}, buildHat),
    beret: define("베레모", {"coversUpperHair": true, "crown": "avatarBeretCrown", "trim": "avatarBeretBand", "trimMaterial": "hatTrim", "decoration": {"position": [0.035, 0.535, -0.025], "scale": [0.022, 0.045, 0.022]}}, buildHat),
  },
  hatColor: {
    ink: define("검정", {}, null),
    cream: define("크림", {}, null),
    mint: define("민트", {}, null),
    coral: define("코랄", {}, null),
    navy: define("네이비", {}, null),
  },
  bag: {
    none: define("가방 없음", {}, null),
    backpack: define("백팩", {}, buildBackpack),
    crossbody: define("크로스백", {}, buildCrossbody),
    shoulder: define("숄더백", {}, buildShoulder),
  },
  bagColor: {
    ink: define("검정", {}, null),
    cream: define("크림", {}, null),
    mint: define("민트", {}, null),
    coral: define("코랄", {}, null),
    navy: define("네이비", {}, null),
  },
  handheld: {
    none: define("빈손", {}, null),
    hotCoffee: define("따뜻한 커피", {"holdsWith": "grip"}, buildHotCoffee),
    icedCoffee: define("차가운 커피", {"holdsWith": "grip"}, buildIcedCoffee),
    book: define("책", {"holdsWith": "grip"}, buildBook),
    laptop: define("노트북", {"holdsWith": "tray"}, buildLaptop),
    phone: define("휴대폰", {"holdsWith": "grip"}, buildPhone),
  },
};
export const AVATAR_PARTS = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([slot, parts]) =>
  [slot, Object.freeze(Object.fromEntries(Object.entries(parts).map(([id, definition]) =>
    [id, Object.freeze({ slot, id, ...definition })]))) ])));

function buildBackpack({ parent, variant, part, joint, hairTraits }) {
  const backpack = joint(parent, [0, 0, 0]);
  const longHair = hairTraits.longBack, back = longHair ? -0.55 : -0.38;
  part(backpack, variant, 'bag', [0, 0.29, back], [0.28, 0.29, 0.13], [0, 0, 0], 'soft');
  part(backpack, variant, 'bagTrim', [0, 0.15, back - 0.13], [0.22, 0.12, 0.04], [0, 0, 0], 'soft');
  part(backpack, variant, 'bagHardware', [0, 0.24, back - 0.17], [0.17, 0.007, 0.008], [0, 0, 0], 'rounded');
  part(backpack, variant, 'bagHardware', [0.12, 0.22, back - 0.181], [0.012, 0.026, 0.005], [0, 0, -0.12], 'rounded');
  for (const sign of [-1, 1]) {
    part(backpack, variant, 'bagTrim', [sign * 0.228, 0, 0], [1, 1, 1], [0, 0, 0], longHair ? 'avatarBackpackLongStrap' : 'avatarBackpackStrap');
    part(backpack, variant, 'bagHardware', [sign * 0.228, 0.20, 0.25], [0.028, 0.02, 0.008], [0, 0, 0], 'rounded');
  }
  return backpack;
}

function buildCrossbody({ parent, variant, part, joint }) {
  const crossbody = joint(parent, [0, 0, 0]);
  part(crossbody, variant, 'bagTrim', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'avatarCrossbodyStrap');
  part(crossbody, variant, 'bag', [0.12, 0.04, 0.32], [0.21, 0.13, 0.08], [0, 0, -0.12], 'soft');
  part(crossbody, variant, 'bagTrim', [0.12, 0.08, 0.39], [0.185, 0.075, 0.014], [0, 0, -0.12], 'soft');
  part(crossbody, variant, 'bagHardware', [0.12, 0.02, 0.408], [0.028, 0.025, 0.006], [0, 0, -0.12], 'rounded');
  return crossbody;
}

function buildShoulder({ parent, variant, part, joint }) {
  const shoulder = joint(parent, [0, 0, 0]);
  part(shoulder, variant, 'bagTrim', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'avatarShoulderStrap');
  part(shoulder, variant, 'bag', [0.42, -0.10, -0.21], [0.12, 0.20, 0.09], [0, 0, -0.05], 'soft');
  part(shoulder, variant, 'bagTrim', [0.42, 0.025, -0.12], [0.105, 0.06, 0.016], [0, 0, -0.05], 'soft');
  part(shoulder, variant, 'bagHardware', [0.42, 0, -0.101], [0.027, 0.021, 0.006], [0, 0, 0], 'rounded');
  return shoulder;
}

function buildHotCoffee({ parent, variant, part, joint }) {
  const hotCoffee = joint(parent, [0, 0, 0]);
  part(hotCoffee, variant, 'itemPaper', [0, 0.02, 0.05], [1, 1, 1], [0, 0, 0], 'avatarHotCup');
  part(hotCoffee, variant, 'itemCoffee', [0, 0.01, 0.05], [1, 1, 1], [0, 0, 0], 'avatarCupSleeve');
  part(hotCoffee, variant, 'itemInk', [0, 0.109, 0.05], [1, 1, 1], [0, 0, 0], 'avatarHotLid');
  part(hotCoffee, variant, 'itemCoffee', [0, 0.130, 0.087], [0.016, 0.0015, 0.006], [0, 0, 0], 'rounded');
  return hotCoffee;
}

function buildIcedCoffee({ parent, variant, part, joint }) {
  const icedCoffee = joint(parent, [0, 0, 0]);
  part(icedCoffee, variant, 'itemGlass', [0, 0.04, 0.05], [1, 1, 1], [0, 0, 0], 'avatarColdCup');
  part(icedCoffee, variant, 'itemCoffee', [0, 0.025, 0.05], [1, 1, 1], [0, 0, 0], 'avatarCoffeeFill');
  part(icedCoffee, variant, 'itemGlass', [0, 0.151, 0.05], [1, 1, 1], [0, 0, 0], 'avatarColdLid');
  for (const [x, z] of [[-0.021, 0.037], [0.019, 0.071], [0.024, 0.028]]) {
    part(icedCoffee, variant, 'itemIce', [x, 0.113, z], [0.017, 0.018, 0.017], [0.2, x * 8, 0.3], 'rounded');
  }
  part(icedCoffee, variant, 'itemAccent', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'avatarStraw');
  return icedCoffee;
}

function buildBook({ parent, variant, part, joint }) {
  const book = joint(parent, [0, 0.025, 0.045]); book.rotation.y = -0.2;
  part(book, variant, 'itemPaper', [0, 0, 0], [0.073, 0.102, 0.016], [0, 0, 0], 'rounded');
  for (const z of [-0.022, 0.022]) part(book, variant, 'itemCover', [0, 0, z], [0.080, 0.11, 0.005], [0, 0, 0], 'rounded');
  part(book, variant, 'itemCover', [-0.077, 0, 0], [0.008, 0.11, 0.023], [0, 0, 0], 'rounded');
  part(book, variant, 'itemPaper', [0, 0.035, 0.029], [0.045, 0.007, 0.002], [0, 0, 0], 'rounded');
  part(book, variant, 'itemPaper', [-0.012, 0.012, 0.029], [0.033, 0.003, 0.002], [0, 0, 0], 'rounded');
  for (const z of [-0.009, 0, 0.009]) part(book, variant, 'sole', [0.073, 0, z], [0.0015, 0.096, 0.001], [0, 0, 0], 'rounded');
  return book;
}

function buildPhone({ parent, variant, part, joint }) {
  const phone = joint(parent, [0, 0.025, 0.055]);
  part(phone, variant, 'itemInk', [0, 0, 0], [0.046, 0.088, 0.011], [0, 0, 0], 'rounded');
  part(phone, variant, 'itemScreen', [0, 0, 0.012], [0.039, 0.075, 0.003], [0, 0, 0], 'rounded');
  part(phone, variant, 'itemPaper', [0, 0.077, 0.012], [0.012, 0.002, 0.002], [0, 0, 0], 'rounded');
  part(phone, variant, 'itemMetal', [-0.022, 0.059, -0.012], [0.016, 0.019, 0.003], [0, 0, 0], 'rounded');
  for (const y of [0.05, 0.067]) part(phone, variant, 'itemScreen', [-0.022, y, -0.016], [0.006, 0.006, 0.002]);
  for (const y of [0.02, -0.005, -0.030]) part(phone, variant, 'itemAccent', [-0.005, y, 0.016], [0.022, 0.005, 0.001], [0, 0, 0], 'rounded');
  return phone;
}

function buildLaptop({ parent, variant, part, joint }) {
  // Rest the base on one palm; the outward lid hides the keyboard from the front.
  const laptop = joint(parent, [0, 0, 0]);
  part(laptop, variant, 'itemMetal', [0, 0.035, 0], [0.23, 0.012, 0.15], [0, 0, 0], 'rounded');
  part(laptop, variant, 'itemInk', [0, 0.049, 0.04], [0.19, 0.002, 0.07], [0, 0, 0], 'rounded');
  part(laptop, variant, 'itemMetal', [0, 0.185, 0.135], [0.23, 0.14, 0.01], [0.18, 0, 0], 'rounded');
  part(laptop, variant, 'itemScreen', [0, 0.185, 0.122], [0.207, 0.118, 0.003], [0.18, 0, 0], 'rounded');
  part(laptop, variant, 'itemAccent', [0, 0.185, 0.149], [0.026, 0.026, 0.003]);
  part(laptop, variant, 'itemInk', [0, 0.049, -0.085], [0.062, 0.002, 0.037], [0, 0, 0], 'rounded');
  return laptop;
}

function buildShoe({ parent, variant, part, joint, traits }) {
  const shoe = joint(parent, [0, 0, 0]);
  part(shoe, variant, 'sole', [0, -0.075, 0.065], [0.158, 0.03, 0.23], [0, 0, 0], 'rounded');
  if (traits.slipOn) {
    part(shoe, variant, 'footwear', [0, -0.012, 0.068], [0.163, 0.073, 0.231], [0, 0, 0], 'soft');
    part(shoe, variant, 'footwear', [0, 0.032, 0.08], [0.115, 0.026, 0.095], [0, 0, 0], 'soft');
    part(shoe, variant, 'sole', [0, 0.051, 0.104], [0.106, 0.008, 0.013]);
  } else {
    // Sneakers retain the existing shoe silhouette and detailing.
    part(shoe, variant, 'footwear', [0, -0.001, 0.064], [0.167, 0.087, 0.235]);
    part(shoe, variant, 'footwear', [0, 0.042, 0.01], [0.085, 0.042, 0.095]);
    if (traits.highTop) {
      part(shoe, variant, 'footwear', [0, 0.074, -0.005], [0.16, 0.115, 0.15], [0, 0, 0], 'soft');
      part(shoe, variant, 'footwear', [0, 0.084, 0.148], [0.09, 0.073, 0.04], [-0.12, 0, 0], 'soft');
      for (const y of [0.09, 0.13]) part(shoe, variant, 'sole', [0, y, 0.186], [0.075, 0.009, 0.011]);
    }
    for (const z of [0.015, 0.052, 0.089]) {
      part(shoe, variant, 'sole', [0, 0.065 - z * 0.13, z], [0.07, 0.009, 0.011]);
    }
  }
  return shoe;
}

function buildHat({ parent, variant, part, joint, traits }) {
  const group = joint(parent, [0, 0, 0]);
  part(group, variant, 'hat', [0, 0, 0], [1, 1, 1], [0, 0, 0], traits.crown);
  part(group, variant, traits.trimMaterial, [0, 0, 0], [1, 1, 1], [0, 0, 0], traits.trim);
  if (traits.decoration) part(group, variant, 'hatTrim', traits.decoration.position, traits.decoration.scale);
  return group;
}

function buildGlasses({ parent, variant, part, joint, traits }) {
  const group = joint(parent, [0, 0, 0]);
  for (const sign of [-1, 1]) {
    part(group, variant, 'face', [sign * 0.111, 0.021, 0.324], [traits.width, 0.88, 1], [0, 0, 0], traits.frame);
    part(group, variant, 'face', [sign * 0.202, 0.025, 0.19], [0.008, 0.008, 0.14], [0, sign * -0.10, 0], 'rounded');
    if (traits.tinted) {
      part(group, variant, 'lenses', [sign * 0.111, 0.021, 0.332], [0.076, 0.053, 0.009], [0, 0, 0], 'rounded');
      part(group, variant, 'sole', [sign * 0.111 - 0.02, 0.043, 0.343], [0.025, 0.003, 0.002], [0, 0, 0.5], 'rounded');
    }
  }
  part(group, variant, 'face', [0, 0.026, 0.33], [0.037, 0.007, 0.008], [0, 0, 0], 'rounded');
  return group;
}
