import { createArena } from '../../public/sparring-arena/src/scene.js';
import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
import { createCharacterDuel } from '../../public/sparring-arena/src/character-duel.js';
import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';
import { createCapsuleReveals } from '../../public/sparring-arena/src/capsule-reveals.js';
import { createClash } from '../../public/sparring-arena/src/clash.js';
import { createDispenser } from '../../public/sparring-arena/src/dispenser.js';

jest.mock('three', () => {
  const actual = jest.requireActual('../../public/sparring-arena/vendor/three.module.js');
  class WebGLRenderer {
    constructor() { this.domElement = global.document.createElement('canvas'); this.shadowMap = {}; this.info = { render: { calls: 0 }, memory: { geometries: 0 } }; }
    setPixelRatio() {} setClearColor() {} setSize() {} render() {} dispose() {} forceContextLoss() {}
  }
  return { ...actual, WebGLRenderer };
}, { virtual: true });
jest.mock('../../public/sparring-arena/src/studio-materials.js', () => ({ studioMaterial: () => ({ dispose() {} }), createStudioEnvironment: () => null }));
jest.mock('../../public/sparring-arena/src/capsules.js', () => ({ createCapsules: jest.fn() }));
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
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return 1; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { nextFrame = null; });
    media = { matches: false, addEventListener: noop, removeEventListener: noop };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => media) });
    global.ResizeObserver = class { observe() {} disconnect() {} };
    global.IntersectionObserver = class { observe() {} disconnect() {} };
    stage = document.createElement('div'); container = document.createElement('div'); stage.append(container); document.body.append(stage);
    Object.defineProperties(container, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
    capsules = { step: noop, replayPipe: () => null, stats: () => ({ queuedId: null, drawReady: true }), takeHistorical: jest.fn(() => ({ post: reply, fresh: false })), takeForDraw: jest.fn(), presentation: () => ({ tracking: ['flight'] }), launch: jest.fn(), shockwave: jest.fn(), updateState: noop, setPaused: noop };
    duel = { updateState: noop, prepare: jest.fn(() => [{ role: 0, post: original }, { role: 1, post: reply }]), emerge: jest.fn(), clear: jest.fn(), setLayout: noop, setPaused: noop, pinned: () => false, canReplace: () => true, step: noop, busy: () => false, needsFrame: () => false, stats: () => ({}), dispose: noop };
    history = { emerge: jest.fn(), setLayout: noop, setPaused: noop, setVisible: jest.fn(), pinned: () => false, step: noop, needsFrame: () => false, stats: () => ({ historyArriving: 0 }), dispose: noop };
    clash = { start: jest.fn(), busy: () => false, reposition: noop, step: noop, needsFrame: () => false, stats: () => ({}), dispose: noop };
    dispenser = { start: jest.fn(() => true), startPair: jest.fn(() => true), clearAll: jest.fn(), readyForNext: () => true, step: noop, outputs: () => [], stats: () => ({}) };
    reveals = { update: jest.fn(), dispose: noop };
    createCapsules.mockReturnValue(capsules);
    createCharacterDuel.mockImplementation(() => { const field = document.createElement('section'); field.className = 'character-duel'; stage.append(field); return duel; });
    createHistoryConversation.mockReturnValue(history); createClash.mockReturnValue(clash); createDispenser.mockReturnValue(dispenser); createCapsuleReveals.mockReturnValue(reveals);
    arena = createArena(container, noop, noop);
  });
  afterEach(() => { arena?.dispose(); stage.remove(); jest.restoreAllMocks(); });
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
    expect(duel.prepare).toHaveBeenCalledWith(reply, true, false);
    expect(dispenser.startPair).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ post: original, role: 0 }), expect.objectContaining({ post: reply, role: 1 })]), false);
    createDispenser.mock.calls[0][2].onOpened({ ...dispenser.startPair.mock.calls[0][0][1], body: { position: { x: 0, y: 0, z: 0 } } });
    expect(duel.emerge).toHaveBeenCalledWith(1, expect.any(Function), false); expect(history.emerge).not.toHaveBeenCalled();
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
