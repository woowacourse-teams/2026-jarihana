import { consumeReturnTarget, peekReturnTarget, storeReturnTarget } from "../../src/features/auth";

describe("protected return target", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("Given an internal path, when storing it, then it can be peeked without consuming it", () => {
    // Given
    const target = "/groups/17/manage?tab=members#pending";

    // When
    const stored = storeReturnTarget(target);

    // Then
    expect(stored).toBe(true);
    expect(peekReturnTarget()).toBe(target);
    expect(peekReturnTarget()).toBe(target);
  });

  test.each([
    "//evil.test/steal",
    "https://evil.test/steal",
    "javascript:alert(1)",
    "/\\evil.test",
    " /my"
  ])("Given unsafe target %s, when storing it, then it is rejected", (target) => {
    // Given
    storeReturnTarget("/my/groups");

    // When
    const stored = storeReturnTarget(target);

    // Then
    expect(stored).toBe(false);
    expect(peekReturnTarget()).toBeNull();
  });

  test("Given a stored internal target, when consuming it, then it is returned exactly once", () => {
    // Given
    storeReturnTarget("/my/registrations");

    // When
    const first = consumeReturnTarget();
    const second = consumeReturnTarget();

    // Then
    expect(first).toBe("/my/registrations");
    expect(second).toBe("/my");
  });

  test("Given tampered storage, when consuming it, then it clears the value and returns the fallback", () => {
    // Given
    sessionStorage.setItem("jarihana:auth:return-target", "//evil.test/steal");

    // When
    const target = consumeReturnTarget("/groups");

    // Then
    expect(target).toBe("/groups");
    expect(peekReturnTarget()).toBeNull();
  });
});
