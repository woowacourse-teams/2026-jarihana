import { render, screen } from "@testing-library/react";
import { GomokuChat } from "./GomokuChat";

function message(id, senderId = "1", createdAt = "2026-11-05T20:50:05") {
  return { id, senderId, createdAt, author: "상대", content: `메시지 ${id}` };
}

function conversation(messages) {
  return (
    <GomokuChat
      chat={{ messages, pending: [] }}
      memberId="1"
      connected
      closed={false}
      playing={false}
      seconds={60}
    />
  );
}

test("moves the minute timestamp to the last consecutive message", () => {
  const first = message("1");
  const { rerender } = render(conversation([first]));
  expect(screen.getByText("20:50", { selector: "time" })).toBeVisible();

  rerender(conversation([first, message("2", "1", "2026-11-05T20:50:59")]));
  const bubbles = screen.getAllByRole("article");
  expect(bubbles[0]).toHaveTextContent("메시지 1");
  expect(bubbles[1]).toHaveTextContent("메시지 2");
  expect(bubbles[0].querySelector("time")).toBeNull();
  expect(bubbles[1].querySelector("time")).toHaveTextContent("20:50");
});

test.each([
  ["sender", "3", "2026-11-05T20:50:59"],
  ["minute", "2", "2026-11-05T20:51:00"],
  ["date", "2", "2026-11-06T20:50:05"]
])("keeps separate authors and timestamps when the %s changes", (_boundary, senderId, createdAt) => {
  render(conversation([message("1", "2"), message("2", senderId, createdAt)]));
  for (const bubble of screen.getAllByRole("article")) {
    expect(bubble.querySelector("time")).toBeVisible();
    expect(bubble.querySelector(".gomoku-chat__author")).toBeVisible();
  }
});

test.each(["PARTICIPANT"])(
  "shows the %s author only above the first consecutive message",
  (senderRole) => {
    const messages = [message("1", "2"), message("2", "2", "2026-11-05T20:50:59")].map(
      (item) => ({ ...item, senderRole })
    );
    render(conversation(messages));
    const bubbles = screen.getAllByRole("article");
    expect(bubbles[0].querySelector(".gomoku-chat__author")).toHaveTextContent(
      "상대"
    );
    expect(bubbles[1].querySelector(".gomoku-chat__author")).toBeNull();
    expect(bubbles[0].querySelector("time")).toBeNull();
    expect(bubbles[1].querySelector("time")).toBeVisible();
  }
);

test("keeps timestamps on messages separated by another sender", () => {
  render(conversation([message("1"), message("2", "2"), message("3")]));
  expect(screen.getAllByText("20:50", { selector: "time" })).toHaveLength(3);
});
