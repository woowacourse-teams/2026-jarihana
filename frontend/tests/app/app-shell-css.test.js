import fs from "node:fs";
import path from "node:path";

const appShellCss = fs.readFileSync(path.resolve(__dirname, "../../src/app/AppShell.css"), "utf8");
const tokensCss = fs.readFileSync(
  path.resolve(__dirname, "../../src/shared/styles/tokens.css"),
  "utf8"
);

function readHexToken(name) {
  return tokensCss.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

it("keeps the brand-filled signup continuation action readable", () => {
  // Given
  const authRule = appShellCss.match(/\.app-header__auth\s*\{([^}]*)\}/)?.[1];
  const foreground = readHexToken("color-ink");
  const background = readHexToken("color-brand");

  // When / Then
  expect(authRule).toMatch(/color:\s*var\(--color-ink\)/);
  expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
});

it("uses a full-width header background with shell-aligned inner content", () => {
  // Given
  const promotedTokens = [
    "--text-brand:",
    "--font-weight-semibold:",
    "--font-weight-bold:",
    "--font-weight-extrabold:",
    "--tracking-brand:",
    "--touch-target:",
    "--border-thin:",
    "--header-auth-placeholder-width:",
    "--header-active-line-width:"
  ];

  // When / Then
  expect(appShellCss).not.toMatch(/:root\s*\{/);
  expect(appShellCss.match(/\.app-shell\s*\{([^}]*)\}/)?.[1]).toMatch(
    /background:\s*var\(--color-surface\)/
  );
  expect(appShellCss.match(/\.app-header\s*\{([^}]*)\}/)?.[1]).toMatch(/width:\s*100%/);
  expect(appShellCss.match(/\.app-header__inner\s*\{([^}]*)\}/)?.[1]).toMatch(
    /max-width:\s*var\(--container-shell\)[\s\S]*margin:\s*0 auto[\s\S]*padding:\s*0 var\(--page-gutter\)/
  );
  expect(appShellCss).toMatch(
    /@media \(min-width: 48rem\)[\s\S]*\.app-header__inner\s*\{[\s\S]*grid-template-columns:\s*1fr auto 1fr/
  );
  promotedTokens.forEach((token) => expect(tokensCss).toContain(token));
  expect(appShellCss).toContain("font-size: var(--text-brand)");
  expect(appShellCss).toContain("font-weight: var(--font-weight-extrabold)");
  expect(appShellCss).toContain("font-weight: var(--font-weight-semibold)");
  expect(appShellCss).toContain("font-weight: var(--font-weight-bold)");
  expect(appShellCss).toContain("letter-spacing: var(--tracking-brand)");
  expect(appShellCss).toContain("min-height: var(--touch-target)");
  expect(appShellCss).toContain("border: var(--border-thin) solid var(--color-header-line)");
  expect(appShellCss).toContain("width: var(--header-auth-placeholder-width)");
  expect(appShellCss).toContain("height: var(--header-active-line-width)");
});
