import { createLocomotionBlend, sampleLocomotion } from "./locomotionBlend.js";

test("walking to running preserves stride phase and blends lean instead of switching instantly", () => {
  const blend = createLocomotionBlend();
  sampleLocomotion(blend, "walking", 0);
  const before = sampleLocomotion(blend, "walking", 50);
  const start = sampleLocomotion(blend, "running", 50);
  expect(start.stride).toBe(before.stride);
  expect(start.running).toBe(0);
  const middle = sampleLocomotion(blend, "running", 140);
  expect(middle.running).toBeCloseTo(0.5);
  expect(middle.walking).toBeCloseTo(0.5);
  expect(sampleLocomotion(blend, "running", 230).running).toBe(1);
});

test.each(["idle", "walking", "running"])("landing blends jump pose into %s and finishes", (mode) => {
  const blend = createLocomotionBlend();
  sampleLocomotion(blend, "jumping", 0);
  expect(sampleLocomotion(blend, mode, 50).jumping).toBe(1);
  expect(sampleLocomotion(blend, mode, 140).jumping).toBeCloseTo(0.5);
  const end = sampleLocomotion(blend, mode, 230);
  expect(end.jumping).toBe(0);
  expect(end.active).toBe(false);
});

test("interrupted transitions start at the current pose and seating can reset immediately", () => {
  const blend = createLocomotionBlend();
  sampleLocomotion(blend, "walking", 0);
  sampleLocomotion(blend, "running", 50);
  const middle = sampleLocomotion(blend, "running", 140);
  expect(sampleLocomotion(blend, "jumping", 140).running).toBe(middle.running);
  expect(sampleLocomotion(blend, "idle", 150, true)).toMatchObject({ walking: 0, running: 0, jumping: 0, active: false });
});
