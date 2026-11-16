// Surface maps are neutral so the selected colour survives lighting updates.
export function setSurfaceColor(material, color, shade = 1) {
  material.color.set(color).multiplyScalar(shade);
}
