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

  it("keeps the signup character selection fixed and spaced", () => {
    const formDeclarations = declarationsFor(".signup-form {");
    const promptDeclarations = declarationsFor(".signup-form__prompt");
    const optionDeclarations = declarationsFor(".signup-type-options");
    const buttonDeclarations = declarationsFor(".signup-type-option {");
    const selectedDeclarations = declarationsFor('.signup-type-option[aria-checked="true"]');
    const imageDeclarations = declarationsFor(".signup-type-option__image");
    const imageFrameDeclarations = declarationsFor(".signup-type-option__image-frame");
    const profileMovementDeclarations = declarationsFor(".signup-form--profile .signup-type-step");
    const crewMovementDeclarations = declarationsFor(".signup-form--crew .signup-type-step");
    const crewProfileDeclarations = declarationsFor(".signup-form--crew .signup-form__profile-panel");
    const actionDeclarations = declarationsFor(".signup-form__profile-actions");
    const coachProfileVisualDeclarations = declarationsFor(
      ".signup-form--profile:not(.signup-form--crew) .signup-form__profile-heading,"
    );
    const profilePanelDeclarations = declarationsFor(".signup-form__profile-panel {");

    expect(formDeclarations).toContain("border: 0");
    expect(promptDeclarations).toContain("color: var(--color-ink)");
    expect(promptDeclarations).toContain("font-size: var(--text-body-lg)");
    expect(promptDeclarations).toContain("text-align: center");
    expect(optionDeclarations).toContain("width: 100%");
    expect(optionDeclarations).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(optionDeclarations).toContain("gap: var(--space-10)");
    expect(buttonDeclarations).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(buttonDeclarations).toContain("width: 100%");
    expect(selectedDeclarations).toContain("border-bottom-color: var(--color-brand)");
    expect(selectedDeclarations).toContain("background: transparent");
    expect(selectedDeclarations).toContain("color: var(--color-ink)");
    expect(imageFrameDeclarations).toContain("width: min(100%, var(--signup-type-image-size))");
    expect(imageFrameDeclarations).toContain("aspect-ratio: 1");
    expect(imageDeclarations).toContain("width: min(50%, var(--signup-type-image-base-size))");
    expect(imageDeclarations).toContain("height: auto");
    expect(imageDeclarations).toContain("transform: scale(2)");
    expect(imageDeclarations).toContain("transform-origin: center");
    expect(profileMovementDeclarations).toContain("grid-column: 1");
    expect(profileMovementDeclarations).toContain("transform: translateX(calc(var(--space-2) * -1))");
    expect(crewMovementDeclarations).toContain("grid-column: 2");
    expect(crewMovementDeclarations).toContain("transform: translateX(var(--space-2))");
    expect(crewProfileDeclarations).toContain("grid-column: 1");
    expect(profilePanelDeclarations).toContain("grid-column: 2");
    expect(actionDeclarations).toContain("grid-column: 1 / -1");
    expect(actionDeclarations).toContain("width: min(100%, calc((100% - var(--space-4)) / 2))");
    expect(actionDeclarations).toContain("justify-self: center");
    expect(coachProfileVisualDeclarations).toContain(
      "transform: translateY(calc(var(--space-16) * -1 + var(--space-2) - var(--border-thin)))"
    );
    expect(profilePanelDeclarations).toContain("grid-row: 1");
    expect(profilePanelDeclarations).toContain("align-self: end");
  });
});
