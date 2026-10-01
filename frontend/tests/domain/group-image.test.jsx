import { fireEvent, render, screen } from "@testing-library/react";

import { DEFAULT_GROUP_IMAGE, GroupImage, groupImageUrl } from "../../src/shared/ui/Cards.jsx";

const defaults = [
  ["CLUB", "/assets/default-group-club-3d.png"],
  ["STUDY", "/assets/default-group-study-3d.png"],
  ["SESSION", "/assets/default-group-session-3d.png"]
];

describe.each(defaults)("%s representative image", (type, fallback) => {
  it.each([
    null,
    undefined,
    "",
    "images/default-group.png",
    "/images/default-group.png",
    "/api/images/default-group.png",
    "https://cdn.example.com/images/default-group.png?version=2"
  ])("replaces the missing or generic image %s", (representativeImageUrl) => {
    expect(groupImageUrl({ type, representativeImageUrl })).toBe(fallback);
  });

  it("preserves an uploaded image URL and its query string", () => {
    const representativeImageUrl = "https://cdn.example.com/images/photo.png?version=2";
    expect(groupImageUrl({ type, representativeImageUrl })).toBe(representativeImageUrl);
  });

  it("uses the type default on load failure without repeatedly requesting a broken fallback", () => {
    render(
      <GroupImage alt="대표 이미지" group={{ type, representativeImageUrl: "/broken.png" }} />
    );
    const image = screen.getByRole("img", { name: "대표 이미지" });
    const setAttribute = jest.spyOn(image, "setAttribute");
    expect(image).not.toHaveClass("ui-group-image--type-default");
    fireEvent.error(image);
    expect(image).toHaveClass("ui-group-image--type-default");
    expect(image.src).toBe(new URL(fallback, window.location.origin).href);
    expect(setAttribute.mock.calls.filter(([name]) => name === "src")).toHaveLength(1);
    fireEvent.error(image);
    expect(setAttribute.mock.calls.filter(([name]) => name === "src")).toHaveLength(1);
    setAttribute.mockRestore();
  });
});

it("keeps the generic fallback for a missing or unknown group type", () => {
  expect(groupImageUrl()).toBe(DEFAULT_GROUP_IMAGE);
  expect(groupImageUrl({ type: "UNKNOWN" })).toBe(DEFAULT_GROUP_IMAGE);
});

it("does not replace an uploaded file just because its filename resembles the default", () => {
  const representativeImageUrl = "https://cdn.example.com/uploads/default-group.png";
  expect(groupImageUrl({ type: "STUDY", representativeImageUrl })).toBe(representativeImageUrl);
});

it("removes default-image framing when a real photo replaces a failed upload", () => {
  const { rerender } = render(
    <GroupImage alt="대표 이미지" group={{ type: "CLUB", representativeImageUrl: "/broken.png" }} />
  );
  const image = screen.getByRole("img", { name: "대표 이미지" });
  fireEvent.error(image);
  expect(image).toHaveClass("ui-group-image--type-default");
  rerender(
    <GroupImage
      alt="대표 이미지"
      group={{ type: "CLUB", representativeImageUrl: "/uploaded.png" }}
    />
  );
  expect(image).toHaveAttribute("src", "/uploaded.png");
  expect(image).not.toHaveClass("ui-group-image--type-default");
});
