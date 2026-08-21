export const getCookieValue = (cookieSource, name) => {
  const prefix = `${name}=`;
  const matchingCookie = cookieSource
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));

  if (!matchingCookie) {
    return null;
  }

  try {
    return decodeURIComponent(matchingCookie.slice(prefix.length));
  } catch (error) {
    if (error instanceof URIError) {
      return null;
    }
    throw error;
  }
};
