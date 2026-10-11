import { fireEvent, render, screen, within } from "@testing-library/react";

import { GroupCalendar } from "./GroupCalendar.jsx";

const flexibleNote = "이 날짜에는 정해진 정기 모임 없이 유동적으로 운영했어요.";

const calendar = {
  showBaseSchedule: true,
  flexibleBeforeFirstRecurring: {
    fromDate: "2026-09-01",
    untilDate: "2026-10-06",
    registeredOn: "2026-10-07"
  },
  flexibleAfterRecurring: [{ fromDate: "2026-10-08", untilDate: null }],
  events: [
    {
      kind: "RECURRING",
      occurrenceKey: "recurring:1:2026-10-07",
      title: "정기 모임",
      startDate: "2026-10-07",
      endDate: "2026-10-07",
      allDay: false,
      startTime: null,
      endTime: null
    },
    {
      kind: "GROUP_EVENT",
      id: 3,
      title: "보드게임 밤",
      startDate: "2026-10-09",
      endDate: "2026-10-10",
      allDay: true,
      startTime: null,
      endTime: null,
      description: "그룹원 전용 설명",
      location: "그룹원 전용 장소"
    }
  ]
};

test("공개 달력은 제목과 날짜를 보이고 상세 정보는 렌더링하지 않는다", () => {
  render(<GroupCalendar calendar={calendar} initialDate="2026-10-07" onEventOpen={() => {}} />);

  expect(screen.getByRole("heading", { name: "2026년 10월" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "정기 모임" })).toHaveLength(2);
  expect(screen.queryByText(flexibleNote)).not.toBeInTheDocument();
  expect(screen.queryByText("그룹원 전용 설명")).not.toBeInTheDocument();
  expect(screen.queryByText("그룹원 전용 장소")).not.toBeInTheDocument();
  expect(screen.queryByText("시간 미정")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "10월 5일 월요일, 일정 0개" }));
  expect(screen.getByText(flexibleNote)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "10월 9일 금요일, 일정 1개" }));
  const agenda = screen.getByRole("heading", { name: "10월 9일 금요일" }).parentElement.parentElement;
  expect(within(agenda).getByRole("button", { name: "종일 보드게임 밤" })).toBeInTheDocument();
  expect(within(agenda).getByText(flexibleNote)).toBeInTheDocument();
});

test("주간 보기와 기본 일정 숨김은 유동적 운영 안내를 함께 제어한다", () => {
  const { rerender } = render(<GroupCalendar calendar={calendar} initialDate="2026-10-07" />);
  fireEvent.click(screen.getByRole("button", { name: "주" }));
  expect(screen.getByRole("heading", { name: "2026년 10월 4일 – 10월 10일" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "10월 5일 월요일, 일정 0개" }));
  expect(screen.getByText(flexibleNote)).toBeInTheDocument();

  rerender(<GroupCalendar calendar={{ ...calendar, showBaseSchedule: false }} initialDate="2026-10-07" />);
  expect(screen.queryByText(flexibleNote)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "정기 모임" })).not.toBeInTheDocument();
});

test("달력 API가 실패해도 월간 화면과 재시도 동작은 보인다", () => {
  const onRetry = jest.fn();
  render(<GroupCalendar error={new Error("unavailable")} initialDate="2026-10-07" onRetry={onRetry} />);

  expect(screen.getByRole("alert")).toHaveTextContent("일정을 불러오지 못했어요.");
  expect(screen.getByRole("heading", { name: "2026년 10월" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "10월 7일 수요일, 일정 0개" })).toBeInTheDocument();
  expect(screen.getByText("일정을 불러오면 이곳에 표시돼요.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("모임장은 달력에서만 기본 일정 표시를 끄고 켤 수 있다", () => {
  const onToggleBase = jest.fn();
  render(<GroupCalendar calendar={calendar} initialDate="2026-10-07"
    isLeader onToggleBase={onToggleBase} />);

  fireEvent.click(screen.getByRole("checkbox", { name: "정기·세션 일정 표시" }));
  expect(onToggleBase).toHaveBeenCalledWith(false);
});
