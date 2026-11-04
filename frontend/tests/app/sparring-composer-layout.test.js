import { updateTransport } from '../../public/sparring-arena/src/transport.js';
jest.mock('../../public/sparring-arena/src/transport.js', () => ({ updateTransport: jest.fn() }));
import { fitArenaViewport, fitVoteLabels, revealComposer, setupComposer } from '../../public/sparring-arena/src/composer.js';

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

  it('받아칠 의견으로 입력창이 길어져도 경기장 크기를 유지하고 화면 크기는 반영한다', () => {
    form.innerHTML = '<div class="composer-devices" style="min-height: 224px; --stage-composer-height: 154px"></div>';
    document.documentElement.style.setProperty('--arena-available-height', '900px');
    fitArenaViewport(form);
    const before = parseFloat(stage.style.height);
    Object.defineProperty(dock, 'offsetHeight', { value: 194 });
    fitArenaViewport(form);
    expect(parseFloat(stage.style.height)).toBe(before);
    document.documentElement.style.setProperty('--arena-available-height', '960px');
    fitArenaViewport(form);
    expect(parseFloat(stage.style.height)).toBe(before + 60);
  });

  it('데스크톱 상단 여백을 줄여도 경기장 크기는 늘리지 않는다', () => {
    stage.getBoundingClientRect = () => ({ top: 0 });
    fitArenaViewport(form);
    const height = stage.style.height;
    stage.getBoundingClientRect = () => ({ top: -32 });
    fitArenaViewport(form);
    expect(stage.style.height).toBe(height);
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
      expect(sceneTop).toBe(0);
      expect(parseFloat(stage.style.height)).toBe(320);
      expect(74 + parseFloat(stage.style.height) + dock.offsetHeight).toBeLessThanOrEqual(900);
    } finally {
      Object.defineProperty(window, 'innerWidth', viewport);
    }
  });

  it('모바일에서 제목과 편 이름이 길어지면 서로 겹치지 않도록 상단 공간을 늘린다', () => {
    const viewport = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    stage.innerHTML = '<header class="topic"></header><button class="vote-flag"></button><button class="vote-flag"></button>';
    const topic = stage.querySelector('.topic');
    Object.defineProperty(topic, 'offsetHeight', { value: 53, configurable: true });
    const [left, right] = stage.querySelectorAll('.vote-flag');
    left.getBoundingClientRect = () => ({ top: 94 });
    right.getBoundingClientRect = () => ({ top: 80 });
    try {
      fitArenaViewport(form);
      expect(stage.style.getPropertyValue('--mobile-topic-space')).toBe('61px');
      Object.defineProperty(topic, 'offsetHeight', { value: 34 });
      fitArenaViewport(form);
      expect(stage.style.getPropertyValue('--mobile-topic-space')).toBe('42px');
    } finally {
      Object.defineProperty(window, 'innerWidth', viewport);
    }
  });
});

it('모바일에서 입력창이 화면 밖이어도 포커스 도킹에 맡기고 스크롤하지 않는다', () => {
  const form = document.createElement('form');
  const viewport = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  try {
    form.getBoundingClientRect = () => ({ top: 400, bottom: innerHeight - 8 });
    form.scrollIntoView = jest.fn();
    revealComposer(form);
    expect(form.scrollIntoView).not.toHaveBeenCalled();
    form.getBoundingClientRect = () => ({ top: innerHeight - 80, bottom: innerHeight + 60 });
    revealComposer(form);
    expect(form.scrollIntoView).not.toHaveBeenCalled();
  } finally { Object.defineProperty(window, 'innerWidth', viewport); }
});

it('데스크톱에서는 입력란이 화면 밖이어도 받아치기로 경기장을 이동시키지 않는다', () => {
  const form = document.createElement('form');
  form.innerHTML = '<div class="composer-device" data-expanded="true"><textarea></textarea></div>';
  const input = form.querySelector('textarea');
  input.scrollIntoView = jest.fn();
  form.scrollIntoView = jest.fn();
  form.getBoundingClientRect = () => ({ top: innerHeight - 194, bottom: innerHeight + 30 });
  input.getBoundingClientRect = () => ({ top: innerHeight - 79, bottom: innerHeight + 13, height: 92 });
  revealComposer(form);
  expect(input.scrollIntoView).not.toHaveBeenCalled();
  expect(form.scrollIntoView).not.toHaveBeenCalled();
  input.getBoundingClientRect = () => ({ top: innerHeight + 10, bottom: innerHeight + 102, height: 92 });
  revealComposer(form);
  expect(input.scrollIntoView).not.toHaveBeenCalled();
  expect(form.scrollIntoView).not.toHaveBeenCalled();
});

