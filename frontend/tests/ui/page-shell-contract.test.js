import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../");
const tokensCss = readFileSync(resolve(root, "src/shared/styles/tokens.css"), "utf8");
const sharedCss = readFileSync(resolve(root, "src/shared/styles/ui.css"), "utf8");
const accountCss = readFileSync(resolve(root, "src/pages/account/account.css"), "utf8");
const groupsCss = readFileSync(resolve(root, "src/pages/groups/groups.css"), "utf8");
const manageCss = readFileSync(resolve(root, "src/pages/manage/manage.css"), "utf8");
const editorCss = readFileSync(resolve(root, "src/pages/group-editor/styles.css"), "utf8");

describe("page shell spacing contract", () => {
  it("uses the root page gutter at every responsive breakpoint", () => {
    expect(tokensCss).toMatch(/--container-shell:\s*76rem/);
    expect(tokensCss).toMatch(/@media \(min-width: 64rem\)[\s\S]*--page-gutter:\s*var\(--groups-page-rail-gutter\)/);
  });

  it.each([
    ["shared page container", sharedCss],
    ["account page", accountCss],
    ["group detail page", groupsCss],
    ["management page", manageCss],
    ["group editor", editorCss]
  ])("%s uses the shared shell and gutter tokens", (_name, css) => {
    expect(css).toContain("var(--container-shell)");
    expect(css).toContain("var(--page-gutter)");
  });
});
