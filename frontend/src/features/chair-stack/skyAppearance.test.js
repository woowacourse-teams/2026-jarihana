import { skyAppearance } from "./skyAppearance";

test("sky layers change throughout each altitude band", () => {
  const low = skyAppearance(500);
  const aurora = skyAppearance(1000);
  const between = skyAppearance(1250);
  const space = skyAppearance(1500);

  expect(low.twilight).toBeGreaterThan(0);
  expect(low.twilight).toBeLessThan(1);
  expect(aurora.night).toBeGreaterThan(0);
  expect(aurora.night).toBeLessThan(1);
  expect(between.space).toBeGreaterThan(aurora.space);
  expect(between.space).toBeLessThan(space.space);
  expect(space.space).toBeGreaterThan(0.8);
  expect(space.aurora).toBeLessThan(0.2);
});

test("stacking one chair cannot switch a sky layer at once", () => {
  for (let altitude = 0; altitude < 1800; altitude += 100) {
    const before = skyAppearance(altitude);
    const after = skyAppearance(altitude + 100);
    for (const layer of ["twilight", "night", "space", "aurora"]) {
      expect(Math.abs(after[layer] - before[layer])).toBeLessThan(0.21);
    }
  }
});
