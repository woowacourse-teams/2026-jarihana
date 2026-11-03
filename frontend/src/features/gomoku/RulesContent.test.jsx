import { render, screen, within } from "@testing-library/react";
import { RulesContent } from "./RulesContent";

test("standard rules separate winning conditions, black-only restrictions and play instructions", () => {
  render(<RulesContent rule="RENJU" />);
  const win = screen.getByRole("region", { name: "승리 조건" });
  expect(within(win).getByText("정확히 5개")).toBeVisible();
  expect(within(win).getByText("5개 이상")).toBeVisible();
  const restrictions = screen.getByRole("region", { name: "흑돌이 둘 수 없는 수" });
  expect(within(restrictions).getByRole("button", { name: "3-3 예시 보기" })).toBeEnabled();
  expect(within(restrictions).getByRole("button", { name: "4-4 예시 보기" })).toBeEnabled();
  expect(screen.getByRole("region", { name: "진행 방법" })).toHaveTextContent("자리하기");
});

test("unrestricted rules apply the same win condition to both colors without showing forbidden examples", () => {
  render(<RulesContent rule="FREESTYLE" />);
  expect(screen.getAllByText("5개 이상")).toHaveLength(2);
  expect(screen.queryByRole("region", { name: "흑돌이 둘 수 없는 수" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /예시 보기/ })).not.toBeInTheDocument();
});
