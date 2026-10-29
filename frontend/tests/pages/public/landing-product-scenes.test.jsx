import { render, screen, within } from "@testing-library/react";

import { LandingGuide } from "../../../src/pages/landing/LandingGuide";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>{children}</a>
  )
}));

test("every guide illustration uses readable service UI without screenshot assets or pretend controls", () => {
  const { container } = render(<LandingGuide />);
  const scenes = ["browse", "detail", "continue", "proposal", "create", "manage", "invite", "chat", "calendar", "activity"];
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
  expect(cards[0].querySelector(".discovery-group-card__location")).toHaveTextContent("강남역 스터디룸");
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

  const inbox = activity.querySelector(".lpa-notifications");
  expect(inbox).toHaveTextContent("알림함2");
  expect([...inbox.querySelectorAll(".notification-row")].map((row) => row.querySelector("strong").textContent))
    .toEqual(["좋아요", "새 댓글"]);
  expect(inbox).toHaveTextContent("모아 외 2명이 좋아요를 눌렀어요.");
  expect(inbox).toHaveTextContent("‘함께 배우는 토요일’ 모임 활동 기록에 새 댓글이 달렸습니다.");
  expect(inbox.querySelector("a, button")).toBeNull();
});

test("chat and calendar examples reuse the real room list, conversation and month grid without controls", () => {
  const { container } = render(<LandingGuide />);
  const chat = container.querySelector(".landing-product-scene--chat");
  const rows = [...chat.querySelectorAll(".chat-room-row")];
  expect(rows.map((row) => row.querySelector(".chat-room-row__title strong").textContent))
    .toEqual(["함께 배우는 토요일", "책으로 만나는 사이"]);
  expect(rows[0].querySelector(".lpm-before .chat-unread")).toHaveTextContent("2");
  expect(rows[0].querySelector(".chat-room-row__meta")).toHaveTextContent("스터디참여자 6명");
  expect(chat.querySelector(".chat-date")).toHaveTextContent("10월 24일 토요일");
  expect([...chat.querySelectorAll(".chat-message:not(.chat-message--mine) .chat-message__author")]
    .map((author) => author.textContent)).toEqual(["모아", "바다"]);
  expect(chat.querySelector(".chat-message--mine .chat-message__bubble")).toHaveTextContent("3번 방이에요. 천천히 오세요!");
  expect(chat.querySelector(".lps-chat-composer")).toHaveTextContent("모임에 이야기를 건네보세요");
  expect(chat.querySelector("a, button, input, select, textarea")).toBeNull();

  const calendar = container.querySelector(".landing-product-scene--calendar");
  expect(calendar.querySelector(".lps-calendar-month")).toHaveTextContent("2026년 10월");
  expect([...calendar.querySelectorAll(".group-calendar__legend > span")].map((item) => item.textContent.trim()))
    .toEqual(["정기 모임", "개별 일정", "같이해요"]);
  expect(calendar.querySelectorAll(".group-calendar__day")).toHaveLength(35);
  expect(calendar.querySelectorAll(".group-calendar__dot--recurring")).toHaveLength(5);
  expect(calendar.querySelectorAll(".group-calendar__dot--group_event")).toHaveLength(1);
  expect(calendar.querySelector(".is-today")).toHaveTextContent("22");
  expect(calendar.querySelector(".lpm-before .group-calendar__agenda-heading")).toHaveTextContent("10월 22일 목요일");
  expect(calendar.querySelector(".lpm-after .group-calendar__event--recurring")).toHaveTextContent("14:00-16:00함께 배우는 토요일");
  expect(calendar.querySelector("a, button, input, select, textarea")).toBeNull();
});

