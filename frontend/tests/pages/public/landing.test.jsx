import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { useAuth } from "../../../src/features/auth";
import { LandingPage } from "../../../src/pages/landing/LandingPage";
import { useLandingChapters } from "../../../src/pages/landing/useLandingChapters";
import { ToastProvider } from "../../../src/shared/ui";

jest.mock("../../../src/pages/landing/useLandingChapters", () => ({
  useLandingChapters: jest.fn()
}));

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ hash: "", key: "default", pathname: "/land", search: "" }),
  useNavigationType: () => "POP"
}));

jest.mock("../../../src/features/auth", () => ({
  storeReturnTarget: jest.requireActual("../../../src/features/auth/returnTarget")
    .storeReturnTarget,
  useAuth: jest.fn()
}));

function renderLanding() {
  return render(
    <ToastProvider>
      <LandingPage />
    </ToastProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

test("reads as the clubhouse, the sparring and games cards, the core feature cards and the tech story with one active chapter at a time", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  const { container } = renderLanding();
  const [pageRef, activate] = useLandingChapters.mock.calls[0];
  const stops = [...pageRef.current.querySelectorAll("[data-guide-chapter]")];
  expect(stops.map((node) => node.dataset.guideChapter)).toEqual([
    "clubhouse", "features", "core",
    "tech-intro", "tech-time", "tech-size", "tech-runs"
  ]);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("우리만의 아지트를 꾸미고함께 어울리는 놀이터");
  // 게임하나? 카드 미리보기는 게임방 순서대로 지금 할 수 있는 세 게임을 보여 준다.
  const gameRows = [...container.querySelectorAll('[data-tone="lavender"] .landing-feature-card__row > span')];
  expect(gameRows.map((node) => node.textContent)).toEqual(["오목", "공평하게 반띵", "리듬 작살"]);
  // 두 카드 모두 실제 화면을 녹화한 영상을 반복한다: 토론은 흰 바탕 의자 대결, 게임은 리듬 작살 데모 플레이.
  expect(container.querySelector('[data-tone="coral"] video')).toHaveAttribute("poster");
  expect(container.querySelector('[data-tone="lavender"] video.landing-feature-card__art--demo')).toHaveAttribute("poster");
  const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ["core", "features", "tech-time", "clubhouse"]) {
    act(() => activate(id));
    expect(container.querySelector(`[data-guide-chapter="${id}"]`)).toHaveAttribute("aria-current", "step");
    expect(container.querySelectorAll('[data-guide-chapter][aria-current="step"]')).toHaveLength(1);
  }
});

test("announces the clubhouse as coming soon instead of opening an unreleased space", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  renderLanding();
  const tries = [
    screen.getByRole("button", { name: "아지트 꾸며 보기" }),
    screen.getByRole("button", { name: "직접 꾸며 보기" })
  ];
  for (const button of tries) {
    expect(button).toHaveAttribute("data-ph-capture-attribute-action", "landing_clubhouse_try");
  }
  fireEvent.click(tries[0]);
  expect(screen.getByText("아지트 꾸미기는 곧 열려요")).toBeInTheDocument();
  expect(screen.getByText("동아리와 스터디마다 생기는 아지트를 준비하고 있어요.")).toBeInTheDocument();
});

test("links the menu, the recruiting list, the feature pages and the footer", () => {
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  renderLanding();
  const menu = screen.getByRole("navigation", { name: "주요 메뉴" });
  for (const [name, href, action] of [
    ["자리", "/groups", "landing_nav_groups"],
    ["토론하나?", "/sparring", "landing_nav_sparring"],
    ["게임하나?", "/games", "landing_nav_games"]
  ]) {
    const link = within(menu).getByRole("link", { name });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", action);
  }

  const recruiting = screen.getAllByRole("link", { name: "모집 중인 모임 보기" });
  expect(recruiting).toHaveLength(2);
  for (const link of recruiting) {
    expect(link).toHaveAttribute("href", "/groups?recruiting=true");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "landing_explore");
  }

  for (const [name, href, action] of [
    ["나에게 맞는 자리 찾기", "/land/join", "landing_feature_join"],
    ["새로운 자리 만들기", "/land/create", "landing_feature_create"],
    [/내 캐릭터가 대신 맞붙어요/, "/land/sparring", "landing_feature_sparring"],
    [/랭킹 1위도 노려 봐요/, "/land/games", "landing_feature_games"]
  ]) {
    const card = screen.getByRole("link", { name });
    expect(card).toHaveAttribute("href", href);
    expect(card).toHaveAttribute("data-ph-capture-attribute-action", action);
  }
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(
    expect.arrayContaining(["말로 한 판 붙고,게임으로도 겨뤄봐요", "당신을 위한 자리,하나쯤은 있어요."])
  );
  expect(screen.getByRole("heading", { name: /여기,\s*자리해도 될까요\?/ })).toBeInTheDocument();
  expect(screen.queryByText("참여할 모임 찾는 중...")).not.toBeInTheDocument();
  expect(screen.queryByText("새 모임 만드는 중...")).not.toBeInTheDocument();

  const footer = screen.getByRole("navigation", { name: "하단 메뉴" });
  expect(within(footer).getByRole("link", { name: "자리하나?를 만드는 방식" })).toHaveAttribute("href", "/land#tech");
  expect(within(footer).getByRole("link", { name: "GitHub 저장소" })).toHaveAttribute(
    "href",
    "https://github.com/woowacourse-teams/2026-jarihana"
  );
});

test("keeps the start button disabled while checking the current session", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "loading", login });
  renderLanding();
  const button = screen.getByRole("button", { name: "연결 중" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(login).not.toHaveBeenCalled();
});

test("lets signed-in visitors return home without another login", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "authenticated", login });
  renderLanding();
  const home = screen.getByRole("link", { name: "홈으로 가기" });
  expect(home).toHaveAttribute("href", "/home");
  expect(home).toHaveAttribute("data-ph-capture-attribute-action", "group_home");
  expect(login).not.toHaveBeenCalled();
});

test("returns a new login to home and continues an interrupted signup", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "anonymous", login });
  const { rerender } = renderLanding();
  fireEvent.click(screen.getByRole("button", { name: "시작하기", exact: true }));
  expect(login).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/home");

  useAuth.mockReturnValue({ status: "signup-required", login });
  rerender(
    <ToastProvider>
      <LandingPage />
    </ToastProvider>
  );
  const signup = screen.getByRole("link", { name: "가입 계속하기" });
  expect(signup).toHaveAttribute("href", "/signup");
  expect(login).toHaveBeenCalledTimes(1);
});
