import { z } from "zod";

const pendingCreationSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(10_000),
  scope: z.enum(["MEMBERS", "PUBLIC"]),
  requestId: z.uuid()
});

const inMemory = new Map();

export function readPendingCreation(key) {
  if (inMemory.has(key)) return inMemory.get(key);
  try {
    const saved = pendingCreationSchema.safeParse(JSON.parse(sessionStorage.getItem(key)));
    return saved.success ? saved.data : null;
  } catch {
    return null;
  }
}

export function savePendingCreation(key, request) {
  try {
    sessionStorage.setItem(key, JSON.stringify(request));
    inMemory.delete(key);
  } catch {
    inMemory.set(key, request);
  }
}

export function clearPendingCreation(key, requestId) {
  if (readPendingCreation(key)?.requestId !== requestId) return;
  inMemory.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage can be disabled in this tab.
  }
}
