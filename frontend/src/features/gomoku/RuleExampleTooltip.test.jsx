import { act, fireEvent, render, screen } from "@testing-library/react";
import { RuleExampleTooltip } from "./RuleExampleTooltip";

const imageUrl =
  "https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/jarihana-dev/images/gomoku-rules/example.png";

test.each([
  ["three", "3-3"],
  ["four", "4-4"]
])("%s opens a labelled image tooltip on hover and Escape dismisses it", (kind, title) => {
  render(<RuleExampleTooltip kind={kind} imageUrl={imageUrl} />);
  const trigger = screen.getByRole("button", { name: `${title} 예시 보기` });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.pointerEnter(trigger);
  const tooltip = screen.getByRole("tooltip");
  expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  expect(screen.getByRole("img")).toHaveAttribute("src", imageUrl);
  expect(screen.getByRole("img")).toHaveAccessibleName(expect.stringContaining(title));
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("keyboard focus and touch click open the example; outside pointer dismisses it", () => {
  render(<RuleExampleTooltip kind="three" imageUrl={imageUrl} />);
  const trigger = screen.getByRole("button", { name: "3-3 예시 보기" });
  fireEvent.focus(trigger);
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  fireEvent.keyDown(trigger, { key: "Escape" });
  fireEvent.click(trigger);
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("pointer can move into the tooltip and read it without it disappearing", () => {
  jest.useFakeTimers();
  try {
    render(<RuleExampleTooltip kind="four" imageUrl={imageUrl} />);
    const trigger = screen.getByRole("button", { name: "4-4 예시 보기" });
    fireEvent.pointerEnter(trigger);
    const tooltip = screen.getByRole("tooltip");
    fireEvent.pointerLeave(trigger);
    fireEvent.pointerEnter(tooltip);
    fireEvent.blur(trigger);
    act(() => jest.advanceTimersByTime(200));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(tooltip);
    act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test("resize and scrolling the modal dismiss the example instead of leaving it misplaced", () => {
  render(<RuleExampleTooltip kind="three" imageUrl={imageUrl} />);
  const trigger = screen.getByRole("button", { name: "3-3 예시 보기" });
  fireEvent.click(trigger);
  fireEvent.resize(window);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  fireEvent.scroll(document);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("Escape does not immediately reopen another example underneath the dismissed tooltip", () => {
  render(
    <>
      <RuleExampleTooltip kind="three" imageUrl={imageUrl} />
      <RuleExampleTooltip kind="four" imageUrl={imageUrl} />
    </>
  );
  const three = screen.getByRole("button", { name: "3-3 예시 보기" });
  const four = screen.getByRole("button", { name: "4-4 예시 보기" });
  fireEvent.pointerEnter(three);
  fireEvent.keyDown(three, { key: "Escape" });
  fireEvent.pointerEnter(four);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.pointerMove(document.body);
  fireEvent.pointerEnter(four);
  expect(screen.getByRole("tooltip")).toHaveTextContent("4-4 예시");
});
