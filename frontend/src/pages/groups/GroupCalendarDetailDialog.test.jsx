import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroupCalendarDetailDialog } from "./GroupCalendarDetailDialog.jsx";

const event = {
  kind: "GROUP_EVENT",
  id: 1,
  title: "보드게임 모임",
  startDate: "2026-10-07",
  endDate: "2026-10-07",
  allDay: false,
  startTime: "19:00:00",
  endTime: "21:00:00"
};

test("비가입자는 공개 제목과 시각만 본다", () => {
  render(<GroupCalendarDetailDialog event={event} isMember={false}
    detail={{ description: "비공개 설명", location: "비공개 장소" }} />);

  expect(screen.getByText("2026-10-07 · 19:00–21:00")).toBeInTheDocument();
  expect(screen.getByText("장소와 설명은 모임원에게만 보여요.")).toBeInTheDocument();
  expect(screen.queryByText("비공개 설명")).not.toBeInTheDocument();
  expect(screen.queryByText("비공개 장소")).not.toBeInTheDocument();
});

test("모임장은 삭제를 한 번 더 확인한다", async () => {
  const onDelete = jest.fn();
  render(<GroupCalendarDetailDialog event={event} isMember isLeader
    detail={{ description: "설명", location: null, version: 1 }} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: "일정 삭제" }));
  expect(onDelete).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "삭제 확정" }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test("모임원은 날짜별 정기 모임 상태를 본다", () => {
  render(<GroupCalendarDetailDialog event={{ ...event, kind: "REGULAR_MEETING", title: "정기 모임" }}
    isMember detail={{ description: "오늘 모여요", location: null, effectiveStatus: "COMPLETED" }} />);

  expect(screen.getByText("상태").parentElement).toHaveTextContent("개최 완료");
});
