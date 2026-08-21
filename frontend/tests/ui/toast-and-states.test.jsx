import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CursorList,
  EmptyState,
  ErrorState,
  Skeleton,
  ToastProvider,
  useToast
} from "../../src/shared/ui/index.js";

function ToastFixture() {
  const toast = useToast();
  return (
    <button
      onClick={() => {
        toast.show({ title: "첫 번째" });
        toast.show({ title: "두 번째" });
        toast.show({ title: "세 번째" });
        toast.show({ title: "네 번째" });
      }}
      type="button"
    >
      알림 만들기
    </button>
  );
}

function SingleToastFixture() {
  const toast = useToast();
  return (
    <button onClick={() => toast.show({ title: "하나" })} type="button">
      알림 하나
    </button>
  );
}

describe("feedback and pagination primitives", () => {
  it("Given four notifications, When shown, Then the polite live region keeps only the latest three", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastFixture />
      </ToastProvider>
    );
    await user.click(screen.getByRole("button", { name: "알림 만들기" }));

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText("첫 번째")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("Given active toast timers, When the provider unmounts, Then every timer is cleared", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const clearTimer = jest.spyOn(window, "clearTimeout");
    try {
      const { unmount } = render(
        <ToastProvider>
          <SingleToastFixture />
        </ToastProvider>
      );
      await user.click(screen.getByRole("button", { name: "알림 하나" }));
      clearTimer.mockClear();
      unmount();
      expect(clearTimer).toHaveBeenCalled();
    } finally {
      clearTimer.mockRestore();
      jest.useRealTimers();
    }
  });

  it("Given StrictMode and a limited stack, When the fourth toast commits, Then the displaced timer is cleared after the committed UI updates", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const committedSnapshots = [];
    const originalClearTimeout = window.clearTimeout;
    const clearTimer = jest.spyOn(window, "clearTimeout").mockImplementation((timer) => {
      if (timer !== undefined) committedSnapshots.push(Boolean(screen.queryByText("네 번째")));
      return originalClearTimeout(timer);
    });
    try {
      render(
        <StrictMode>
          <ToastProvider>
            <ToastFixture />
          </ToastProvider>
        </StrictMode>
      );
      await user.click(screen.getByRole("button", { name: "알림 만들기" }));

      expect(screen.getAllByRole("listitem")).toHaveLength(3);
      expect(committedSnapshots).toEqual([true]);
    } finally {
      clearTimer.mockRestore();
      jest.useRealTimers();
    }
  });

  it("Given a next cursor, When more results are requested, Then the opaque cursor is passed through", async () => {
    const user = userEvent.setup();
    const onLoadMore = jest.fn();
    render(
      <CursorList hasNext nextCursor="opaque-cursor-value" onLoadMore={onLoadMore}>
        <li>모임 하나</li>
      </CursorList>
    );

    await user.click(screen.getByRole("button", { name: "모임 더 보기" }));
    expect(onLoadMore).toHaveBeenCalledWith("opaque-cursor-value");
  });

  it("Given recovery states, When rendered, Then each state exposes one named next action", () => {
    render(
      <>
        <EmptyState action={<a href="/groups/new">모임 만들기</a>} title="아직 모임이 없어요" />
        <ErrorState action={<button type="button">다시 시도</button>} title="불러오지 못했어요" />
      </>
    );

    expect(screen.getByRole("link", { name: "모임 만들기" })).toHaveAttribute(
      "href",
      "/groups/new"
    );
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
  });
});

describe("Skeleton", () => {
  it("Given an accessible loading label, When a skeleton renders, Then the label belongs to a status role", () => {
    render(<Skeleton aria-label="모임 카드 불러오는 중" />);

    expect(screen.getByRole("status", { name: "모임 카드 불러오는 중" })).toBeVisible();
  });

  it("Given a decorative skeleton, When no label is provided, Then it stays out of the accessibility tree", () => {
    const { container } = render(<Skeleton />);

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
