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

describe("signup profile layout", () => {
  it("keeps the coach and crew profile panels opposite their selected type", () => {
    expect(declarationsFor(".signup-form--profile .signup-type-step")).toContain(
      "grid-column: 2"
    );
    expect(declarationsFor(".signup-form--crew .signup-type-step")).toContain("grid-column: 1");
    expect(declarationsFor(".signup-form__profile-panel {")).toContain("grid-column: 1");
    expect(declarationsFor(".signup-form--crew .signup-form__profile-panel")).toContain(
      "grid-column: 2"
    );
  });
});
