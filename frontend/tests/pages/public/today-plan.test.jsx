import { render, screen } from "@testing-library/react";

import { TodayPlan } from "../../../src/pages/groups/home/TodayPlan.jsx";

jest.mock("react-router", () => ({ Link: () => null }));

const groups = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  name: `일정 ${index + 1}`,
  activeRecruitment: null,
  sessionSchedule: { startTime: "09:00", endTime: "10:00" }
}));

function rowAt(container, offset) {
  return [...container.querySelectorAll(".today-plan__item")].find(
    (row) => Number(row.style.getPropertyValue("--today-plan-row-offset")) === offset
  );
}

it("starts with the last appointments above the centered first appointment", () => {
  const { container } = render(<TodayPlan activePosition={0} groups={groups} />);
  expect(rowAt(container, -2)).toHaveTextContent("일정 5");
  expect(rowAt(container, -1)).toHaveTextContent("일정 6");
  expect(rowAt(container, 0)).toHaveTextContent("일정 1");
  expect(rowAt(container, 1)).toHaveTextContent("일정 2");
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByRole("listitem")).toBe(rowAt(container, 0));
});

it("keeps the same row nodes moving one step across the last-to-first boundary", () => {
  const { container, rerender } = render(
    <TodayPlan activePosition={5} groups={groups} />
  );
  const last = rowAt(container, 0);
  const first = rowAt(container, 1);
  rerender(<TodayPlan activePosition={6} groups={groups} />);
  expect(rowAt(container, -1)).toBe(last);
  expect(rowAt(container, 0)).toBe(first);
  expect(screen.getByRole("listitem")).toHaveTextContent("일정 1");
  rerender(<TodayPlan activePosition={5} groups={groups} />);
  expect(rowAt(container, 0)).toBe(last);
  expect(rowAt(container, 1)).toBe(first);
});

it("repeats two appointments on both sides without exposing duplicate accessible rows", () => {
  const { container, rerender } = render(
    <TodayPlan activePosition={0} groups={groups.slice(0, 2)} />
  );
  const previous = rowAt(container, -1);
  expect(previous).toHaveTextContent("일정 2");
  expect(rowAt(container, 1)).toHaveTextContent("일정 2");
  rerender(<TodayPlan activePosition={-1} groups={groups.slice(0, 2)} />);
  expect(rowAt(container, 0)).toBe(previous);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});

it("keeps a bounded set of rows across many rotations and replaces changed data", () => {
  const { container, rerender } = render(
    <TodayPlan activePosition={600} groups={groups} />
  );
  expect(container.querySelectorAll(".today-plan__item")).toHaveLength(9);
  expect(screen.getByRole("listitem")).toHaveTextContent("일정 1");
  rerender(<TodayPlan activePosition={601} groups={groups.slice(0, 2)} />);
  expect(screen.getByRole("listitem")).toHaveTextContent("일정 2");
  expect(container).not.toHaveTextContent("일정 3");
});

it("renders one appointment only once and handles an empty list", () => {
  const { container, rerender } = render(
    <TodayPlan activePosition={0} groups={groups.slice(0, 1)} />
  );
  expect(container.querySelectorAll(".today-plan__item")).toHaveLength(1);
  expect(rowAt(container, 0)).toHaveTextContent("일정 1");
  rerender(<TodayPlan activePosition={0} groups={[]} />);
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
});
