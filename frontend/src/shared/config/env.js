export const getOAuthConfig = () => {
  return Object.freeze({
    clientId: process.env.APP_GITHUB_CLIENT_ID ?? "",
    cookieDomain: process.env.APP_OAUTH_COOKIE_DOMAIN || undefined,
    cookieName: process.env.APP_OAUTH_COOKIE_NAME || "oauthState",
    redirectUri: process.env.APP_GITHUB_REDIRECT_URI ?? ""
  });
};
