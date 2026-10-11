import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroupCalendarEventDialog } from "./GroupCalendarEventDialog.jsx";

test("서버 연결 전에도 등록 모달을 미리 볼 수 있지만 저장은 비활성화된다", () => {
  render(<GroupCalendarEventDialog initialDate="2026-10-07" open saveDisabled />);

  expect(screen.getByRole("dialog", { name: "개별 일정 등록" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "종일" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "시간 지정" })).not.toBeChecked();
  expect(screen.getByLabelText(/^시작일/)).toHaveValue("2026-10-07");
  expect(screen.getByRole("button", { name: "일정 등록" })).toBeDisabled();
});

test("개별 일정을 수정할 때 기존 값을 채우고 버전을 함께 보낸다", async () => {
  const onSave = jest.fn();
  render(<GroupCalendarEventDialog open onSave={onSave} initialEvent={{
    id: 4, title: "게임의 밤", startDate: "2026-10-07", endDate: "2026-10-07",
    allDay: true, startTime: null, endTime: null, location: null,
    description: "함께 게임해요", version: 2
  }} />);
  expect(screen.getByRole("dialog", { name: "개별 일정 수정" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "종일" })).toBeChecked();
  expect(screen.getByRole("textbox", { name: /일정 제목/ })).toHaveValue("게임의 밤");
  await userEvent.click(screen.getByRole("button", { name: "일정 수정" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    title: "게임의 밤", allDay: true, version: 2
  }));
});
