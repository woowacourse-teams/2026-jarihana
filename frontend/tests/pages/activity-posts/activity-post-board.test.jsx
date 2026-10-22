import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useSearchParams } from "react-router";

import { storeReturnTarget, useAuth } from "../../../src/features/auth/index.js";
import {
  useInfiniteActivityComments,
  useInfiniteActivityPosts,
  useToggleActivityReaction
} from "../../../src/features/activity-post/hooks.js";
import { ActivityPostBoard } from "../../../src/pages/activity-posts/ActivityPostBoard.jsx";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";

jest.mock("../../../src/features/auth/index.js", () => ({
  storeReturnTarget: jest.fn(),
  useAuth: jest.fn()
}));

jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={typeof to === "string" ? to : "/"} {...properties}>
      {children}
    </a>
  ),
  useNavigate: () => jest.fn(),
  useSearchParams: jest.fn()
}));

jest.mock("../../../src/features/activity-post/hooks.js", () => ({
  useCreateActivityComment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateActivityPost: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteActivityComment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteActivityPost: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInfiniteActivityComments: jest.fn(),
  useInfiniteActivityPosts: jest.fn(),
  useModifyActivityPost: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useToggleActivityReaction: jest.fn()
}));

const posts = [
  {
    activityDate: "2026-08-18",
    authorNickname: "가온",
    canModify: false,
    caption: "모두 함께한 하루",
    commentCount: 2,
    createdAt: "2026-08-19T10:00:00",
    group: { id: 41, joined: false, name: "우아한 스터디", recruiting: true, status: "ACTIVE", type: "STUDY" },
    id: 2,
    imageUrl: "https://cdn.example.test/photo-2.jpg",
    reactions: [{ count: 3, emoji: "HEART", reacted: true }]
  },
  {
    activityDate: "2026-08-10",
    authorNickname: "나래",
    canModify: false,
    caption: null,
    commentCount: 0,
    createdAt: "2026-08-19T09:00:00",
    group: { id: 43, joined: false, name: "사진 동아리", recruiting: false, status: "ENDED", type: "CLUB" },
    id: 1,
    imageUrl: "https://cdn.example.test/photo-1.jpg",
    reactions: []
  }
];

let restorePhotoWallMeasurements;
const originalMatchMedia = window.matchMedia;

function createBoardTree(client) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider duration={0}>
        <ActivityPostBoard />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return { ...render(createBoardTree(queryClient)), queryClient };
}

function mockActivityPosts(items, overrides = {}) {
  useInfiniteActivityPosts.mockReturnValueOnce({
    data: { pages: [{ hasNext: false, items, nextCursor: null }] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn(),
    ...overrides
  });
}

function firePointerEvent(target, type, properties = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.entries(properties).forEach(([key, value]) => {
    Object.defineProperty(event, key, { value });
  });
  fireEvent(target, event);
}

function mockPhotoWallMeasurements() {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const originalGetComputedStyle = window.getComputedStyle;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const cardHeights = new WeakMap();
  let pendingFrame = null;

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList?.contains("activity-photo-wall") ? 800 : 0;
    }
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return this.classList?.contains("activity-photo-card") ? cardHeights.get(this) ?? 100 : 0;
    }
  });
  window.getComputedStyle = (element) => (
    element.classList?.contains("activity-photo-wall")
      ? { columnGap: "20px", gridTemplateColumns: "253px 253px 253px", rowGap: "16px" }
      : originalGetComputedStyle(element)
  );
  window.requestAnimationFrame = (callback) => {
    pendingFrame = callback;
    return 1;
  };
  window.cancelAnimationFrame = jest.fn();

  return {
    flushFrame() {
      const callback = pendingFrame;
      pendingFrame = null;
      callback?.(0);
    },
    setCardHeight(card, height) {
      cardHeights.set(card, height);
    },
    restore() {
      if (clientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
      } else {
        delete HTMLElement.prototype.clientWidth;
      }
      if (offsetHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeightDescriptor);
      } else {
        delete HTMLElement.prototype.offsetHeight;
      }
      window.getComputedStyle = originalGetComputedStyle;
      if (originalRequestAnimationFrame) {
        window.requestAnimationFrame = originalRequestAnimationFrame;
      } else {
        delete window.requestAnimationFrame;
      }
      if (originalCancelAnimationFrame) {
        window.cancelAnimationFrame = originalCancelAnimationFrame;
      } else {
        delete window.cancelAnimationFrame;
      }
    }
  };
}

