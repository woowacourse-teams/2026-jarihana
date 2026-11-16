import { act, render, screen } from "@testing-library/react";
import { RoomConnectionToast } from "./RoomConnectionToast.jsx";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("a position correction is not announced as a reconnected socket", () => {
  const { rerender } = render(<RoomConnectionToast status={{ status: "connected" }} />);
  rerender(<RoomConnectionToast status={{ status: "syncing" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("상태를 맞추고");
  rerender(<RoomConnectionToast status={{ status: "connected" }} />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

test("reconnect is a quiet top notice without a button and success disappears", () => {
  const { rerender } = render(<RoomConnectionToast status={{ status: "reconnecting" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("자동으로 다시 연결 중");
  expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<RoomConnectionToast status={{ status: "connected" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("다시 연결됐어요");
  act(() => jest.advanceTimersByTime(3500));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

test("terminal permission errors remain and reconnecting replaces success", () => {
  const { rerender } = render(<RoomConnectionToast status={{ status: "syncing" }} />);
  rerender(<RoomConnectionToast status={{ status: "connected" }} />);
  rerender(<RoomConnectionToast status={{ status: "reconnecting" }} />);
  act(() => jest.advanceTimersByTime(4000));
  expect(screen.getByRole("status")).toHaveTextContent("자동으로 다시 연결 중");
  rerender(<RoomConnectionToast status={{ status: "error", error: { message: "입장 권한이 없어요" } }} />);
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.getByRole("status")).toHaveTextContent("입장 권한이 없어요");
});
