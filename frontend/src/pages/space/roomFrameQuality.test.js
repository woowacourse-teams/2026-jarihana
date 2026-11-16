import { createRoomFrameQuality } from "./roomFrameQuality";

function sampleFrames(quality, elapsed, count) {
  for (let index = 0; index < count; index += 1) quality.sample(elapsed, 0.5);
}

test("one stall and isolated missed frames keep full resolution", () => {
  const quality = createRoomFrameQuality();
  quality.sample(800, 0.5);
  for (let index = 0; index < 60; index += 1) {
    quality.sample(33, 0.5);
    sampleFrames(quality, 16.7, 3);
  }
  expect(quality.scale).toBe(1);
});

test("sustained slow frames reduce resolution and smooth motion restores it gradually", () => {
  const quality = createRoomFrameQuality();
  sampleFrames(quality, 33, 30);
  expect(quality.scale).toBeLessThan(1);
  sampleFrames(quality, 33, 200);
  expect(quality.scale).toBe(0.5);
  sampleFrames(quality, 16.7, 60);
  expect(quality.scale).toBe(0.5);
  sampleFrames(quality, 16.7, 90);
  expect(quality.scale).toBeGreaterThan(0.5);
  expect(quality.scale).toBeLessThan(1);
  sampleFrames(quality, 16.7, 600);
  expect(quality.scale).toBe(1);
});

test("a steady 30 Hz display retains full resolution and adapts when it starts missing frames", () => {
  const quality = createRoomFrameQuality();
  quality.setRefreshInterval(1000 / 30);
  sampleFrames(quality, 34, 120);
  expect(quality.scale).toBe(1);
  sampleFrames(quality, 67, 15);
  expect(quality.scale).toBeLessThan(1);
  quality.reset();
  expect(quality.scale).toBe(1);
});