const comments = [
  {
    authorNickname: "나래",
    canDelete: false,
    content: "다음 모임에 저도 가고 싶어요",
    createdAt: "2026-08-19T11:00:00",
    id: 7,
    reactions: [{ count: 1, emoji: "HEART", reacted: false }]
  }
];

const toggleReaction = jest.fn(() => Promise.resolve());

beforeEach(() => {
  jest.clearAllMocks();
  useSearchParams.mockReturnValue([new URLSearchParams(), jest.fn()]);
  useAuth.mockReturnValue({ isAuthenticated: false, login: jest.fn(), status: "anonymous" });
  useToggleActivityReaction.mockReturnValue({ mutateAsync: toggleReaction });
  useInfiniteActivityComments.mockReturnValue({
    data: { pages: [{ hasNext: false, items: comments, nextCursor: null }] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn()
  });
  useInfiniteActivityPosts.mockReturnValue({
    data: { pages: [{ hasNext: false, items: posts, nextCursor: null }] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn()
  });
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  restorePhotoWallMeasurements?.restore();
  restorePhotoWallMeasurements = null;
  jest.clearAllTimers();
  jest.useRealTimers();
});

it("shows public photo posts in the server's date order with reaction and comment counts", () => {
  renderBoard();

  const cards = screen.getAllByRole("button", { name: /활동 사진/ });
  expect(cards).toHaveLength(2);
  expect(cards[0]).not.toHaveAttribute("href");
  expect(cards[0]).toHaveAttribute("data-ph-capture-attribute-action", "activity_post_detail_open");
  expect(within(cards[0]).getByText("우아한 스터디")).toBeVisible();
  expect(within(cards[0]).queryByText("가온")).not.toBeInTheDocument();
  expect(within(cards[0]).getByText("모두 함께한 하루")).toHaveClass("activity-photo-card__note");
  expect(cards[0].querySelector(".activity-photo-card__date")).toHaveTextContent("2026. 8. 18.");
  expect(cards[0].querySelector(".activity-photo-card__date svg")).not.toBeInTheDocument();
  expect(cards[0].querySelector("img")).toHaveAttribute("src", posts[0].imageUrl);
  expect(cards[0].querySelector(".activity-photo-card__signals")).toHaveTextContent("32");
  expect(cards[0].querySelector(".activity-photo-card__reaction-icon")).toHaveAttribute("alt", "");
  expect(within(cards[0]).getByText("반응과 댓글: 하트 3개, 댓글 2개")).toHaveClass("ui-sr-only");
  expect(cards[1].querySelector(".activity-photo-card__signals")).not.toBeInTheDocument();
});

it("marks ended group records through the card design instead of an archive badge", () => {
  renderBoard();

  const cards = screen.getAllByRole("button", { name: /활동 사진/ });
  expect(cards[1].closest("article")).toHaveClass("is-ended");
  expect(cards[0].closest("article")).not.toHaveClass("is-ended");
  expect(within(cards[1]).queryByText("아카이브")).not.toBeInTheDocument();
  expect(within(cards[1]).getByText("종료된 모임의 기록")).toHaveClass("ui-sr-only");
});

it("opens the post detail with its group, reactions and comments when a card is selected", () => {
  renderBoard();

  fireEvent.click(screen.getAllByRole("button", { name: /활동 사진/ })[0]);

  const dialog = screen.getByRole("dialog", { name: "우아한 스터디" });
  expect(within(dialog).getByText("모두 함께한 하루")).toBeVisible();
  expect(within(dialog).getByRole("link", { name: /모임 둘러보기/ })).toHaveAttribute("href", "/groups/41");
  expect(within(dialog).getByText("모집 중")).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "하트 반응 3개, 내가 남김" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(within(dialog).getByRole("button", { name: "하트 반응 1개" })).toHaveAttribute("aria-pressed", "false");
  expect(within(dialog).getByText("다음 모임에 저도 가고 싶어요")).toBeVisible();
  expect(useInfiniteActivityComments).toHaveBeenLastCalledWith({ postId: 2, viewerKey: "anonymous" });
});

it("keeps loading later pages until a post requested from a notification is found", () => {
  const fetchNextPage = jest.fn();
  const setSearchParams = jest.fn();
  useSearchParams.mockReturnValue([new URLSearchParams("mine=true&post=1"), setSearchParams]);
  useInfiniteActivityPosts.mockReturnValue({
    data: { pages: [{ hasNext: true, items: [posts[0]], nextCursor: "next" }] },
    fetchNextPage,
    hasNextPage: true,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn()
  });
  const view = renderBoard();

  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  expect(setSearchParams).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  useInfiniteActivityPosts.mockReturnValue({
    data: {
      pages: [
        { hasNext: true, items: [posts[0]], nextCursor: "next" },
        { hasNext: false, items: [posts[1]], nextCursor: null }
      ]
    },
    fetchNextPage,
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn()
  });
  view.rerender(createBoardTree(view.queryClient));

  expect(screen.getByRole("dialog", { name: "사진 동아리" })).toBeVisible();
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  expect(setSearchParams).not.toHaveBeenCalled();
});

it("stops searching for a requested post after a few pages and only clears the address", () => {
  const fetchNextPage = jest.fn();
  const setSearchParams = jest.fn();
  useSearchParams.mockReturnValue([new URLSearchParams("mine=true&post=99"), setSearchParams]);
  useInfiniteActivityPosts.mockReturnValue({
    data: { pages: Array.from({ length: 5 }, () => ({ hasNext: true, items: posts, nextCursor: "next" })) },
    fetchNextPage,
    hasNextPage: true,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn()
  });

  renderBoard();

  expect(fetchNextPage).not.toHaveBeenCalled();
  expect(setSearchParams).toHaveBeenCalledWith(new URLSearchParams("mine=true"), { replace: true });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("asks visitors to log in before reacting or commenting and returns them to the same post", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ isAuthenticated: false, login, status: "anonymous" });
  renderBoard();
  fireEvent.click(screen.getAllByRole("button", { name: /활동 사진/ })[0]);
  const dialog = screen.getByRole("dialog", { name: "우아한 스터디" });

  fireEvent.click(within(dialog).getByRole("button", { name: "하트 반응 3개, 내가 남김" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "로그인하고 댓글 남기기" }));

  expect(toggleReaction).not.toHaveBeenCalled();
  expect(storeReturnTarget).toHaveBeenCalledTimes(2);
  expect(storeReturnTarget).toHaveBeenLastCalledWith("/?post=2");
  expect(login).toHaveBeenCalledTimes(2);
});

it("toggles hearts on the post and its comments for signed-in members", async () => {
  useAuth.mockReturnValue({ isAuthenticated: true, member: { id: 9 }, status: "authenticated" });
  renderBoard();
  fireEvent.click(screen.getAllByRole("button", { name: /활동 사진/ })[0]);
  const dialog = screen.getByRole("dialog", { name: "우아한 스터디" });

  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "하트 반응 3개, 내가 남김" }));
  });
  const commentReactions = within(dialog).getByRole("group", { name: "나래님의 댓글 반응" });
  await act(async () => {
    fireEvent.click(within(commentReactions).getByRole("button", { name: "하트 반응 1개" }));
  });

  expect(toggleReaction).toHaveBeenNthCalledWith(1, expect.objectContaining({
    emoji: "HEART",
    reacted: true,
    target: { id: 2, type: "post" },
    viewerRelation: "non_member"
  }));
  expect(toggleReaction).toHaveBeenNthCalledWith(2, expect.objectContaining({
    emoji: "HEART",
    reacted: false,
    target: { id: 7, type: "comment" }
  }));
});

