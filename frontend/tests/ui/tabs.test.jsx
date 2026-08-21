import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "../../src/shared/ui/index.js";

describe("Tabs", () => {
  it("Given three tabs, When ArrowRight and Home are pressed, Then focus and selection follow the roving tab stop", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        defaultValue="overview"
        items={[
          { label: "소개", value: "overview", content: <p>소개 내용</p> },
          { label: "활동 기록", value: "activity", content: <p>활동 내용</p> },
          { label: "멤버", value: "members", content: <p>멤버 내용</p> }
        ]}
      />
    );

    const overview = screen.getByRole("tab", { name: "소개" });
    overview.focus();
    await user.keyboard("{ArrowRight}");
    const activity = screen.getByRole("tab", { name: "활동 기록" });
    expect(activity).toHaveFocus();
    expect(activity).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "활동 기록" })).toBeVisible();

    await user.keyboard("{Home}");
    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute("aria-selected", "true");
  });

  it("Given a controlled tab, When a trigger is clicked, Then it requests the next value without mutating selection", async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(
      <Tabs
        items={[
          { label: "전체", value: "all", content: <p>전체</p> },
          { label: "모집 중", value: "open", content: <p>모집 중</p> }
        ]}
        onValueChange={onValueChange}
        value="all"
      />
    );

    await user.click(screen.getByRole("tab", { name: "모집 중" }));
    expect(onValueChange).toHaveBeenCalledWith("open");
    expect(screen.getByRole("tab", { name: "전체" })).toHaveAttribute("aria-selected", "true");
  });
});
