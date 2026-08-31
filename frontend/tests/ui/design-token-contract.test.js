const fs = require("node:fs");
const path = require("node:path");

describe("shared UI design token contract", () => {
  it("Given shared border and touch geometry, When CSS is authored, Then repeated scale literals use their semantic tokens", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/shared/styles/ui.css"), "utf8");

    expect(css).not.toMatch(/0\.0625rem/);
    expect(css).not.toMatch(/2\.75rem/);
    expect(css).toContain("var(--border-thin)");
    expect(css).toContain("var(--touch-target)");
  });

  it("gives Markdown tables subtle borders using the shared line token", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/shared/styles/ui.css"), "utf8");

    expect(css).toContain(".ui-markdown table {");
    expect(css).toContain("border-collapse: collapse;");
    expect(css).toContain(".ui-markdown th,");
    expect(css).toContain("border: var(--border-thin) solid var(--color-line);");
  });
});
