export function updateTransport(form) {
  const scene = document.querySelector('#scene'), network = document.querySelector('.transport-pipes');
  if (!scene.dataset.pipeAnchors) { network.setAttribute('hidden', ''); return null; }
  network.removeAttribute('hidden');
  const anchors = JSON.parse(scene.dataset.pipeAnchors), stage = scene.parentElement.getBoundingClientRect();
  const mouth = form.querySelector('.inlet-mouth').getBoundingClientRect();
  const start = { x: mouth.x + mouth.width / 2, y: mouth.y + mouth.height / 2 };
  for (const side of ['a', 'b']) {
    const anchor = anchors[side], inward = side === 'a' ? 1 : -1;
    const direction = anchor.direction, width = anchor.width;
    const end = { x: stage.x + anchor.x, y: stage.y + anchor.y };
    const overlap = width * 0.18;
    const join = { x: end.x + direction.x * overlap, y: end.y + direction.y * overlap };
    const inset = width / 2 + 6;
    const rail = side === 'a' ? inset : document.documentElement.clientWidth - inset;
    const neckLength = Math.min(width * 1.2, Math.abs(end.x - rail) * 0.35);
    const neck = { x: end.x - direction.x * neckLength, y: end.y - direction.y * neckLength };
    const curveX = neck.x - inward * neckLength * 0.6;
    const finish = `H ${curveX} C ${curveX + inward * neckLength * 0.4} ${neck.y} ${neck.x} ${neck.y} ${end.x} ${end.y} L ${join.x} ${join.y}`;
    const edge = side === 'a' ? -width : document.documentElement.clientWidth + width;
    let d = `M ${edge} ${neck.y} ${finish}`;
    if (form.dataset.side === side) {
      const railY = neck.y;
      const vertical = Math.sign(railY - start.y) || -1;
      const radius = Math.min(30, Math.abs(railY - start.y) / 3, Math.abs(start.x - rail) / 2, Math.abs(curveX - rail) / 2);
      const turnX = rail + inward * radius;
      d = `M ${start.x} ${start.y} H ${turnX} Q ${rail} ${start.y} ${rail} ${start.y + vertical * radius} V ${railY - vertical * radius} Q ${rail} ${railY} ${turnX} ${railY} ${finish}`;
    }
    const route = network.querySelector(`[data-route=${side}]`);
    route.style.setProperty('--pipe-width', `${width}px`);
    for (const path of route.querySelectorAll('path')) path.setAttribute('d', d);
  }
  return form.dataset.side ? network.querySelector(`[data-route=${form.dataset.side}] .transport-route`) : null;
}
