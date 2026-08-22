import { getOAuthConfig } from "../../src/shared/config";

test("Given public build variables, when reading OAuth config, then it exposes only public settings", () => {
  // Given
  const previousEnvironment = { ...process.env };
  process.env.APP_GITHUB_CLIENT_ID = "github-client";
  process.env.APP_GITHUB_REDIRECT_URI = "https://app.test/api/oauth/github/callback";
  process.env.APP_OAUTH_COOKIE_NAME = "customState";
  process.env.APP_OAUTH_COOKIE_DOMAIN = ".app.test";

  try {
    // When
    const config = getOAuthConfig();

    // Then
    expect(config).toEqual({
      clientId: "github-client",
      cookieDomain: ".app.test",
      cookieName: "customState",
      redirectUri: "https://app.test/api/oauth/github/callback"
    });
  } finally {
    process.env = previousEnvironment;
  }
});
