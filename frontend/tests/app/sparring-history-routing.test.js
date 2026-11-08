import { createArena } from '../../public/sparring-arena/src/scene.js';
import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
import { createCharacterDuel } from '../../public/sparring-arena/src/character-duel.js';
import { createChairDuelVisuals } from '../../public/sparring-arena/src/chair-duel-visuals.js';
import { createChairCharacters } from '../../public/sparring-arena/src/chair-characters.js';
import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';
import { createCapsuleReveals } from '../../public/sparring-arena/src/capsule-reveals.js';
import { createClash } from '../../public/sparring-arena/src/clash.js';
import { createDispenser } from '../../public/sparring-arena/src/dispenser.js';
import { createComposerCharacters } from '../../public/sparring-arena/src/composer-characters.js';
import { whenCharacterAssetsReady } from '../../public/sparring-arena/src/characters.js';
import { createStudioEnvironment } from '../../public/sparring-arena/src/studio-materials.js';
import { Vector3, WebGLRenderer } from 'three';

jest.mock('../../public/sparring-arena/src/characters.js', () => ({ whenCharacterAssetsReady: jest.fn(() => Promise.resolve()) }));
jest.mock('../../public/sparring-arena/src/composer-characters.js', () => ({ createComposerCharacters: jest.fn(() => ({ update() {}, step() {}, ship() {}, dispose() {}, presentation: jest.fn(() => null), setProjection() {}, setStandingVisible: jest.fn() })) }));

jest.mock('three', () => {
  const actual = jest.requireActual('../../public/sparring-arena/vendor/three.module.js');
  class WebGLRenderer {
    constructor() { this.domElement = global.document.createElement('canvas'); this.shadowMap = {}; this.info = { reset() {}, render: { calls: 0 }, memory: { geometries: 0 } }; }
    clear() {} clearDepth() {} setViewport() {} setScissor() {} setScissorTest() {}
    setPixelRatio() {} setClearColor() {} setSize() {} render() {} dispose() {} forceContextLoss() {}
  }
  return { ...actual, WebGLRenderer };
}, { virtual: true });
jest.mock('../../public/sparring-arena/src/studio-materials.js', () => {
  const actual = jest.requireActual('../../public/sparring-arena/src/studio-materials.js');
  const { MeshPhysicalMaterial } = jest.requireActual('../../public/sparring-arena/vendor/three.module.js');
  return { ...actual, studioMaterial: options => new MeshPhysicalMaterial(options), createStudioEnvironment: jest.fn(() => null) };
});
jest.mock('../../public/sparring-arena/src/capsules.js', () => ({ createCapsules: jest.fn() }));
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: () => ({ draw() {}, hide() {} }) }));
jest.mock('../../public/sparring-arena/src/character-duel.js', () => ({ createCharacterDuel: jest.fn() }));
jest.mock('../../public/sparring-arena/src/chair-duel-visuals.js', () => ({ createChairDuelVisuals: jest.fn(() => ({ draw: jest.fn(), hide: jest.fn(), dispose: jest.fn() })) }));
jest.mock('../../public/sparring-arena/src/chair-characters.js', () => ({ createChairCharacters: jest.fn(() => ({ draw: jest.fn(), hide: jest.fn(), pickMeshes: [] })) }));
jest.mock('../../public/sparring-arena/src/history-conversation.js', () => ({
  ...jest.requireActual('../../public/sparring-arena/src/history-conversation.js'), createHistoryConversation: jest.fn(),
}));
jest.mock('../../public/sparring-arena/src/capsule-reveals.js', () => ({ createCapsuleReveals: jest.fn() }));
jest.mock('../../public/sparring-arena/src/clash.js', () => ({ createClash: jest.fn() }));
jest.mock('../../public/sparring-arena/src/dispenser.js', () => ({ createDispenser: jest.fn() }));
const original = { id: 'one', side: 'a', name: '크루', text: '기다려요' };
const reply = { id: 'two', side: 'b', name: '코치', text: '시간이 아까워요', replyTo: original };
const noop = () => {};

