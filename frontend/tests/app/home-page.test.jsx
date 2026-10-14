import { render, screen } from "@testing-library/react";

import { HomePage } from "../../src/pages/HomePage";
import { useAuth } from "../../src/features/auth";

jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/pages/groups/GroupsPage", () => ({
  GroupsPage: () => <h1>기존 모임 홈</h1>
}));
jest.mock("../../src/pages/landing/LandingPage", () => ({
  LandingPage: () => <h1>자리하나 소개</h1>
}));

it.each(["anonymous", "signup-required", "unavailable"])("shows the landing for %s", async (status) => {
  useAuth.mockReturnValue({ status });
  render(<HomePage />);
  expect(await screen.findByRole("heading", { name: "자리하나 소개" })).toBeInTheDocument();
  expect(screen.queryByText("기존 모임 홈")).not.toBeInTheDocument();
});

it("waits for authentication, keeps the existing home, and switches after logout", async () => {
  useAuth.mockReturnValue({ status: "loading" });
  const { rerender } = render(<HomePage />);
  expect(screen.getByRole("status")).toHaveTextContent("홈 불러오는 중");
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();

  useAuth.mockReturnValue({ status: "authenticated" });
  rerender(<HomePage />);
  expect(await screen.findByRole("heading", { name: "기존 모임 홈" })).toBeInTheDocument();
  expect(screen.queryByText("자리하나 소개")).not.toBeInTheDocument();

  useAuth.mockReturnValue({ status: "anonymous" });
  rerender(<HomePage />);
  expect(await screen.findByRole("heading", { name: "자리하나 소개" })).toBeInTheDocument();
  expect(screen.queryByText("기존 모임 홈")).not.toBeInTheDocument();
});
