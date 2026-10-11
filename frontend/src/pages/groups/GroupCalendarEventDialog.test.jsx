import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroupCalendarEventDialog } from "./GroupCalendarEventDialog.jsx";

test("일정 종류는 개별 일정이 기본값이고 시간 방식은 선택 전까지 비어 있다", () => {
  render(<GroupCalendarEventDialog initialDate="2026-10-07" open saveDisabled />);

  expect(screen.getByRole("dialog", { name: "일정 등록" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "개별 일정" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "정기 모임" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "종일" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "시간 지정" })).not.toBeChecked();
  expect(screen.getByLabelText(/^시작일/)).toHaveValue("2026-10-07");
  expect(screen.getByRole("button", { name: "일정 등록" })).toBeDisabled();
});

test("같이해요에는 정기 모임 종류를 제공하지 않는다", () => {
  render(<GroupCalendarEventDialog groupType="SESSION" initialDate="2026-10-07" open />);

  expect(screen.getByRole("radio", { name: "개별 일정" })).toBeChecked();
  expect(screen.queryByRole("radio", { name: "정기 모임" })).not.toBeInTheDocument();
});

test("특정 날짜의 정기 모임은 제목을 고정하고 하루 일정으로 등록한다", async () => {
  const onSave = jest.fn();
  render(<GroupCalendarEventDialog initialDate="2026-10-07" onSave={onSave} open />);

  await userEvent.click(screen.getByRole("radio", { name: "정기 모임" }));
  expect(screen.getByText("정기 모임", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByLabelText("회차 상태")).toHaveValue("AUTO");
  expect(screen.queryByLabelText(/^종료일/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "종일" }));
  await userEvent.selectOptions(screen.getByLabelText("회차 상태"), "COMPLETED");
  await userEvent.type(screen.getByRole("textbox", { name: "설명" }), "이번 주 모임을 진행해요");
  await userEvent.click(screen.getByRole("button", { name: "일정 등록" }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    eventType: "REGULAR_MEETING",
    status: "COMPLETED",
    title: "정기 모임",
    startDate: "2026-10-07",
    endDate: "2026-10-07",
    allDay: true,
    description: "이번 주 모임을 진행해요"
  }));
});

test("개별 일정을 수정할 때 기존 값을 채우고 버전을 함께 보낸다", async () => {
  const onSave = jest.fn();
  render(<GroupCalendarEventDialog open onSave={onSave} initialEvent={{
    id: 4, eventType: "INDIVIDUAL", title: "게임의 밤", startDate: "2026-10-07", endDate: "2026-10-07",
    allDay: true, startTime: null, endTime: null, location: null,
    description: "함께 게임해요", version: 2
  }} />);
  expect(screen.getByRole("dialog", { name: "일정 수정" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "종일" })).toBeChecked();
  expect(screen.getByRole("textbox", { name: /일정 제목/ })).toHaveValue("게임의 밤");
  await userEvent.click(screen.getByRole("button", { name: "일정 수정" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    eventType: "INDIVIDUAL",
    title: "게임의 밤", allDay: true, version: 2
  }));
});
