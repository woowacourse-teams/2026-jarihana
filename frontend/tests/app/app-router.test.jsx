import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, useLocation, useNavigate } from "react-router";

import { createAppRouteElements } from "../../src/app/AppRouter";
import { routeRegistry } from "../../src/app/routes";

// Use the real routing primitives without loading the SSR entry point's import.meta code in Jest.
jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const packageRoot = dirname(require.resolve("react-router/package.json"));
  return {
    ...jest.requireActual(join(packageRoot, "dist/production/lib/components.js")),
    ...jest.requireActual(join(packageRoot, "dist/production/lib/hooks.js"))
  };
});

jest.mock("../../src/app/AnalyticsBridge", () => ({ AnalyticsBridge: () => null }));
jest.mock("../../src/app/AppShell", () => ({ AppShell: () => null }));
jest.mock("../../src/app/AuthGuard", () => ({ AuthGuard: ({ children }) => children }));
jest.mock("../../src/app/LeaderGuard", () => ({ LeaderGuard: ({ children }) => children }));
jest.mock("../../src/app/SignupGuard", () => ({ SignupGuard: ({ children }) => children }));

const pageRegistry = Object.fromEntries(
  routeRegistry.map(({ page }) => [page, () => <h1>{page}</h1>])
);

function NavigationProbe() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="현재 경로">{pathname}{search}{hash}</output>
      <button onClick={() => navigate(-1)} type="button">뒤로</button>
    </>
  );
}

function renderRoutes(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigationProbe />
      <Routes>{createAppRouteElements(pageRegistry)}</Routes>
    </MemoryRouter>
  );
}

it.each([
  ["/", "GroupsPage"],
  ["/groups", "GroupBrowsePage"],
  ["/activities", "ActivityPostsPage"],
  ["/groups/42", "GroupDetailPage"]
])("renders %s as %s", (path, page) => {
  renderRoutes([path]);
  expect(screen.getByRole("heading", { name: page })).toBeInTheDocument();
  expect(screen.getByLabelText("현재 경로")).toHaveTextContent(path);
});

it("replaces the legacy browse URL while preserving query, hash and back navigation", () => {
  renderRoutes([
    "/?previous=1",
    "/groups/explore?type=STUDY&keyword=react&status=ACTIVE&recruiting=true#results"
  ]);
  expect(screen.getByRole("heading", { name: "GroupBrowsePage" })).toBeInTheDocument();
  expect(screen.getByLabelText("현재 경로")).toHaveTextContent(
    "/groups?type=STUDY&keyword=react&status=ACTIVE&recruiting=true#results"
  );

  fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
  expect(screen.getByRole("heading", { name: "GroupsPage" })).toBeInTheDocument();
  expect(screen.getByLabelText("현재 경로")).toHaveTextContent("/?previous=1");
});
