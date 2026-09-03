import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangePicker } from "../../src/shared/ui/index.js";

function PickerHarness({
  initialAlwaysOpen = false,
  initialEnd = "",
  initialStart = "2026-09-10T10:00"
}) {
  const [period, setPeriod] = useState({
    alwaysOpen: initialAlwaysOpen,
    end: initialEnd,
    start: initialStart
  });

  return (
    <DateRangePicker
      alwaysOpen={period.alwaysOpen}
      endValue={period.end}
      onAlwaysOpenChange={(alwaysOpen) =>
        setPeriod((current) => ({ ...current, alwaysOpen }))
      }
      onEndChange={(end) => setPeriod((current) => ({ ...current, end }))}
      onStartChange={(start) => setPeriod((current) => ({ ...current, start }))}
      startValue={period.start}
    />
  );
}

describe("DateRangePicker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("Given an edited start, When now is selected, Then the start resets to the current local minute", async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, "now").mockReturnValue(new Date(2026, 8, 2, 12, 34, 45).getTime());
    render(<PickerHarness />);

    await user.click(screen.getByRole("button", { name: "지금 시작" }));

    expect(screen.getByRole("button", { name: "모집 시작일 선택" })).toHaveTextContent(
      "2026. 9. 2."
    );
    expect(screen.getByLabelText("모집 시작 시간")).toHaveValue("12:34");
  });

  it.each([
    ["3일 뒤", "2026. 9. 13."],
    ["2주 뒤", "2026. 9. 24."]
  ])("Given a start date, When %s is selected, Then the matching local end date is shown", async (preset, expectedDate) => {
    const user = userEvent.setup();
    render(<PickerHarness />);

    await user.click(screen.getByRole("button", { name: preset }));

    expect(screen.getByRole("button", { name: "모집 마감일 선택" })).toHaveTextContent(
      expectedDate
    );
    expect(screen.getByLabelText("모집 마감 시간")).toHaveValue("10:00");
  });

  it("Given a selected start date, When the end calendar opens, Then earlier dates are disabled", async () => {
    const user = userEvent.setup();
    render(<PickerHarness />);

    await user.click(screen.getByRole("button", { name: "모집 마감일 선택" }));

    expect(screen.getByRole("button", { name: "2026년 9월 9일" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2026년 9월 10일" })).toBeEnabled();
  });

  it("Given the same start and end date, When the end time is edited, Then its minimum is one minute after the start", async () => {
    const user = userEvent.setup();
    render(<PickerHarness initialEnd="2026-09-10T10:01" />);

    await user.click(screen.getByRole("button", { name: "모집 마감일 선택" }));

    expect(screen.getByLabelText("모집 마감 시간")).toHaveAttribute("min", "10:01");
  });

  it("Given an open end calendar, When Escape is pressed, Then it closes and returns focus to the endpoint", async () => {
    const user = userEvent.setup();
    render(<PickerHarness />);
    const endpoint = screen.getByRole("button", { name: "모집 마감일 선택" });

    await user.click(endpoint);
    expect(screen.getByRole("region", { name: "모집 마감일 달력" })).toBeVisible();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("region", { name: "모집 마감일 달력" })).not.toBeInTheDocument();
    expect(endpoint).toHaveFocus();
  });

  it("Given a focused calendar day, When arrow and Page Down are pressed, Then focus moves across days and months", async () => {
    const user = userEvent.setup();
    render(<PickerHarness />);

    await user.click(screen.getByRole("button", { name: "모집 마감일 선택" }));
    const startDay = screen.getByRole("button", { name: "2026년 9월 10일" });
    startDay.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "2026년 9월 11일" })).toHaveFocus();

    await user.keyboard("{PageDown}");
    expect(screen.getByText("2026년 10월")).toBeVisible();
    expect(screen.getByRole("button", { name: "2026년 10월 11일" })).toHaveFocus();
  });

  it("Given the selected date is outside the next month, When the month button is used, Then the visible grid keeps a tab stop", async () => {
    const user = userEvent.setup();
    render(<PickerHarness />);

    await user.click(screen.getByRole("button", { name: "모집 마감일 선택" }));
    const nextMonthButton = screen.getByRole("button", { name: "다음 달" });
    await user.click(nextMonthButton);
    const firstVisibleDay = screen.getByRole("button", { name: "2026년 10월 1일" });

    expect(firstVisibleDay).toHaveAttribute("tabindex", "0");
    nextMonthButton.focus();
    await user.tab();
    expect(firstVisibleDay).toHaveFocus();
  });

  it("Given a 23:59 start, When the end calendar opens, Then the first selectable day remains keyboard reachable", async () => {
    const user = userEvent.setup();
    render(<PickerHarness initialStart="2026-09-10T23:59" />);

    await user.click(screen.getByRole("button", { name: "모집 마감일 선택" }));
    const startDay = screen.getByRole("button", { name: "2026년 9월 10일" });
    const firstSelectableDay = screen.getByRole("button", { name: "2026년 9월 11일" });

    expect(startDay).toBeDisabled();
    expect(startDay).toHaveAttribute("tabindex", "-1");
    expect(firstSelectableDay).toHaveAttribute("tabindex", "0");

    firstSelectableDay.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "2026년 9월 12일" })).toHaveFocus();
  });

  it("Given a dated end, When always-open is selected, Then the end time control is removed", async () => {
    const user = userEvent.setup();
    render(<PickerHarness initialEnd="2026-09-17T10:00" />);

    await user.click(screen.getByRole("button", { name: "상시 모집" }));

    expect(screen.getByRole("button", { name: "상시 모집" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByLabelText("모집 마감 시간")).not.toBeInTheDocument();
    expect(screen.getByText("없음")).toBeVisible();
    expect(screen.getByRole("button", { name: "모집 마감일 선택" })).toHaveTextContent("상시 모집");
  });
});