it("shows the heart without a count before anyone reacts", () => {
  renderBoard();
  fireEvent.click(screen.getAllByRole("button", { name: /활동 사진/ })[1]);

  const dialog = screen.getByRole("dialog", { name: "사진 동아리" });
  const postReactions = within(dialog).getByRole("group", { name: "활동 기록 반응" });
  const heart = within(postReactions).getByRole("button", { name: "하트 반응 0개" });
  expect(heart).toHaveAttribute("aria-pressed", "false");
  expect(heart).toHaveAttribute("data-ph-capture-attribute-action", "activity_reaction_toggle");
  expect(heart.querySelector(".activity-reaction__icon")).toBeInTheDocument();
  expect(heart.querySelector(".activity-reaction__count")).not.toBeInTheDocument();
});

it("closes the photo viewer with Escape while keeping the post detail open", () => {
  renderBoard();
  fireEvent.click(screen.getAllByRole("button", { name: /활동 사진/ })[0]);

  fireEvent.click(screen.getByRole("button", { name: "사진 크게 보기" }));
  const viewer = screen.getByRole("dialog", { name: "사진 크게 보기" });
  expect(within(viewer).getByRole("button", { name: "크게 보기 닫기" })).toHaveFocus();

  fireEvent.keyDown(within(viewer).getByRole("button", { name: "크게 보기 닫기" }), { key: "Escape" });

  expect(screen.queryByRole("dialog", { name: "사진 크게 보기" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "우아한 스터디" })).toBeVisible();
  expect(screen.getByRole("button", { name: "사진 크게 보기" })).toHaveFocus();
});

