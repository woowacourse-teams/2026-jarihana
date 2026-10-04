// Official campus address: https://www.woowacourse.io/contact
// The A-building map pin (8Q99C34Q+HH) is documented in frontend/DESIGN.md.
// This is a building-area estimate, not a floor-level presence check.
export const PANGYO_CAMPUS = {
  latitude: 37.406397,
  longitude: 127.088898,
  radiusMeters: 100
};

export function campusPositionStatus(coords) {
  if (!coords) return "imprecise";
  const { latitude, longitude, accuracy } = coords;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    accuracy < 0
  ) {
    return "imprecise";
  }

  const radians = Math.PI / 180;
  const latitudeDelta = (latitude - PANGYO_CAMPUS.latitude) * radians;
  const longitudeDelta = (longitude - PANGYO_CAMPUS.longitude) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(PANGYO_CAMPUS.latitude * radians) *
      Math.cos(latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  const distance = 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(haversine)));

  if (distance > PANGYO_CAMPUS.radiusMeters + accuracy) return "outside";
  if (distance + accuracy > PANGYO_CAMPUS.radiusMeters) return "imprecise";
  return "inside";
}
