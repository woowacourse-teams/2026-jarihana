import { compareSequence, mergeMessages, messageSchema } from "./index";

const message = (sequence, extra = {}) => ({ id: sequence, sequence, groupId: "1", senderId: "2", author: "크루", clientMessageId: `key-${sequence}`, content: "안녕", createdAt: "2026-10-25T12:00:00", ...extra });

test("orders adjacent sequences beyond safe integer without numeric coercion", () => {
  expect(compareSequence("9007199254740992", "9007199254740993")).toBeLessThan(0);
  expect(mergeMessages([message("9007199254740993")], [message("9007199254740992")]).map((item) => item.sequence)).toEqual(["9007199254740992", "9007199254740993"]);
  expect(messageSchema.safeParse(message("1", { id: 1 })).success).toBe(false);
});

test("deduplicates HTTP and socket echoes and replaces only same sender optimistic key", () => {
  const pending = message(undefined, { id: "pending-1", clientMessageId: "same", pending: true });
  const saved = message("12", { clientMessageId: "same" });
  expect(mergeMessages(mergeMessages([pending], [saved]), [saved])).toEqual([saved]);
  expect(mergeMessages([saved], [{ ...pending, pending: false, failed: true }])).toEqual([saved]);
  expect(mergeMessages([saved], [message("13", { clientMessageId: "same", senderId: "3" })])).toHaveLength(2);
});
