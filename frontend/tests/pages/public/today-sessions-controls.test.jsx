import { act, fireEvent, render, screen } from "@testing-library/react";
import { TodaySessionsHero } from "../../../src/pages/groups/home/TodaySessionsHero.jsx";

jest.mock("../../../src/pages/groups/GroupTransition.jsx", () => ({
  useGroupTransitionSource: () => null,
  GroupDetailLink: ({ children, groupId, carouselIndex: _index, source: _source, ...props }) => (
    <a {...props} href={`/groups/${groupId}`}>{children}</a>
  )
}));

const groups = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  type: "SESSION",
  name: `오늘 모임 ${index + 1}`,
  introduction: "함께해요",
  sessionSchedule: { sessionDate: "2026-10-05", startTime: `${10 + index}:00`, endTime: `${11 + index}:00` },
  activeRecruitment: { capacity: 6, approvedCount: 2 }
}));

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Element.prototype.scrollTo = jest.fn();
});
afterEach(() => {
  jest.useRealTimers();
  delete Element.prototype.scrollTo;
});

function renderHero() {
  const result = render(<TodaySessionsHero date="2026-10-05" groups={groups} />);
  const viewport = result.container.querySelector(".today-sessions-hero__tickets");
  [...viewport.children].forEach((ticket, index) => {
    Object.defineProperty(ticket, "offsetLeft", { configurable: true, value: index * 300 });
  });
  return { ...result, viewport };
}

function expectSelected(number) {
  expect(screen.getByRole("button", { name: `${number}번째 같이해요 보기` })).toHaveAttribute("aria-pressed", "true");
}

it("puts the arrows around the dots and resumes after ten seconds with the mouse still over controls", () => {
  const { container } = renderHero();
  const controls = container.querySelector(".today-sessions-hero__controls");
  expect(controls.firstElementChild).toHaveAccessibleName("이전 같이해요 보기");
  expect(controls.lastElementChild).toHaveAccessibleName("다음 같이해요 보기");
  expect(screen.queryByRole("button", { name: /자동 전환/ })).not.toBeInTheDocument();
  const next = screen.getByRole("button", { name: "다음 같이해요 보기" });
  fireEvent.mouseEnter(next);
  fireEvent.click(next);
  expectSelected(2);
  act(() => jest.advanceTimersByTime(9999));
  expectSelected(2);
  act(() => jest.advanceTimersByTime(1));
  expectSelected(3);
});

it("synchronizes horizontal trackpad scrolling and extends the idle timer with another gesture", () => {
  const { viewport } = renderHero();
  fireEvent.wheel(viewport, { deltaX: 600, deltaY: 2 });
  viewport.scrollLeft = 600;
  fireEvent.scroll(viewport);
  act(() => jest.advanceTimersByTime(180));
  expectSelected(3);
  act(() => jest.advanceTimersByTime(8000));
  fireEvent.wheel(viewport, { deltaX: -300, deltaY: 0 });
  viewport.scrollLeft = 300;
  fireEvent.scroll(viewport);
  act(() => jest.advanceTimersByTime(9999));
  expectSelected(2);
  act(() => jest.advanceTimersByTime(1));
  expectSelected(3);
});

it("does not pause automatic rotation for vertical scrolling or programmatic card movement", () => {
  const { viewport } = renderHero();
  fireEvent.wheel(viewport, { deltaX: 2, deltaY: 200 });
  viewport.scrollLeft = 300;
  fireEvent.scroll(viewport);
  act(() => jest.advanceTimersByTime(5000));
  expectSelected(2);
});
