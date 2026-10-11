import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSave = jest.fn();
jest.mock("../../features/group/index.js", () => ({
  useReplaceSessionSchedule: () => ({ mutateAsync: mockSave, reset: jest.fn(), isPending: false, error: null })
}));

import { GroupSessionManageDialog } from "./GroupSessionManageDialog.jsx";

test("같이해요 일정 모달은 날짜와 시각을 독립 저장한다", async () => {
  mockSave.mockResolvedValue({});
  render(<GroupSessionManageDialog groupId="17" open onClose={jest.fn()} schedule={{
    sessionDate: "2026-10-07", startTime: "19:00:00", endTime: "21:00:00"
  }} />);
  expect(screen.getByRole("dialog", { name: "같이해요 일정 수정" })).toBeInTheDocument();
  expect(screen.getByLabelText(/진행 날짜/)).toHaveValue("2026-10-07");
  await userEvent.click(screen.getByRole("button", { name: "일정 저장" }));
  expect(mockSave).toHaveBeenCalledWith({
    sessionDate: "2026-10-07", startTime: "19:00", endTime: "21:00"
  });
});
