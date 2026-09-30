import {
  beginLoginAttempt,
  consumeLoginCompletion,
  finishLoginAttempt
} from "../../src/shared/analytics/loginConversion";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("requires an initiated login and verified callback, then consumes completion once", () => {
  finishLoginAttempt("authenticated", 42);
  expect(consumeLoginCompletion(42)).toBe(false);
  beginLoginAttempt();
  expect(consumeLoginCompletion(42)).toBe(false);
  finishLoginAttempt("authenticated", 42);
  expect(consumeLoginCompletion(42)).toBe(true);
  expect(consumeLoginCompletion(42)).toBe(false);
  finishLoginAttempt("authenticated", 42);
  expect(consumeLoginCompletion(42)).toBe(false);
});

test.each(["anonymous", "unavailable", "signup-required"])(
  "%s callback clears the attempt and cannot later become a login completion",
  (status) => {
    beginLoginAttempt();
    finishLoginAttempt(status);
    finishLoginAttempt("authenticated", 42);
    expect(consumeLoginCompletion(42)).toBe(false);
  }
);

test("does not attribute a confirmed login to a different account", () => {
  beginLoginAttempt();
  finishLoginAttempt("authenticated", 42);
  expect(consumeLoginCompletion(99)).toBe(false);
  expect(consumeLoginCompletion(42)).toBe(false);
});

test("expires an abandoned OAuth attempt after ten minutes", () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1000);
  beginLoginAttempt();
  now.mockReturnValue(601001);
  finishLoginAttempt("authenticated", 42);
  expect(consumeLoginCompletion(42)).toBe(false);
});

test("storage failure cannot break login or emit a completion", () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => beginLoginAttempt()).not.toThrow();
  expect(() => finishLoginAttempt("authenticated", 42)).not.toThrow();
  expect(consumeLoginCompletion(42)).toBe(false);
});

test("persists only attempt timing and the internal member ID", () => {
  window.history.replaceState({}, "", "/oauth/callback?code=secret&state=secret");
  beginLoginAttempt();
  finishLoginAttempt("authenticated", 42);
  const attempt = JSON.parse(sessionStorage.getItem("jarihana:analytics:login-attempt"));
  expect(attempt).toEqual({ startedAt: expect.any(Number), memberId: "42" });
  window.history.replaceState({}, "", "/");
});
