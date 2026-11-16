const SKY_COLORS = {
  dawn: ["#485579", "#bd8394", "#f5c7a1"],
  day: ["#527fa9", "#9bc6e5", "#e2eef3"],
  dusk: ["#484b78", "#c37f8b", "#f1b489"],
  night: ["#141e3a", "#293752", "#526182"]
};
const OVERCAST_COLORS = {
  dawn: ["#515b75", "#8a8199", "#c8abb3"],
  day: ["#5a7087", "#829aaf", "#c2d0da"],
  dusk: ["#4c546d", "#837887", "#bb9ca5"],
  night: ["#191f34", "#303a50", "#536078"]
};

export function roomSkyPalette({ phase, weather }) {
  return (weather === "clear" ? SKY_COLORS : OVERCAST_COLORS)[phase];
}