test("proposal example reuses the board card and gathered conditions without real controls", () => {
  const { container } = render(<LandingGuide />);
  const proposal = container.querySelector(".landing-product-scene--proposal");
  expect(proposal).toHaveTextContent("자유게시판");
  const card = proposal.querySelector(".proposal-card__body");
  expect(card.querySelector(".proposal-badge--study")).toHaveTextContent("스터디");
  expect(card.querySelector(".proposal-card__title")).toHaveTextContent("주말에 같이 공부할 사람 있나요?");
  expect(card.querySelector(".lpm-before .proposal-pill")).toHaveTextContent("함께하고 싶어요4");
  expect(card.querySelector(".lpm-after .proposal-pill--on")).toHaveTextContent("함께하고 싶어요5");
  expect([...proposal.querySelectorAll(".proposal-summary-chip__button")].map((chip) => chip.textContent))
    .toEqual(["주말 오후5명", "오프라인4명", "초보 환영4명"]);
  const rows = [...proposal.querySelectorAll(".lps-proposal-rows .proposal-bar-row")];
  expect(rows.map((row) => row.textContent)).toEqual(["주말 오후5명", "평일 저녁2명", "주말 오전1명"]);
  expect(rows[0]).toHaveClass("proposal-bar-row--lead");
  expect(proposal.querySelector("a, button, input, select, textarea")).toBeNull();

  const board = screen.getByRole("link", { name: "자유게시판 둘러보기" });
  expect(board).toHaveAttribute("href", "/board");
  expect(board).toHaveAttribute("data-ph-capture-attribute-action", "landing_board_explore");
  expect(container.querySelector("#guide-proposal .landing-guide__intro")).toContainElement(board);
});


test("all usage sections expose the same intro, chapter and showcase structure with unique anchors", () => {
  const { container } = render(<LandingGuide createAction={<a href="/groups/new">모임 만들기</a>} />);
  const sections = [...container.querySelectorAll("[data-guide-sequence]")];
  expect(sections.map((section) => section.id))
    .toEqual(["guide", "guide-proposal", "guide-host", "guide-invite", "guide-chat", "guide-activity"]);
  expect([...container.querySelectorAll("[data-guide-chapter]")].map((chapter) => chapter.dataset.guideChapter))
    .toEqual([
      "participate-intro", "browse", "detail", "continue", "proposal-intro", "proposal", "host-intro", "create",
      "manage", "invite-intro", "invite", "chat-intro", "chat", "calendar", "activity-intro", "activity"
    ]);
  expect([...container.querySelectorAll(".landing-guide__intro .landing-eyebrow")].map((eyebrow) => eyebrow.textContent))
    .toEqual([
      "01 모임에 참여하기", "02 자유게시판", "03 직접 만들고 운영하기", "04 초대하기", "05 모임 채팅과 일정", "06 활동 피드"
    ]);
  for (const section of sections) {
    expect(section).toHaveClass("landing-guide-section");
    expect(section.querySelector(".landing-guide__intro h2")).toBeInTheDocument();
    expect(section.querySelector(".landing-guide__chapters .landing-guide-chapter__number svg")).toBeInTheDocument();
    expect(section.querySelector(".landing-guide__showcase .landing-guide-frame")).toBeInTheDocument();
  }
  expect(sections.map((section) => section.classList.contains("landing-guide--reversed")))
    .toEqual([false, true, false, true, false, true]);
  expect(screen.getByRole("heading", { level: 2, name: "이런 모임, 같이할 사람?" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "모임 단톡방, 따로 만들 필요 없어요." })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "모임 사람들과 바로 대화하기" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "다음 일정 한눈에 보기" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "함께할 마음 모으기" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "이 자리, 네가 함께하면 좋겠어." })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "함께한 순간은, 우리의 기록으로." })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "함께할 사람 초대하기" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "활동 기록 남기기" })).toBeInTheDocument();
  expect(within(sections[2]).getByRole("link", { name: "모임 만들기" })).toHaveAttribute("href", "/groups/new");
  const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("the controlled active chapter selects one desktop demo and keeps the native flow available", () => {
  const { container, rerender } = render(<LandingGuide />);

  expect(container.querySelector('[data-guide-chapter="participate-intro"]')).toHaveAttribute("aria-current", "step");
  const desktopFrames = [...container.querySelectorAll(".landing-guide__showcase .landing-guide-frame")];
  for (const intro of ["participate-intro", "proposal-intro", "host-intro", "invite-intro", "chat-intro", "activity-intro"]) {
    rerender(<LandingGuide activeChapter={intro} />);
    expect(container.querySelector(`[data-guide-chapter="${intro}"]`)).toHaveAttribute("aria-current", "step");
    for (const frame of desktopFrames) {
      expect(frame).toHaveAttribute("inert");
      expect(frame).toHaveAttribute("aria-hidden", "true");
      expect(frame).toHaveAttribute("data-active", "false");
    }
  }

  for (const id of ["browse", "detail", "continue", "proposal", "create", "manage", "invite", "chat", "calendar", "activity"]) {
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
  expect(chapters).toHaveLength(10);
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
