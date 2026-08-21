export function resolveAuthenticatedAccess(status, currentPath = "/") {
  if (status === "loading") {
    return { kind: "loading" };
  }

  if (status === "anonymous") {
    return {
      kind: "redirect",
      state: { from: currentPath, loginRequired: true },
      to: "/groups"
    };
  }

  if (status === "signup-required") {
    return {
      kind: "redirect",
      state: { from: currentPath },
      to: "/signup"
    };
  }

  if (status === "unavailable") {
    return { kind: "unavailable" };
  }

  return { kind: "allow" };
}

export function resolveLeaderAccess(memberId, leaderMemberId) {
  if (memberId === leaderMemberId) {
    return { kind: "allow" };
  }

  return { kind: "forbidden" };
}

export function resolveSignupAccess(status, returnTo) {
  if (status === "loading") {
    return { kind: "loading" };
  }

  if (status === "unavailable") {
    return { kind: "unavailable" };
  }

  if (status === "anonymous") {
    return {
      kind: "redirect",
      state: { from: "/signup", loginRequired: true },
      to: "/groups"
    };
  }

  if (status !== "authenticated") {
    return { kind: "allow" };
  }

  const safeReturnTo =
    typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/my";
  return { kind: "redirect", to: safeReturnTo };
}
