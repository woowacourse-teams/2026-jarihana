export function updateTransport(form) {
  const scene = document.querySelector('#scene'), network = document.querySelector('.transport-pipes');
  const joints = document.querySelector('.transport-joints');
  if (!scene.dataset.pipeAnchors) {
    network.setAttribute('hidden', ''); joints?.setAttribute('hidden', '');
    scene.dispatchEvent(new CustomEvent('transportlayout', { detail: [] }));
    return null;
  }
  network.removeAttribute('hidden');
  joints?.removeAttribute('hidden');
  const anchors = JSON.parse(scene.dataset.pipeAnchors), stage = scene.parentElement.getBoundingClientRect();
  const diameter = Math.max(anchors.a.width, anchors.b.width);
  form.style.setProperty('--composer-gutter', `${diameter * 2.4}px`);
  const layout = [];
  for (const side of ['a', 'b']) {
    const anchor = anchors[side], inward = side === 'a' ? 1 : -1;
    const device = form.querySelector(`[data-composer-side="${side}"]`);
    const width = anchor.width;
    device?.style.setProperty('--pipe-diameter', `${width}px`);
    if (device) device.dataset.capsuleDiameter = String(anchor.capsuleDiameter ?? width * 0.8);
    const sideMouth = device?.querySelector('.inlet-mouth');
    const mouth = (sideMouth ?? form.querySelector('.inlet-mouth')).getBoundingClientRect();
    const start = { x: mouth.x + mouth.width / 2, y: mouth.y + mouth.height / 2 };
    const direction = anchor.direction;
    const end = { x: stage.x + anchor.x, y: stage.y + anchor.y };
    const overlap = anchor.width * 0.18;
    const join = { x: end.x + direction.x * overlap, y: end.y + direction.y * overlap };
    const inset = width / 2 + 3;
    const rail = side === 'a' ? inset : document.documentElement.clientWidth - inset;
    const neckLength = width * 0.12;
    const neck = { x: end.x - direction.x * neckLength, y: end.y - direction.y * neckLength };
    const curveX = neck.x;
    const connector = `C ${curveX + inward * neckLength * 0.4} ${neck.y} ${neck.x} ${neck.y} ${end.x} ${end.y} L ${join.x} ${join.y}`;
    const finish = `H ${curveX}`;
    const edge = side === 'a' ? -width : document.documentElement.clientWidth + width;
    let d = `M ${edge} ${neck.y} ${finish}`;
    if (sideMouth || form.dataset.side === side) {
      const railY = neck.y;
      const vertical = Math.sign(railY - start.y) || -1;
      const radius = Math.max(2, Math.min(width * 0.8, Math.abs(railY - start.y) / 3, Math.abs(start.x - rail) - width * 1.364, Math.abs(curveX - rail)));
      const turnX = rail + inward * radius;
      d = `M ${start.x} ${start.y} H ${turnX} Q ${rail} ${start.y} ${rail} ${start.y + vertical * radius} V ${railY - vertical * radius} Q ${rail} ${railY} ${turnX} ${railY} ${finish}`;
    }
    const route = network.querySelector(`[data-route=${side}]`);
    route.style.setProperty('--pipe-width', `${width}px`);
    for (const path of route.querySelectorAll('path')) {
      const outlet = anchor.mouth ? ` L ${stage.x + anchor.mouth.x} ${stage.y + anchor.mouth.y}` : '';
      path.setAttribute('d', path.classList.contains('pipe-flow') ? `${d} ${connector}${outlet}` : !joints ? `${d} ${connector}` : d);
    }
    const joint = joints?.querySelector(`[data-route=${side}]`);
    if (joint) {
      joint.style.setProperty('--pipe-width', `${width}px`);
      for (const path of joint.querySelectorAll('path')) path.setAttribute('d', `M ${curveX} ${neck.y} ${connector}`);
    }
    const avatar = device?.querySelector('.composer-avatar')?.getBoundingClientRect();
    layout.push({ side, diameter: width, inlet: start,
      avatar: avatar ? { x: avatar.x, y: avatar.y, width: avatar.width, height: avatar.height } : null,
      active: device?.dataset.expanded === 'true', memberType: device?.dataset.memberType ?? 'CREW',
      frontPath: route.querySelector('.transport-route'),
      backPath: joint?.querySelector('.transport-route') ?? null });
  }
  scene.dispatchEvent(new CustomEvent('transportlayout', { detail: layout }));
  return form.dataset.side ? network.querySelector(`[data-route=${form.dataset.side}] .pipe-flow`) ?? network.querySelector(`[data-route=${form.dataset.side}] .transport-route`) : null;
}
