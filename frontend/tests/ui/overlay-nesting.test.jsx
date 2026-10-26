import { fireEvent, render, screen } from "@testing-library/react";
import { Modal, Drawer } from "../../src/shared/ui/Overlay.jsx";

test("Escape closes only the top drawer, then the underlying modal, restoring focus and scroll", () => {
  render(<Modal title="채팅" trigger={<button>채팅 열기</button>}>
    <Drawer title="모임 정보" trigger={<button>정보 열기</button>}>상세 정보</Drawer>
  </Modal>);
  const opener = screen.getByRole("button", { name: "채팅 열기" });
  const focus = jest.spyOn(opener, "focus");
  opener.focus();
  fireEvent.click(opener);
  const info = screen.getByRole("button", { name: "정보 열기" });
  info.focus();
  fireEvent.click(info);
  expect(screen.getAllByRole("dialog")).toHaveLength(2);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "모임 정보" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "채팅" })).toBeInTheDocument();
  expect(info).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  expect(document.body.style.overflow).toBe("");
});

test("removing a parent with an open drawer releases the body scroll lock", () => {
  const { rerender } = render(<Modal open title="채팅">
    <Drawer defaultOpen title="모임 정보">상세 정보</Drawer>
  </Modal>);
  expect(document.body.style.overflow).toBe("hidden");
  rerender(<Modal open={false} title="채팅" />);
  expect(document.body.style.overflow).toBe("");
});
