import { fireEvent, render, screen } from "@testing-library/react";

import { ExploreHero } from "../../../src/pages/groups/home/ExploreHero.jsx";

const originalEnvironment = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnvironment;
});

it("previews each background in development without changing the headline", () => {
  process.env.NODE_ENV = "development";
  render(<ExploreHero headline="현재 시간의 문구" period="night" isAuthenticated />);
  const heading = screen.getByRole("heading", { level: 1 });
  const hero = heading.closest("section");
  const selector = screen.getByRole("combobox", { name: "히어로 배경 미리보기" });

  expect(selector).toHaveValue("auto");
  expect(selector).toHaveAttribute(
    "data-ph-capture-attribute-action", "home_hero_background_preview_change"
  );
  expect(hero).toHaveAttribute("data-time-of-day", "night");
  for (const period of ["day", "sunset", "night"]) {
    fireEvent.change(selector, { target: { value: period } });
    expect(hero).toHaveAttribute("data-time-of-day", period);
    expect(heading).toHaveAccessibleName("현재 시간의 문구");
  }
});

it("keeps a manual background across live updates and resumes the latest automatic theme", () => {
  process.env.NODE_ENV = "development";
  const { rerender } = render(<ExploreHero period="day" />);
  const selector = screen.getByRole("combobox", { name: "히어로 배경 미리보기" });
  const hero = screen.getByRole("heading", { level: 1 }).closest("section");

  fireEvent.change(selector, { target: { value: "sunset" } });
  rerender(<ExploreHero period="night" />);
  expect(hero).toHaveAttribute("data-time-of-day", "sunset");
  fireEvent.change(selector, { target: { value: "auto" } });
  expect(hero).toHaveAttribute("data-time-of-day", "night");
});

it.each(["production", "test"])("hides preview controls in %s", (environment) => {
  process.env.NODE_ENV = environment;
  render(<ExploreHero period="sunset" />);
  expect(screen.queryByRole("combobox", { name: "히어로 배경 미리보기" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 }).closest("section"))
    .toHaveAttribute("data-time-of-day", "sunset");
});

it("ignores a manual preview outside development", () => {
  process.env.NODE_ENV = "development";
  const { rerender } = render(<ExploreHero period="night" />);
  fireEvent.change(screen.getByRole("combobox", { name: "히어로 배경 미리보기" }), {
    target: { value: "day" }
  });

  process.env.NODE_ENV = "production";
  rerender(<ExploreHero period="night" />);
  expect(screen.queryByRole("combobox", { name: "히어로 배경 미리보기" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 }).closest("section"))
    .toHaveAttribute("data-time-of-day", "night");
});
