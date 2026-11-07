import { AVATAR_BASIC_APPEARANCE } from "../../public/sparring-arena/src/avatar-appearance.js";
import { createAvatarPreview } from "../../public/sparring-arena/src/avatar-preview.js";
import { createAvatarEditor } from "../../public/sparring-arena/avatar-studio/avatar-editor.js";

jest.mock("../../public/sparring-arena/src/avatar-preview.js", () => ({
  createAvatarPreview: jest.fn()
}));
jest.mock("../../public/sparring-arena/avatar-studio/avatar-editor.js", () => ({
  createAvatarEditor: jest.fn()
}));

let preview;
function send(type, appearance, origin = location.origin, source = window.parent) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      source,
      data: { channel: "jarihana-avatar-studio", type, appearance }
    })
  );
}
beforeEach(() => {
  window.history.replaceState({}, "", "/?mode=preview");
  document.body.innerHTML = '<main hidden><div id="preview"></div></main><p id="error" hidden></p>';
  preview = { setAppearance: jest.fn(), setRotation: jest.fn(), dispose: jest.fn() };
  createAvatarPreview.mockReturnValue(preview);
  jest.isolateModules(() => require("../../public/sparring-arena/avatar-studio/studio.js"));
  send("initialize", AVATAR_BASIC_APPEARANCE);
  preview.setAppearance.mockClear();
});
afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  window.history.replaceState({}, "", "/");
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

it("유효한 미리보기 변경은 모델을 다시 만들지 않고 반영한다", () => {
  const next = { ...AVATAR_BASIC_APPEARANCE, hat: "beret", hatColor: "mint" };
  send("preview-appearance", next);
  expect(preview.setAppearance).toHaveBeenCalledWith(next);
  expect(createAvatarPreview).toHaveBeenCalledTimes(1);
  expect(createAvatarEditor).not.toHaveBeenCalled();
});

it("다른 출처·창·지원하지 않는 버전은 미리보기를 변경하지 않는다", () => {
  const next = { ...AVATAR_BASIC_APPEARANCE, hat: "beret" };
  send("preview-appearance", next, "https://untrusted.example");
  send("preview-appearance", next, location.origin, null);
  send("preview-appearance", { ...next, version: 2 });
  expect(preview.setAppearance).not.toHaveBeenCalled();
});
