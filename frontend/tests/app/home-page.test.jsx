import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";

import { HomePage } from "../../src/pages/HomePage";
import { useAuth } from "../../src/features/auth";

jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const packageRoot = dirname(require.resolve("react-router/package.json"));
  return {
    ...jest.requireActual(join(packageRoot, "dist/production/lib/components.js")),
    ...jest.requireActual(join(packageRoot, "dist/production/lib/hooks.js"))
  };
});
jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/pages/landing/LandingPage", () => ({
  LandingPage: () => <h1>자리하나 소개</h1>
}));

function NavigationProbe() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="현재 경로">{pathname}{search}{hash}</output>
    <button onClick={() => navigate(-1)} type="button">뒤로</button>
  </>;
}

function TestRoutes({ initialEntries = ["/"] }) {
  return <MemoryRouter initialEntries={initialEntries}>
    <NavigationProbe />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/home" element={<h1>기존 모임 홈</h1>} />
      <Route path="/groups" element={<h1>모임 탐색</h1>} />
    </Routes>
  </MemoryRouter>;
}

it.each(["anonymous", "signup-required", "unavailable"])("shows the landing for %s", async (status) => {
  useAuth.mockReturnValue({ status });
  render(<TestRoutes />);
  expect(await screen.findByRole("heading", { name: "자리하나 소개" })).toBeInTheDocument();
  expect(screen.getByLabelText("현재 경로")).toHaveTextContent(/^\/$/);
});

it("waits for authentication, then replaces root with home and preserves filters and history", async () => {
  useAuth.mockReturnValue({ status: "loading" });
  const entries = ["/groups", "/?homeType=STUDY&homeKeyword=react#results"];
  const { rerender } = render(<TestRoutes initialEntries={entries} />);
  expect(screen.getByText("홈 불러오는 중")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();

  useAuth.mockReturnValue({ status: "authenticated" });
  rerender(<TestRoutes initialEntries={entries} />);
  expect(await screen.findByRole("heading", { name: "기존 모임 홈" })).toBeInTheDocument();
  expect(screen.getByLabelText("현재 경로")).toHaveTextContent("/home?homeType=STUDY&homeKeyword=react#results");
  expect(screen.queryByText("자리하나 소개")).not.toBeInTheDocument();

  useAuth.mockReturnValue({ status: "anonymous" });
  rerender(<TestRoutes initialEntries={entries} />);
  expect(screen.getByRole("heading", { name: "기존 모임 홈" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
  expect(screen.getByRole("heading", { name: "모임 탐색" })).toBeInTheDocument();
  expect(screen.getByLabelText("현재 경로")).toHaveTextContent(/^\/groups$/);
});
