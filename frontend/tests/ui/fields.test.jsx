import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, Checkbox, Radio, Select, Textarea, TextField } from "../../src/shared/ui/index.js";

describe("form primitives", () => {
  it("Given help and an error, When a text field renders, Then its control is labelled and described", () => {
    render(
      <TextField
        description="모임에서 사용할 이름이에요."
        error="이름을 입력해 주세요."
        label="이름"
        name="name"
      />
    );

    const input = screen.getByRole("textbox", { name: "이름" });
    expect(input).toHaveAccessibleDescription("모임에서 사용할 이름이에요. 이름을 입력해 주세요.");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("Given each field kind, When rendered, Then every control has a visible label", () => {
    render(
      <>
        <Textarea label="소개" name="introduction" />
        <Select label="분야" name="type">
          <option>스터디</option>
        </Select>
        <Checkbox label="모집 중만 보기" name="recruiting" />
        <Radio label="자동 승인" name="joinMethod" value="AUTO" />
      </>
    );

    expect(screen.getByRole("textbox", { name: "소개" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "분야" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "모집 중만 보기" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "자동 승인" })).toBeVisible();
  });

  it("Given a pending button, When clicked, Then it stays disabled and exposes the busy state", async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(
      <Button pending onClick={handleClick}>
        저장하기
      </Button>
    );

    const button = screen.getByRole("button", { name: "저장하기 처리 중" });
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(handleClick).not.toHaveBeenCalled();
  });
});
