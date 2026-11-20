import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GomokuSpectators } from "./GomokuSpectators";

const person = {
  memberId: 3,
  name: "봄날",
  avatarUrl: "https://avatars.githubusercontent.com/u/3"
};
const signal = (spectators) => ({ roomId: 1, spectators });
const view = (spectators = [person]) =>
  render(<GomokuSpectators connected signal={signal(spectators)} />);

function pointerOut(from, to) {
  // user-event omits relatedTarget on pointerout; preserve the browser's destination here.
  const event = new MouseEvent("pointerout", { bubbles: true, relatedTarget: to });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  fireEvent(from, event);
}

test("arrivals update only the count without revealing names or opening the roster", () => {
  const { rerender } = view([]);
  expect(screen.getByRole("button", { name: "관전자 0명" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  rerender(<GomokuSpectators connected signal={signal([person])} />);
  expect(screen.getByRole("button", { name: "관전자 1명" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.queryByText("봄날")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("hover shows live profiles and names, and leaving the whole area closes it immediately", async () => {
  const user = userEvent.setup();
  const { container, rerender } = view();
  const trigger = screen.getByRole("button", { name: "관전자 1명" });
  await user.hover(trigger);
  const panel = screen.getByRole("region", { name: "관전자 목록" });
  expect(within(panel).getByText("봄날")).toBeVisible();
  expect(within(panel).getByRole("img", { name: "봄날 프로필" })).toHaveAttribute(
    "src",
    person.avatarUrl
  );
  expect(container.firstChild).toHaveAttribute("data-ph-private");
  expect(trigger).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_spectators_toggle");
  pointerOut(trigger, panel);
  expect(panel).toBeVisible();
  rerender(
    <GomokuSpectators
      connected
      signal={signal([person, { memberId: 4, name: "여름", avatarUrl: null }])}
    />
  );
  expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
  expect(within(panel).getByLabelText("여름 프로필")).toHaveTextContent("여");
  fireEvent.error(within(panel).getByRole("img", { name: "봄날 프로필" }));
  expect(within(panel).getByLabelText("봄날 프로필")).toHaveTextContent("봄");
  pointerOut(panel, document.body);
  expect(screen.queryByRole("region", { name: "관전자 목록" })).not.toBeInTheDocument();
});

test("click toggles and outside press dismisses the roster", async () => {
  const user = userEvent.setup();
  view();
  const trigger = screen.getByRole("button", { name: "관전자 1명" });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  await user.click(document.body);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("keyboard focus opens the roster, Tab reaches its scroll area, and Escape returns focus", async () => {
  const user = userEvent.setup();
  view();
  const trigger = screen.getByRole("button", { name: "관전자 1명" });
  await user.tab();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.tab();
  expect(screen.getByRole("region", { name: "관전자 목록" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.tab();
  expect(screen.queryByRole("region", { name: "관전자 목록" })).not.toBeInTheDocument();
});

test("empty and disconnected states do not keep a stale roster open", async () => {
  const user = userEvent.setup();
  const { rerender } = view([]);
  await user.click(screen.getByRole("button", { name: "관전자 0명" }));
  expect(screen.getByText("아직 관전 중인 사람이 없어요.")).toBeVisible();
  rerender(<GomokuSpectators connected={false} signal={signal([person])} />);
  expect(screen.getByText("관전자 확인 중")).toBeVisible();
  expect(screen.queryByRole("region", { name: "관전자 목록" })).not.toBeInTheDocument();
  rerender(<GomokuSpectators connected signal={signal([person])} />);
  expect(screen.getByRole("button", { name: "관전자 1명" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
});
