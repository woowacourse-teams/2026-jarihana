import {
  resolveAuthenticatedAccess,
  resolveLeaderAccess,
  resolveSignupAccess
} from "../../src/app/routeAccess";

describe("authenticated route access", () => {
  it("returns a loading decision while the cookie session is bootstrapping", () => {
    // Given
    const authStatus = "loading";

    // When
    const decision = resolveAuthenticatedAccess(authStatus);

    // Then
    expect(decision).toEqual({ kind: "loading" });
  });

  it("preserves the deep link when an anonymous visitor reaches a protected route", () => {
    // Given
    const authStatus = "anonymous";

    // When
    const decision = resolveAuthenticatedAccess(authStatus, "/my/registrations?status=PENDING");

    // Then
    expect(decision).toEqual({
      kind: "redirect",
      state: {
        from: "/my/registrations?status=PENDING",
        loginRequired: true
      },
      to: "/groups"
    });
  });

  it("sends an incomplete signup session to signup", () => {
    // Given
    const authStatus = "signup-required";

    // When
    const decision = resolveAuthenticatedAccess(authStatus, "/groups/new");

    // Then
    expect(decision).toEqual({
      kind: "redirect",
      state: { from: "/groups/new" },
      to: "/signup"
    });
  });

  it("allows an authenticated member to continue", () => {
    // Given
    const authStatus = "authenticated";

    // When
    const decision = resolveAuthenticatedAccess(authStatus, "/my");

    // Then
    expect(decision).toEqual({ kind: "allow" });
  });

  it("keeps an unavailable auth service out of both protected content and login redirects", () => {
    expect(resolveAuthenticatedAccess("unavailable", "/my")).toEqual({
      kind: "unavailable"
    });
  });
});

describe("leader route access", () => {
  it("allows only the member named by the server group detail", () => {
    // Given
    const memberId = 31;
    const leaderMemberId = 31;

    // When
    const decision = resolveLeaderAccess(memberId, leaderMemberId);

    // Then
    expect(decision).toEqual({ kind: "allow" });
  });

  it("forbids a signed-in non-leader", () => {
    // Given
    const memberId = 31;
    const leaderMemberId = 44;

    // When
    const decision = resolveLeaderAccess(memberId, leaderMemberId);

    // Then
    expect(decision).toEqual({ kind: "forbidden" });
  });
});

describe("signup route access", () => {
  it("keeps an incomplete signup session on the signup route", () => {
    expect(resolveSignupAccess("signup-required")).toEqual({ kind: "allow" });
  });

  it("returns a completed member only to a safe internal deep link", () => {
    expect(resolveSignupAccess("authenticated", "/groups/91")).toEqual({
      kind: "redirect",
      to: "/groups/91"
    });
    expect(resolveSignupAccess("authenticated", "//malicious.example")).toEqual({
      kind: "redirect",
      to: "/my"
    });
  });

  it("does not expose the signup form to a plain anonymous visitor", () => {
    expect(resolveSignupAccess("anonymous")).toEqual({
      kind: "redirect",
      state: { from: "/signup", loginRequired: true },
      to: "/groups"
    });
  });

  it("shows recovery instead of a signup form when auth is unavailable", () => {
    expect(resolveSignupAccess("unavailable")).toEqual({ kind: "unavailable" });
  });
});
