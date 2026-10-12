import { campusPositionStatus, PANGYO_CAMPUS } from "../../src/pages/groups/home/pangyoCampus.js";

const atCampus = (overrides = {}) => ({
  latitude: PANGYO_CAMPUS.latitude,
  longitude: PANGYO_CAMPUS.longitude,
  accuracy: 10,
  ...overrides
});

it("recognizes a precise position at the campus", () => {
  expect(campusPositionStatus(atCampus())).toBe("inside");
});

it("does not treat a nearby neighborhood or Seoul as the campus", () => {
  expect(campusPositionStatus(atCampus({ latitude: PANGYO_CAMPUS.latitude + 0.003 }))).toBe(
    "outside"
  );
  expect(campusPositionStatus({ latitude: 37.5665, longitude: 126.978, accuracy: 10 })).toBe(
    "outside"
  );
});

it("requires the reported accuracy area to fit inside the campus radius", () => {
  expect(campusPositionStatus(atCampus({ accuracy: PANGYO_CAMPUS.radiusMeters }))).toBe("inside");
  expect(campusPositionStatus(atCampus({ accuracy: PANGYO_CAMPUS.radiusMeters + 1 }))).toBe(
    "imprecise"
  );
  expect(
    campusPositionStatus(
      atCampus({
        latitude: PANGYO_CAMPUS.latitude + 0.0005,
        accuracy: PANGYO_CAMPUS.radiusMeters - 1
      })
    )
  ).toBe("imprecise");
});

it.each([
  { latitude: NaN },
  { latitude: 91 },
  { longitude: -181 },
  { accuracy: -1 },
  { accuracy: Infinity },
  { accuracy: undefined }
])("rejects an invalid position: %s", (overrides) => {
  expect(campusPositionStatus(atCampus(overrides))).toBe("imprecise");
});
