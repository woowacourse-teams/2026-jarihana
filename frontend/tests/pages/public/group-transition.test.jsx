import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const mockFetchGroup = jest.fn(async (groupId) => ({ id: Number(groupId), name: `group-${groupId}` }));

jest.mock("../../../src/features/group/api.js", () => ({
  createGroup: jest.fn(),
  deleteGroup: jest.fn(),
  fetchGroup: (...args) => mockFetchGroup(...args),
  fetchGroups: jest.fn(),
  modifyGroup: jest.fn(),
  removeRecurringSchedule: jest.fn(),
  replaceRecurringSchedule: jest.fn(),
  replaceSessionSchedule: jest.fn(),
  terminateGroup: jest.fn()
}));

function Cards({ linkProps = {} }) {
  return <>
    <GroupDetailLink groupId={42} source="today" data-ph-capture-attribute-action="today_session_open" {...linkProps}>오늘 카드</GroupDetailLink>
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

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

function renderRoutes(entry = "/?homeType=STUDY#results", { linkProps } = {}) {
  const queryClient = createQueryClient();
  const result = render(<QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[entry]}>
      <GroupTransitionProvider>
        <Routes>
          <Route path="/" element={<Cards linkProps={linkProps} />} />
          <Route path="/groups" element={<Cards linkProps={linkProps} />} />
          <Route path="/groups/:groupId" element={<Detail />} />
        </Routes>
      </GroupTransitionProvider>
    </MemoryRouter>
  </QueryClientProvider>);

  return { queryClient, ...result };
}

function firePointerDown(element, pointerType) {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(element, event);
}

beforeEach(() => {
  mockFetchGroup.mockClear();
});

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

test("prefetches the group detail query on mouse intent, focus, and touch intent", async () => {
  const callbacks = {
    onFocus: jest.fn(),
    onPointerDown: jest.fn(),
    onPointerEnter: jest.fn()
  };
  const { queryClient } = renderRoutes("/?homeType=STUDY#results", { linkProps: callbacks });
  const todayCard = screen.getByRole("link", { name: "오늘 카드" });

  fireEvent.pointerEnter(todayCard, { pointerType: "mouse" });
  await waitFor(() => expect(queryClient.getQueryData(["groups", "detail", "42"])).toEqual({ id: 42, name: "group-42" }));
  expect(mockFetchGroup).toHaveBeenCalledWith("42");

  queryClient.removeQueries({ queryKey: ["groups", "detail", "42"] });
  fireEvent.focus(todayCard);
  await waitFor(() => expect(queryClient.getQueryData(["groups", "detail", "42"])).toEqual({ id: 42, name: "group-42" }));

  queryClient.removeQueries({ queryKey: ["groups", "detail", "42"] });
  firePointerDown(todayCard, "touch");
  await waitFor(() => expect(queryClient.getQueryData(["groups", "detail", "42"])).toEqual({ id: 42, name: "group-42" }));

  expect(callbacks.onPointerEnter).toHaveBeenCalled();
  expect(callbacks.onFocus).toHaveBeenCalled();
  expect(callbacks.onPointerDown).toHaveBeenCalled();
});

test.each(["https://example.com", "//example.com", "/groups/new", "/groups/42"])(
  "does not treat %s as a discovery origin", (origin) => {
    expect(groupTransitionOrigin({ groupTransition: { origin } })).toBeNull();
  }
);


test("repeated intent on cards for the same group reuses the detail cache", async () => {
  const { queryClient } = renderRoutes();
  fireEvent.pointerEnter(screen.getByRole("link", { name: "오늘 카드" }));
  await waitFor(() => expect(queryClient.getQueryData(["groups", "detail", "42"])).toBeDefined());
  fireEvent.focus(screen.getByRole("link", { name: "모집 카드" }));
  expect(mockFetchGroup).toHaveBeenCalledTimes(1);
});

test("a failed intent request does not block normal detail navigation", async () => {
  mockFetchGroup.mockRejectedValueOnce(new Error("offline"));
  const { queryClient } = renderRoutes();
  const card = screen.getByRole("link", { name: "오늘 카드" });
  fireEvent.pointerEnter(card);
  await waitFor(() => expect(queryClient.getQueryState(["groups", "detail", "42"]).status).toBe("error"));
  fireEvent.click(card);
  expect(screen.getByLabelText("출발 경로")).toHaveTextContent("/?homeType=STUDY#results");
});

test("an existing intent callback can prevent prefetch", () => {
  renderRoutes("/", { linkProps: { onFocus: (event) => event.preventDefault() } });
  fireEvent.focus(screen.getByRole("link", { name: "오늘 카드" }));
  expect(mockFetchGroup).not.toHaveBeenCalled();
});
