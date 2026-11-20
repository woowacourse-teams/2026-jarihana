import { render } from "@testing-library/react";
import { useLocation, useNavigationType } from "react-router";

import { LandingShell } from "../../../src/pages/landing/LandingChrome";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: jest.fn(),
  useNavigationType: jest.fn()
}));

jest.mock("../../../src/features/auth", () => ({
  storeReturnTarget: jest.fn(),
  useAuth: () => ({ login: jest.fn(), status: "anonymous" })
}));

const SCROLL_POSITIONS_KEY = "react-router-scroll-positions";

function visit({ key, navigationType, scrollY }) {
  useLocation.mockReturnValue({ hash: "", key, pathname: "/land", search: "" });
  useNavigationType.mockReturnValue(navigationType);
  window.scrollY = scrollY;
  render(<LandingShell><p>본문</p></LandingShell>);
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  window.scrollTo = jest.fn();
});

test("starts a page opened from a link at the top", () => {
  visit({ key: "next", navigationType: "PUSH", scrollY: 640 });

  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
});

test("going back keeps the position the router restored", () => {
  sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ back: 2400 }));
  visit({ key: "back", navigationType: "POP", scrollY: 2400 });

  expect(window.scrollTo).not.toHaveBeenCalled();
});

test("a reload or a return from another site moves to the saved position once the page has drawn", () => {
  sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ back: 2400 }));
  visit({ key: "back", navigationType: "POP", scrollY: 0 });

  expect(window.scrollTo).toHaveBeenCalledWith(0, 2400);
});
