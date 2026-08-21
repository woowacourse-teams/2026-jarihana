import {
  clearOAuthState,
  createGithubAuthorizationUrl,
  readOAuthState
} from "../../src/features/auth";

describe("GitHub OAuth state", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (bytes) => {
          bytes.fill(171);
          return bytes;
        }
      }
    });
    document.cookie = "oauthState=; Max-Age=0; Path=/";
  });

  test("Given public OAuth config, when creating the authorize URL, then it stores state and returns a GitHub URL", () => {
    // Given / When
    const url = createGithubAuthorizationUrl({
      clientId: "github-client",
      redirectUri: "https://app.test/oauth/callback"
    });

    // Then
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("github-client");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.test/oauth/callback");
    expect(parsed.searchParams.get("state")).toBe(
      "abababababababababababababababababababababababababababababababab"
    );
    expect(readOAuthState()).toBe(parsed.searchParams.get("state"));
  });

  test("Given a stored OAuth state, when clearing it, then it can no longer be read", () => {
    // Given
    document.cookie = "oauthState=state-value; Path=/; SameSite=Lax";

    // When
    clearOAuthState();

    // Then
    expect(readOAuthState()).toBeNull();
  });
});
