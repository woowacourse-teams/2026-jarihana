import { fireEvent, render, screen } from "@testing-library/react";

import { ExploreHero } from "../../../src/pages/groups/home/ExploreHero.jsx";
import {
  getHeroArtworkImageName,
  getHeroArtworkStyle
} from "../../../src/pages/groups/home/heroArtworkPreview.js";

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
  expect(screen.getByRole("option", { name: "자동 · 밤" })).toBeInTheDocument();
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

it("previews the classic artwork set independently from the time-of-day preview", () => {
  process.env.NODE_ENV = "development";
  render(<ExploreHero headline="현재 시간의 문구" period="night" isAuthenticated />);
  const hero = screen.getByRole("heading", { level: 1 }).closest("section");
  const periodSelector = screen.getByRole("combobox", { name: "히어로 배경 미리보기" });
  const artworkSelector = screen.getByRole("combobox", { name: "히어로 이미지 버전" });

  expect(artworkSelector).toHaveValue("current");
  expect(screen.getByRole("option", { name: "보정 세트 (낮·노을·밤)" })).toHaveValue("classic");
  expect(artworkSelector).toHaveAttribute(
    "data-ph-capture-attribute-action", "home_hero_artwork_preview_change"
  );
  expect(hero).not.toHaveAttribute("style");

  fireEvent.change(artworkSelector, { target: { value: "classic" } });
  expect(hero).toHaveAttribute("style", expect.stringContaining("--reference-hero-image"));
  expect(hero).toHaveAttribute("data-time-of-day", "night");

  fireEvent.change(periodSelector, { target: { value: "sunset" } });
  expect(hero).toHaveAttribute("data-time-of-day", "sunset");
  expect(artworkSelector).toHaveValue("classic");
  expect(hero).toHaveAttribute("style", expect.stringContaining("--reference-hero-image"));

  fireEvent.change(artworkSelector, { target: { value: "current" } });
  expect(hero.style.getPropertyValue("--reference-hero-image")).toBe("");
  expect(hero).toHaveAttribute("data-time-of-day", "sunset");
});

it("maps the nebula artwork option to classic day and sunset with a separate night asset", () => {
  expect(getHeroArtworkImageName("nebula", "day")).toBe("jarihana-hero-day-classic.png");
  expect(getHeroArtworkImageName("nebula", "sunset")).toBe("jarihana-hero-sunset-classic.png");
  expect(getHeroArtworkImageName("nebula", "night")).toBe("jarihana-hero-night-nebula.png");
});

it("maps the refined artwork option to the refined day, sunset, and night assets", () => {
  expect(getHeroArtworkImageName("refined", "day")).toBe("jarihana-hero-day-refined.png");
  expect(getHeroArtworkImageName("refined", "sunset")).toBe("jarihana-hero-sunset-refined.png");
  expect(getHeroArtworkImageName("refined", "night")).toBe("jarihana-hero-night-refined.png");
});

it("does not apply the refined artwork override outside development", () => {
  process.env.NODE_ENV = "production";
  expect(getHeroArtworkStyle("refined", "night")).toBeUndefined();
});

it("previews the nebula artwork without forcing the time-of-day selector to night", () => {
  process.env.NODE_ENV = "development";
  render(<ExploreHero headline="현재 시간의 문구" period="sunset" isAuthenticated />);
  const hero = screen.getByRole("heading", { level: 1 }).closest("section");
  const artworkSelector = screen.getByRole("combobox", { name: "히어로 이미지 버전" });

  expect(artworkSelector).toHaveAccessibleDescription(
    "왼쪽 시간대에서 낮·노을·밤을 선택하세요. 성운 강조는 밤에만 달라져요."
  );

  fireEvent.change(artworkSelector, { target: { value: "nebula" } });
  expect(hero).toHaveAttribute("data-time-of-day", "sunset");
  expect(hero).toHaveAttribute("style", expect.stringContaining("--reference-hero-image"));
});

it("previews the refined artwork set independently from the time-of-day selector", () => {
  process.env.NODE_ENV = "development";
  render(<ExploreHero headline="현재 시간의 문구" period="day" isAuthenticated />);
  const hero = screen.getByRole("heading", { level: 1 }).closest("section");
  const periodSelector = screen.getByRole("combobox", { name: "히어로 배경 미리보기" });
  const artworkSelector = screen.getByRole("combobox", { name: "히어로 이미지 버전" });

  expect(screen.getByRole("option", { name: "얼굴 보정 (낮·노을·밤)" })).toHaveValue("refined");

  fireEvent.change(artworkSelector, { target: { value: "refined" } });
  expect(hero).toHaveAttribute("style", expect.stringContaining("--reference-hero-image"));
  expect(hero).toHaveAttribute("data-time-of-day", "day");

  fireEvent.change(periodSelector, { target: { value: "night" } });
  expect(hero).toHaveAttribute("data-time-of-day", "night");
  expect(artworkSelector).toHaveValue("refined");

  fireEvent.change(artworkSelector, { target: { value: "current" } });
  expect(hero.style.getPropertyValue("--reference-hero-image")).toBe("");
  expect(hero).toHaveAttribute("data-time-of-day", "night");
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
  expect(screen.queryByRole("combobox", { name: "히어로 이미지 버전" })).not.toBeInTheDocument();
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
