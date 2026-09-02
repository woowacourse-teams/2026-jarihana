/** @jest-environment node */

import { readFileSync } from "node:fs";

const manageCss = readFileSync(`${process.cwd()}/src/pages/manage/manage.css`, "utf8");

describe("management text color tokens", () => {
  it("uses contrast-safe semantic aliases instead of decorative brand or muted colors for text", () => {
    expect(manageCss).not.toMatch(/color:\s*var\(--color-brand-strong\)/);
    expect(manageCss).not.toMatch(/color:\s*var\(--color-muted\)/);
    expect(manageCss).toContain("color: var(--color-brand-ink)");
    expect(manageCss).toContain("color: var(--color-muted-ink)");
  });

  it("keeps Korean words intact on narrow management screens and centralizes repeated border values", () => {
    expect(manageCss).toContain("word-break: keep-all");
    expect(manageCss).not.toMatch(/word-break:\s*break-all|overflow-wrap:\s*anywhere/);
    expect(manageCss.match(/border:\s*1px/g) ?? []).toHaveLength(0);
    expect(manageCss).toContain("border: var(--border-thin) solid var(--color-line)");
    expect(manageCss).toContain("min-height: var(--touch-target)");
    expect(manageCss).toContain("@media (max-width: 47.9375rem)");
  });

  it("uses the final2 operational density and reflows before tablet labels become narrow", () => {
    expect(manageCss).toContain(".manage-page--dashboard");
    expect(manageCss).toContain(".manage-status-filters");
    expect(manageCss).toContain(".manage-status-select");
    expect(manageCss).toContain(".manage-registration-card");
    expect(manageCss).toContain(".manage-recruitment-approved-members");
    expect(manageCss).toContain(".manage-page--registrations .ui-state--neutral .ui-state__mark");
    expect(manageCss).toContain("background: transparent");
    expect(manageCss).toContain("@media (max-width: 64rem)");
    expect(manageCss).toContain("--manage-rail-min");
  });

  it("keeps the pending application badge compact while allowing larger counts to grow", () => {
    expect(manageCss).toContain("box-sizing: border-box");
    expect(manageCss).toContain("min-inline-size: var(--space-5)");
    expect(manageCss).toContain("min-block-size: var(--space-5)");
    expect(manageCss).toContain("padding-inline: var(--space-1)");
  });
});
