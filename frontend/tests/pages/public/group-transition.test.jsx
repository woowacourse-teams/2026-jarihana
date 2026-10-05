import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";

import {
  GroupDetailLink,
  GroupTransitionProvider,
  groupTransitionOrigin
} from "../../../src/pages/groups/GroupTransition.jsx";

jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const packageRoot = dirname(require.resolve("react-router/package.json"));
  const components = jest.requireActual(join(packageRoot, "dist/production/lib/components.js"));
  const hooks = jest.requireActual(join(packageRoot, "dist/production/lib/hooks.js"));
  function Link({ children, to, state, viewTransition, onClick, ...props }) {
    const navigate = hooks.useNavigate();
    return <a {...props} href={to} data-motion-enabled={viewTransition || undefined} onClick={(event) => {
      onClick?.(event);
      const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (!event.defaultPrevented && !modified) navigate(to, { state });
      event.preventDefault();
    }}>{children}</a>;
  }
  return { ...components, ...hooks, Link };
});

function Cards() {
  return <>
    <GroupDetailLink groupId={42} source="today" data-ph-capture-attribute-action="today_session_open">오늘 카드</GroupDetailLink>
    <GroupDetailLink groupId={42} source="recruiting" data-ph-capture-attribute-action="group_view">모집 카드</GroupDetailLink>
  </>;
}

function Detail() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="출발 경로">{groupTransitionOrigin(location.state)}</output>
    <button onClick={() => navigate(-1)}>목록으로</button>
  </>;
}

function renderRoutes(entry = "/?homeType=STUDY#results") {
  return render(<MemoryRouter initialEntries={[entry]}>
    <GroupTransitionProvider>
      <Routes>
        <Route path="/" element={<Cards />} />
        <Route path="/groups" element={<Cards />} />
        <Route path="/groups/:groupId" element={<Detail />} />
      </Routes>
    </GroupTransitionProvider>
  </MemoryRouter>);
}

test.each(["/?homeType=STUDY#results", "/groups?type=STUDY&keyword=react#results"])(
  "restores the clicked card and preserves origin %s", async (origin) => {
    renderRoutes(origin);
    fireEvent.click(screen.getByRole("link", { name: "모집 카드" }));
    expect(screen.getByLabelText("출발 경로")).toHaveTextContent(origin);
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    const card = screen.getByRole("link", { name: "모집 카드" });
    expect(card).toHaveAttribute("data-group-transition-source", "true");
    expect(document.querySelectorAll("[data-group-transition-source]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "오늘 카드" })).not.toHaveAttribute("data-group-transition-source");
    await waitFor(() => expect(card).toHaveFocus());
    expect(card).toHaveAttribute("data-ph-capture-attribute-action", "group_view");
  }
);

test("a modified click keeps the current page and does not select a shared image", () => {
  renderRoutes();
  fireEvent.click(screen.getByRole("link", { name: "오늘 카드" }), { metaKey: true });
  expect(screen.getByRole("link", { name: "오늘 카드" })).toBeInTheDocument();
  expect(document.querySelectorAll("[data-group-transition-source]")).toHaveLength(0);
});

test.each(["https://example.com", "//example.com", "/groups/new", "/groups/42"])(
  "does not treat %s as a discovery origin", (origin) => {
    expect(groupTransitionOrigin({ groupTransition: { origin } })).toBeNull();
  }
);
