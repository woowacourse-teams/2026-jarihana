import * as THREE from "three";
import { AVATAR_PALETTE, AVATAR_PRESETS } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { createWalkProp, disposeObject, updateWalkPropAppearance } from "./roomModels";

const hex = (color) => new THREE.Color(color).getHexString();
const colors = (model, name) => model.getObjectByName("first-person-grip").children
  .filter((part) => part.name === name).map((part) => part.material.color.getHexString());

test("first-person sleeve and hand use the member appearance instead of the legacy avatar color", () => {
  const prop = createWalkProp("cookie", "#e68c7e");
  const cookieColor = prop.children[0].material.color.getHexString();
  try {
    updateWalkPropAppearance(prop, AVATAR_PRESETS[0].appearance, "#e68c7e");
    expect(colors(prop, "first-person-sleeve")).toEqual([hex(AVATAR_PALETTE.outfit.mint)]);
    expect(colors(prop, "first-person-hand")).toEqual([hex(AVATAR_PALETTE.skin.warm)]);
    expect(prop.children[0].material.color.getHexString()).toBe(cookieColor);
  } finally { disposeObject(prop); }
});

test("both first-person arms update when the same held item receives a different appearance", () => {
  const prop = createWalkProp("book", "#e68c7e");
  try {
    updateWalkPropAppearance(prop, AVATAR_PRESETS[1].appearance);
    updateWalkPropAppearance(prop, AVATAR_PRESETS[0].appearance);
    expect(colors(prop, "first-person-sleeve")).toEqual(Array(2).fill(hex(AVATAR_PALETTE.outfit.mint)));
    expect(colors(prop, "first-person-hand")).toEqual(Array(2).fill(hex(AVATAR_PALETTE.skin.warm)));
  } finally { disposeObject(prop); }
});

test("legacy appearance retains its skin and sleeve even when their initial colors match", () => {
  const prop = createWalkProp("book", "#f3c8a8");
  try {
    updateWalkPropAppearance(prop, AVATAR_PRESETS[0].appearance);
    updateWalkPropAppearance(prop, null, "#e68c7e");
    expect(colors(prop, "first-person-sleeve")).toEqual(Array(2).fill(hex("#e68c7e")));
    expect(colors(prop, "first-person-hand")).toEqual(Array(2).fill(hex("#f3c8a8")));
  } finally { disposeObject(prop); }
});