it("keeps browsing public to visitors who are not signed in", () => {
  renderBoard();

  expect(screen.getByRole("heading", { name: "활동 기록" })).toBeVisible();
  const toolbar = screen.getByRole("tablist", { name: "활동 기록 범위" }).parentElement;
  const pageHeader = screen.getByRole("heading", { name: "활동 기록" }).closest(".ui-page-header");
  const createButton = within(toolbar).getByRole("button", { name: "활동 올리기" });
  expect(createButton).toBeVisible();
  expect(createButton).toHaveAttribute("data-ph-capture-attribute-action", "activity_post_login_to_create");
  expect(within(pageHeader).queryByRole("button", { name: "활동 올리기" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "활동 올리기" })).toHaveLength(1);
  const filters = screen.getByRole("tablist", { name: "활동 기록 범위" });
  expect(filters).toHaveAttribute("data-active", "all");
  expect(filters.querySelector(".activity-post-filters__indicator")).toHaveAttribute("aria-hidden", "true");
  expect(within(filters).getByRole("tab", { name: "전체 기록" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

it("re-packs later cards when an earlier lazy-loaded photo reveals its true height", () => {
  restorePhotoWallMeasurements = mockPhotoWallMeasurements();
  const wallPosts = Array.from({ length: 4 }, (_, index) => ({
    ...posts[0],
    caption: `사진 기록 ${index + 1}`,
    id: index + 10
  }));
  mockActivityPosts(wallPosts);
  renderBoard();

  const wall = screen.getByLabelText("활동 사진 게시판");
  const cards = [...wall.querySelectorAll(":scope > .activity-photo-card")];
  const initialFourthCardLeft = cards[3].style.left;
  expect(initialFourthCardLeft).toBe(cards[0].style.left);

  restorePhotoWallMeasurements.setCardHeight(cards[0], 300);
  act(() => {
    fireEvent.load(cards[0].querySelector("img"));
    restorePhotoWallMeasurements.flushFrame();
  });

  expect(cards[3].style.left).toBe(cards[1].style.left);
  expect(cards[3].style.left).not.toBe(initialFourthCardLeft);
});

it("keeps the current photo wall visible while the selected feed loads", () => {
  mockActivityPosts(posts, { hasNextPage: true, isFetching: true, isPlaceholderData: true });
  renderBoard();

  const wall = screen.getByLabelText("활동 사진 게시판");
  expect(wall).toHaveAttribute("aria-busy", "true");
  expect(within(wall).getByText("모두 함께한 하루")).toBeVisible();
  expect(screen.getByText("활동 기록을 불러오는 중…")).toBeVisible();
  expect(screen.queryByText("모든 활동 기록을 확인했어요.")).not.toBeInTheDocument();
});

it("keeps one create action with the filters while the feed refreshes", () => {
  useAuth.mockReturnValue({
    isAuthenticated: true,
    login: jest.fn(),
    member: { id: 12 },
    status: "authenticated"
  });
  mockActivityPosts(posts, { isFetching: true, isPlaceholderData: true });
  renderBoard();

  const toolbar = screen.getByRole("tablist", { name: "활동 기록 범위" }).parentElement;
  const refreshStatus = screen.getByText("활동 기록을 불러오는 중…");
  const createButton = within(toolbar).getByRole("button", { name: "활동 올리기" });

  expect(toolbar).toContainElement(refreshStatus);
  expect(screen.getAllByRole("button", { name: "활동 올리기" })).toHaveLength(1);
  expect(createButton).toHaveAttribute("data-ph-capture-attribute-action", "activity_post_create_start");
  expect(createButton).toBeVisible();
});

it("starts login when a visitor selects the personal-record filter", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ isAuthenticated: false, login, status: "anonymous" });
  renderBoard();

  fireEvent.click(screen.getByRole("tab", { name: "내가 쓴 기록" }));

  expect(login).toHaveBeenCalledTimes(1);
});

it("animates a ready filter change without remounting the existing photo wall", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true })
  });
  const view = renderBoard();
  const wall = screen.getByLabelText("활동 사진 게시판");
  const cancel = jest.fn();
  const animate = jest.fn(() => ({ cancel }));
  wall.parentElement.animate = animate;

  useSearchParams.mockReturnValue([new URLSearchParams("mine=true"), jest.fn()]);
  mockActivityPosts(posts, { isFetching: true, isPlaceholderData: true });
  view.rerender(createBoardTree(view.queryClient));
  expect(screen.getByLabelText("활동 사진 게시판")).toBe(wall);
  expect(animate).not.toHaveBeenCalled();

  view.rerender(createBoardTree(view.queryClient));
  expect(screen.getByLabelText("활동 사진 게시판")).toBe(wall);
  expect(animate).toHaveBeenCalledTimes(1);

  mockActivityPosts(posts, { isFetchingNextPage: true });
  view.rerender(createBoardTree(view.queryClient));
  expect(animate).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("keeps filter changes immediate when motion is reduced", () => {
  const view = renderBoard();
  const content = screen.getByLabelText("활동 사진 게시판").parentElement;
  content.animate = jest.fn();
  useSearchParams.mockReturnValue([new URLSearchParams("mine=true"), jest.fn()]);

  view.rerender(createBoardTree(view.queryClient));

  expect(screen.getByRole("tab", { name: "내가 쓴 기록" })).toHaveAttribute("aria-selected", "true");
  expect(content.animate).not.toHaveBeenCalled();
});

