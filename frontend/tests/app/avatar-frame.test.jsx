import { act, render, screen } from "@testing-library/react";
import { AvatarFrame } from "../../src/features/avatar/AvatarFrame.jsx";
import { AVATAR_BASIC_APPEARANCE } from "../../public/sparring-arena/src/avatar-appearance.js";

function message(frame, type, payload = {}, origin = location.origin, source = frame.contentWindow) {
  act(() => window.dispatchEvent(new MessageEvent("message", {
    origin, source, data: { channel: "jarihana-avatar-studio", type, ...payload }
  })));
}

it("캐시된 iframe의 ready/load가 먼저 끝났어도 마운트 시 초기 연결을 시작한다", () => {
  const postMessage = jest.fn();
  const getter = jest.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({ postMessage });
  const { unmount } = render(<AvatarFrame appearance={AVATAR_BASIC_APPEARANCE} />);
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "initialize", appearance: AVATAR_BASIC_APPEARANCE }), location.origin);
  unmount(); getter.mockRestore();
});

it("편집기와 같은 출처·창에서 온 유효한 외형만 수신하고 인증 정보 없이 초기화한다", () => {
  const onChange = jest.fn(), onReady = jest.fn();
  render(<AvatarFrame appearance={AVATAR_BASIC_APPEARANCE} onChange={onChange} onReady={onReady} />);
  const frame = screen.getByTitle("아바타 파츠 편집기");
  const post = jest.spyOn(frame.contentWindow, "postMessage").mockImplementation(() => {});
  message(frame, "ready");
  expect(post).toHaveBeenCalledWith({ channel: "jarihana-avatar-studio", type: "initialize", appearance: AVATAR_BASIC_APPEARANCE }, location.origin);
  message(frame, "initialized"); expect(onReady).toHaveBeenCalledTimes(1);
  const next = { ...AVATAR_BASIC_APPEARANCE, hair: "flowing" };
  message(frame, "change", { appearance: next }, "https://untrusted.example");
  message(frame, "change", { appearance: next }, location.origin, window);
  message(frame, "change", { appearance: { ...next, version: 999 } });
  expect(onChange).not.toHaveBeenCalled();
  message(frame, "change", { appearance: next });
  expect(onChange).toHaveBeenCalledWith(next);
});

it("렌더링 실패를 알리고 언마운트 후 메시지를 받지 않는다", () => {
  const onError = jest.fn(), onChange = jest.fn();
  const { unmount } = render(<AvatarFrame appearance={AVATAR_BASIC_APPEARANCE} onError={onError} onChange={onChange} />);
  const frame = screen.getByTitle("아바타 파츠 편집기");
  message(frame, "error");
  expect(onError).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert")).toHaveTextContent("입체 캐릭터를 표시하지 못했어요");
  unmount();
  message(frame, "change", { appearance: AVATAR_BASIC_APPEARANCE });
  expect(onChange).not.toHaveBeenCalled();
});


it("같은 출처에서 받은 미래 파츠는 해당 파츠만 대체하고 나머지 외형을 유지한다", () => {
  const onChange = jest.fn();
  render(<AvatarFrame appearance={AVATAR_BASIC_APPEARANCE} onChange={onChange} />);
  const frame = screen.getByTitle("아바타 파츠 편집기");
  message(frame, "change", { appearance: { ...AVATAR_BASIC_APPEARANCE, hair: "flowing", hat: "futureHat" } });
  expect(onChange).toHaveBeenCalledWith({ ...AVATAR_BASIC_APPEARANCE, hair: "flowing" });
});
