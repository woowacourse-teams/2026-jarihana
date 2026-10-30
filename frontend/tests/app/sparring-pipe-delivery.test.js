import { animateCapsuleSend } from '../../public/sparring-arena/src/composer.js';
import { updateTransport } from '../../public/sparring-arena/src/transport.js';

jest.mock('../../public/sparring-arena/src/transport.js', () => ({ updateTransport: jest.fn() }));

describe('파이프 전달과 경기장 발사 동기화', () => {
  let form, launch, motion, finish, reject, animation, frames, originalAnimate, originalMatchMedia;
  const post = { id: 'reply', side: 'a', text: '받아치는 의견' };
  const flush = () => Promise.resolve();
  beforeEach(() => {
    originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    motion = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => motion });
    document.body.innerHTML = '<div id="scene"></div><form><span class="inlet-mouth"></span><button id="send"><span class="send-capsule"><span class="capsule-paper"></span></span></button></form>';
    document.querySelector('#scene').getBoundingClientRect = () => ({ top: 0, bottom: 200 });
    form = document.querySelector('form');
    form.querySelector('#send').getBoundingClientRect = () => ({ x: 200, y: 500, width: 60, height: 60 });
    form.querySelector('.inlet-mouth').getBoundingClientRect = () => ({ x: 150, y: 500, width: 40, height: 60 });
    updateTransport.mockReturnValue({ getTotalLength: () => 1000, getPointAtLength: distance => ({ x: distance / 5, y: 530 - distance / 2 }) });
    animation = { finished: new Promise((resolve, fail) => { finish = resolve; reject = fail; }), cancel: jest.fn(() => reject(new Error('canceled'))) };
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: function(nextFrames) {
      if (this.classList.contains('inlet-token')) { frames = nextFrames; return animation; }
      return { cancel() {} };
    } });
    launch = jest.fn();
  });
  afterEach(() => {
    document.body.replaceChildren();
    if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
    else delete Element.prototype.animate;
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else delete window.matchMedia;
  });
  it('파이프 끝 좌표에 도착한 다음 토큰을 제거하고 한 번 발사한다', async () => {
    form.style.setProperty('--inlet-color', '#2ac1bc');
    form.style.setProperty('--inlet-glass', '#8bdfda');
    form.style.setProperty('--inlet-dark', '#087f7b');
    animateCapsuleSend(form, post, launch);
    const token = document.querySelector('.inlet-token');
    for (const name of ['--inlet-color', '--inlet-glass', '--inlet-dark']) {
      expect(token.style.getPropertyValue(name)).toBe(form.style.getPropertyValue(name));
    }
    expect(launch).not.toHaveBeenCalled();
    expect(frames.at(-1)).toMatchObject({ offset: 1 });
    expect(frames.at(-1).transform).toContain('translate(-30px,-500px)');
    finish(); await flush();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.inlet-token')).toBeNull();
  });
  it('3D 포장에는 전송한 편과 글, 캐릭터 위치, 실제 캡슐 지름을 전달한다', () => {
    const avatar = document.createElement('span'); avatar.className = 'composer-avatar';
    avatar.getBoundingClientRect = () => ({ x: 200, y: 450, width: 68, height: 104 });
    const field = document.createElement('div'); field.className = 'composer-field';
    field.getBoundingClientRect = () => ({ x: 280, y: 450, width: 220, height: 108 });
    form.append(avatar, field); form.dataset.capsuleDiameter = '48';
    const pending = [], cancel = jest.fn();
    document.querySelector('#scene').addEventListener('capsuleship', event => {
      pending.push(event.detail); event.detail.handled = true; event.detail.cancel = cancel;
    });
    const fallbackAnimate = Element.prototype.animate;
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: () => ({ finished: Promise.resolve(), cancel() {} }) });
    try {
      const cleanup = animateCapsuleSend(form, post, launch);
      expect(pending[0]).toMatchObject({ post, diameter: 48, origin: { x: 200, y: 450, height: 104 } });
      expect(document.querySelector('.inlet-token')).toBeNull();
      pending[0].onArrive(); pending[0].onArrive();
      expect(launch).toHaveBeenCalledTimes(1);
      cleanup(); expect(cancel).toHaveBeenCalledTimes(1);
    } finally { Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: fallbackAnimate }); }
  });

  it('이동 중 모션 감소로 바꾸면 대기 없이 한 번 도착 처리한다', async () => {
    animateCapsuleSend(form, post, launch);
    const changed = motion.addEventListener.mock.calls[0][1];
    changed({ matches: true }); await flush();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.inlet-token')).toBeNull();
    expect(motion.removeEventListener).toHaveBeenCalledWith('change', changed);
  });
  it('외부 애니메이션 취소도 전달 예약을 해제한다', async () => {
    animateCapsuleSend(form, post, launch); animation.cancel(); await flush();
    expect(launch).toHaveBeenCalledTimes(1);
  });
  it('경기장 폐기용 정리는 토큰만 없애고 뒤늦게 발사하지 않는다', async () => {
    const cancel = animateCapsuleSend(form, post, launch); cancel(); await flush();
    expect(document.querySelector('.inlet-token')).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });
  it('모션 감소 또는 파이프가 없는 화면은 즉시 전달한다', () => {
    motion.matches = true;
    animateCapsuleSend(form, post, launch);
    motion.matches = false; updateTransport.mockReturnValue(null);
    animateCapsuleSend(form, post, launch);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.inlet-token')).toBeNull();
  });
});
