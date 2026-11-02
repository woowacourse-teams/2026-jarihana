import { createArena } from '../../public/sparring-arena/src/scene.js';
import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
import { createCharacterDuel } from '../../public/sparring-arena/src/character-duel.js';
import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';
import { createCapsuleReveals } from '../../public/sparring-arena/src/capsule-reveals.js';
import { createClash } from '../../public/sparring-arena/src/clash.js';
import { createDispenser } from '../../public/sparring-arena/src/dispenser.js';
import { whenCharacterAssetsReady } from '../../public/sparring-arena/src/characters.js';
import { WebGLRenderer } from 'three';

jest.mock('../../public/sparring-arena/src/characters.js', () => ({ whenCharacterAssetsReady: jest.fn(() => Promise.resolve()) }));

jest.mock('../../public/sparring-arena/src/composer-characters.js', () => ({ createComposerCharacters: () => ({ update() {}, step() {}, ship() {}, dispose() {}, presentation: () => null, setProjection() {} }) }));

jest.mock('three', () => {
  const actual = jest.requireActual('../../public/sparring-arena/vendor/three.module.js');
  class WebGLRenderer {
    constructor() { this.domElement = global.document.createElement('canvas'); this.shadowMap = {}; this.info = { reset() {}, render: { calls: 0 }, memory: { geometries: 0 } }; }
    clear() {} clearDepth() {} setViewport() {} setScissor() {} setScissorTest() {}
    setPixelRatio() {} setClearColor() {} setSize() {} render() {} dispose() {} forceContextLoss() {}
  }
  return { ...actual, WebGLRenderer };
}, { virtual: true });
jest.mock('../../public/sparring-arena/src/studio-materials.js', () => ({ studioMaterial: () => ({ dispose() {} }), createStudioEnvironment: () => null }));
jest.mock('../../public/sparring-arena/src/capsules.js', () => ({ createCapsules: jest.fn() }));
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: () => ({ draw() {}, hide() {} }) }));
jest.mock('../../public/sparring-arena/src/character-duel.js', () => ({ createCharacterDuel: jest.fn() }));
jest.mock('../../public/sparring-arena/src/walking-characters.js', () => ({ createWalkingCharacters: () => ({ draw() {}, hide() {} }) }));
jest.mock('../../public/sparring-arena/src/history-conversation.js', () => ({ createHistoryConversation: jest.fn() }));
jest.mock('../../public/sparring-arena/src/capsule-reveals.js', () => ({ createCapsuleReveals: jest.fn() }));
jest.mock('../../public/sparring-arena/src/clash.js', () => ({ createClash: jest.fn() }));
jest.mock('../../public/sparring-arena/src/dispenser.js', () => ({ createDispenser: jest.fn() }));
const original = { id: 'one', side: 'a', name: '크루', text: '기다려요' };
const reply = { id: 'two', side: 'b', name: '코치', text: '시간이 아까워요', replyTo: original };
const noop = () => {};

