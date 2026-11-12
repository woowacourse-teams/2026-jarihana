const fadeBetween = (altitude, start, end) => {
  const progress = Math.min(1, Math.max(0, (altitude - start) / (end - start)));
  return progress * progress * (3 - 2 * progress);
};

export function skyAppearance(altitude) {
  const space = fadeBetween(altitude, 900, 1650);
  return {
    twilight: fadeBetween(altitude, 100, 900),
    night: fadeBetween(altitude, 400, 1200),
    space,
    aurora: 1 - space
  };
}
