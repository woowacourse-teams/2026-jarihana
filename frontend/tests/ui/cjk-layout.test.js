const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(process.cwd(), "src/shared/styles/ui.css"), "utf8");
const showcase = fs.readFileSync(path.join(process.cwd(), "src/pages/ShowcasePage.jsx"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`[^{}]*${escaped}[^{}]*\\{([^}]+)\\}`))?.[1] || "";
}

describe("Korean-safe shared layouts", () => {
  it.each([
    ".ui-group-card__title",
    ".ui-recruitment-card__title",
    ".ui-state__title",
    ".ui-state__description"
  ])(
    "Given narrow Korean copy in %s, When it wraps, Then whole words are preferred with an overflow fallback",
    (selector) => {
      const declaration = rule(selector);
      expect(declaration).toContain("word-break: keep-all");
      expect(declaration).toContain("overflow-wrap: anywhere");
    }
  );

  it("Given the 360px showcase grid, When cards reflow, Then columns and children can shrink without horizontal clipping", () => {
    const mobileRule =
      css.match(
        /@media \(max-width: 47\.9375rem\) \{([\s\S]+)\}\s*@media \(prefers-reduced-motion/
      )?.[1] || "";
    expect(mobileRule).toMatch(
      /\.ui-showcase__grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/
    );
    expect(rule(".ui-showcase__grid > *")).toContain("min-width: 0");
  });

  it("Given the showcase loading specimen, When its height is styled, Then JSX contains no raw inline height", () => {
    expect(showcase).toContain('className="ui-showcase__skeleton"');
    expect(showcase).not.toContain('style={{ height: "14rem" }}');
    expect(rule(".ui-showcase__skeleton")).toContain("height: var(--showcase-skeleton-height)");
  });
});
