import { fireEvent, render, screen } from "@testing-library/react";

import {
  isDefaultGroupImageUrl,
  representativeImageKeyFromUrl
} from "../../src/features/image-upload/api.js";
import { GroupImage } from "../../src/shared/ui/Cards.jsx";

it.each([
  null,
  "images/default-group.png",
  "/images/default-group.png",
  "/api/images/default-group.png",
  "https://cdn.example.com/images/default-group.png?version=1",
  "/assets/default-group.png"
])("renders the static asset for a missing or default image: %s", (representativeImageUrl) => {
  render(<GroupImage alt="모임 대표 이미지" group={{ representativeImageUrl }} />);

  expect(screen.getByRole("img")).toHaveAttribute("src", "/assets/default-group.png");
  expect(representativeImageKeyFromUrl(representativeImageUrl)).toBeNull();
});

it("recognizes the asset path as a default when editing a group", () => {
  expect(isDefaultGroupImageUrl("/assets/default-group.png")).toBe(true);
});

it("preserves uploaded image URLs and storage keys", () => {
  const representativeImageUrl = "https://dev.jarihana.com/images/groups/tmp/upload.webp";

  render(<GroupImage alt="업로드 이미지" group={{ representativeImageUrl }} />);

  expect(screen.getByRole("img")).toHaveAttribute("src", representativeImageUrl);
  expect(isDefaultGroupImageUrl(representativeImageUrl)).toBe(false);
  expect(representativeImageKeyFromUrl(representativeImageUrl)).toBe("groups/tmp/upload.webp");
});

it("uses the static asset if an uploaded image fails to load", () => {
  render(<GroupImage alt="업로드 이미지" group={{ representativeImageUrl: "/images/groups/lost.webp" }} />);

  fireEvent.error(screen.getByRole("img"));

  expect(screen.getByRole("img").src).toBe(`${window.location.origin}/assets/default-group.png`);
});