it("does not open management actions when the viewer cannot modify the post", () => {
  renderBoard();

  const link = screen.getAllByRole("button", { name: /활동 사진/ })[0];
  expect(fireEvent.contextMenu(link)).toBe(false);
  expect(screen.queryByRole("group", { name: "우아한 스터디 기록 관리" })).not.toBeInTheDocument();

  const secondLink = screen.getAllByRole("button", { name: /활동 사진/ })[1];
  fireEvent.keyDown(secondLink, { key: "ContextMenu" });
  expect(screen.queryByRole("group", { name: "사진 동아리 기록 관리" })).not.toBeInTheDocument();
});

it("separates feed cache by viewer and closes open management actions after logout", () => {
  useAuth.mockReturnValue({
    isAuthenticated: true,
    login: jest.fn(),
    member: { id: 12 },
    status: "authenticated"
  });
  mockActivityPosts([{ ...posts[0], canModify: true }]);
  const view = renderBoard();

  const link = screen.getByRole("button", { name: /활동 사진/ });
  fireEvent.contextMenu(link);
  expect(screen.getByRole("group", { name: "우아한 스터디 기록 관리" })).toBeVisible();
  expect(useInfiniteActivityPosts).toHaveBeenLastCalledWith({
    groupId: undefined,
    mine: false,
    viewerKey: 12
  });

  useAuth.mockReturnValue({ isAuthenticated: false, login: jest.fn(), status: "anonymous" });
  mockActivityPosts([{ ...posts[0], canModify: false }]);
  view.rerender(createBoardTree(view.queryClient));

  expect(useInfiniteActivityPosts).toHaveBeenLastCalledWith({
    groupId: undefined,
    mine: false,
    viewerKey: "anonymous"
  });
  expect(screen.queryByRole("group", { name: "우아한 스터디 기록 관리" })).not.toBeInTheDocument();
});

