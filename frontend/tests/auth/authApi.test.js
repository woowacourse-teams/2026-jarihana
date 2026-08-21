/** @jest-environment node */

import { bootstrapAuth, getMe, logout } from "../../src/features/auth";

const member = {
  avatarUrl: "https://avatars.githubusercontent.com/u/123",
  course: "FRONTEND",
  crewName: "자리",
  generation: 7,
  id: 12
};

describe("auth API", () => {
  test("Given a member response, when getMe runs, then it validates the profile shape", async () => {
    // Given
    const client = { request: async () => ({ member, signupCompleted: true }) };

    // When
    const result = await getMe(client);

    // Then
    expect(result).toEqual({ member, signupCompleted: true });
  });

  test("Given an authenticated session, when logout runs, then it calls the logout endpoint", async () => {
    // Given
    const requests = [];
    const client = { request: async (path, options) => requests.push({ options, path }) };

    // When
    await logout(client);

    // Then
    expect(requests).toEqual([{ options: { method: "POST" }, path: "auth/logout" }]);
  });

  test("Given initial me is unauthenticated, when bootstrap runs, then it refreshes once and reads me again", async () => {
    // Given
    const events = [];
    const me = async () => {
      events.push("me");
      if (events.length === 1) {
        throw Object.assign(new Error("expired"), { code: "UNAUTHENTICATED", status: 401 });
      }
      return { member, signupCompleted: true };
    };
    const refresh = async () => events.push("refresh");

    // When
    const result = await bootstrapAuth({ getMe: me, refresh });

    // Then
    expect(result).toEqual({ member, signupCompleted: true });
    expect(events).toEqual(["me", "refresh", "me"]);
  });
});
