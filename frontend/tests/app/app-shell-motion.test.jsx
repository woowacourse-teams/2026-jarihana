import { fireEvent, render, screen } from "@testing-library/react";

import { AppShell } from "../../src/app/AppShell";

let mockPathname = "/";
let mockSearch = "";
const originalMatchMedia = window.matchMedia;

jest.mock("react-router", () => ({
  Outlet: () => null,
  useLocation: () => ({ pathname: mockPathname, search: mockSearch })
}));
jest.mock("../../src/app/AppHeader", () => ({ AppHeader: () => <header>헤더</header> }));
jest.mock("../../src/app/AppFooter", () => ({ AppFooter: () => <footer>푸터</footer> }));

function page() {
  return <AppShell><input aria-label="입력 유지 확인" defaultValue="" /></AppShell>;
}

beforeEach(() => {
  mockPathname = "/";
  mockSearch = "";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => ({ matches: true }))
  });
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia
  });
});

function prepareAnimation(main) {
  const content = main.firstElementChild;
  const cancel = jest.fn();
  content.animate = jest.fn(() => ({ cancel }));
  content.style.setProperty("--duration-smooth", "420ms");
  content.style.setProperty("--ease-standard", "cubic-bezier(0.2, 0.8, 0.2, 1)");
  return { cancel, content };
}

it("slides forward through tabs without remounting content and cancels stale motion", () => {
  const { rerender } = render(page());
  const main = screen.getByRole("main");
  const { cancel, content } = prepareAnimation(main);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "유지할 내용" } });

  mockPathname = "/groups";
  rerender(page());
  expect(content.animate).toHaveBeenCalledWith([
    { opacity: 0, transform: "translateX(calc(var(--page-slide-distance) * 1))" },
    { opacity: 1, transform: "translateX(0)" }
  ], {
    duration: 420,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)"
  });
  expect(screen.getByRole("main")).toBe(main);
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("유지할 내용");

  mockPathname = "/activities";
  rerender(page());
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(content.animate).toHaveBeenCalledTimes(2);
});

it("slides from the left when moving to an earlier tab, including nonadjacent tabs", () => {
  mockPathname = "/activities";
  const { rerender, unmount } = render(page());
  const { cancel, content } = prepareAnimation(screen.getByRole("main"));

  mockPathname = "/";
  rerender(page());
  expect(content.animate).toHaveBeenCalledWith(
    [
      { opacity: 0, transform: "translateX(calc(var(--page-slide-distance) * -1))" },
      { opacity: 1, transform: "translateX(0)" }
    ],
    expect.objectContaining({ duration: 420 })
  );
  unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("does not animate unchanged paths, feedback query updates, or detail destinations", () => {
  const { rerender } = render(page());
  const main = screen.getByRole("main");
  const { content } = prepareAnimation(main);
  rerender(page());
  mockSearch = "?feedback=open";
  rerender(page());
  mockSearch = "";
  rerender(page());
  mockPathname = "/groups/121";
  rerender(page());
  mockPathname = "/";
  rerender(page());
  expect(content.animate).not.toHaveBeenCalled();
});

it("skips page motion when reduced motion is requested", () => {
  window.matchMedia.mockReturnValue({ matches: false });
  const { rerender } = render(page());
  const main = screen.getByRole("main");
  const { content } = prepareAnimation(main);
  mockPathname = "/groups";
  rerender(page());
  expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: no-preference)");
  expect(content.animate).not.toHaveBeenCalled();
});

it("keeps navigation working when the browser cannot animate elements", () => {
  const { rerender } = render(page());
  mockPathname = "/groups";
  expect(() => rerender(page())).not.toThrow();
  expect(screen.getByRole("main")).toBeVisible();
});
