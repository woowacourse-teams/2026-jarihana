import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const accountCss = readFileSync(
  resolve(__dirname, "../../../src/pages/account/account.css"),
  "utf8"
);

function declarationsFor(selector) {
  const selectorStart = accountCss.indexOf(selector);
  const blockStart = accountCss.indexOf("{", selectorStart);
  const blockEnd = accountCss.indexOf("}", blockStart);

  return accountCss.slice(blockStart + 1, blockEnd);
}

describe("account Korean text wrapping", () => {
  it("keeps group card titles and descriptions on Korean word boundaries with a narrow fallback", () => {
    expect(declarationsFor(".account-card h3,")).toContain("word-break: keep-all");
    expect(declarationsFor(".account-card > p,")).toContain("word-break: keep-all");
    expect(declarationsFor(".account-card > p,")).toContain("overflow-wrap: anywhere");
  });

  it("balances the signup heading without splitting Korean phrases", () => {
    const headingDeclarations = declarationsFor(".account-heading h1");

    expect(headingDeclarations).toContain("text-wrap: balance");
    expect(headingDeclarations).toContain("word-break: keep-all");
  });

  it("uses the shared mint background behind transparent group thumbnails", () => {
    expect(declarationsFor(".activity-row__visual")).toContain(
      "background: var(--color-brand-soft)"
    );
  });
});
