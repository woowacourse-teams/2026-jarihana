import { act, render, screen } from "@testing-library/react";
jest.mock("react-router", () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }));
import { MyAvatarCard } from "../../src/features/avatar/MyAvatarCard.jsx";

jest.mock("../../src/features/avatar/hooks.js", () => ({ useMyAvatar: () => ({ data: { customized: true, appearance: { version: 1 } } }) }));
jest.mock("../../src/features/avatar/AvatarFrame.jsx", () => ({ AvatarFrame: () => <div data-testid="webgl-preview" /> }));

let enter, disconnect, originalObserver;
beforeEach(() => {
  jest.useFakeTimers(); originalObserver = window.IntersectionObserver; disconnect = jest.fn();
  window.IntersectionObserver = jest.fn(callback => { enter = callback; return { observe: jest.fn(), disconnect }; });
});
afterEach(() => { window.IntersectionObserver = originalObserver; jest.useRealTimers(); });
const card = paused => <MyAvatarCard previewPaused={paused} />;

it("화면 밖 카드는 링크를 즉시 제공하고 3D iframe은 만들지 않는다", () => {
  render(card(false)); act(() => jest.advanceTimersByTime(2000));
  expect(screen.getByRole("link", { name: "아바타 수정하기" })).toBeVisible();
  expect(screen.queryByTestId("webgl-preview")).not.toBeInTheDocument();
});
it("카드가 보여도 알림 포커스 대기가 끝난 뒤 두 프레임을 넘겨 3D를 시작한다", () => {
  const { rerender } = render(card(true));
  act(() => enter([{ isIntersecting: true }])); act(() => jest.advanceTimersByTime(2000));
  expect(screen.queryByTestId("webgl-preview")).not.toBeInTheDocument();
  rerender(card(false));
  act(() => jest.advanceTimersByTime(16));
  expect(screen.queryByTestId("webgl-preview")).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(100));
  expect(screen.getByTestId("webgl-preview")).toBeVisible();
});
it("지연 중 이탈하면 관찰과 예약된 렌더링을 해제한다", () => {
  const { unmount } = render(card(false)); act(() => enter([{ isIntersecting: true }]));
  unmount(); act(() => jest.advanceTimersByTime(2000)); expect(disconnect).toHaveBeenCalled();
  expect(screen.queryByTestId("webgl-preview")).not.toBeInTheDocument();
});
