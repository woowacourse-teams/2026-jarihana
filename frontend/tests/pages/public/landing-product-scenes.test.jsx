import { render, screen, within } from "@testing-library/react";

import { LandingGuide } from "../../../src/pages/landing/LandingGuide";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>{children}</a>
  )
}));

test("every guide illustration uses readable service UI without screenshot assets or pretend controls", () => {
  const { container } = render(<LandingGuide />);
  const scenes = ["browse", "detail", "continue", "create", "manage", "invite", "activity"];
  for (const name of scenes) {
    const frames = container.querySelectorAll(`[data-screen="${name}"]`);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      const illustration = frame.querySelector('[role="img"]');
      expect(illustration).toHaveAccessibleName(/이용 예시/);
      expect(illustration.querySelector(".landing-product-scene")).toBeInTheDocument();
      expect(illustration.querySelector("a, button, input, select, textarea, [tabindex]")).toBeNull();
      expect(frame.querySelector("figcaption")).toHaveTextContent("서비스 이용 예시");
    }
  }
  for (const image of container.querySelectorAll("img")) {
    expect(image.getAttribute("src")).not.toMatch(
      /landing-(browse|detail|my|create|manage|invite|activity)\./
    );
  }
  expect(container.querySelector(".ui-group-card")).toBeInTheDocument();
  expect(container.querySelector(".ui-recruitment-card")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute("href", "/groups");
  expect(screen.getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "landing_guide_groups"
  );
});

test("account and activity examples keep the real product's tabs, photo and conversation structure", () => {
  const { container } = render(<LandingGuide />);
  const account = container.querySelector('.landing-product-scene--continue');
  expect(account).toHaveTextContent("나의 프로필");
  expect(account).toHaveTextContent("동아리·스터디");
  expect(account).toHaveTextContent("검토 중");
  expect(account.querySelectorAll(".lps-account-row")).toHaveLength(2);
  expect(account.querySelector(".lps-account-summary")).toBeNull();

  const activity = container.querySelector('.landing-product-scene--activity');
  expect(activity.querySelector(".lps-feed-photo img")).toBeInTheDocument();
  expect(activity.querySelectorAll(".lps-comment")).toHaveLength(2);
  expect(activity.querySelector(".lps-reactions")).toBeInTheDocument();
  expect(activity).toHaveTextContent("댓글을 남겨 보세요.");
});


test("all usage sections expose the same intro, chapter and showcase structure with unique anchors", () => {
  const { container } = render(<LandingGuide createAction={<a href="/groups/new">모임 만들기</a>} />);
  const sections = [...container.querySelectorAll("[data-guide-sequence]")];
  expect(sections.map((section) => section.id)).toEqual(["guide", "guide-host", "guide-invite", "guide-activity"]);
  expect([...container.querySelectorAll("[data-guide-chapter]")].map((chapter) => chapter.dataset.guideChapter))
    .toEqual(["participate-intro", "browse", "detail", "continue", "host-intro", "create", "manage", "invite-intro", "invite", "activity-intro", "activity"]);
  for (const section of sections) {
    expect(section).toHaveClass("landing-guide-section");
    expect(section.querySelector(".landing-guide__intro h2")).toBeInTheDocument();
    expect(section.querySelector(".landing-guide__chapters .landing-guide-chapter__number svg")).toBeInTheDocument();
    expect(section.querySelector(".landing-guide__showcase .landing-guide-frame")).toBeInTheDocument();
  }
  expect(sections.map((section) => section.classList.contains("landing-guide--reversed")))
    .toEqual([false, true, false, true]);
  expect(screen.getByRole("heading", { level: 2, name: "이 자리, 네가 함께하면 좋겠어." })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "함께한 순간은, 우리의 기록으로." })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "함께할 사람 초대하기" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "활동 기록 남기기" })).toBeInTheDocument();
  expect(within(sections[1]).getByRole("link", { name: "모임 만들기" })).toHaveAttribute("href", "/groups/new");
  const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("the controlled active chapter selects one desktop demo and keeps the native flow available", () => {
  const { container, rerender } = render(<LandingGuide />);

  expect(container.querySelector('[data-guide-chapter="participate-intro"]')).toHaveAttribute("aria-current", "step");
  const desktopFrames = [...container.querySelectorAll(".landing-guide__showcase .landing-guide-frame")];
  for (const intro of ["participate-intro", "host-intro", "invite-intro", "activity-intro"]) {
    rerender(<LandingGuide activeChapter={intro} />);
    expect(container.querySelector(`[data-guide-chapter="${intro}"]`)).toHaveAttribute("aria-current", "step");
    for (const frame of desktopFrames) {
      expect(frame).toHaveAttribute("inert");
      expect(frame).toHaveAttribute("aria-hidden", "true");
      expect(frame).toHaveAttribute("data-active", "false");
    }
  }

  for (const id of ["browse", "detail", "continue", "create", "manage", "invite", "activity"]) {
    rerender(<LandingGuide activeChapter={id} />);
    expect(container.querySelector(`[data-guide-chapter="${id}"]`)).toHaveAttribute("aria-current", "step");
    expect(container.querySelectorAll('[data-guide-chapter][aria-current="step"]')).toHaveLength(1);
    for (const frame of desktopFrames) {
      if (frame.dataset.screen === id) {
        expect(frame).toHaveAttribute("data-active", "true");
        expect(frame).not.toHaveAttribute("inert");
        expect(frame).not.toHaveAttribute("aria-hidden");
      } else {
        expect(frame).toHaveAttribute("data-active", "false");
        expect(frame).toHaveAttribute("inert");
        expect(frame).toHaveAttribute("aria-hidden", "true");
      }
    }
  }
  for (const frame of container.querySelectorAll(".landing-guide-chapter__mobile-shot .landing-guide-frame")) {
    expect(frame).toHaveAttribute("data-active", "true");
    expect(frame).not.toHaveAttribute("inert");
  }
});
