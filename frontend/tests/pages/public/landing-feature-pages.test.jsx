import { fireEvent, render, screen } from "@testing-library/react";

import { useAuth } from "../../../src/features/auth";
import {
  LandingCreatePage,
  LandingGamesPage,
  LandingJoinPage,
  LandingSparringPage
} from "../../../src/pages/landing/LandingFeaturePages";
import { useLandingChapters } from "../../../src/pages/landing/useLandingChapters";

jest.mock("../../../src/pages/landing/useLandingChapters", () => ({
  useLandingChapters: jest.fn()
}));

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ hash: "", key: "default", pathname: "/land/create", search: "" }),
  useNavigationType: () => "POP"
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

test("the join page explains finding, applying and what members share after joining", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  render(<LandingJoinPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("관심 가는 모임을 찾아바로 참여를 신청해요");
  expect(chaptersOf()).toEqual([
    "join-intro", "browse", "detail", "continue", "chat-intro", "chat", "calendar", "activity-intro", "activity"
  ]);
  // 머리글, 첫 화면, 마지막 버튼
  const explore = screen.getAllByRole("link", { name: "모집 중인 모임 보기" });
  expect(explore).toHaveLength(3);
  for (const link of explore) {
    expect(link).toHaveAttribute("href", "/groups?recruiting=true");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "landing_explore");
  }
  expect(screen.getByRole("link", { name: "자리하나? 처음 화면으로" })).toHaveAttribute("href", "/land");
});

test("the create page explains group types, creating, inviting and gathering people on the board", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  render(<LandingCreatePage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("주제와 일정만 정하면오늘 바로 모임을 열 수 있어요");
  expect(chaptersOf()).toEqual([
    "host-intro", "create", "manage", "invite-intro", "invite", "proposal-intro", "proposal"
  ]);
  for (const name of ["스터디", "동아리", "같이해요"]) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
  }
  const board = screen.getByRole("link", { name: "자유게시판 둘러보기" });
  expect(board).toHaveAttribute("href", "/board");
  expect(board).toHaveAttribute("data-ph-capture-attribute-action", "landing_board_explore");
  expect(screen.getByRole("link", { name: "자리하나 홈" })).toHaveAttribute("href", "/land");
  expect(screen.getByRole("link", { name: "자리하나? 처음 화면으로" })).toHaveAttribute("href", "/land");
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

test("the games page introduces the three playable games in game room order and links to the game room", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  const { container } = render(<LandingGamesPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("모임 사람들과 한 판 즐기고랭킹에 이름을 올려 봐요");
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
    "오목",
    "공평하게 반띵",
    "행성이의 리듬 작살"
  ]);
  expect(screen.getByText("막대과자를 같은 무게로 나누는 퍼즐")).toBeInTheDocument();
  expect(container.querySelector(".landing-feature-page__game-art svg.stick-artwork")).toBeInTheDocument();
  const links = screen.getAllByRole("link", { name: "게임방 가기" });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "/games");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "landing_games_explore");
  }
});