describe('지난 대화, 새 한마디, 받아치기 연출 분리', () => {
  let stage, container, arena, capsules, history, duel, clash, dispenser, reveals, now, nextFrame, media, freshReplies, resizeCallbacks;
  function advance(seconds) {
    for (let i = 0; i < seconds * 20; i++) { now += 50; const callback = nextFrame; nextFrame = null; callback?.(now); }
  }
  beforeEach(() => {
    jest.clearAllMocks(); now = 0; nextFrame = null; freshReplies = new Map();
    whenCharacterAssetsReady.mockResolvedValue();
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return 1; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { nextFrame = null; });
    media = { matches: false, addEventListener: noop, removeEventListener: noop };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => media) });
    resizeCallbacks = [];
    global.ResizeObserver = class { constructor(callback) { resizeCallbacks.push(callback); } observe() {} disconnect() {} };
    global.IntersectionObserver = class { observe() {} disconnect() {} };
    stage = document.createElement('div'); container = document.createElement('div'); stage.append(container); document.body.append(stage);
    Object.defineProperty(stage, 'clientWidth', { value: 900 });
    Object.defineProperties(container, { clientWidth: { configurable: true, value: 900 }, clientHeight: { configurable: true, value: 500 } });
    capsules = { step: noop, takeCollision: () => null, replayPipe: jest.fn(() => null), controlState: () => ({ queuedId: null, drawReady: true, freshReady: freshReplies.size > 0 }), stats: jest.fn(() => ({ queuedId: null, drawReady: true })), takeHistorical: jest.fn(() => { const next = freshReplies.values().next().value; if (next) { freshReplies.delete(next.id); return { post: next, fresh: true }; } return { post: reply, fresh: false }; }), takeForDraw: jest.fn(), presentation: () => ({ tracking: ['flight'] }), launch: jest.fn(), queueReplay: jest.fn((post, readyAt, fresh) => { if (fresh && readyAt === 0) freshReplies.set(post.id, post); }), settleReplays: jest.fn(() => freshReplies.clear()), shockwave: jest.fn(), updateState: noop, setPaused: noop };
    duel = { updateState: noop, prepare: jest.fn(() => [{ role: 0, post: original }, { role: 1, post: reply }]), emerge: jest.fn(), clear: jest.fn(), setLayout: jest.fn(), setPaused: noop, pinned: () => false, canReplace: () => true, step: noop, busy: () => false, needsFrame: () => false, stats: () => ({}), dispose: noop };
    history = { setBrawl: jest.fn(), setCharacterLimits: jest.fn(), hasAuthor: jest.fn(() => false), canAccept: jest.fn(() => true), canReplace: jest.fn(() => true), emerge: jest.fn(), leaveAll: jest.fn(), setCheering: jest.fn(), setLayout: jest.fn(), setPaused: noop, setVisible: jest.fn(), pinned: () => false, step: noop, needsFrame: () => false, stats: () => ({ historyArriving: 0 }), dispose: noop };
    clash = { start: jest.fn(), busy: () => false, setCamera: jest.fn(), reposition: noop, step: jest.fn(), presentation: () => null, projectEffects: noop, needsFrame: () => false, stats: () => ({}), dispose: noop };
    dispenser = { setTrayWidth: jest.fn(), start: jest.fn(() => true), startPair: jest.fn(() => true), clearAll: jest.fn(), readyForNext: () => true, step: noop, presentation: () => null, outputs: () => [], stats: () => ({}) };
    reveals = { update: jest.fn(), spark: jest.fn(), dispose: noop };
    createCapsules.mockReturnValue(capsules);
    createCharacterDuel.mockImplementation(() => { const field = document.createElement('section'); field.className = 'character-duel'; stage.append(field); return duel; });
    createHistoryConversation.mockReturnValue(history); createClash.mockReturnValue(clash); createDispenser.mockReturnValue(dispenser); createCapsuleReveals.mockReturnValue(reveals);
    arena = createArena(container, noop, noop);
  });
  afterEach(() => { arena?.dispose(); stage.remove(); jest.restoreAllMocks(); });
  it.each(['compact', 'original'])('%s 구도에서 집기 좌표를 마당 평면으로 역투영한다', view => {
    arena.setView(view);
    const { project, unproject, unprojectHold } = createHistoryConversation.mock.lastCall[3];
    for (const point of [{ x: -2, y: -6.4, z: 9 }, { x: 3, y: -6.4, z: 14 }]) {
      const result = unproject(project(point), point.y);
      expect(result.x).toBeCloseTo(point.x, 5);
      expect(result.y).toBe(point.y);
      expect(result.z).toBeCloseTo(point.z, 5);
      const screen = project(point), target = { x: screen.x + 80, y: screen.y - 120 };
      const held = unprojectHold(target, point);
      expect(project(held).x).toBeCloseTo(target.x, 5);
      expect(project(held).y).toBeCloseTo(target.y, 5);
      const groundAgain = unproject(project(point), point.y);
      expect(groundAgain.y).toBe(point.y);
    }
  });
  it('16명 좌표를 매 프레임 투영할 때 DOM 크기를 반복 측정하지 않고 리사이즈와 위치 이동을 반영한다', () => {
    let width = 900, height = 500, top = 20;
    const reads = { clientWidth: jest.fn(() => width), clientHeight: jest.fn(() => height), offsetTop: jest.fn(() => top) };
    for (const [name, get] of Object.entries(reads)) Object.defineProperty(container, name, { configurable: true, get });
    resizeCallbacks.at(-1)();
    const project = createHistoryConversation.mock.lastCall[3].project;
    const camera = createClash.mock.calls[0][2];
    const point = { x: 1, y: -4, z: 9 };
    const expected = () => {
      const p = new Vector3(point.x, point.y, point.z).project(camera);
      return { x: (p.x + 1) * width / 2, y: top + (1 - p.y) * height / 2 };
    };
    for (const read of Object.values(reads)) read.mockClear();
    for (let frame = 0; frame < 120; frame++) {
      for (let index = 0; index < 16 * 2; index++) expect(project(point)).toEqual(expected());
    }
    for (const read of Object.values(reads)) expect(read).not.toHaveBeenCalled();
    const before = project(point);
    width = 600; height = 400; top = 40;
    resizeCallbacks.at(-1)();
    expect(project(point)).toEqual(expected());
    expect(project(point)).not.toEqual(before);
    top = 55; advance(.05);
    expect(project(point)).toEqual(expected());
  });
  it.each(['compact', 'original'])('%s 구도는 패싸움 전환과 다른 구도 왕복 후에도 각도·확대율·투영 위치가 같다', view => {
    arena.setView(view);
    const currentCamera = () => clash.setCamera.mock.lastCall?.[0] ?? createClash.mock.calls[0][2];
    const snapshot = () => {
      const camera = currentCamera();
      return { position: camera.position.toArray(), rotation: camera.quaternion.toArray(), zoom: camera.zoom,
        projection: [...camera.projectionMatrix.elements], anchors: container.dataset.pipeAnchors };
    };
    const before = snapshot();
    arena.setBrawl(true);
    expect(snapshot()).toEqual(before);
    arena.setView(view === 'compact' ? 'original' : 'compact'); arena.setView(view);
    expect(snapshot()).toEqual(before);
    arena.setBrawl(false);
    expect(snapshot()).toEqual(before);
  });
  it('패싸움 전환은 기존 인물과 큐를 유지하며 새 인물도 미끄럼틀 개봉 뒤 입장한다', () => {
    history.step = jest.fn();
    capsules.takeHistorical.mockReturnValueOnce({ post: original, fresh: false }).mockReturnValue(null);
    arena.updateState([original], { total: 1 });
    const before = capsules.takeHistorical.mock.calls.length;
    arena.setBrawl(true);
    expect(history.setBrawl).toHaveBeenCalledWith(true, false);
    expect(capsules.takeHistorical).toHaveBeenCalledTimes(before);
    advance(1);
    expect(stage.dataset.brawl).toBe('true');
    expect(history.step).toHaveBeenCalled();
    expect(history.leaveAll).not.toHaveBeenCalled();
    expect(history.setVisible).toHaveBeenLastCalledWith(true, { speech: true });
    expect(dispenser.start).toHaveBeenCalledWith(expect.objectContaining({ post: original, kind: 'history' }), false);
    expect(history.emerge).not.toHaveBeenCalled();
    const origin = { x: 1, y: -6, z: 9 };
    createDispenser.mock.calls[0][2].onOpened({ groupId: 0, kind: 'history', post: original, characterOrigin: origin, body: { position: origin } });
    expect(history.emerge).toHaveBeenCalledWith(original, origin, false);
    expect(createDispenser.mock.calls[0][0].visible).toBe(true);
    arena.setBrawl(false); arena.setBrawl(false);
    expect(history.setBrawl.mock.calls).toEqual([[true, false], [false, false]]);
  });
  it('팀별 인원 변경은 재생 큐나 카메라를 다시 만들지 않고 마당에 전달한다', () => {
    media.matches = true;
    const starts = dispenser.start.mock.calls.length;
    const cameras = clash.setCamera.mock.calls.length;
    arena.setCharacterLimits({ a: 3, b: 5 });
    expect(history.setCharacterLimits).toHaveBeenCalledWith({ a: 3, b: 5 }, true);
    expect(history.leaveAll).not.toHaveBeenCalled();
    expect(dispenser.start).toHaveBeenCalledTimes(starts);
    expect(clash.setCamera).toHaveBeenCalledTimes(cameras);
  });
  it('패싸움 중 새 받아치기도 기존 충돌과 미끄럼틀 연출을 거친다', () => {
    arena.updateState([], {}); arena.setBrawl(true); arena.launch(reply); advance(1);
    expect(clash.start).toHaveBeenCalledWith(reply, true, false);
    expect(freshReplies.size).toBe(0);
    expect(history.setCheering).toHaveBeenCalledWith(true, false);
    expect(createDispenser.mock.calls[0][0].visible).toBe(true);
    createClash.mock.calls[0][4].onImpactComplete({ post: reply, fresh: true });
    expect(dispenser.startPair).toHaveBeenCalledWith(expect.any(Array), false);
  });
  it('패싸움에도 기존 일시정지와 모션 감소 재생 규칙을 적용한다', () => {
    history.step = jest.fn(); media.matches = true;
    arena.setBrawl(true); expect(history.setBrawl).toHaveBeenCalledWith(true, true);
    arena.setPaused(true); advance(1); expect(history.step).not.toHaveBeenCalled();
    arena.setPaused(false); advance(.1); expect(history.step).toHaveBeenCalledWith(expect.any(Number), true);
    expect(capsules.takeHistorical).not.toHaveBeenCalled();
    arena.launch(reply); advance(1);
    expect(clash.start).toHaveBeenCalledWith(reply, true, true);
  });
  it('마당에 있는 작성자의 다음 글은 캡슐을 다시 열지 않고 같은 인물에게 전달한다', () => {
    history.hasAuthor.mockReturnValue(true);
    capsules.takeHistorical.mockReturnValue({ post: original, fresh: false });
    arena.updateState([original], { a: 1, b: 0, total: 1, ratio: 1 });
    expect(history.emerge).toHaveBeenCalledWith(original, null, false);
    expect(dispenser.start).not.toHaveBeenCalled();
    expect(history.leaveAll).not.toHaveBeenCalled();
  });
  it('최초 과거 페이지를 기다리는 동안 빈 재생 선택을 열지 않고 응답 후 재생한다', () => {
    capsules.takeHistorical.mockReturnValue(null);
    expect(() => arena.updateState([original], { a: 1, b: 0, total: 1, ratio: 1 }, { page: 0, posts: [] })).not.toThrow();
    advance(2);
    expect(dispenser.start).not.toHaveBeenCalled();
    capsules.takeHistorical.mockReturnValue({ post: original, fresh: false });
    arena.updateState([original], { a: 1, b: 0, total: 1, ratio: 1 }, { page: 1, posts: [original] });
    advance(2);
    expect(dispenser.start).toHaveBeenCalled();
  });
  it('받아치기와 지난 대화 모두 의자 캐릭터를 각 장면의 좌표에 연결한다', () => {
    const [front, visualStage] = createChairDuelVisuals.mock.lastCall;
    const [world, capacity] = createChairCharacters.mock.lastCall;
    expect(visualStage).toBe(stage);
    expect(front.isGroup).toBe(true);
    expect(front.parent.isScene).toBe(true);
    expect(world.isScene).toBe(true);
    expect(front).not.toBe(world);
    expect(capacity).toBe(32);
    expect(createCharacterDuel.mock.lastCall[3]).toBe(createChairDuelVisuals.mock.results.at(-1).value);
    expect(createHistoryConversation.mock.lastCall[3]).toMatchObject({
      draw: expect.any(Function),
      hide: expect.any(Function),
      project: expect.any(Function),
    });
  });
  it('집은 인물만 앞쪽 장면에서 그리고 놓으면 원래 마당 모델로 복귀한다', () => {
    const visuals = createHistoryConversation.mock.lastCall[3];
    const worldModels = createChairCharacters.mock.results.at(-1).value;
    const position = { x: 0, y: -4, z: 10 };
    visuals.draw(3, original, position, 1, { hanging: true }, 0);
    const [heldWorld, capacity] = createChairCharacters.mock.lastCall;
    const heldModels = createChairCharacters.mock.results.at(-1).value;
    expect(capacity).toBe(1);
    expect(heldWorld).not.toBe(createChairCharacters.mock.calls[0][0]);
    expect(worldModels.hide).toHaveBeenCalledWith(3);
    expect(heldModels.draw).toHaveBeenCalledWith(0, original, position, 1, { hanging: true }, 0);
    visuals.draw(3, original, position, 1, { hanging: false }, 0.6);
    expect(heldModels.hide).toHaveBeenCalledWith(0);
    expect(worldModels.draw).toHaveBeenCalledWith(3, original, position, 1, { hanging: false }, 0.6);
  });
  it.each(['compact', 'original'])('%s 구도에서 잡힌 인물의 의자 던지기는 현재 카메라를 목표로 전달한다', view => {
    arena.setView(view);
    const visuals = createHistoryConversation.mock.lastCall[3];
    const pose = { hanging: true, chairFlight: { target: 'camera', progress: .2 } };
    visuals.draw(3, original, { x: 0, y: -4, z: 10 }, 1, pose, 0);
    const rendered = createChairCharacters.mock.results.at(-1).value.draw.mock.lastCall[4];
    expect(rendered.chairFlight.camera).toBe(clash.setCamera.mock.lastCall?.[0] ?? createClash.mock.calls[0][2]);
    expect(rendered.chairFlight).toMatchObject({ target: 'camera', progress: .2 });
    expect(pose.chairFlight.camera).toBeUndefined();
  });
  it.each([[7, 2], [2, 7]])('포커스가 %i번에서 %i번으로 바뀌어도 새 인물을 전경에 유지하고 이전 인물은 마당으로 복귀한다', (previous, next) => {
    const visuals = createHistoryConversation.mock.lastCall[3];
    const worldModels = createChairCharacters.mock.results.at(-1).value;
    const position = { x: 0, y: -6.3, z: 10 };
    visuals.draw(previous, original, position, 1, { focused: true }, 0);
    const foreground = createChairCharacters.mock.results.at(-1).value;
    const canvas = document.querySelector('.arena-held-renderer');
    advance(.1);
    expect(canvas.hidden).toBe(false);
    expect(canvas.dataset.held).toBe('false');
    expect(worldModels.hide).toHaveBeenCalledWith(previous);
    expect(foreground.draw).toHaveBeenLastCalledWith(0, original, position, 1, { focused: true }, 0);
    foreground.hide.mockClear();
    const drawPrevious = () => visuals.draw(previous, original, position, 1, { focused: false }, .6);
    const drawNext = () => visuals.draw(next, reply, position, 1, { focused: true }, .2);
    if (previous < next) { drawPrevious(); drawNext(); }
    else { drawNext(); drawPrevious(); }
    advance(.1);
    expect(canvas.hidden).toBe(false);
    expect(worldModels.draw).toHaveBeenCalledWith(previous, original, position, 1, { focused: false }, .6);
    expect(worldModels.hide).toHaveBeenCalledWith(next);
    expect(foreground.draw).toHaveBeenLastCalledWith(0, reply, position, 1, { focused: true }, .2);
    if (previous > next) expect(foreground.hide).not.toHaveBeenCalled();
    visuals.hide(previous);
    expect(canvas.hidden).toBe(false);
    visuals.hide(next);
    expect(canvas.hidden).toBe(true);
    expect(foreground.hide).toHaveBeenCalledWith(0);
  });
  it('첫 포커스에만 전경 캔버스를 만들고 집기와 일반 포커스 전환에 같은 모델과 렌더러를 재사용한다', () => {
    const field = document.createElement('section');
    field.className = 'history-conversation';
    stage.append(field);
    const visuals = createHistoryConversation.mock.lastCall[3];
    const worldModels = createChairCharacters.mock.results.at(-1).value;
    const position = { x: 0, y: -6.3, z: 10 };
    visuals.draw(1, original, position, 1, {}, 0);
    expect(document.querySelector('.arena-held-renderer')).toBeNull();
    visuals.draw(1, original, position, 1, { focused: true }, 0);
    const canvas = document.querySelector('.arena-held-renderer');
    const foreground = createChairCharacters.mock.results.at(-1).value;
    expect(createChairCharacters.mock.lastCall[1]).toBe(1);
    expect(canvas.dataset.held).toBe('false');
    expect(canvas.parentElement).toBe(field);
    visuals.draw(1, original, position, 1, { focused: true, hanging: true }, 0);
    expect(canvas.dataset.held).toBe('true');
    expect(canvas.parentElement).toBe(document.body);
    visuals.draw(1, original, position, 1, { released: true, hanging: false }, 0);
    expect(canvas.dataset.held).toBe('true');
    expect(canvas.parentElement).toBe(document.body);
    visuals.draw(1, original, position, 1, { focused: true, hanging: false }, 0);
    expect(canvas.dataset.held).toBe('false');
    expect(canvas.parentElement).toBe(field);
    expect(createChairCharacters).toHaveBeenCalledTimes(2);
    expect(createStudioEnvironment).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('.arena-held-renderer')).toHaveLength(1);
    visuals.draw(1, original, position, 1, { focused: false }, .6);
    expect(canvas.hidden).toBe(true);
    expect(foreground.hide).toHaveBeenCalledWith(0);
    expect(worldModels.draw).toHaveBeenLastCalledWith(1, original, position, 1, { focused: false }, .6);
  });
  it.each(['compact', 'original'])('%s 구도에서 의자 충격은 렌더 화면만 픽셀 단위로 흔들고 집기 좌표와 기본 카메라를 유지한다', view => {
    jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(900);
    jest.spyOn(container, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 900, bottom: 500, width: 900, height: 500 });
    arena.setView(view);
    const visuals = createHistoryConversation.mock.lastCall[3];
    const world = createChairCharacters.mock.lastCall[0];
    const position = { x: 1, y: -4, z: 10 }, projected = visuals.project(position);
    const base = clash.setCamera.mock.lastCall?.[0] ?? createClash.mock.calls[0][2];
    const baseProjection = base.projectionMatrix.clone(), baseView = { ...base.view };
    const renders = [];
    jest.spyOn(WebGLRenderer.prototype, 'render').mockImplementation((scene, camera) => {
      renders.push({ scene, point: new Vector3(position.x, position.y, position.z).project(camera), view: { ...camera.view } });
    });
    visuals.draw(3, original, position, 1, { hanging: true }, 0);
    const foreground = createChairCharacters.mock.lastCall[0];
    advance(.1);
    const before = renders.filter(call => call.scene === world).at(-1);
    visuals.draw(3, original, position, 1, { hanging: true, cameraShake: { x: 4, y: -2 } }, 0);
    advance(.1);
    const hit = renders.filter(call => call.scene === world).at(-1);
    expect((hit.point.x - before.point.x) * 900 / 2).toBeCloseTo(-4);
    expect((hit.point.y - before.point.y) * innerHeight / 2).toBeCloseTo(-2);
    expect(renders.filter(call => call.scene === foreground).at(-1).view).toEqual(hit.view);
    expect(visuals.project(position)).toEqual(projected);
    expect(base.projectionMatrix).toEqual(baseProjection);
    expect(base.view).toEqual(baseView);
    visuals.draw(3, original, position, 1, { hanging: true }, 0);
    advance(.1);
    expect(renders.filter(call => call.scene === world).at(-1).view).toEqual(before.view);
    visuals.draw(3, original, position, 1, { hanging: true, cameraShake: { x: 4, y: -2 } }, 0);
    visuals.hide(3); advance(.1);
    expect(renders.filter(call => call.scene === world).at(-1).view).toEqual(before.view);
    visuals.draw(3, original, position, 1, { hanging: true, cameraShake: { x: 4, y: -2 } }, 0);
    media.matches = true; advance(.1);
    expect(renders.filter(call => call.scene === world).at(-1).view).toEqual(before.view);
    media.matches = false; arena.setPaused(true); advance(.1);
    expect(renders.filter(call => call.scene === world).at(-1).view).toEqual(before.view);
  });
  it('집을 때만 별도 투명 캔버스를 만들어 같은 구도로 그리고 숨김과 해제 때 자원을 정리한다', () => {
    const width = jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(900);
    jest.replaceProperty(window, 'devicePixelRatio', 2);
    const render = jest.spyOn(WebGLRenderer.prototype, 'render');
    const setSize = jest.spyOn(WebGLRenderer.prototype, 'setSize');
    const setViewport = jest.spyOn(WebGLRenderer.prototype, 'setViewport');
    const setPixelRatio = jest.spyOn(WebGLRenderer.prototype, 'setPixelRatio');
    const dispose = jest.spyOn(WebGLRenderer.prototype, 'dispose');
    const forceContextLoss = jest.spyOn(WebGLRenderer.prototype, 'forceContextLoss');
    const environment = { dispose: jest.fn() };
    createStudioEnvironment.mockReturnValueOnce(environment);
    const visuals = createHistoryConversation.mock.lastCall[3];
    const position = { x: 0, y: -4, z: 10 };
    expect(document.querySelector('.arena-held-renderer')).toBeNull();
    visuals.draw(3, original, position, 1, { hanging: true }, 0);
    const canvas = document.querySelector('.arena-held-renderer');
    const heldRenderer = createStudioEnvironment.mock.lastCall[0];
    const heldWorld = createChairCharacters.mock.lastCall[0];
    expect(canvas.parentElement).toBe(document.body);
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(setPixelRatio).toHaveBeenCalledWith(1.5);
    expect(heldWorld.environment).toBe(environment);
    advance(.1);
    const heldDraw = render.mock.calls.findIndex(([world]) => world === heldWorld);
    expect(heldDraw).toBeGreaterThanOrEqual(0);
    expect(render.mock.contexts[heldDraw]).toBe(heldRenderer);
    expect(render.mock.calls[heldDraw][1]).toBe(render.mock.calls[heldDraw - 1][1]);
    expect(canvas.hidden).toBe(false);
    const viewportFor = target => setViewport.mock.calls.filter((_, index) => setViewport.mock.contexts[index] === target);
    const mainRenderer = createStudioEnvironment.mock.calls[0][0];
    expect(viewportFor(mainRenderer)).toContainEqual(viewportFor(heldRenderer).at(-1));
    const heldSizes = () => setSize.mock.calls.filter((_, index) => setSize.mock.contexts[index] === heldRenderer);
    expect(heldSizes()).toHaveLength(1);
    width.mockReturnValue(1000);
    advance(.1);
    expect(heldSizes()).toHaveLength(2);
    expect(heldSizes().at(-1)).toEqual([1000, innerHeight, false]);
    visuals.hide(3);
    expect(canvas.hidden).toBe(true);
    render.mockClear();
    advance(.1);
    expect(render.mock.calls.some(([world]) => world === heldWorld)).toBe(false);
    visuals.draw(4, original, position, 1, { hanging: true }, 0);
    expect(document.querySelectorAll('.arena-held-renderer')).toHaveLength(1);
    expect(createStudioEnvironment).toHaveBeenCalledTimes(2);
    visuals.draw(4, original, position, 1, { hanging: false }, 0);
    expect(canvas.hidden).toBe(true);
    arena.dispose(); arena = null;
    expect(environment.dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.contexts).toContain(heldRenderer);
    expect(forceContextLoss.mock.contexts).toContain(heldRenderer);
    expect(canvas.isConnected).toBe(false);
  });
  it('캐릭터 등장 중 다시 깨워도 프레임 예약은 하나만 유지하고 화면을 숨기면 모두 취소한다', () => {
    arena.dispose(); stage.replaceChildren(container);
    const pending = new Map();
    let sequence = 0;
    window.requestAnimationFrame.mockImplementation(callback => {
      pending.set(++sequence, callback); return sequence;
    });
    window.cancelAnimationFrame.mockImplementation(id => pending.delete(id));
    arena = createArena(container, noop, noop);
    capsules.step = () => stage.dispatchEvent(new Event('historywake'));
    for (let i = 0; i < 10; i++) {
      const [id, callback] = pending.entries().next().value;
      pending.delete(id); now += 1000 / 60; callback(now);
      expect(pending.size).toBe(1);
    }
    jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pending.size).toBe(0);
  });
  it.each([60, 120, 144, 240])('%iHz에서 장면은 최대 120fps로 갱신하고 전체 통계는 매 프레임 계산하지 않는다', hz => {
    capsules.step = jest.fn();
    capsules.stats.mockClear();
    for (let frame = 0; frame < hz * 2; frame++) {
      now = frame * 1000 / hz;
      const callback = nextFrame; nextFrame = null;
      callback?.(now);
    }
    expect(capsules.step).toHaveBeenCalledTimes(Math.min(hz, 120) * 2);
    expect(capsules.step.mock.calls.reduce((sum, [delta]) => sum + delta, 0)).toBeCloseTo(2, 1);
    expect(capsules.stats.mock.calls.length).toBeGreaterThan(0);
    expect(capsules.stats.mock.calls.length).toBeLessThanOrEqual(8);
    expect(capsules.replayPipe).toHaveBeenCalled();
    expect(nextFrame).toEqual(expect.any(Function));
  });
  it('숨겨진 화면에 도착한 일반 채팅과 받아치기를 복귀 시 한꺼번에 발사하지 않는다', async () => {
    const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    clash.busy = () => true;
    const transport = jest.fn();
    for (let i = 0; i < 120; i++) {
      arena.launch({ ...original, id: 'chat-' + i });
      arena.launch({ ...reply, id: 'reply-' + i });
    }
    const delivered = arena.launch({ ...reply, id: 'own-background' }, transport);
    expect(capsules.launch).not.toHaveBeenCalled();
    expect(clash.start).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    await delivered;
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    clash.busy = () => false;
    advance(.5);
    expect(clash.start).not.toHaveBeenCalled();
    expect(capsules.replayPipe).toHaveBeenCalled();
    expect(JSON.parse(container.dataset.renderStats).replyQueued).toBe(0);
    expect(nextFrame).toEqual(expect.any(Function));
    arena.launch({ ...reply, id: 'after-return' }); advance(.8);
    expect(clash.start).toHaveBeenCalledTimes(1);
  });
  it('화면을 떠나기 전에 밀린 받아치기도 복귀 후 연속 재생하지 않는다', () => {
    clash.busy = () => true;
    for (let i = 0; i < 20; i++) arena.launch({ ...reply, id: 'queued-' + i });
    advance(.1);
    expect(freshReplies.size).toBe(20);
    const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    now += 600000;
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    clash.busy = () => false;
    advance(.1);
    expect(clash.start).not.toHaveBeenCalled();
    expect(JSON.parse(container.dataset.renderStats).replyQueued).toBe(0);
    expect(nextFrame).toEqual(expect.any(Function));
  });
  it('세 구도 전환은 살아 있는 대화와 캡슐을 비우지 않고 작은 모드의 크기만 적용하고 복원한다', () => {
    expect(container.dataset.viewMode).toBe('compact');
    expect(createDispenser.mock.calls[0][2].trayWidth).toBe(3.2);
    for (const [view, width, compact] of [['original', 5, false], ['reference', 5, false], ['compact', 3.2, true]]) {
      arena.setView(view);
      expect(container.dataset.viewMode).toBe(view);
      expect(dispenser.setTrayWidth).toHaveBeenLastCalledWith(width, compact ? 0.45 : 1);
      const field = stage.querySelector('.character-duel');
      expect(field.dataset.compact).toBe(String(compact));
      expect(field.style.getPropertyValue('--duel-figure-size')).toBe('');
      const destinations = duel.setLayout.mock.lastCall[0];
      expect(destinations[1].x - destinations[0].x).toBeGreaterThan(0);
      const layout = history.setLayout.mock.lastCall[0];
      expect(layout.characterScale).toBeCloseTo(compact ? 0.31 * 0.5 / 0.48 : 0.65);
      expect(layout.worldRight.x - layout.worldLeft.x).toBeCloseTo(compact ? 2.5 : 4.0);
      expect(layout.worldLeft.y).toBe(-6.4);
      expect(layout.worldRight.y).toBe(-6.4);
      expect(layout.worldLeft.z).toBe(compact ? 9.6 : 10.1);
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
        expect(bounds.boundingBox.max.x).toBe(354);
        expect(bounds.boundingBox.max.y).toBe(136);
        expect(backdrop.position.z).toBeLessThan(30);
        form.firstChild.style.setProperty('--inlet-soft', '#fff0ed');
        form.dataset.side = 'b'; advance(.1);
        expect(backdrop.material.color.getHex()).toBe(0xfff0ed);
        form.firstChild.style.setProperty('--inlet-soft', '#def6f3');
        form.dataset.side = 'a'; advance(.1);
        expect(backdrop.material.color.getHex()).toBe(0xdef6f3);
      }
    } finally {
      if (descriptor) Object.defineProperty(document.documentElement, 'clientWidth', descriptor);
      else delete document.documentElement.clientWidth;
    }
  });
  it.each([[390, 'finish'], [1024, 'finish'], [390, 'disable'], [390, 'reduced'], [390, 'view'], [390, 'dispose']])('%ipx 추적 중 입력 UI를 숨기고 %s 이후 초안과 함께 복원한다', (width, ending) => {
    arena.dispose(); stage.replaceChildren(container);
    const form = document.createElement('form');
    form.id = 'composer'; form.innerHTML = '<div class="composer-field"><textarea>이어 쓰던 초안</textarea></div>';
    stage.append(form);
    form.firstChild.getBoundingClientRect = () => ({ left: 16, bottom: 540, width: 358, height: 140 });
    const descriptor = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
    const render = jest.spyOn(WebGLRenderer.prototype, 'render');
    try {
      arena = createArena(container, noop, noop); advance(.1);
      const backdrop = render.mock.lastCall[0].getObjectByName('composer-backdrop');
      const characters = createComposerCharacters.mock.results.at(-1).value;
      expect(backdrop.visible).toBe(width <= 700);
      const frame = { id: 'camera-reply', mine: true, fresh: true, elapsed: 0, contactAt: .8, releaseAt: 1.8, follow: new Vector3(), opponent: new Vector3(1, 0, 0) };
      clash.presentation = () => frame;
      arena.setClashCamera(true); advance(.05);
      frame.elapsed = .4; advance(.1);
      expect(stage.dataset.cinematic).toBe('true');
      expect(form.hasAttribute('inert')).toBe(true);
      expect(backdrop.visible).toBe(false);
      expect(characters.setStandingVisible).toHaveBeenLastCalledWith(false);
      if (ending === 'finish') frame.elapsed = 1.8;
      if (ending === 'disable') arena.setClashCamera(false);
      if (ending === 'reduced') media.matches = true;
      if (ending === 'view') arena.setView('reference');
      if (ending === 'dispose') arena.dispose();
      else advance(.1);
      expect(stage.dataset.cinematic).toBe('false');
      expect(form.hasAttribute('inert')).toBe(false);
      expect(form.querySelector('textarea').value).toBe('이어 쓰던 초안');
      if (ending !== 'dispose') {
        expect(backdrop.visible).toBe(width <= 700);
        expect(characters.setStandingVisible).toHaveBeenLastCalledWith(true);
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
  it('내 받아치기가 호스 도착 뒤 이전 대화를 기다려도 추적을 유지하고 충돌로 이어간다', () => {
    const render = jest.spyOn(WebGLRenderer.prototype, 'render');
    const world = createChairCharacters.mock.calls.at(-1)[0];
    const currentCamera = () => render.mock.calls.filter(([scene]) => scene === world).at(-1)[1];
    const mine = { ...reply, mine: true };
    let arrive;
    duel.canReplace = () => false;
    arena.launch(mine, done => { arrive = done; });
    const characters = createComposerCharacters.mock.results.at(-1).value;
    let transport = { id: mine.id, mine: true, fresh: true, phase: 'transport', elapsed: 0,
      follow: new Vector3(-8, 3, 0.3) };
    characters.presentation.mockImplementation(() => transport);
    advance(.05);
    transport.elapsed = 1.2; advance(.05);
    const last = currentCamera().position.clone();
    expect(stage.dataset.cinematic).toBe('true');
    arrive(); transport = null;
    advance(4);
    expect(clash.start).not.toHaveBeenCalled();
    expect(stage.dataset.cinematic).toBe('true');
    expect(currentCamera().position.distanceTo(last)).toBeLessThan(1e-8);
    clash.start.mockImplementation(() => {
      clash.busy = () => true;
      clash.presentation = () => ({ id: mine.id, mine: true, fresh: true, elapsed: 0,
        contactAt: .36, releaseAt: 1.38, follow: new Vector3(-8, 3, .3), opponent: new Vector3(8, 3, .3) });
    });
    duel.canReplace = () => true; advance(.05);
    expect(clash.start).toHaveBeenCalledWith(mine, true, false);
    expect(stage.dataset.cinematic).toBe('true');
    expect(currentCamera().position.distanceTo(last)).toBeLessThan(1e-8);
    clash.presentation = () => null; advance(.05);
    expect(stage.dataset.cinematic).toBe('false');
  });
  it('실제 지난 대화 읽기 타이머가 멈춰도 추적 중인 내 글만 먼저 재생하고 입력을 복원한다', () => {
    arena.dispose(); stage.replaceChildren(container);
    const form = document.createElement('form'); form.id = 'composer'; stage.append(form);
    createHistoryConversation.mockImplementation(jest.requireActual('../../public/sparring-arena/src/history-conversation.js').createHistoryConversation);
    createCapsules.mockImplementation(jest.requireActual('../../public/sparring-arena/src/capsules.js').createCapsules);
    arena = createArena(container, noop, noop);
    history = createHistoryConversation.mock.results.at(-1).value;
    arena.updateState([], { total: 0, ratio: .5 });
    history.emerge(original, { x: 0, y: -6, z: 10, floorY: -6 });
    advance(1.55);
    expect(history.canAccept()).toBe(true);
    expect(history.canReplace()).toBe(false);
    const mine = { ...reply, id: 'my-tracked-reply', mine: true };
    let arrive;
    arena.launch(mine, done => { arrive = done; });
    const characters = createComposerCharacters.mock.results.at(-1).value;
    let transport = { id: mine.id, mine: true, fresh: true, phase: 'transport', elapsed: 0,
      follow: new Vector3(-8, 3, .3) };
    characters.presentation.mockImplementation(() => transport);
    advance(.05); transport.elapsed = .5; advance(.05);
    expect(stage.dataset.cinematic).toBe('true');
    const other = { ...reply, id: 'other-reply', mine: false };
    arena.launch(other); advance(.1);
    expect(clash.start).not.toHaveBeenCalled();
    let collision;
    clash.start.mockImplementation(post => {
      collision = { id: post.id, mine: post.mine, fresh: true, elapsed: 0, contactAt: .36, releaseAt: 1.38,
        follow: new Vector3(-8, 3, .3), opponent: new Vector3(8, 3, .3) };
      clash.presentation = () => collision;
      clash.busy = () => true;
    });
    arrive(); transport = null; advance(.1);
    expect(history.canReplace()).toBe(false);
    expect(clash.start).toHaveBeenCalledTimes(1);
    expect(clash.start).toHaveBeenLastCalledWith(mine, true, false);
    expect(stage.dataset.cinematic).toBe('true');
    expect(form.hasAttribute('inert')).toBe(true);
    collision.elapsed = 1.38; advance(.05);
    clash.presentation = () => null; clash.busy = () => false;
    createClash.mock.calls.at(-1)[4].onImpactComplete({ post: mine, fresh: true });
    advance(1.2);
    expect(stage.dataset.cinematic).toBe('false');
    expect(form.hasAttribute('inert')).toBe(false);
    expect(clash.start).toHaveBeenCalledTimes(1);
    advance(2.5);
    expect(history.canReplace()).toBe(true);
    expect(clash.start).toHaveBeenCalledTimes(2);
    expect(clash.start).toHaveBeenLastCalledWith(other, true, false);
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
    capsules.takeHistorical.mockReturnValue(null);
    arena.updateState([], {}); arena.launch(original); advance(0.8);
    expect(capsules.launch).toHaveBeenCalledWith(original, { reduced: false });
    expect(reveals.update).toHaveBeenCalledWith([], ['flight'], expect.anything());
    expect(dispenser.start).not.toHaveBeenCalled(); expect(clash.start).not.toHaveBeenCalled();
  });
  it('새 받아치기는 기존 충돌, 쌍 캡슐 미끄럼틀, VS로 이어진다', () => {
    arena.updateState([], {}); arena.launch(reply); advance(0.8);
    expect(clash.start).toHaveBeenCalledWith(reply, true, false);
    expect(history.setVisible).toHaveBeenCalledWith(true, { speech: false });
    expect(history.setVisible).not.toHaveBeenCalledWith(false);
    expect(history.leaveAll).not.toHaveBeenCalled();
    clash.busy = () => true;
    advance(0.2);
    expect(history.setVisible).toHaveBeenLastCalledWith(true, { speech: false });
    expect(history.leaveAll).not.toHaveBeenCalled();
    createClash.mock.calls[0][4].onImpactComplete({ post: reply, fresh: true });
    expect(history.leaveAll).not.toHaveBeenCalled();
    expect(history.setCheering).toHaveBeenLastCalledWith(true, false);
    expect(capsules.queueReplay).toHaveBeenCalledTimes(2);
    expect(capsules.queueReplay).toHaveBeenLastCalledWith(reply, 0, true);
    expect(duel.prepare).toHaveBeenCalledWith(reply, true, false);
    expect(dispenser.startPair).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ post: original, role: 0 }), expect.objectContaining({ post: reply, role: 1 })]), false);
    createDispenser.mock.calls[0][2].onOpened({ ...dispenser.startPair.mock.calls[0][0][1], body: { position: { x: 0, y: 0, z: 0 } } });
    expect(duel.emerge).toHaveBeenCalledWith(1, expect.any(Function), false); expect(history.emerge).not.toHaveBeenCalled();
  });
  it('즉시 전송하되 미끄럼틀과 읽기가 끝나야 받아치기를 한 번 재생한다', () => {
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
    arrive(); arrive(); advance(.5);
    expect(clash.start).not.toHaveBeenCalled();
    dispenser.readyForNext = () => true; duel.canReplace = () => true; history.pinned = () => false;
    history.canReplace.mockReturnValue(false); advance(.5);
    expect(clash.start).not.toHaveBeenCalled();
    history.canReplace.mockReturnValue(true); advance(.1);
    clash.busy = () => true; advance(.5);
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
    arena.updateState([], balance, { page: 1, posts: old }); advance(0.1);
    arena.updateState([original], balance);
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
  it('연속 받아치기의 호스 이동은 즉시 시작하고 이전 대화가 끝난 뒤 순서대로 재생한다', () => {
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
    busy = false; advance(.8);
    expect(clash.start).not.toHaveBeenCalled();
    duel.canReplace = () => true; dispenser.readyForNext = () => true; advance(.1);
    expect(clash.start).toHaveBeenCalledTimes(1);
    expect(clash.start).toHaveBeenLastCalledWith(reply, true, false);
    busy = false; advance(.8);
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
  it('퇴장 슬롯이 찼으면 지난 대화를 더 꺼내지 않고 자리가 생긴 뒤 배출한다', () => {
    history.canAccept.mockReturnValue(false);
    advance(3);
    expect(capsules.takeHistorical).not.toHaveBeenCalled();
    expect(dispenser.start).not.toHaveBeenCalled();
    history.canAccept.mockReturnValue(true);
    advance(0.1);
    expect(capsules.takeHistorical).toHaveBeenCalledTimes(1);
    expect(dispenser.start).toHaveBeenCalledTimes(1);
  });

  it('실제 재생 큐에서 연속 받아치기 두 번마다 과거 한 번을 넣고 새 글이 끝나면 과거를 이어간다', () => {
    arena.dispose(); stage.replaceChildren(container);
    createCapsules.mockImplementation(jest.requireActual('../../public/sparring-arena/src/capsules.js').createCapsules);
    arena = createArena(container, noop, noop);
    const order = [];
    dispenser.start.mockImplementation(entry => { order.push(entry.post.id); return true; });
    clash.start.mockImplementation(post => { order.push(post.id); });
    const older = Array.from({ length: 6 }, (_, i) => ({ ...original, id: String(i + 1) }));
    arena.updateState([], { a: 1, b: 1, total: 2, ratio: .5 }, { page: 1, posts: older });
    advance(0.7);
    for (const id of ['101', '102', '103']) arena.launch({ ...reply, id });
    advance(2.4);
    expect(order.slice(0, 5)).toEqual(['1', '101', '102', '2', '103']);
    advance(4);
    expect(order.slice(5)).toEqual(['3', '4', '5', '6']);
  });

});