describe('지난 대화, 새 한마디, 받아치기 연출 분리', () => {
  let stage, container, arena, capsules, history, duel, clash, dispenser, reveals, now, nextFrame, media;
  function advance(seconds) {
    for (let i = 0; i < seconds * 20; i++) { now += 50; const callback = nextFrame; nextFrame = null; callback?.(now); }
  }
  beforeEach(() => {
    jest.clearAllMocks(); now = 0; nextFrame = null;
    whenCharacterAssetsReady.mockResolvedValue();
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return 1; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { nextFrame = null; });
    media = { matches: false, addEventListener: noop, removeEventListener: noop };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => media) });
    global.ResizeObserver = class { observe() {} disconnect() {} };
    global.IntersectionObserver = class { observe() {} disconnect() {} };
    stage = document.createElement('div'); container = document.createElement('div'); stage.append(container); document.body.append(stage);
    Object.defineProperties(container, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
    capsules = { step: noop, takeCollision: () => null, replayPipe: jest.fn(() => null), stats: () => ({ queuedId: null, drawReady: true }), takeHistorical: jest.fn(() => ({ post: reply, fresh: false })), takeForDraw: jest.fn(), presentation: () => ({ tracking: ['flight'] }), launch: jest.fn(), queueReplay: jest.fn(), shockwave: jest.fn(), updateState: noop, setPaused: noop };
    duel = { updateState: noop, prepare: jest.fn(() => [{ role: 0, post: original }, { role: 1, post: reply }]), emerge: jest.fn(), clear: jest.fn(), setLayout: jest.fn(), setPaused: noop, pinned: () => false, canReplace: () => true, step: noop, busy: () => false, needsFrame: () => false, stats: () => ({}), dispose: noop };
    history = { emerge: jest.fn(), setLayout: jest.fn(), setPaused: noop, setVisible: jest.fn(), pinned: () => false, step: noop, needsFrame: () => false, stats: () => ({ historyArriving: 0 }), dispose: noop };
    clash = { start: jest.fn(), busy: () => false, setCamera: jest.fn(), reposition: noop, step: jest.fn(), presentation: () => null, projectEffects: noop, needsFrame: () => false, stats: () => ({}), dispose: noop };
    dispenser = { setTrayWidth: jest.fn(), start: jest.fn(() => true), startPair: jest.fn(() => true), clearAll: jest.fn(), readyForNext: () => true, step: noop, presentation: () => null, outputs: () => [], stats: () => ({}) };
    reveals = { update: jest.fn(), spark: jest.fn(), dispose: noop };
    createCapsules.mockReturnValue(capsules);
    createCharacterDuel.mockImplementation(() => { const field = document.createElement('section'); field.className = 'character-duel'; stage.append(field); return duel; });
    createHistoryConversation.mockReturnValue(history); createClash.mockReturnValue(clash); createDispenser.mockReturnValue(dispenser); createCapsuleReveals.mockReturnValue(reveals);
    arena = createArena(container, noop, noop);
  });
  afterEach(() => { arena?.dispose(); stage.remove(); jest.restoreAllMocks(); });
  it('세 구도 전환은 살아 있는 대화와 캡슐을 비우지 않고 작은 모드의 크기만 적용하고 복원한다', () => {
    expect(container.dataset.viewMode).toBe('compact');
    expect(createDispenser.mock.calls[0][2].trayWidth).toBe(4.4);
    for (const [view, width, compact] of [['original', 10, false], ['reference', 14, false], ['compact', 4.4, true]]) {
      arena.setView(view);
      expect(container.dataset.viewMode).toBe(view);
      expect(dispenser.setTrayWidth).toHaveBeenLastCalledWith(width, compact ? 0.45 : 1);
      const field = stage.querySelector('.character-duel');
      expect(field.dataset.compact).toBe(String(compact));
      const size = field.style.getPropertyValue('--duel-figure-size');
      if (compact) expect(parseFloat(size)).toBeGreaterThan(0);
      else expect(size).toBe('');
      const layout = history.setLayout.mock.lastCall[0];
      expect(layout.characterScale).toBeCloseTo(compact ? 0.31 * 0.5 / 0.48 : 0.65);
      expect(dispenser.clearAll).not.toHaveBeenCalled();
      expect(duel.clear).not.toHaveBeenCalled();
    }
  });
  it.each([390, 1024])('%ipx에서 모바일 입력창만 호스를 가리고 캐릭터는 그 위에 그린다', width => {
    arena.dispose(); stage.replaceChildren(container);
    const form = document.createElement('form');
    form.id = 'composer'; form.innerHTML = '<div class="composer-field"></div>'; stage.append(form);
    form.firstChild.getBoundingClientRect = () => ({ left: 16, bottom: 540, width: 358, height: 140 });
    const descriptor = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
    const render = jest.spyOn(WebGLRenderer.prototype, 'render');
    try {
      arena = createArena(container, noop, noop); advance(.1);
      const front = render.mock.lastCall[0];
      const backdrop = front.getObjectByName('composer-backdrop');
      expect(backdrop.visible).toBe(width <= 700);
      if (width <= 700) {
        const bounds = backdrop.geometry;
        bounds.computeBoundingBox();
        expect(bounds.boundingBox.max.x).toBe(358);
        expect(bounds.boundingBox.max.y).toBe(140);
        expect(backdrop.position.z).toBeLessThan(30);
      }
    } finally {
      if (descriptor) Object.defineProperty(document.documentElement, 'clientWidth', descriptor);
      else delete document.documentElement.clientWidth;
    }
  });
  it('캐릭터 이미지와 호스 배치가 끝난 첫 렌더 뒤에만 준비 완료를 알린다', async () => {
    arena.dispose(); stage.replaceChildren(container);
    let finishAssets;
    whenCharacterAssetsReady.mockImplementationOnce(() => new Promise(resolve => { finishAssets = resolve; }));
    arena = createArena(container, noop, noop);
    const ready = jest.fn();
    arena.ready.then(ready);
    advance(.1);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    finishAssets();
    await Promise.resolve();
    advance(.1);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    container.dispatchEvent(new CustomEvent('transportlayout', { detail: [] }));
    expect(ready).not.toHaveBeenCalled();
    advance(.1);
    await arena.ready;
    expect(ready).toHaveBeenCalledTimes(1);
  });
  it('낙하감을 조정해도 파이프의 빠른 연속 발사 간격은 유지한다', () => {
    arena.updateState([original, reply], {}); advance(6);
    expect(capsules.replayPipe.mock.calls.length).toBeGreaterThanOrEqual(58);
    expect(capsules.replayPipe.mock.calls.length).toBeLessThanOrEqual(62);
  });
  it('지난 받아치기도 한 캡슐로 내려오며 개봉 후에만 대화 캐릭터가 나온다', () => {
    arena.updateState([original, reply], {}); advance(0.1);
    expect(dispenser.start).toHaveBeenCalledWith(expect.objectContaining({ post: reply, kind: 'history', fresh: false }), false);
    expect(clash.start).not.toHaveBeenCalled(); expect(duel.prepare).not.toHaveBeenCalled(); expect(history.emerge).not.toHaveBeenCalled();
    createDispenser.mock.calls[0][2].onOpened({ ...dispenser.start.mock.calls[0][0], characterOrigin: { x: 1, y: -6, z: 9 }, body: { position: { x: 0, y: 0, z: 0 } } });
    expect(history.emerge).toHaveBeenCalledWith(reply, { x: 1, y: -6, z: 9 }, false); expect(duel.emerge).not.toHaveBeenCalled();
  });
  it('새 일반 채팅은 파이프 말풍선으로 연결하고 대치 큐에 넣지 않는다', () => {
    arena.updateState([], {}); arena.launch(original); advance(0.8);
    expect(capsules.launch).toHaveBeenCalledWith(original, { reduced: false });
    expect(reveals.update).toHaveBeenCalledWith([], ['flight'], expect.anything());
    expect(dispenser.start).not.toHaveBeenCalled(); expect(clash.start).not.toHaveBeenCalled();
  });
  it('새 받아치기는 기존 충돌, 쌍 캡슐 미끄럼틀, VS로 이어진다', () => {
    arena.updateState([], {}); arena.launch(reply); advance(0.8);
    expect(clash.start).toHaveBeenCalledWith(reply, true, false); expect(history.setVisible).toHaveBeenCalledWith(false);
    createClash.mock.calls[0][4].onImpactComplete({ post: reply, fresh: true });
    expect(capsules.queueReplay).toHaveBeenCalledTimes(1);
    expect(capsules.queueReplay).toHaveBeenCalledWith(reply);
    expect(duel.prepare).toHaveBeenCalledWith(reply, true, false);
    expect(dispenser.startPair).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ post: original, role: 0 }), expect.objectContaining({ post: reply, role: 1 })]), false);
    createDispenser.mock.calls[0][2].onOpened({ ...dispenser.startPair.mock.calls[0][0][1], body: { position: { x: 0, y: 0, z: 0 } } });
    expect(duel.emerge).toHaveBeenCalledWith(1, expect.any(Function), false); expect(history.emerge).not.toHaveBeenCalled();
  });
  it('미끄럼틀과 대화가 진행 중이어도 즉시 전송하며 파이프 도착 시 한 번만 받아치기를 발사한다', () => {
    let arrive;
    dispenser.readyForNext = () => false;
    duel.canReplace = () => false;
    history.pinned = () => true;
    const transport = jest.fn(done => { arrive = done; });
    arena.updateState([], {});
    arena.launch(reply, transport);
    arena.launch(reply);
    advance(0.5);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(capsules.replayPipe).toHaveBeenCalled();
    advance(1);
    expect(clash.start).not.toHaveBeenCalled();
    expect(capsules.launch).not.toHaveBeenCalled();
    expect(capsules.replayPipe).toHaveBeenCalled();
    const feedBeforeClash = capsules.replayPipe.mock.calls.length;
    arrive(); arrive();
    clash.busy = () => true;
    advance(0.5);
    expect(capsules.replayPipe.mock.calls.length).toBeGreaterThan(feedBeforeClash);
    expect(clash.start).toHaveBeenCalledTimes(1);
    expect(clash.start).toHaveBeenCalledWith(reply, true, false);
    expect(clash.step).toHaveBeenCalledWith(0);
    arena.launch(reply); advance(0.1);
    expect(clash.start).toHaveBeenCalledTimes(1);
  });
  it('일반 채팅도 파이프 도착 뒤 한 번 발사하고 과거 상태 갱신은 새 전송을 막지 않는다', () => {
    let arrive;
    arena.updateState([original], {});
    arena.launch(original, done => { arrive = done; });
    advance(0.5);
    expect(capsules.replayPipe).toHaveBeenCalled();
    expect(capsules.launch).not.toHaveBeenCalled();
    arrive();
    arena.launch(original);
    expect(capsules.launch).toHaveBeenCalledTimes(1);
    expect(clash.start).not.toHaveBeenCalled();
  });
  it('실제 캡슐 큐의 새 대화가 호스 전달과 말풍선 이후 미끄럼틀 개봉, 대화 캐릭터로 이어진다', () => {
    arena.dispose(); stage.replaceChildren(container);
    createCapsules.mockImplementation(jest.requireActual('../../public/sparring-arena/src/capsules.js').createCapsules);
    arena = createArena(container, noop, noop);
    const old = Array.from({ length: 100 }, (_, i) => ({ ...original, id: 'old-' + i }));
    const balance = { a: 1, b: 1, total: 2, ratio: 0.5 };
    arena.updateState(old, balance); advance(0.1);
    arena.updateState([...old, original], balance);
    let arrive;
    arena.launch(original, done => { arrive = done; });
    const liveOutputs = () => dispenser.start.mock.calls.filter(([entry]) => entry.post.id === original.id);
    advance(1);
    expect(liveOutputs()).toHaveLength(0);
    arrive(); advance(4.4);
    expect(liveOutputs()).toHaveLength(0);
    advance(2);
    expect(liveOutputs()).toHaveLength(1);
    const entry = liveOutputs()[0][0];
    expect(entry).toMatchObject({ post: original, kind: 'history', fresh: false });
    const origin = { x: 1, y: -6, z: 9 };
    createDispenser.mock.calls.at(-1)[2].onOpened({ ...entry, characterOrigin: origin });
    expect(history.emerge).toHaveBeenCalledWith(original, origin, false);
  });
  it('경기장이 닫히면 진행 중인 전달을 정리하고 늦은 도착은 발사하지 않는다', async () => {
    let arrive;
    const cancel = jest.fn();
    arena.updateState([], {});
    const delivered = arena.launch(reply, done => { arrive = done; return cancel; });
    advance(0.1);
    arena.dispose(); arena = null;
    expect(cancel).toHaveBeenCalledTimes(1);
    arrive();
    expect(clash.start).not.toHaveBeenCalled();
    await expect(delivered).resolves.toBeUndefined();
  });
  it('미끄럼틀과 무관하게 시작한 전달도 종료 시 대기를 해제한다', async () => {
    dispenser.readyForNext = () => false;
    const transport = jest.fn();
    const delivered = arena.launch(reply, transport);
    advance(0.1);
    arena.dispose(); arena = null;
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(delivered).resolves.toBeUndefined();
  });
  it('연속 받아치기는 호스 이동을 즉시 시작하고 이전 충돌만 끝나면 발사한다', () => {
    let busy = true;
    clash.busy = () => busy;
    duel.canReplace = () => false;
    dispenser.readyForNext = () => false;
    const arrivals = [];
    const transport = jest.fn(done => { arrivals.push(done); });
    arena.launch(reply, transport);
    const next = { ...reply, id: 'next-reply' };
    arena.launch(next, transport);
    expect(transport).toHaveBeenCalledTimes(2);
    arrivals[0](); arrivals[1]();
    expect(clash.start).not.toHaveBeenCalled();
    clash.start.mockImplementation(() => { busy = true; });
    busy = false; advance(0.1);
    expect(clash.start).toHaveBeenCalledTimes(1);
    expect(clash.start).toHaveBeenLastCalledWith(reply, true, false);
    busy = false; advance(0.1);
    expect(clash.start).toHaveBeenCalledTimes(2);
    expect(clash.start).toHaveBeenLastCalledWith(next, true, false);
  });
  it('전달 효과 생성 실패는 즉시 발사로 이어지고 대기를 남기지 않는다', async () => {
    const delivered = arena.launch(original, () => { throw new Error('animation unavailable'); });
    await expect(delivered).resolves.toBeUndefined();
    expect(capsules.launch).toHaveBeenCalledTimes(1);
  });
  it('멈춤 중 다음 대화는 대기 간격을 건너뛰고 하나만 내려보낸다', () => {
    arena.updateState([], {}); arena.setPaused(true); arena.spill(); advance(1);
    expect(dispenser.start).toHaveBeenCalledTimes(1); expect(clash.start).not.toHaveBeenCalled();
  });
  it('지난 받아치기는 다시 보기를 눌렀을 때 충돌을 재생한다', () => {
    arena.updateState([], {}); arena.replayReply(reply); advance(0.8);
    expect(clash.start).toHaveBeenCalledWith(reply, false, false);
  });
  it('모션 감소에서는 자동 순환하지 않고 다음 대화를 누르면 개봉한다', () => {
    media.matches = true; arena.updateState([original, reply], {}); advance(6);
    expect(dispenser.start).toHaveBeenCalledTimes(1);
    arena.spill(); advance(0.2);
    expect(dispenser.start).toHaveBeenCalledTimes(2);
    expect(dispenser.start).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'history' }), true);
  });
});
