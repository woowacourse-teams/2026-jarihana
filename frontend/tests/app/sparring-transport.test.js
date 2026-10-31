import { updateTransport } from '../../public/sparring-arena/src/transport.js';

describe('스파링 파이프 연결', () => {
  let form, network, originalClientWidth;

  beforeEach(() => {
    document.body.innerHTML = `<div id="stage"><div id="scene"></div></div>
      <svg class="transport-pipes"><g data-route="a"><path class="pipe-rim"/><path class="pipe-body"/><path class="transport-route"/><path class="pipe-sheen"/></g>
      <g data-route="b"><path class="pipe-rim"/><path class="pipe-body"/><path class="transport-route"/><path class="pipe-sheen"/></g></svg>
      <form><span class="inlet-mouth"></span></form>`;
    originalClientWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 390, configurable: true });
    const scene = document.querySelector('#scene');
    scene.dataset.pipeAnchors = JSON.stringify({
      a: { x: 45, y: 120, direction: { x: 1, y: 0 }, width: 20 },
      b: { x: 295, y: 120, direction: { x: -1, y: 0 }, width: 20 }
    });
    scene.parentElement.getBoundingClientRect = () => ({ x: 16, y: 30 });
    form = document.querySelector('form');
    form.querySelector('.inlet-mouth').getBoundingClientRect = () => ({ x: 51, y: 480, width: 24, height: 48 });
    network = document.querySelector('.transport-pipes');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    if (originalClientWidth) Object.defineProperty(document.documentElement, 'clientWidth', originalClientWidth);
    else delete document.documentElement.clientWidth;
  });

  it('선택한 편의 입력구부터 통까지 같은 파이프 경로로 연결한다', () => {
    const a = network.querySelector('[data-route=a]');
    const b = network.querySelector('[data-route=b]');

    for (const [side, active, inactive] of [['a', a, b], ['b', b, a]]) {
      form.dataset.side = side;
      const route = updateTransport(form);
      const path = route.getAttribute('d');
      expect(route).toBe(active.querySelector('.transport-route'));
      expect(path).toMatch(/^M 63 504 H /);
      expect(path).toContain(' V ');
      for (const layer of active.querySelectorAll('path')) {
        expect(layer.getAttribute('d')).toBe(path);
      }
      expect(inactive.querySelector('.transport-route').getAttribute('d')).not.toContain(' V ');
      expect(active.style.getPropertyValue('--pipe-width')).toBe('20px');
    }
  });

  it('이동 캡슐의 크기는 실제 새 캡슐 투영값을 쓰고 경로는 통 노즐 입구까지 이어진다', () => {
    const scene = document.querySelector('#scene');
    const anchors = JSON.parse(scene.dataset.pipeAnchors);
    anchors.a.mouth = { x: 90, y: 120 }; anchors.a.capsuleDiameter = 16;
    scene.dataset.pipeAnchors = JSON.stringify(anchors);
    form.innerHTML = '<div data-composer-side="a"><span class="inlet-mouth"></span><span class="composer-avatar"></span></div><div data-composer-side="b"><span class="inlet-mouth"></span></div>';
    for (const group of network.querySelectorAll('g')) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('pipe-flow'); group.append(path);
    }
    form.dataset.side = 'a';
    const route = updateTransport(form);
    expect(route.getAttribute('d')).toMatch(/L 106 150$/);
    expect(form.querySelector('[data-composer-side=a]').dataset.capsuleDiameter).toBe('16');
    expect(network.querySelector('[data-route=a] .transport-route').getAttribute('d')).not.toMatch(/L 106 150$/);
  });

  it('두 입력구를 각자 같은 편의 파이프에 연결한다', () => {
    form.innerHTML = '<div data-composer-side="a"><span class="inlet-mouth"></span></div><div data-composer-side="b"><span class="inlet-mouth"></span></div>';
    form.querySelector('[data-composer-side=a] .inlet-mouth').getBoundingClientRect = () => ({ x: 20, y: 480, width: 20, height: 40 });
    form.querySelector('[data-composer-side=b] .inlet-mouth').getBoundingClientRect = () => ({ x: 350, y: 480, width: 20, height: 40 });
    form.dataset.side = 'b';
    const layouts = jest.fn();
    document.querySelector('#scene').addEventListener('transportlayout', layouts);
    const selected = updateTransport(form);
    expect(layouts).toHaveBeenCalledTimes(1);
    expect(layouts.mock.calls[0][0].detail).toHaveLength(2);
    for (const device of form.querySelectorAll('[data-composer-side]')) {
      expect(device.style.getPropertyValue('--pipe-diameter')).toBe('20px');
    }
    expect(network.querySelector('[data-route=a] .transport-route').getAttribute('d')).toMatch(/^M 30 500 H /);
    expect(network.querySelector('[data-route=b] .transport-route').getAttribute('d')).toMatch(/^M 360 500 H /);
    expect(selected).toBe(network.querySelector('[data-route=b] .transport-route'));
  });

  it('바닥 앞 호스와 노즐 뒤 연결부를 이어 붙이면서 캡슐의 이동 경로는 하나로 유지한다', () => {
    const joints = network.cloneNode(true);
    joints.classList.add('transport-joints');
    network.after(joints);
    for (const group of network.querySelectorAll('g')) {
      const flow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      flow.classList.add('pipe-flow');
      group.append(flow);
    }
    form.dataset.side = 'a';
    const selected = updateTransport(form);
    expect(selected).toBe(network.querySelector('[data-route=a] .pipe-flow'));
    for (const side of ['a', 'b']) {
      const front = network.querySelector(`[data-route=${side}] .transport-route`).getAttribute('d');
      const rear = joints.querySelector(`[data-route=${side}] .transport-route`).getAttribute('d');
      const [, rearX, rearY, connector] = rear.match(/^M ([\d.-]+) ([\d.-]+) (C .+)$/);
      expect(front.endsWith(`H ${rearX}`)).toBe(true);
      expect(front).toContain(rearY);
      const full = network.querySelector(`[data-route=${side}] .pipe-flow`).getAttribute('d');
      expect(full).toBe(`${front} ${connector}`);
      expect(rear).toMatch(side === 'a' ? /L 64\.6 150$/ : /L 307\.4 150$/);
      expect(joints.querySelector(`[data-route=${side}]`).style.getPropertyValue('--pipe-width')).toBe('20px');
    }
    delete document.querySelector('#scene').dataset.pipeAnchors;
    expect(updateTransport(form)).toBeNull();
    expect(network).toHaveAttribute('hidden');
    expect(joints).toHaveAttribute('hidden');
  });

});
