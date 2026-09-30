import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FeedbackForm } from "../../../src/features/feedback/FeedbackForm.jsx";
import { useCreateFeedback } from "../../../src/features/feedback/hooks.js";

jest.mock("../../../src/features/feedback/hooks.js", () => ({
  useCreateFeedback: jest.fn()
}));

beforeEach(() => {
  useCreateFeedback.mockReset();
});

it("tracks the content length and submits trimmed content", async () => {
  // Given
  const mutateAsync = jest.fn().mockResolvedValue({});
  const onSuccess = jest.fn();
  useCreateFeedback.mockReturnValue({ isPending: false, mutateAsync });
  render(<FeedbackForm onSuccess={onSuccess} />);
  const content = screen.getByRole("textbox", { name: "피드백 내용" });

  // When
  fireEvent.change(content, { target: { value: "  좋은 서비스예요  " } });
  fireEvent.click(screen.getByRole("button", { name: "피드백 보내기" }));

  // Then
  expect(content).toHaveAttribute("maxLength", "1000");
  expect(content).toHaveAttribute("aria-label", "피드백 내용");
  expect(screen.queryByText("피드백 내용", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText(`${"  좋은 서비스예요  ".length}/1000`)).toBeInTheDocument();
  expect(mutateAsync).toHaveBeenCalledWith({ content: "좋은 서비스예요" });
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
});

it("shows a validation message without sending whitespace-only content", () => {
  // Given
  const mutateAsync = jest.fn();
  useCreateFeedback.mockReturnValue({ isPending: false, mutateAsync });
  render(<FeedbackForm onSuccess={jest.fn()} />);

  // When
  fireEvent.change(screen.getByRole("textbox", { name: "피드백 내용" }), {
    target: { value: "   " }
  });
  fireEvent.click(screen.getByRole("button", { name: "피드백 보내기" }));

  // Then
  expect(screen.getByText("피드백 내용을 입력해 주세요.")).toBeInTheDocument();
  expect(mutateAsync).not.toHaveBeenCalled();
});

it("shows a submission error and keeps the form open after failure", async () => {
  // Given
  const mutateAsync = jest.fn().mockRejectedValue(new Error("Request failed"));
  const onSuccess = jest.fn();
  useCreateFeedback.mockReturnValue({ isPending: false, mutateAsync });
  render(<FeedbackForm onSuccess={onSuccess} />);

  // When
  fireEvent.change(screen.getByRole("textbox", { name: "피드백 내용" }), {
    target: { value: "전송 오류 확인" }
  });
  fireEvent.click(screen.getByRole("button", { name: "피드백 보내기" }));

  // Then
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요."
  );
  expect(onSuccess).not.toHaveBeenCalled();
});
