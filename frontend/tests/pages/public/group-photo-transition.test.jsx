import { fireEvent, render } from "@testing-library/react";

import { fittedPhotoSize, useGroupPhotoTransition } from "../../../src/pages/groups/useGroupPhotoTransition.js";

test.each([
  [200, 100, 1000, 1000, "contain", "100px 100px"],
  [200, 100, 1000, 1000, "cover", "200px 200px"],
  [200, 100, 1200, 600, "cover", "200px 100px"],
  [410, 328, 1000, 1000, "contain", "328px 328px"]
])("preserves photo aspect ratio for %s x %s (%s x %s, %s)", (width, height, naturalWidth, naturalHeight, fit, expected) => {
  expect(fittedPhotoSize(width, height, naturalWidth, naturalHeight, fit)).toBe(expected);
});

function PhotoRoute({ path, source = "card", url = "/photo.png", loaded = true, width = 200 }) {
  useGroupPhotoTransition(path, source);
  return <div key={path} className={path === "/" ? "" : "group-detail-page"} data-group-transition-source={path === "/" || undefined}>
    <div className={path === "/" ? "" : "group-profile__art"} data-group-transition-image>
      <img alt="" ref={(element) => {
        if (!element) return;
        Object.defineProperties(element, {
          complete: { configurable: true, value: loaded },
          naturalWidth: { configurable: true, value: loaded ? 1000 : 0 },
          naturalHeight: { configurable: true, value: loaded ? 1000 : 0 }
        });
        element.getBoundingClientRect = () => ({ width, height: 100 });
      }} src={url} style={{ objectFit: "cover" }} />
    </div>
  </div>;
}

afterEach(() => {
  delete document.documentElement.dataset.groupPhotoMotion;
  document.documentElement.removeAttribute("style");
});

test("uses one source in both directions and reverses crop endpoints", () => {
  const { rerender } = render(<PhotoRoute path="/" />);
  const root = document.documentElement;
  expect(root).not.toHaveAttribute("data-group-photo-motion");
  rerender(<PhotoRoute path="/groups/42" width={800} />);
  expect(root).toHaveAttribute("data-group-photo-motion", "true");
  expect(root.style.getPropertyValue("--group-photo-from-size")).toBe("200px 200px");
  expect(root.style.getPropertyValue("--group-photo-to-size")).toBe("800px 800px");
  rerender(<PhotoRoute path="/" />);
  expect(root.style.getPropertyValue("--group-photo-from-size")).toBe("800px 800px");
  expect(root.style.getPropertyValue("--group-photo-to-size")).toBe("200px 200px");
});

test("falls back when a photo is unavailable or the source has changed", () => {
  const { rerender } = render(<PhotoRoute path="/" />);
  rerender(<PhotoRoute path="/groups/42" loaded={false} />);
  expect(document.documentElement).not.toHaveAttribute("data-group-photo-motion");
  rerender(<PhotoRoute path="/" />);
  rerender(<PhotoRoute path="/groups/42" url="/different.png" />);
  expect(document.documentElement).not.toHaveAttribute("data-group-photo-motion");
});

test("remembers a restored lazy image after it finishes loading", () => {
  const { rerender, container } = render(<PhotoRoute path="/" loaded={false} />);
  const image = container.querySelector("img");
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 1000 },
    naturalHeight: { configurable: true, value: 1000 }
  });
  fireEvent.load(image);
  rerender(<PhotoRoute path="/groups/42" width={800} />);
  expect(document.documentElement).toHaveAttribute("data-group-photo-motion", "true");
  expect(document.documentElement.style.getPropertyValue("--group-photo-from-size")).toBe("200px 200px");
});
