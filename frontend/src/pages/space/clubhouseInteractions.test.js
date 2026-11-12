import { activeSpeechMessages, featureForRoomItem, SPEECH_DURATION_MS } from "./clubhouseInteractions";

test("decorations route to shared features without owning their records", () => {
  ["memory", "clubPinboard", "climbingBoard", "gameWallBoard", "galleryPartition", "foodMap", "bandPoster"].forEach((kind) => {
    expect(featureForRoomItem({ kind })).toBe("activities");
  });
  expect(featureForRoomItem({ kind: "whiteboard" })).toBe("info");
  expect(featureForRoomItem({ kind: "sofa" })).toBeNull();
  expect(featureForRoomItem(null)).toBeNull();
});

test("speech uses at most three latest speakers and sixty Unicode characters", () => {
  const messages = [1, 2, 3, 4, 4].map((memberId, id) => ({ id, memberId, content: "🙂".repeat(90), expiresAt: 9000 }));
  const visible = activeSpeechMessages(messages, 1000);
  expect(visible.map((message) => message.id)).toEqual([1, 2, 4]);
  expect(Array.from(visible[0].content)).toHaveLength(60);
  expect(visible[0].content.endsWith("…")).toBe(true);
});

test("old, unbounded and blank speech cannot appear or replay", () => {
  const now = 1000;
  const message = { id: 1, memberId: 7, content: "반가워요", expiresAt: now + SPEECH_DURATION_MS };
  expect(activeSpeechMessages([message], now)).toHaveLength(1);
  expect(activeSpeechMessages([message], now + SPEECH_DURATION_MS)).toEqual([]);
  expect(activeSpeechMessages([{ ...message, expiresAt: now + SPEECH_DURATION_MS + 1 }], now)).toEqual([]);
  expect(activeSpeechMessages([{ ...message, expiresAt: undefined }, { ...message, content: "  " }], now)).toEqual([]);
});
