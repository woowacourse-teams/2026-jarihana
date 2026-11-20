import { render, screen } from "@testing-library/react";
import { ChairStackSky } from "./ChairStackSky";

test.each([
  [0, "0 m", "day"],
  [4, "400 m", "day"],
  [5, "500 m", "twilight"],
  [9, "900 m", "twilight"],
  [10, "1,000 m", "aurora"],
  [14, "1,400 m", "aurora"],
  [15, "1,500 m", "space"],
  [16, "1,600 m", "space"]
])("selects the sky for %i successfully stacked chairs", (count, altitude, sky) => {
  const run = { placements: Array.from({ length: count }) };
  const { container } = render(<ChairStackSky run={run} />);

  expect(screen.getByText(altitude)).toBeVisible();
  expect(container.querySelector(".chair-stack-sky")).toHaveAttribute("data-sky", sky);
});
