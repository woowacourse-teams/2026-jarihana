import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KEYMAP,
  assignKey,
  isAssignableKey,
  isRetryKey,
  keyLabel,
  laneForKey,
  readKeymap,
  readPracticeSettings,
  writeKeymap,
  writePracticeSettings
} from "../../../src/features/game/rhythm/preferences.mjs";
import {
  DEFAULT_LESSON_SETTINGS,
  readLessonSettings,
  writeLessonSettings
} from "../../../src/features/game/rhythm/lesson.mjs";

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const blocked = {
  getItem() {
    throw Error("blocked");
  },
  setItem() {
    throw Error("blocked");
  }
};

test("key layout swaps conflicting keys, rejects reserved keys and keeps arrows fixed", () => {
  const moved = assignKey(DEFAULT_KEYMAP, "left", "KeyJ");
  assert.deepEqual(moved, { keymap: { ...DEFAULT_KEYMAP, left: "KeyJ" }, swappedWith: null });
  const swapped = assignKey(DEFAULT_KEYMAP, "retry", "KeyW");
  assert.deepEqual(swapped.keymap, { ...DEFAULT_KEYMAP, retry: "KeyW", up: "KeyR" });
  assert.equal(swapped.swappedWith, "up");
  for (const code of ["Escape", "Enter", "Space", "Tab", "ShiftLeft", "ArrowLeft", "F5", ""])
    assert.equal(assignKey(DEFAULT_KEYMAP, "left", code), null, code);
  assert.equal(assignKey(DEFAULT_KEYMAP, "jump", "KeyJ"), null);
  assert.equal(isAssignableKey("Semicolon"), true);
  assert.deepEqual(["KeyJ", "Digit7", "Numpad4", "Semicolon", "Slash"].map(keyLabel), ["J", "7", "Num 4", ";", "/"]);
  const custom = { ...DEFAULT_KEYMAP, left: "KeyJ" };
  assert.equal(laneForKey(custom, { code: "KeyJ" }), "left");
  assert.equal(laneForKey(custom, { code: "KeyA" }), null);
  assert.equal(laneForKey(custom, { code: "ArrowLeft" }), "left");
  assert.equal(laneForKey(custom, { code: "KeyR" }), null);
  assert.equal(isRetryKey(custom, { code: "KeyR" }), true);
  assert.equal(isRetryKey(custom, { key: "r" }), false);
});

test("key layout and practice settings survive reloads and fall back on broken values", () => {
  const storage = memoryStorage();
  assert.deepEqual(readKeymap(storage), DEFAULT_KEYMAP);
  const custom = { left: "KeyJ", down: "KeyK", up: "KeyI", right: "KeyL", retry: "KeyP" };
  assert.equal(writeKeymap(storage, custom), true);
  assert.deepEqual(readKeymap(storage), custom);
  assert.equal(writeKeymap(storage, { ...custom, down: "KeyJ" }), false);
  storage.setItem("haengseong-keymap-v1", JSON.stringify({ ...custom, retry: "Escape" }));
  assert.deepEqual(readKeymap(storage), DEFAULT_KEYMAP);
  storage.setItem("haengseong-keymap-v1", "{broken");
  assert.deepEqual(readKeymap(storage), DEFAULT_KEYMAP);
  assert.deepEqual(readKeymap(blocked), DEFAULT_KEYMAP);
  assert.equal(writeKeymap(blocked, custom), false);

  assert.equal(readPracticeSettings(storage), null);
  const settings = { level: "hardest", rate: 2.25, volume: 40, timingFeedback: false, labels: true };
  assert.equal(writePracticeSettings(storage, settings), true);
  assert.deepEqual(readPracticeSettings(storage), settings);
  storage.setItem(
    "haengseong-practice-settings-v1",
    JSON.stringify({ level: "insane", rate: 1.1, volume: 300, timingFeedback: "no" })
  );
  assert.deepEqual(readPracticeSettings(storage), {
    level: "easy",
    rate: 1,
    volume: 65,
    timingFeedback: true,
    labels: true
  });
  assert.equal(readPracticeSettings(blocked), null);
  assert.equal(writePracticeSettings(blocked, settings), false);
});

test("lesson tempo and scroll speed are remembered only when they are valid choices", () => {
  const storage = memoryStorage();
  assert.deepEqual(readLessonSettings(storage), DEFAULT_LESSON_SETTINGS);
  assert.equal(writeLessonSettings(storage, { bpm: 72, scrollSpeed: 2 }), true);
  assert.deepEqual(readLessonSettings(storage), { bpm: 72, scrollSpeed: 2 });
  storage.setItem("haengseong-lesson-settings-v1", JSON.stringify({ bpm: 90, scrollSpeed: 1.75 }));
  assert.deepEqual(readLessonSettings(storage), DEFAULT_LESSON_SETTINGS);
  assert.deepEqual(readLessonSettings(blocked), DEFAULT_LESSON_SETTINGS);
  assert.equal(writeLessonSettings(blocked, DEFAULT_LESSON_SETTINGS), false);
});
