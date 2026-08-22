const fs = require("node:fs");
const path = require("node:path");

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => channel(Number.parseInt(value, 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function token(source, name) {
  return source.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
}

describe("text role color tokens", () => {
  it.each([
    ["--color-brand-ink", "brand"],
    ["--color-muted-ink", "muted"]
  ])(
    "Given the %s role, When used on supported light surfaces, Then every contrast is WCAG AA",
    (name) => {
      const source = fs.readFileSync(
        path.join(process.cwd(), "src/shared/styles/tokens.css"),
        "utf8"
      );
      const foreground = token(source, name);
      const backgrounds = ["--color-surface", "--color-canvas", "--color-brand-soft"].map(
        (background) => token(source, background)
      );

      expect(foreground).toBeDefined();
      for (const background of backgrounds)
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