it.each([390, 1440])('%ipx에서 키보드 크기 변화는 모바일 입력창만 도킹하고 경기장 크기를 유지한다', width => {
  document.body.innerHTML = '<header class="app-header"></header><div class="sparring-detail"><iframe></iframe></div><div class="stage"><div class="topic"></div><div id="scene"></div></div><div><form><textarea></textarea></form></div>';
  const saved = Object.fromEntries(['innerWidth', 'innerHeight', 'frameElement', 'visualViewport'].map(key => [key, Object.getOwnPropertyDescriptor(window, key)]));
  const observer = global.ResizeObserver, raf = window.requestAnimationFrame;
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  const host = document.querySelector('iframe'), form = document.querySelector('form'), stage = document.querySelector('.stage');
  host.getBoundingClientRect = () => ({ top: 48 });
  document.querySelector('.app-header').getBoundingClientRect = () => ({ height: 48 });
  document.querySelector('.stage').getBoundingClientRect = () => ({ top: 16 });
  Object.defineProperty(form, 'offsetHeight', { value: 122, configurable: true });
  Object.defineProperty(stage, 'clientWidth', { value: width - 32 });
  document.documentElement.style.setProperty('--arena-available-height', '796px');
  for (const [key, value] of Object.entries({ innerWidth: width, innerHeight: 844, frameElement: host, visualViewport: viewport })) Object.defineProperty(window, key, { configurable: true, value });
  global.ResizeObserver = class { observe() {} };
  let callback;
  window.requestAnimationFrame = fn => { callback = fn; return 1; };
  try {
    setupComposer(form); callback();
    const initialHeight = stage.style.height;
    form.querySelector('textarea').focus(); callback();
    if (width > 700) {
      viewport.height = 420; viewport.dispatchEvent(new Event('resize')); callback();
      expect(form).not.toHaveClass('keyboard-docked');
      expect(form.style.top).toBe('');
      expect(stage.style.height).toBe(initialHeight);
      expect(stage.style.getPropertyValue('--scene-top')).toBe('0px');
      expect(document.querySelector('.sparring-detail')).toHaveAttribute('data-keyboard-open', 'false');
      return;
    }
    expect(document.querySelector('.sparring-detail')).toHaveAttribute('data-composer-editing', 'true');
    expect(document.querySelector('.sparring-detail').style.getPropertyValue('--mobile-composer-height')).toBe('122px');
    expect(form).not.toHaveClass('keyboard-docked');
    viewport.height = 500; viewport.dispatchEvent(new Event('resize')); callback();
    expect(form).toHaveClass('keyboard-docked');
    expect(form.style.top).toBe('322px');
    expect(stage.style.height).toBe(initialHeight);
    expect(stage.style.getPropertyValue('--scene-top')).toBe('0px');
    expect(document.querySelector('.sparring-detail')).toHaveAttribute('data-keyboard-open', 'true');
    expect(form.querySelector('textarea')).toHaveFocus();
    viewport.height = 420; viewport.dispatchEvent(new Event('resize')); callback();
    expect(form.style.top).toBe('242px');
    expect(stage.style.height).toBe(initialHeight);
    expect(stage.style.getPropertyValue('--scene-top')).toBe('0px');
    Object.defineProperty(form, 'offsetHeight', { value: 170 });
    viewport.offsetTop = 20; viewport.dispatchEvent(new Event('scroll')); callback();
    expect(form.style.top).toBe('214px');
    expect(stage.style.height).toBe(initialHeight);
    expect(stage.style.getPropertyValue('--scene-top')).toBe('0px');
    viewport.height = 844; viewport.dispatchEvent(new Event('resize')); callback();
    expect(form).not.toHaveClass('keyboard-docked');
    expect(form.style.top).toBe('');
    expect(stage.style.height).toBe(initialHeight);
    form.querySelector('textarea').blur(); callback();
    expect(document.querySelector('.sparring-detail')).toHaveAttribute('data-composer-editing', 'false');
  } finally {
    window.dispatchEvent(new Event('pagehide'));
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(window, key, descriptor); else delete window[key];
    }
    global.ResizeObserver = observer; window.requestAnimationFrame = raf; document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--arena-available-height');
  }
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

it('편명 버튼의 호버·눌림 중 재배치해도 제목 위치와 폭을 유지한다', () => {
  document.body.innerHTML = '<div class="stage"><div class="topic"><h1>토론</h1></div><div id="scene"></div><button class="vote-flag"><strong>민트</strong></button><button class="vote-flag"><strong>코랄</strong></button></div><div><form></form></div>';
  const viewport = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const observer = global.ResizeObserver, raf = window.requestAnimationFrame;
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
  global.ResizeObserver = class { observe() {} };
  let callback;
  window.requestAnimationFrame = fn => { callback = fn; return 1; };
  const topic = document.querySelector('.topic');
  const labels = [...document.querySelectorAll('.vote-flag strong')];
  document.querySelector('.stage').getBoundingClientRect = () => ({ x: 0, y: 0, width: 1000 });
  Object.defineProperty(topic, 'offsetHeight', { value: 30 });
  let shift = [0, 0];
  labels.forEach((label, index) => {
    const left = index ? 720 : 200;
    label.getBoundingClientRect = () => ({ left: left + shift[0], right: left + 80 + shift[0], y: 80 + shift[1], height: 40 });
  });
  try {
    setupComposer(document.querySelector('form'));
    for (shift of [[0, 0], [-1, -2], [3, 4], [0, 0]]) {
      labels.forEach(label => { label.style.translate = `${shift[0]}px ${shift[1]}px`; });
      callback();
      expect(topic.style.getPropertyValue('--topic-row-top')).toBe('85px');
      expect(topic.style.getPropertyValue('--topic-row-width')).toBe('392px');
      labels.forEach(label => expect(label.parentElement.style.getPropertyValue('--claim-row-shift')).toBe('0px'));
    }
  } finally {
    Object.defineProperty(window, 'innerWidth', viewport);
    global.ResizeObserver = observer; window.requestAnimationFrame = raf; document.body.innerHTML = '';
  }
});

it('선택 띠가 있어도 양쪽 주장 본문 중심에 제목 카드 전체를 정렬한다', () => {
  document.body.innerHTML = '<div class="stage"><div class="topic"><h1>짧은 제목</h1></div><div id="scene"></div><button class="vote-flag"><strong style="padding-top:8px;padding-bottom:8px">민트</strong></button><button class="vote-flag"><strong style="padding-top:34px;padding-bottom:8px">코랄</strong></button></div><div><form></form></div>';
  const viewport = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const observer = global.ResizeObserver, raf = window.requestAnimationFrame;
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
  global.ResizeObserver = class { observe() {} };
  let callback;
  window.requestAnimationFrame = fn => { callback = fn; return 1; };
  const topic = document.querySelector('.topic');
  let stageY = 0;
  document.querySelector('.stage').getBoundingClientRect = () => ({ x: 0, y: stageY, width: 1000 });
  Object.defineProperty(topic, 'offsetHeight', { value: 54, configurable: true });
  document.querySelectorAll('.vote-flag strong').forEach((label, index) => {
    label.getBoundingClientRect = () => ({ left: index ? 700 : 180, right: index ? 820 : 300, y: 80, height: index ? 70 : 44 });
  });
  try {
    setupComposer(document.querySelector('form')); callback();
    expect(topic.style.getPropertyValue('--topic-row-top')).toBe('88px');
    expect(topic.style.getPropertyValue('--topic-row-width')).toBe('352px');
    expect([...document.querySelectorAll('.vote-flag')].map(label => label.style.getPropertyValue('--claim-row-shift'))).toEqual(['13px', '-13px']);
    Object.defineProperty(topic, 'offsetHeight', { value: 300 });
    callback();
    expect(topic.style.getPropertyValue('--topic-row-top')).toBe('0px');
    stageY = -32;
    callback();
    expect(topic.style.getPropertyValue('--topic-row-top')).toBe('32px');
  } finally {
    Object.defineProperty(window, 'innerWidth', viewport);
    global.ResizeObserver = observer; window.requestAnimationFrame = raf; document.body.innerHTML = '';
  }
});

it('양쪽 주장 폭을 맞추되 선택하지 않은 카드의 높이를 늘리지 않는다', () => {
  document.body.innerHTML = '<button class="vote-flag"><strong>짧은 주장</strong></button><button class="vote-flag"><strong>여러 줄이 되는 긴 주장</strong></button>';
  const rangeRects = Range.prototype.getClientRects;
  Range.prototype.getClientRects = function () { return [{ width: this.toString().includes('긴') ? 119 : 70 }]; };
  const labels = [...document.querySelectorAll('strong')];
  labels.forEach((label, index) => {
    Object.defineProperty(label.parentElement, 'clientWidth', { value: 200 });
    Object.defineProperty(label, 'offsetHeight', { value: index ? 80 : 60 });
  });
  try {
    fitVoteLabels();
    expect(labels.map(label => label.style.width)).toEqual(['120px', '120px']);
    expect(labels.map(label => label.style.height)).toEqual(['', '']);
  } finally { Range.prototype.getClientRects = rangeRects; document.body.innerHTML = ''; }
});

it('움직이는 받아치기 말풍선의 포인터 포커스만 막고 클릭과 키보드 접근은 유지한다', () => {
  document.body.innerHTML = '<div class="topic"></div><div class="stage"><div id="scene"></div><button class="history-conversation-speech"><span>의견</span></button><button class="vote-option">투표</button></div><div><form><textarea></textarea></form></div>';
  const observer = global.ResizeObserver, raf = window.requestAnimationFrame;
  global.ResizeObserver = class { observe() {} };
  window.requestAnimationFrame = () => 1;
  try {
    setupComposer(document.querySelector('form'));
    const bubble = document.querySelector('.history-conversation-speech');
    const clicked = jest.fn(); bubble.addEventListener('click', clicked);
    const pointer = new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    bubble.firstChild.dispatchEvent(pointer);
    expect(pointer.defaultPrevented).toBe(true);
    bubble.click(); expect(clicked).toHaveBeenCalledTimes(1);
    bubble.focus(); expect(bubble).toHaveFocus();
    const votePointer = new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    document.querySelector('.vote-option').dispatchEvent(votePointer);
    expect(votePointer.defaultPrevented).toBe(false);
  } finally {
    global.ResizeObserver = observer; window.requestAnimationFrame = raf; document.body.innerHTML = '';
  }
});
