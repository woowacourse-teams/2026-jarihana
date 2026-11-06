// Original line icons; category names remain visible and provide accessible labels.
const ICONS = {
  face: [['rect', { x: 8, y: 5, width: 24, height: 30, rx: 12 }], ['path', { d: 'M15 19h.1M25 19h.1M16 27q4 3 8 0' }]],
  hair: [['path', { d: 'M8 29V18C8 3 32 3 32 18v11M8 19q8-1 12-10 3 8 12 10M13 24v5q7 9 14 0v-5' }]],
  eyebrows: [['path', { d: 'M7 16q6-6 12-2M23 14q6-4 11 2M10 26h6M26 26h6', 'stroke-width': 3 }]],
  eyes: [['path', { d: 'M5 20q7-10 14 0-7 10-14 0ZM22 20q7-10 14 0-7 10-14 0Z' }], ['path', { d: 'M12 18v4M29 18v4', 'stroke-width': 3 }]],
  nose: [['path', { d: 'M19 7q-1 10-6 18-1 5 7 5 8 0 7-5l-3-6M17 28h6' }]],
  mouth: [['path', { d: 'M7 19q13 4 26 0-4 13-13 13T7 19ZM11 21q9 6 18 0' }]],
  glasses: [['rect', { x: 4, y: 14, width: 13, height: 14, rx: 5 }], ['rect', { x: 23, y: 14, width: 13, height: 14, rx: 5 }], ['path', { d: 'M17 19q3-3 6 0M4 18l-2-3M36 18l2-3' }]],
  outfit: [['path', { d: 'm13 7-9 6 5 9 5-3v15h12V19l5 3 5-9-9-6q-7 9-14 0Z' }]],
  shoes: [['path', { d: 'M7 11h10v9l14 5q4 1 4 7H5V20ZM5 32v3h30v-3M18 23l3-3M24 26l3-3' }]],
  hat: [['path', { d: 'M9 25V20a11 11 0 0 1 22 0v5M5 25h30v5H5ZM20 9v4M11 24h18' }]],
  bag: [['rect', { x: 8, y: 10, width: 24, height: 26, rx: 7 }], ['path', { d: 'M15 10V7q5-6 10 0v3M8 21h24M14 27h12M5 17v13M35 17v13' }]],
  handheld: [['path', { d: 'M9 15h22l-3 20H12ZM7 11h26v4H7ZM15 7V4M23 7V4M16 24h8' }]],
};

export function createEditorIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 40 40', width: '32', height: '32', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  for (const [tag, attributes] of ICONS[name]) {
    const element = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    svg.append(element);
  }
  return svg;
}
