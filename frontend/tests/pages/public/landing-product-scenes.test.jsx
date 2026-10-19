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
      const windowFrame = frame.querySelector(".landing-guide-frame__window");
      expect(windowFrame).toContainElement(illustration);
      const chrome = windowFrame.querySelector(".landing-guide-frame__chrome");
      expect(chrome).toHaveAttribute("aria-hidden", "true");
      expect(chrome.querySelectorAll("span")).toHaveLength(3);
      expect(chrome.querySelector("button, a, [tabindex]")).toBeNull();
      expect(windowFrame.querySelectorAll("button[data-ph-capture-attribute-action]")).toHaveLength(2);
      expect(windowFrame.querySelector("figcaption")).toBeNull();
      expect(frame.querySelector("figcaption")).toHaveTextContent("서비스 이용 예시");
    }
  }
  for (const image of container.querySelectorAll("img")) {
    expect(image.getAttribute("src")).not.toMatch(
      /landing-(browse|detail|my|create|manage|invite|activity)\./
    );
  }
  expect(container.querySelector(".discovery-group-card")).toBeInTheDocument();
  expect(container.querySelector(".lps-recruitment")).toHaveTextContent("승인 5명 / 정원 6명");
  expect(screen.getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute("href", "/groups");
  expect(screen.getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "landing_guide_groups"
  );
});

test("discovery examples reuse product cards, search and all three filters without fake navigation", () => {
  const { container } = render(<LandingGuide />);
  const browse = container.querySelector('.landing-product-scene--browse');
  expect(browse).toHaveTextContent("자리 둘러보기");
  expect(browse.querySelector(".groups-discovery-search__control")).toHaveTextContent("함께");
  expect([...browse.querySelectorAll(".groups-discovery-filter__field > span")].map((label) => label.textContent))
    .toEqual(["모임 유형", "모임 상태", "모집 상태"]);
  const cards = browse.querySelectorAll(".discovery-group-card");
  expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveTextContent("1자리 남음");
  expect(cards[0].querySelector(".discovery-group-card__location")).toHaveTextContent("잠실 캠퍼스");
  expect(cards[0].querySelector(".discovery-group-card__schedule")).toHaveTextContent("14:00");
  expect(browse.querySelector("a, button, input, select")).toBeNull();
});

test("management and invitation examples preserve real status and dialog semantics", () => {
  const { container } = render(<LandingGuide />);
  const manage = container.querySelector('.landing-product-scene--manage');
  expect(manage.querySelector('.lps-manage-toolbar')).toHaveTextContent("신청자 목록전체");
  expect(manage.querySelector('.lps-manage-summary')).toHaveTextContent("정원 6명");
  expect(manage).not.toHaveTextContent("전체 신청");
  expect([...manage.querySelectorAll('.lps-decisions > span')].map((item) => item.textContent))
    .toEqual(["승인", "미승인"]);
  const invite = container.querySelector('.landing-product-scene--invite');
  expect(invite.querySelector('.lps-search-submit')).toHaveTextContent("검색");
  expect(invite.querySelector('.lps-dialog-actions')).toHaveTextContent("닫기");
  expect(invite.querySelector('.lps-invite-context')).toHaveTextContent("초대 링크 복사");
  expect(invite).toHaveTextContent("1명에게 초대를 보냈어요.");
  const detail = container.querySelector('.landing-product-scene--detail');
  expect(detail.querySelector('.lps-application-overlay')).toHaveTextContent("신청 메시지");
  expect(detail.querySelector('.lps-tabs')).toHaveTextContent("소개캘린더활동 기록참여자");
});

test("account and activity examples keep the real product's tabs, photo and conversation structure", () => {
  const { container } = render(<LandingGuide />);
  const account = container.querySelector('.landing-product-scene--continue');
  expect(account).toHaveTextContent("나의 프로필");
  expect(account).toHaveTextContent("동아리·스터디");
  expect(account).toHaveTextContent("검토 중");
  expect(account.querySelector('.lps-account-layout > .lps-profile')).toBeInTheDocument();
  expect(account.querySelector('.lps-account-panels').querySelectorAll('.lps-dashboard-panel')).toHaveLength(2);
  expect(account.querySelectorAll(".lps-account-row")).toHaveLength(2);
  expect(account.querySelector(".lps-account-summary")).toBeNull();

  const activity = container.querySelector('.landing-product-scene--activity');
  expect(activity.querySelector(".lps-feed-photo img")).toBeInTheDocument();
  expect(activity.querySelectorAll(".lps-comment")).toHaveLength(2);
  expect(activity.querySelectorAll(".lps-reactions .lpa-reaction")).toHaveLength(1);
  expect(activity.querySelector(".lps-reactions .lpa-reaction-heart")).toHaveAttribute("alt", "");
  expect(activity.querySelector(".lps-reactions svg")).toBeNull();
  expect(activity.querySelector(".lps-reactions")).not.toHaveTextContent(/[👍🔥]/u);
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

test("every usage chapter has a heading, two feature checks and a demo without repeated prose", () => {
  const { container } = render(<LandingGuide />);
  const chapters = [...container.querySelectorAll(".landing-guide-chapter")];
  expect(chapters).toHaveLength(7);
  for (const chapter of chapters) {
    expect(chapter.querySelector("h3")).toBeInTheDocument();
    expect(chapter.querySelectorAll(".landing-guide-checks > li")).toHaveLength(2);
    expect(chapter.querySelector(":scope > p")).toBeNull();
    expect(chapter.querySelector(".landing-guide-checks").nextElementSibling)
      .toHaveClass("landing-guide-chapter__mobile-shot");
  }
});

test("inline demos play only in their selected chapter and reset when leaving it", () => {
  const originalObserver = global.IntersectionObserver;
  global.IntersectionObserver = undefined;
  try {
    const { container, rerender } = render(<LandingGuide activeChapter="browse" />);
    const demo = (id) => container.querySelector(`#guide-${id} .landing-product-demo`);
    expect(demo("browse")).toHaveAttribute("data-state", "running");
    expect(demo("detail")).toHaveAttribute("data-state", "idle");
    rerender(<LandingGuide activeChapter="detail" />);
    expect(demo("browse")).toHaveAttribute("data-state", "idle");
    expect(demo("detail")).toHaveAttribute("data-state", "running");
  } finally {
    global.IntersectionObserver = originalObserver;
  }
});
