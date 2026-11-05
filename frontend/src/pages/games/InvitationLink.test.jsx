import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InvitationLink } from "./InvitationLink";

const writeText = jest.fn();
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
});

test("invitation opens after creation, folds and reopens without rotating its URL", async () => {
  const onCreate = jest.fn().mockResolvedValue(true);
  const props = { url: "", canCreate: true, locked: false, onCreate };
  const { rerender } = render(<InvitationLink {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "초대링크" }));
  expect(await screen.findByRole("region", { name: "초대 링크" })).toBeVisible();
  expect(onCreate).toHaveBeenCalledTimes(1);
  const url = "https://example.com/games/gomoku/invite/test-token";
  rerender(<InvitationLink {...props} url={url} />);
  const trigger = screen.getByRole("button", { name: "초대링크", exact: true });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("textbox", { name: "초대 링크" })).toHaveValue(url);
  expect(screen.getByRole("region")).toHaveClass("ph-no-capture", "ph-no-record");
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "초대 링크" })).toHaveValue(url);
  expect(onCreate).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "새 링크 만들기" }));
  expect(onCreate).toHaveBeenCalledTimes(2);
  expect(writeText).not.toHaveBeenCalled();
});

test("copying the current URL closes the panel and returns focus only after success", async () => {
  let finishCopy;
  writeText.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishCopy = resolve;
      })
  );
  const url = "https://example.com/invite/test-token";
  const onCreate = jest.fn();
  render(<InvitationLink url={url} canCreate onCreate={onCreate} />);
  const trigger = screen.getByRole("button", { name: "초대링크", exact: true });
  fireEvent.click(trigger);
  const copy = screen.getByRole("button", { name: "복사", exact: true });
  expect(copy.closest(".gomoku-invitation-field")).toContainElement(screen.getByRole("textbox"));
  expect(copy).not.toHaveTextContent("복사");
  expect(copy.querySelector("svg")).toBeInTheDocument();
  expect(copy).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_invitation_copy");
  fireEvent.click(copy);
  expect(writeText).toHaveBeenCalledWith(url);
  expect(copy).toBeDisabled();
  expect(screen.getByRole("region")).toBeVisible();
  fireEvent.click(copy);
  expect(writeText).toHaveBeenCalledTimes(1);
  await act(async () => finishCopy());
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("초대 링크를 복사했어요.");
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox")).toHaveValue(url);
  expect(onCreate).not.toHaveBeenCalled();
});

test("clipboard failure retains the link for manual copying and allows retry", async () => {
  writeText.mockRejectedValueOnce(new Error("clipboard blocked"));
  const url = "https://example.com/invite/test-token";
  render(<InvitationLink url={url} />);
  fireEvent.click(screen.getByRole("button", { name: "초대링크", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "복사", exact: true }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("직접 복사해 주세요."));
  expect(screen.getByRole("region")).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue(url);
  fireEvent.click(screen.getByRole("button", { name: "복사", exact: true }));
  await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
  expect(writeText).toHaveBeenCalledTimes(2);
});

test("Escape returns focus and outside clicks dismiss without stealing focus", () => {
  render(<InvitationLink url="https://example.com/invite/test-token" />);
  const trigger = screen.getByRole("button", { name: "초대링크", exact: true });
  fireEvent.click(trigger);
  screen.getByRole("textbox").focus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole("textbox"));
  expect(screen.getByRole("region")).toBeVisible();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

test("failed creation keeps the panel closed and locked commands cannot create links", async () => {
  const onCreate = jest.fn().mockResolvedValue(false);
  const { rerender } = render(<InvitationLink onCreate={onCreate} />);
  fireEvent.click(screen.getByRole("button", { name: "초대링크" }));
  await screen.findByRole("button", { name: "초대링크", expanded: false });
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  rerender(<InvitationLink onCreate={onCreate} locked />);
  expect(screen.getByRole("button", { name: "초대링크" })).toBeDisabled();
  rerender(<InvitationLink url="https://example.com/invite/test-token" locked canCreate />);
  fireEvent.click(screen.getByRole("button", { name: "초대링크", exact: true }));
  expect(screen.getByRole("region")).toBeVisible();
  expect(screen.getByRole("button", { name: "새 링크 만들기" })).toBeDisabled();
});
