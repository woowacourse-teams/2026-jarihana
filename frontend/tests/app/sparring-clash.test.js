import { createClash } from '../../public/sparring-arena/src/clash.js';
import { createCapsuleBatch } from '../../public/sparring-arena/src/capsule-batch.js';

jest.mock('three', () => {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    project() { return this; }
    unproject() { return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    normalize() { return this; }
    addScaledVector(v, n) { this.x += v.x * n; this.y += v.y * n; this.z += v.z * n; return this; }
    lerp(v, n) { this.x += (v.x - this.x) * n; this.y += (v.y - this.y) * n; this.z += (v.z - this.z) * n; return this; }
  }
  class Quaternion { setFromEuler() { return this; } identity() { return this; } }
  class Euler { set() { return this; } }
  return { Vector3, Quaternion, Euler };
}, { virtual: true });
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: jest.fn() }));
jest.mock('../../public/sparring-arena/src/physics.js', () => ({ nozzlePose: side => ({ mouth: [side === 'a' ? -8 : 8, 3, 0] }) }));
jest.mock('../../public/sparring-arena/src/character-motion.js', () => ({ characterPose: () => ({ shrink: 1 }) }));

const original = { id: '1', side: 'a', name: '크루', text: '기다릴래요' };
const reply = { id: '2', side: 'b', name: '코치', text: '시간이 아까워요', replyTo: original };

describe('받아치기 발사와 충돌', () => {
  let stage, scene, clash, onReveal, batch;
  beforeEach(() => {
    stage = document.createElement('div');
    scene = document.createElement('div');
    stage.append(scene); document.body.append(stage);
    Object.defineProperties(scene, { clientWidth: { value: 800 }, clientHeight: { value: 500 } });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({ matches: true })) });
    batch = { draw: jest.fn(), hide: jest.fn() };
    createCapsuleBatch.mockReturnValue(batch);
    onReveal = jest.fn();
    clash = createClash({}, scene, { position: { x: 0, y: 0, z: 28 } }, onReveal);
  });
  afterEach(() => { clash.dispose(); stage.remove(); });

  it('원문과 답장 캡슐이 날아간 뒤 실제 두 의견을 한 번 표시한다', () => {
    clash.start(reply, true);
    clash.step(0.2);
    expect(scene.dataset.clashState).toBe('flying');
    expect(batch.draw.mock.calls.map(call => call[1].post.id)).toEqual(['1', '2']);
    expect(onReveal).not.toHaveBeenCalled();
    clash.step(0.8);
    expect(scene.dataset.clashState).toBe('pair');
    expect(scene.querySelector('.clash-voices')).toHaveTextContent(original.text);
    expect(scene.querySelector('.clash-voices')).toHaveTextContent(reply.text);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith(reply, true);
    clash.step(0.3);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
  it('파이프 입구에서 뒤로 물러나는 재장전 없이 곧바로 충돌 방향으로 날아간다', () => {
    const positions = [];
    batch.draw.mockImplementation((index, entry) => positions.push({ index, x: entry.body.position.x }));
    clash.start(reply, true); clash.step(0);
    expect(positions.slice(-2).map(item => item.x)).toEqual([-8, 8]);
    clash.step(0.05);
    expect(positions.at(-2).x).toBeGreaterThan(-8);
    expect(positions.at(-1).x).toBeLessThan(8);
  });

  it('의견에 포커스가 있으면 유지하고 닫으면 다음 연출을 허용한다', () => {
    clash.start(reply, false);
    clash.step(1);
    scene.querySelector('.clash-voice').focus();
    clash.step(10);
    expect(clash.busy()).toBe(true);
    expect(scene.dataset.clashState).toBe('pair');
    scene.querySelector('.clash-close').click();
    clash.step(0.5);
    expect(clash.busy()).toBe(false);
    expect(scene.dataset.clashState).toBe('idle');
  });

  it('모션 감소에서는 이동 없이 실제 원문과 답장을 바로 보여준다', () => {
    clash.start(reply, false, true);
    expect(scene.dataset.clashState).toBe('pair');
    expect(scene.querySelector('.clash-impact')).toHaveClass('reduced');
    expect(onReveal).toHaveBeenCalledWith(reply, false);
  });

  it('발사와 충돌 효과가 끝나면 같은 받아치기를 캐릭터 연출에 한 번 전달한다', () => {
    const complete = jest.fn();
    const impact = jest.fn();
    clash.dispose();
    clash = createClash({}, scene, { position: { x: 0, y: 0, z: 28 } }, onReveal, { onImpact: impact, onImpactComplete: complete });
    clash.start(reply, true);
    clash.step(0.2);
    expect(scene.dataset.clashState).toBe('flying');
    expect(complete).not.toHaveBeenCalled();
    clash.step(0.8);
    expect(scene.dataset.clashState).toBe('pressing');
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith({ post: reply, fresh: true, point: { x: 0, y: -0.2, z: 0.3 } });
    expect(batch.draw.mock.calls.slice(-2).map(call => call[1].phase)).toEqual(['rolling', 'rolling']);
    expect(scene.querySelector('.clash-voices')).not.toBeVisible();
    expect(complete).not.toHaveBeenCalled();
    clash.step(0.9);
    expect(scene.dataset.clashState).toBe('burst');
    expect(impact).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith({ post: reply, fresh: true });
    clash.step(0.7);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(onReveal).not.toHaveBeenCalled();
    expect(clash.busy()).toBe(false);
  });

  it('모션 감소에서는 충돌 애니메이션 없이 캐릭터 연출로 이어진다', () => {
    const complete = jest.fn();
    const impact = jest.fn();
    clash.dispose();
    clash = createClash({}, scene, { position: { x: 0, y: 0, z: 28 } }, onReveal, { onImpact: impact, onImpactComplete: complete });
    clash.start(reply, false, true);
    clash.step(0);
    expect(complete).toHaveBeenCalledWith({ post: reply, fresh: false });
    expect(impact).not.toHaveBeenCalled();
    expect(clash.busy()).toBe(false);
  });
});
