import { act, render, screen } from "@testing-library/react";

import { LandingGuide } from "../../../src/pages/landing/LandingGuide";
import { useLandingGuideScroll } from "../../../src/pages/landing/useLandingGuideScroll";

jest.mock("../../../src/pages/landing/useLandingGuideScroll", () => ({
  useLandingGuideScroll: jest.fn(() => ({ current: false }))
}));

beforeEach(() => jest.clearAllMocks());

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


test("one controller owns every usage section and activates the matching demonstration", () => {
  const { container } = render(<LandingGuide />);
  expect(useLandingGuideScroll).toHaveBeenCalledTimes(1);
  const [flowRef, setActiveChapter] = useLandingGuideScroll.mock.calls[0];
  const sections = [...flowRef.current.querySelectorAll("[data-guide-sequence]")];
  expect(sections.map((section) => section.id)).toEqual(["guide", "guide-host", "guide-invite", "guide-activity"]);
  expect([...flowRef.current.querySelectorAll("[data-guide-chapter]")].map((chapter) => chapter.dataset.guideChapter))
    .toEqual(["participate-intro", "browse", "detail", "continue", "host-intro", "create", "manage", "invite", "activity"]);

  expect(container.querySelector('[data-guide-chapter="participate-intro"]')).toHaveAttribute("aria-current", "step");
  expect(container.querySelector('#guide .landing-guide__showcase [data-screen="browse"]')).toHaveAttribute("inert");

  act(() => setActiveChapter("browse"));
  expect(container.querySelector('[data-guide-chapter="participate-intro"]')).not.toHaveAttribute("aria-current");
  expect(container.querySelector('#guide .landing-guide__showcase [data-screen="browse"]')).toHaveAttribute("data-active", "true");

  act(() => setActiveChapter("host-intro"));
  expect(container.querySelector('[data-guide-chapter="host-intro"]')).toHaveAttribute("aria-current", "step");
  for (const frame of container.querySelectorAll(".landing-guide__showcase .landing-guide-frame")) {
    expect(frame).toHaveAttribute("inert");
  }

  act(() => setActiveChapter("create"));
  expect(container.querySelector('#guide-host .landing-guide__showcase [data-screen="create"]')).toHaveAttribute("data-active", "true");
  expect(container.querySelector('#guide .landing-guide__showcase [data-screen="browse"]')).toHaveAttribute("inert");
  for (const id of ["invite", "activity", "manage"]) {
    act(() => setActiveChapter(id));
    expect(container.querySelector(`[data-guide-chapter="${id}"]`)).toHaveAttribute("aria-current", "step");
  }
});
