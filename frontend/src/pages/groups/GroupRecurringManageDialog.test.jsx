import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockReplace = jest.fn();
const mockEdit = jest.fn();
const mockSaveOccurrence = jest.fn();
const mockDeleteOccurrence = jest.fn();
const mockManage = {
  data: { seriesId: 4, periodId: 9, startDate: "2026-08-01", endDate: null,
    version: 2, daysOfWeek: ["WEDNESDAY"], startTime: "19:00:00", endTime: "21:00:00" },
  isSuccess: true, isPending: false, error: null
};
const mockPeriod = {
  data: { periodId: 8, effectiveFrom: "2026-08-01", effectiveUntil: "2026-08-15",
    version: 2, daysOfWeek: ["MONDAY"], startTime: null, endTime: null },
  isPending: false, error: null
};
const mockMutation = (mutateAsync) => ({ mutateAsync, reset: jest.fn(), isPending: false, error: null });

jest.mock("../../features/auth/index.js", () => ({
  useAuth: () => ({ member: { id: 3 }, sessionVersion: 1 })
}));
jest.mock("../../features/group/index.js", () => ({
  useGroupRecurringManage: () => mockManage,
  useGroupRecurringPeriod: () => mockPeriod,
  useReplaceScopedRecurringSchedule: () => mockMutation(mockReplace),
  useEditGroupRecurringPeriod: () => mockMutation(mockEdit),
  useUpdateGroupRecurringRange: () => mockMutation(jest.fn()),
  useDeleteScopedRecurringSchedule: () => mockMutation(jest.fn())
}));

import { GroupRecurringManageDialog } from "./GroupRecurringManageDialog.jsx";

test("현재 정기 규칙 변경에는 범위 선택이 필수다", async () => {
  mockReplace.mockClear().mockResolvedValue({ version: 3 });
  render(<GroupRecurringManageDialog groupId="17" event={{ periodId: 9, startDate: "2026-08-19" }} onClose={jest.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "규칙 저장" }));
  expect(screen.getByRole("alert")).toHaveTextContent("변경할 일정 범위를 선택해 주세요.");
  expect(mockReplace).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("radio", { name: "앞으로의 일정" }));
  await userEvent.click(screen.getByRole("button", { name: "규칙 저장" }));
  expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({
    applyScope: "FROM_TODAY", version: 2
  }));
});

test("과거 구간은 범위 선택 없이 그 구간의 요일과 시각만 수정한다", async () => {
  mockEdit.mockClear().mockResolvedValue({ version: 3 });
  render(<GroupRecurringManageDialog groupId="17" event={{ periodId: 8, startDate: "2026-08-10" }} onClose={jest.fn()} />);
  expect(screen.getByText(/선택한 과거 구간/)).toHaveTextContent("2026-08-01 ~ 2026-08-15");
  expect(screen.queryByRole("radio", { name: "앞으로의 일정" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "규칙 저장" }));
  expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({
    periodId: 8, version: 2, daysOfWeek: ["MONDAY"]
  }));
});

test("정기 규칙은 유지하고 선택한 회차만 새 일정 정보로 수정한다", async () => {
  mockSaveOccurrence.mockClear().mockResolvedValue({ id: 51 });
  render(<GroupRecurringManageDialog
    groupId="17"
    event={{ id: null, periodId: 9, occurrenceKey: "recurring:4:2026-08-19", startDate: "2026-08-19", startTime: "19:00:00" }}
    detail={{ kind: "RECURRING", title: "정기 모임", date: "2026-08-19", startTime: "19:00:00", endTime: "21:00:00", location: "회의실" }}
    onSaveOccurrence={mockSaveOccurrence}
    onDeleteOccurrence={mockDeleteOccurrence}
    onClose={jest.fn()}
  />);

  await userEvent.click(screen.getByRole("radio", { name: "이 일정만" }));
  expect(screen.getByRole("radio", { name: "종일" })).not.toBeChecked();
  await userEvent.click(screen.getByRole("radio", { name: "종일" }));
  await userEvent.type(screen.getByRole("textbox", { name: "설명" }), "이번 회차는 장소를 변경해요");
  await userEvent.click(screen.getByRole("button", { name: "일정 등록" }));

  expect(mockSaveOccurrence).toHaveBeenCalledWith(expect.objectContaining({
    sourceDate: "2026-08-19", periodId: 9, seriesVersion: 2,
    eventType: "REGULAR_MEETING", startDate: "2026-08-19", allDay: true,
    description: "이번 회차는 장소를 변경해요", location: "회의실"
  }));
});

test("정기 일정 삭제 범위에서 선택한 회차만 지울 수 있다", async () => {
  mockDeleteOccurrence.mockClear().mockResolvedValue(undefined);
  render(<GroupRecurringManageDialog
    groupId="17"
    event={{ id: null, periodId: 9, occurrenceKey: "recurring:4:2026-08-19", startDate: "2026-08-19" }}
    detail={{ kind: "RECURRING", title: "정기 모임", date: "2026-08-19", startTime: null, endTime: null, location: null }}
    onSaveOccurrence={mockSaveOccurrence}
    onDeleteOccurrence={mockDeleteOccurrence}
    onClose={jest.fn()}
  />);

  await userEvent.selectOptions(screen.getByLabelText("삭제 범위"), "THIS_EVENT");
  await userEvent.click(screen.getByRole("button", { name: "정기 일정 삭제" }));
  await userEvent.click(screen.getByRole("button", { name: "삭제 확정" }));
  expect(mockDeleteOccurrence).toHaveBeenCalledWith({ sourceDate: "2026-08-19", periodId: 9, seriesVersion: 2 });
});
