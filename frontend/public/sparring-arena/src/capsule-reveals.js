import * as THREE from 'three';
import { TRAY } from './dispenser-physics.js';

export function createCapsuleReveals(container, onSelect) {
  const layer = document.createElement('div');
  layer.className = 'capsule-notes';
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.classList.add('capsule-connectors');
  layer.append(lines);
  container.append(layer);
  const notes = new Map(), flights = new Map(), projected = new THREE.Vector3();
  function project(body, camera, width, height) {
    projected.copy(body.position).project(camera);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
  }
  function update(entries, tracking, camera) {
    const width = container.clientWidth, height = container.clientHeight;
    const mobile = matchMedia('(max-width: 700px)').matches;
    const visible = mobile ? entries.slice(-2) : entries;
    const keys = new Set(visible.map(entry => `${entry.body.id}:${entry.born}`));
    for (const [key, note] of notes) if (!keys.has(key)) { note.card.remove(); note.line.remove(); notes.delete(key); }
    const trayLeft = project({ position: new THREE.Vector3(-TRAY.frontWidth / 2, TRAY.frontY, TRAY.front) }, camera, width, height).x;
    const cardWidth = mobile ? (width - 32) / 2 : Math.min(225, Math.max(140, trayLeft - 28));
    const placed = [];
    for (const entry of visible) {
      const key = `${entry.body.id}:${entry.born}`;
      let note = notes.get(key);
      if (!note) {
        const card = document.createElement('button');
        card.type = 'button';
        card.dataset.phCaptureAttributeAction = 'sparring_capsule_select';
        card.className = `capsule-note ${entry.post.side}${entry.fresh ? ' fresh' : ''}`;
        card.dataset.postId = entry.post.id;
        card.dataset.fresh = String(entry.fresh);
        const meta = document.createElement('span');
        meta.className = 'capsule-note-meta';
        meta.textContent = entry.fresh ? (entry.post.name === '나' ? '방금 보낸 내 캡슐' : '방금 · ' + entry.post.name) : '지난 대화 · ' + entry.post.name;
        const text = document.createElement('span');
        text.className = 'capsule-note-text'; text.textContent = entry.post.text;
        const action = document.createElement('span');
        action.className = 'capsule-note-action'; action.textContent = '눌러서 펼쳐보기 ↗';
        card.append(meta, text, action);
        card.setAttribute('aria-label', `${meta.textContent}: ${entry.post.text}`);
        card.addEventListener('click', () => onSelect(entry.post.id));
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', entry.post.side === 'a' ? '#2ac1bc' : '#ed6a5a');
        lines.append(line); layer.append(card);
        note = { card, line }; notes.set(key, note);
      }
      note.card.style.width = `${cardWidth}px`;
      const speaker = new THREE.Vector3().copy(entry.body.position);
      speaker.y += 0.24 + (entry.characterPose?.lift ?? 0) + (entry.characterPose?.scale ?? 0) * 1.65;
      placed.push({ entry, note, point: project({ position: speaker }, camera, width, height), height: note.card.offsetHeight || 108 });
    }
    const rowHeights = [0, 0];
    placed.forEach((item, index) => { rowHeights[Math.floor(index / 2)] = Math.max(rowHeights[Math.floor(index / 2)], item.height); });
    placed.forEach(({ note, point, height: cardHeight }, index) => {
      const column = index % 2, row = Math.floor(index / 2);
      const left = mobile ? 12 : Math.max(12, trayLeft - cardWidth - 20);
      const x = column === 0 ? left : width - cardWidth - left;
      const y = mobile ? height + 8 + (row ? rowHeights[0] + 8 : 0)
        : Math.max(68, height - rowHeights[0] - 14 - (row ? rowHeights[1] + 10 : 0));
      note.card.style.left = `${x}px`; note.card.style.top = `${y}px`;
      note.line.setAttribute('x1', String(point.x)); note.line.setAttribute('y1', String(point.y));
      note.line.setAttribute('x2', String(mobile ? x + cardWidth / 2 : column === 0 ? x + cardWidth : x));
      note.line.setAttribute('y2', String(mobile ? y : y + cardHeight * 0.68));
    });
    const flyingIds = new Set(tracking.map(entry => entry.post.id));
    for (const [id, flight] of flights) {
      if (!flyingIds.has(id)) { flight.remove(); flights.delete(id); }
    }
    for (const entry of tracking) {
      let flight = flights.get(entry.post.id);
      if (!flight) {
        flight = document.createElement('span');
        flight.className = 'capsule-flight-tag ' + entry.post.side;
        const label = document.createElement('strong');
        label.textContent = entry.post.name === '나' ? '내 한마디' : `방금 · ${entry.post.name}`;
        const preview = document.createElement('span');
        preview.textContent = entry.post.text;
        flight.append(label, preview);
        flight.dataset.postId = entry.post.id;
        layer.append(flight); flights.set(entry.post.id, flight);
      }
      const point = project(entry.body, camera, width, height);
      flight.style.left = `${Math.min(width - 65, Math.max(65, point.x))}px`;
      flight.style.top = `${Math.max(55, point.y - 25)}px`;
    }
  }
  function spark(position, camera) {
    const point = project({ position: new THREE.Vector3(position.x, position.y, position.z) }, camera, container.clientWidth, container.clientHeight);
    const burst = document.createElement('span'); burst.className = 'pipe-spark'; burst.textContent = '✦';
    burst.style.left = point.x + 'px'; burst.style.top = point.y + 'px';
    burst.addEventListener('animationend', () => burst.remove(), { once: true });
    layer.append(burst);
  }
  return { update, spark };
}
