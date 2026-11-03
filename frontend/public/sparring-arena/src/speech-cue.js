const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSpeechCue(button, action) {
  const dismissed = new Set();
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('speech-cue-outline');
  svg.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS(SVG_NS, 'path');
  outline.classList.add('speech-cue-wave');
  const body = document.createElementNS(SVG_NS, 'path');
  body.classList.add('speech-cue-body');
  const shadow = document.createElementNS(SVG_NS, 'rect');
  shadow.classList.add('speech-cue-shadow');
  shadow.setAttribute('x', '1');
  shadow.setAttribute('y', '1');
  shadow.setAttribute('transform', 'translate(3 4)');
  svg.append(shadow, body, outline);
  const label = document.createElement('span');
  label.className = 'speech-cue-label';
  label.setAttribute('aria-hidden', 'true');
  label.textContent = '받아치기?';
  const hand = document.createElementNS(SVG_NS, 'svg');
  hand.classList.add('speech-cue-hand');
  hand.setAttribute('viewBox', '0 0 24 24');
  hand.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M9 11V5.5a1.5 1.5 0 0 1 3 0V10l1-.6a1.5 1.5 0 0 1 1.5.1l.8.6a1.5 1.5 0 0 1 1.6.1l1.4 1.1c.7.5.9 1.2.7 2.1l-1.1 5c-.2 1.1-1.1 1.8-2.2 1.8h-3.6c-.8 0-1.4-.3-1.9-.9l-3.5-4.5a1.5 1.5 0 0 1 2.3-1.9L9 14 M5.2 5.4 3.8 4 M5.1 9H3 M15 5l1.4-1.4');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  hand.append(path);
  action.replaceChildren(hand);
  button.append(svg, label);
  let current, lastLayout;
  return {
    present(id) {
      id = String(id);
      if (current === id) return;
      if (current !== undefined) {
        button.dataset.cueActive = 'false';
        void button.offsetWidth;
      }
      current = id;
      button.dataset.cueActive = String(!dismissed.has(id));
    },
    dismiss() {
      if (current === undefined) return;
      dismissed.add(current);
      button.dataset.cueActive = 'false';
    },
    layout(width, height, tail, tip = tail, tailHeight = 10) {
      if (!(width > 0 && height > 0)) return;
      const key = `${width}:${height}:${tail}:${tip}:${tailHeight}`;
      if (key === lastLayout) return;
      lastLayout = key;
      const r = Math.min(18, width / 4, height / 2);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const right = width - 1, bottom = height - 1;
      const half = Math.min(8, (width - 2 * r - 2) / 2);
      // Keep both tail roots on the straight edge, even near a rounded corner.
      const base = Math.max(r + 1 + half, Math.min(right - r - half, tail));
      const dy = Math.max(10, tailHeight);
      const dx = Math.max(-dy, Math.min(dy, tip - base));
      const scale = Math.min(1, 24 / Math.hypot(dx, dy));
      const tipX = Number((base + dx * scale).toFixed(2));
      const tipY = Number((bottom + dy * scale).toFixed(2));
      const d = `M ${1+r} 1 H ${right-r} Q ${right} 1 ${right} ${1+r} V ${bottom-r} Q ${right} ${bottom} ${right-r} ${bottom} H ${base+half} L ${tipX} ${tipY} L ${base-half} ${bottom} H ${1+r} Q 1 ${bottom} 1 ${bottom-r} V ${1+r} Q 1 1 ${1+r} 1 Z`;
      // A second offset tail would make oblique tips look forked.
      shadow.setAttribute('width', width - 2);
      shadow.setAttribute('height', height - 2);
      shadow.setAttribute('rx', r);
      for (const path of [body, outline]) path.setAttribute('d', d);
    },
  };
}
