import { z } from "zod";
import { apiClient } from "../../shared/api";
const binding = z.object({ id: z.number().int().positive().safe(), generation: z.number().int().positive().safe(),
  enabled: z.boolean(), lastSeenAt: z.string() });
const subscriptionPage = z.object({ items: z.array(binding), nextCursor: z.string().nullable(), hasNext: z.boolean() });
export const fetchPushConfig = () => apiClient.request("push-config", {
  schema: z.object({ enabled: z.boolean(), vapidPublicKey: z.string().nullable(), payloadVersions: z.array(z.number().int()) })
});
export const registerPush = (subscription) => apiClient.request("push-subscriptions", {
  method: "POST", json: subscription.toJSON(), schema: binding
});
export const disconnectPush = (id) => apiClient.request(`push-subscriptions/${id}`, { method: "DELETE" });

export async function hasActivePushSubscription() {
  const seen = new Set();
  let cursor;
  do {
    const page = await apiClient.request("push-subscriptions", { searchParams: { size: 100, ...(cursor ? { cursor } : {}) },
      schema: subscriptionPage });
    if (page.items.some((item) => item.enabled)) return true;
    if (!page.hasNext) return false;
    if (!page.nextCursor || seen.has(page.nextCursor)) throw new Error("구독 목록을 확인하지 못했어요.");
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return false;
}

export async function refreshLogoutBinding(previous) {
  const seen = new Set();
  let cursor;
  do {
    const page = await apiClient.request("push-subscriptions", { searchParams: { size: 100, ...(cursor ? { cursor } : {}) },
      schema: subscriptionPage });
    const found = page.items.find((item) => item.id === previous.pushSubscriptionId);
    if (found) return { pushSubscriptionId: found.id, generation: found.generation };
    if (!page.hasNext) return null;
    if (!page.nextCursor || seen.has(page.nextCursor)) throw new Error("구독 목록을 확인하지 못했어요.");
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return null;
}
