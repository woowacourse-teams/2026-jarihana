import { updateTransport } from '../../public/sparring-arena/src/transport.js';
jest.mock('../../public/sparring-arena/src/transport.js', () => ({ updateTransport: jest.fn() }));
import { fitArenaViewport, revealComposer, setupComposer } from '../../public/sparring-arena/src/composer.js';

describe('스파링 화면 높이 배분', () => {
  let form, stage, dock;

  beforeEach(() => {
    document.body.innerHTML = '<div class="stage"></div><div class="composer-dock"><form></form></div>';
    form = document.querySelector('form');
    stage = document.querySelector('.stage');
    dock = form.parentElement;
    stage.getBoundingClientRect = () => ({ top: 74 });
    Object.defineProperty(dock, 'offsetHeight', { value: 154, configurable: true });
    Object.defineProperty(stage, 'clientWidth', { value: 1376, configurable: true });
    document.documentElement.style.setProperty('--arena-available-height', '620px');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--arena-available-height');
  });

  it('데스크톱에서 경기장과 입력창을 주어진 화면 높이에 맞춘다', () => {
    dock.style.marginTop = '-140px';
    fitArenaViewport(form);
    expect(74 + parseFloat(stage.style.height) + dock.offsetHeight - 140).toBeLessThanOrEqual(620);
    expect(parseFloat(stage.style.height)).toBeGreaterThanOrEqual(380);
  });

  it('받아칠 의견으로 입력창이 길어지면 경기장을 줄여 화면 안에 유지한다', () => {
    document.documentElement.style.setProperty('--arena-available-height', '900px');
    fitArenaViewport(form);
    const before = parseFloat(stage.style.height);
    Object.defineProperty(dock, 'offsetHeight', { value: 194 });
    fitArenaViewport(form);
    expect(parseFloat(stage.style.height)).toBe(before - 40);
  });

  it('부모 화면 높이를 받기 전에는 기본 레이아웃을 유지한다', () => {
    document.documentElement.style.removeProperty('--arena-available-height');
    fitArenaViewport(form);
    expect(stage.style.height).toBe('');
  });

  it('긴 제목이 여러 줄이면 최소 경기장 높이를 늘린다', () => {
    const topic = document.createElement('header');
    topic.className = 'topic';
    Object.defineProperty(topic, 'offsetHeight', { value: 220 });
    stage.append(topic);
    fitArenaViewport(form);
    const sceneTop = parseFloat(stage.style.getPropertyValue('--scene-top'));
    expect(sceneTop).toBe(0);
    expect(parseFloat(stage.style.height)).toBeGreaterThanOrEqual(500);
  });

  it('세로로 긴 모바일에서는 작은 통의 위아래에 불필요한 빈 공간을 남기지 않는다', () => {
    const viewport = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(stage, 'clientWidth', { value: 358 });
    const topic = document.createElement('header');
    topic.className = 'topic';
    Object.defineProperty(topic, 'offsetHeight', { value: 128 });
    stage.append(topic);
    document.documentElement.style.setProperty('--arena-available-height', '900px');
    try {
      fitArenaViewport(form);
      const sceneTop = parseFloat(stage.style.getPropertyValue('--scene-top'));
      expect(sceneTop).toBeGreaterThan(topic.offsetHeight);
      expect(parseFloat(stage.style.height) - sceneTop).toBeLessThan(stage.clientWidth);
      expect(74 + parseFloat(stage.style.height) + dock.offsetHeight).toBeLessThanOrEqual(900);
    } finally {
      Object.defineProperty(window, 'innerWidth', viewport);
    }
  });
});

it('입력창이 이미 화면 안에 있으면 받아치기를 선택해도 스크롤하지 않는다', () => {
  const form = document.createElement('form');
  form.getBoundingClientRect = () => ({ top: 400, bottom: innerHeight - 8 });
  form.scrollIntoView = jest.fn();
  revealComposer(form);
  expect(form.scrollIntoView).not.toHaveBeenCalled();
  form.getBoundingClientRect = () => ({ top: innerHeight - 80, bottom: innerHeight + 60 });
  revealComposer(form);
  expect(form.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
});

it('입력 중 다른 편 캐릭터를 누를 때 입력창 포커스를 빼앗지 않는다', () => {
  document.body.innerHTML = '<div class="topic"></div><div id="scene"></div><div><form><textarea></textarea><button class="composer-avatar" type="button"></button><button type="submit"></button></form></div>';
  const observer = global.ResizeObserver, raf = window.requestAnimationFrame;
  global.ResizeObserver = class { observe() {} };
  window.requestAnimationFrame = () => 1;
  try {
    const form = document.querySelector('form'), input = form.querySelector('textarea');
    setupComposer(form); input.focus();
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    form.querySelector('.composer-avatar').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(input).toHaveFocus();
  } finally {
    global.ResizeObserver = observer; window.requestAnimationFrame = raf; document.body.innerHTML = '';
  }
});

 it('입력창 전환 중 호스를 매 프레임 연결하고 취소 뒤 갱신을 멈춘다', () => {
  document.body.innerHTML = '<div class="topic"></div><div id="scene"></div><div><form><div class="composer-devices"><div class="input-row"></div></div></form></div>';
  const observer = global.ResizeObserver, raf = window.requestAnimationFrame;
  global.ResizeObserver = class { observe() {} };
  const callbacks = [];
  window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length; };
  try {
    const form = document.querySelector('form'), panel = form.querySelector('.input-row');
    setupComposer(form);
    callbacks.shift()();
    updateTransport.mockClear();
    const transition = type => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, 'propertyName', { value: 'max-height' });
      panel.dispatchEvent(event);
    };
    transition('transitionrun');
    callbacks.shift()();
    callbacks.shift()();
    expect(updateTransport).toHaveBeenCalledTimes(2);
    transition('transitioncancel');
    callbacks.shift()();
    expect(callbacks).toHaveLength(0);
  } finally {
    global.ResizeObserver = observer; window.requestAnimationFrame = raf; document.body.innerHTML = '';
  }
});
