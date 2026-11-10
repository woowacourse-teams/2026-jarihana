import { AVATAR_BASIC_APPEARANCE } from "../../public/sparring-arena/src/avatar-appearance.js";
import { createAvatarPreview } from "../../public/sparring-arena/src/avatar-preview.js";
import { SHOP_PREVIEW_CHANNEL } from "../../public/sparring-arena/shop-preview/channel.js";

jest.mock("../../public/sparring-arena/src/avatar-preview.js", () => ({
  createAvatarPreview: jest.fn()
}));

let preview;
function send(appearance, origin = location.origin, source = window.parent) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      source,
      data: { channel: SHOP_PREVIEW_CHANNEL, type: "appearance", appearance }
    })
  );
}
beforeEach(() => {
  document.body.innerHTML = '<div id="preview"></div>';
  preview = { setAppearance: jest.fn(), setRotation: jest.fn(), dispose: jest.fn() };
  createAvatarPreview.mockReturnValue(preview);
  jest.isolateModules(() => require("../../public/sparring-arena/shop-preview/preview.js"));
  send(AVATAR_BASIC_APPEARANCE);
  preview.setAppearance.mockClear();
});
afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

it("유효한 미리보기 변경은 모델을 다시 만들지 않고 반영한다", () => {
  const next = { ...AVATAR_BASIC_APPEARANCE, hat: "beret", hatColor: "mint" };
  send(next);
  expect(preview.setAppearance).toHaveBeenCalledWith(next);
  expect(createAvatarPreview).toHaveBeenCalledTimes(1);
});

it("다른 출처·창·지원하지 않는 버전은 미리보기를 변경하지 않는다", () => {
  const next = { ...AVATAR_BASIC_APPEARANCE, hat: "beret" };
  send(next, "https://untrusted.example");
  send(next, location.origin, null);
  send({ ...next, version: 2 });
  expect(preview.setAppearance).not.toHaveBeenCalled();
});
