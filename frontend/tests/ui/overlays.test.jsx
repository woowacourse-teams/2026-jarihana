import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { Button, ConfirmDialog, Drawer, Modal } from "../../src/shared/ui/index.js";

function ModalFixture() {
  return (
    <Modal title="신청을 철회할까요?" trigger={<Button>철회하기</Button>}>
      <p>철회한 신청은 되돌릴 수 없어요.</p>
      <Button>계속</Button>
      <Button>취소</Button>
    </Modal>
  );
}

describe("Modal", () => {
  it("Given a closed modal, When opened and escaped, Then focus is owned, scroll is restored, and focus returns", async () => {
    const user = userEvent.setup();
    render(<ModalFixture />);
    const trigger = screen.getByRole("button", { name: "철회하기" });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "신청을 철회할까요?" });
    expect(dialog).toBeVisible();
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("Given an open modal, When Tab wraps past its final control, Then focus stays trapped", async () => {
    const user = userEvent.setup();
    render(<ModalFixture />);
    await user.click(screen.getByRole("button", { name: "철회하기" }));
    const close = screen.getByRole("button", { name: "닫기" });
    const cancel = screen.getByRole("button", { name: "취소" });

    cancel.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it.each([
    ["modal", Modal],
    ["drawer", Drawer]
  ])(
    "Given a controlled %s, When an external opener closes it, Then focus returns to that opener",
    async (_, Overlay) => {
      const user = userEvent.setup();

      function ControlledFixture() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <Button onClick={() => setOpen(true)}>외부에서 열기</Button>
            <Overlay onClose={() => setOpen(false)} open={open} title="제어된 화면">
              <Button>내부 작업</Button>
            </Overlay>
          </>
        );
      }

      render(<ControlledFixture />);
      const opener = screen.getByRole("button", { name: "외부에서 열기" });
      await user.click(opener);
      expect(screen.getByRole("dialog", { name: "제어된 화면" })).toBeVisible();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "제어된 화면" })).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    }
  );
});

describe("ConfirmDialog", () => {
  it("Given an unresolved confirmation, When confirm is pressed, Then it stays open and exposes pending until success", async () => {
    const user = userEvent.setup();
    let resolveConfirmation;
    const onConfirm = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveConfirmation = resolve;
        })
    );
    render(
      <ConfirmDialog
        confirmLabel="저장하기"
        onConfirm={onConfirm}
        title="저장할까요?"
        trigger={<Button>확인 열기</Button>}
      />
    );

    await user.click(screen.getByRole("button", { name: "확인 열기" }));
    await user.click(screen.getByRole("button", { name: "저장하기" }));
    expect(screen.getByRole("dialog", { name: "저장할까요?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "저장하기 처리 중" })).toBeDisabled();

    resolveConfirmation();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "저장할까요?" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "확인 열기" })).toHaveFocus();
  });

  it("Given a rejected confirmation, When confirm fails, Then it remains open without an unhandled rejection", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn().mockRejectedValue(new Error("network failed"));
    render(
      <ConfirmDialog
        confirmLabel="삭제하기"
        onConfirm={onConfirm}
        title="삭제할까요?"
        trigger={<Button>삭제 확인 열기</Button>}
      />
    );

    await user.click(screen.getByRole("button", { name: "삭제 확인 열기" }));
    await user.click(screen.getByRole("button", { name: "삭제하기" }));

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "삭제할까요?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "삭제하기" })).toBeEnabled();
  });

  it("Given a controlled confirm dialog, When dismissed, Then focus returns to its external opener", async () => {
    const user = userEvent.setup();
    function ControlledConfirm() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>위임 확인 열기</Button>
          <ConfirmDialog
            onClose={() => setOpen(false)}
            onConfirm={() => {}}
            open={open}
            title="위임할까요?"
          />
        </>
      );
    }
    render(<ControlledConfirm />);
    const opener = screen.getByRole("button", { name: "위임 확인 열기" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog", { name: "위임할까요?" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
