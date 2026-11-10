import { fireEvent, render, screen } from "@testing-library/react";

import { useAuth } from "../../../src/features/auth";
import {
  LandingCreatePage,
  LandingGamesPage,
  LandingSparringPage
} from "../../../src/pages/landing/LandingFeaturePages";
import { useLandingChapters } from "../../../src/pages/landing/useLandingChapters";

jest.mock("../../../src/pages/landing/useLandingChapters", () => ({
  useLandingChapters: jest.fn()
}));

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ hash: "", pathname: "/land/create", search: "" })
}));

jest.mock("../../../src/features/auth", () => ({
  storeReturnTarget: jest.requireActual("../../../src/features/auth/returnTarget")
    .storeReturnTarget,
  useAuth: jest.fn()
}));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

function chaptersOf() {
  const [rootRef] = useLandingChapters.mock.calls[0];
  return [...rootRef.current.querySelectorAll("[data-guide-chapter]")].map((node) => node.dataset.guideChapter);
}

test("the create page reuses the product demos from creating a group to its activity feed", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  render(<LandingCreatePage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("주제와 일정만 정하면오늘 바로 모임을 열 수 있어요");
  expect(chaptersOf()).toEqual([
    "host-intro", "create", "manage", "invite-intro", "invite", "chat-intro", "chat", "calendar", "activity-intro", "activity"
  ]);
  for (const name of ["스터디", "동아리", "같이해요"]) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "자리하나 홈" })).toHaveAttribute("href", "/land");
  expect(screen.getByRole("link", { name: "자리하나 처음 화면으로" })).toHaveAttribute("href", "/land");
});

test("creating from the feature page logs in and returns to the group form", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "anonymous", login });
  render(<LandingCreatePage />);
  const buttons = screen.getAllByRole("button", { name: "모임 만들기" });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  expect(login).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/groups/new");
});

test("reports a failed login connection and keeps the creation destination for retry", () => {
  const login = jest.fn(() => {
    throw new Error("OAuth configuration unavailable");
  });
  useAuth.mockReturnValue({ status: "unavailable", login });
  render(<LandingCreatePage />);
  fireEvent.click(screen.getAllByRole("button", { name: "모임 만들기" })[0]);
  expect(screen.getByRole("alert")).toHaveTextContent("로그인을 연결하지 못했어요");
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/groups/new");
});

test("signed-in members go straight to the group form", () => {
  useAuth.mockReturnValue({ status: "authenticated", login: jest.fn() });
  render(<LandingCreatePage />);
  const links = screen.getAllByRole("link", { name: "모임 만들기" });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "/groups/new");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "group_create");
  }
});

test("the sparring page explains the three steps and plays the arena recording", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  render(<LandingSparringPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("누구 말이 맞을까?편을 고르고 한마디");
  expect(chaptersOf()).toEqual(["sparring-intro", "sparring"]);
  for (const name of ["편 고르기", "한마디 보내기", "받아치기"]) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
  }
  const links = screen.getAllByRole("link", { name: "토론 둘러보기" });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "/sparring");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "landing_sparring_explore");
  }
});

test("the games page introduces both games and links to the game room", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  render(<LandingGamesPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("모임 사람들과 한 판 하고기록과 랭킹을 나눠요");
  expect(screen.getByRole("heading", { level: 3, name: "오목" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "행성이의 리듬 작살" })).toBeInTheDocument();
  const links = screen.getAllByRole("link", { name: "게임방 가기" });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "/games");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "landing_games_explore");
  }
});
