import { moveRequestId } from "./moveRequestId";

test("legacy browsers generate distinct UUID v4 move identifiers without randomUUID", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
  Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
  try {
    const ids = Array.from({ length: 30 }, moveRequestId);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(ids.length);
  } finally {
    if (original) Object.defineProperty(globalThis.crypto, "randomUUID", original);
    else delete globalThis.crypto.randomUUID;
  }
});
