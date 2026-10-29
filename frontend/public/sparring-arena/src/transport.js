export function updateTransport(form) {
  const scene = document.querySelector('#scene'), network = document.querySelector('.transport-pipes');
  if (!scene.dataset.pipeAnchors) { network.setAttribute('hidden', ''); return null; }
  network.removeAttribute('hidden');
  const anchors = JSON.parse(scene.dataset.pipeAnchors), stage = scene.parentElement.getBoundingClientRect();
  const mouth = form.querySelector('.inlet-mouth').getBoundingClientRect();
  const start = { x: mouth.x + mouth.width / 2, y: mouth.y + mouth.height / 2 };
  for (const side of ['a', 'b']) {
    const edge = side === 'a' ? 0 : document.documentElement.clientWidth;
    const end = { x: stage.x + anchors[side].x, y: stage.y + anchors[side].y };
    let d = `M ${edge} ${end.y} L ${end.x} ${end.y}`;
    if (form.dataset.side === side) {
      const direction = side === 'a' ? -1 : 1, vertical = Math.sign(end.y - start.y) || -1;
      const radius = Math.min(28, Math.abs(end.y - start.y) / 3, Math.abs(start.x - edge) / 2, Math.abs(end.x - edge) / 2);
      const turnX = edge - direction * radius;
      d = `M ${start.x} ${start.y} H ${turnX} Q ${edge} ${start.y} ${edge} ${start.y + vertical * radius} V ${end.y - vertical * radius} Q ${edge} ${end.y} ${turnX} ${end.y} L ${end.x} ${end.y}`;
    }
    for (const path of network.querySelectorAll(`[data-route=${side}] path`)) path.setAttribute('d', d);
  }
  return form.dataset.side ? network.querySelector(`[data-route=${form.dataset.side}] .transport-route`) : null;
}