it("opens the same management actions on touch long-press without navigating", () => {
  jest.useFakeTimers();
  mockActivityPosts([{ ...posts[0], canModify: true }]);
  renderBoard();

  const link = screen.getAllByRole("button", { name: /활동 사진/ })[0];
  firePointerEvent(link, "pointerdown", {
    button: 0,
    clientX: 20,
    clientY: 30,
    isPrimary: true,
    pointerType: "touch"
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(screen.getByRole("group", { name: "우아한 스터디 기록 관리" })).toBeVisible();
  fireEvent.contextMenu(link);
  expect(screen.getByRole("group", { name: "우아한 스터디 기록 관리" })).toBeVisible();
  firePointerEvent(link, "pointerup", { pointerType: "touch" });
  expect(fireEvent.click(link)).toBe(false);
});

it("cancels touch long-press when the pointer moves like a scroll gesture", () => {
  jest.useFakeTimers();
  mockActivityPosts([{ ...posts[0], canModify: true }]);
  renderBoard();

  const link = screen.getAllByRole("button", { name: /활동 사진/ })[0];
  firePointerEvent(link, "pointerdown", {
    button: 0,
    clientX: 20,
    clientY: 30,
    isPrimary: true,
    pointerType: "touch"
  });
  firePointerEvent(link, "pointermove", { clientX: 20, clientY: 50, pointerType: "touch" });
  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(screen.queryByRole("group", { name: "우아한 스터디 기록 관리" })).not.toBeInTheDocument();
});

it("toggles management actions on repeated context-menu input when the viewer can modify the post", () => {
  mockActivityPosts([{ ...posts[0], canModify: true }]);
  renderBoard();

  const link = screen.getByRole("button", { name: /활동 사진/ });
  fireEvent.contextMenu(link, { button: 2 });

  const actions = screen.getByRole("group", { name: "우아한 스터디 기록 관리" });
  expect(within(actions).getByRole("button", { name: /수정/ })).toBeEnabled();
  expect(within(actions).getByRole("button", { name: /내리기/ })).toBeEnabled();

  fireEvent.contextMenu(link, { button: 2 });
  expect(screen.queryByRole("group", { name: "우아한 스터디 기록 관리" })).not.toBeInTheDocument();
});

it("dismisses visible management actions when the board scrolls", () => {
  mockActivityPosts([{ ...posts[0], canModify: true }]);
  renderBoard();

  const link = screen.getByRole("button", { name: /활동 사진/ });
  fireEvent.contextMenu(link, { button: 2 });
  expect(screen.getByRole("group", { name: "우아한 스터디 기록 관리" })).toBeVisible();

  fireEvent.scroll(window);

  expect(screen.queryByRole("group", { name: "우아한 스터디 기록 관리" })).not.toBeInTheDocument();
});

it("does not open management actions on touch long-press without modification permission", () => {
  jest.useFakeTimers();
  renderBoard();

  const link = screen.getAllByRole("button", { name: /활동 사진/ })[0];
  firePointerEvent(link, "pointerdown", {
    button: 0,
    clientX: 20,
    clientY: 30,
    isPrimary: true,
    pointerType: "touch"
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(screen.queryByRole("group", { name: "우아한 스터디 기록 관리" })).not.toBeInTheDocument();
  firePointerEvent(link, "pointerup", { pointerType: "touch" });
  expect(fireEvent.click(link)).toBe(false);
});
