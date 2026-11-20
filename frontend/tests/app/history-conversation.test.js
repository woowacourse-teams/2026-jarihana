import { PACKED_SCALE, EXIT_SECONDS, WALKOUT_SECONDS } from '../../public/sparring-arena/src/history-walk.js';
import { createHistoryConversation, HISTORY_MODEL_CAPACITY } from '../../public/sparring-arena/src/history-conversation.js';
import { CHAIR_BRAWL_STYLES, UNARMED_BRAWL_STYLES } from '../../public/sparring-arena/src/history-brawl.js';
import { HELD_CHAIR_RELEASE_SECONDS, HELD_CHAIR_FLIGHT_SECONDS } from '../../public/sparring-arena/src/held-reactions.js';
import { LANDING_FALL_SECONDS, LANDING_SECONDS } from '../../public/sparring-arena/src/character-landing.js';
const post = (id, side = 'a') => ({ id, side, name: '크루 ' + id, text: '의견 ' + id, memberType: 'CREW' });
describe('지난 메시지 캐릭터 모임', () => {
  let stage, history, select, reveal, visuals;
  const field = () => stage.querySelector('.history-conversation');
  const bubble = side => stage.querySelector(`.history-conversation-speech[data-side="${side}"]`);
  const add = (id, side = 'a', reduced = false) => { history.emerge(post(id, side), { x: 0, y: -6, z: 9 }, reduced); history.step(2.5, reduced); };
  beforeEach(() => {
    stage = document.createElement('div'); document.body.append(stage); select = jest.fn(); reveal = jest.fn();
    visuals = { draw: jest.fn(), hide: jest.fn(), project: point => ({ x: point.x * 50 + 400, y: 300 - (point.y + 6.3) * 40 }) };
    visuals.unprojectHold = (point, reference) => ({ x: (point.x - 400) / 50, y: (300 - point.y) / 40 - 6.3, z: reference.z });
    history = createHistoryConversation(stage, select, reveal, visuals);
    history.setLayout({ left: { x: 180, y: 300 }, right: { x: 620, y: 300 }, worldLeft: { x: -4.4, y: -6.3, z: 10.1 }, worldRight: { x: 4.4, y: -6.3, z: 10.1 }, width: 800 });
  });
  afterEach(() => { history.dispose(); stage.remove(); });
  const entrance = { x: 0, y: -6, z: 9 };
  const authored = (id, authorId = 'member-1', side = 'a') => ({ ...post(id, side), authorId, name: '같은 이름' });
  const pointer = (target, type, x = 100, y = 100, detail = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, pointerId: 1, isPrimary: true, clientX: x, clientY: y, ...detail });
    target.dispatchEvent(event);
  };
  const drawn = id => visuals.draw.mock.calls.filter(([, entry]) => entry.id === id).at(-1);
  describe('마우스로 던져 놓기', () => {
    let now, clock;
    beforeEach(() => {
      now = 0;
      clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
      visuals.unproject = (point, y) => ({ x: (point.x - 400) / 50, y, z: 11 + (point.y - 200) / 50 });
      history.setBrawl(true); add('fling');
    });
    afterEach(() => clock.mockRestore());
    const start = (viaSpeech = false) => {
      const figure = stage.querySelector('.history-character[data-post-id="fling"]');
      pointer(viaSpeech ? bubble('a') : figure, 'pointerdown', viaSpeech ? 390 : 400, 200);
      if (viaSpeech) pointer(window, 'pointermove', 400, 200);
      history.step(.25); now = 250;
      return figure;
    };

    it.each([-1, 1])('놓기 직전 방향 %s로 날아가 기존 먼지와 일어나기로 이어진다', direction => {
      const figure = start();
      pointer(window, 'pointermove', 400 + 40 * direction, 200);
      const from = { ...drawn('fling')[2] };
      pointer(window, 'pointerup', 400 + 40 * direction, 200);
      expect(drawn('fling')[2]).toEqual(from);
      history.step(.01);
      expect((drawn('fling')[2].x - from.x) * direction).toBeGreaterThan(0);
      history.step(.34);
      expect(figure.dataset.phase).toBe('landing');
      expect(history.canAccept()).toBe(false);
      history.step(.25);
      expect(figure.dataset.phase).toBe('splat');
      expect((drawn('fling')[2].x - from.x) * direction).toBeGreaterThan(.5);
      expect(document.querySelector('.history-landing-dust:not([hidden])')).not.toBeNull();
      history.step(.81);
      expect(figure.dataset.phase).toBe('brawling');
      expect(bubble('a').dataset.postId).toBe('fling');
      expect(history.stats().historyCharacters).toBe(1);
    });

    it.each([{ wait: 160, pixels: 40 }, { wait: 0, pixels: 5 }])('멈추거나 천천히 놓으면 일반 낙하한다: %o', ({ wait, pixels }) => {
      const figure = start();
      pointer(window, 'pointermove', 400 + pixels, 200);
      now += wait;
      pointer(window, 'pointerup', 400 + pixels, 200);
      history.step(LANDING_FALL_SECONDS);
      expect(figure.dataset.phase).toBe('splat');
      expect(drawn('fling')[2].x).toBeCloseTo(pixels / 50);
      history.step(LANDING_SECONDS - LANDING_FALL_SECONDS);
      expect(figure.dataset.phase).toBe('brawling');
    });

    it('말풍선으로 집어 마지막 순간 위쪽으로 방향을 바꿔 놓아도 그 방향을 따른다', () => {
      const figure = start(true);
      pointer(window, 'pointermove', 440, 200);
      now += 16; pointer(window, 'pointermove', 400, 160);
      const from = { ...drawn('fling')[2] };
      pointer(window, 'pointerup', 400, 160); bubble('a').click();
      history.step(.01);
      expect(drawn('fling')[2].x).toBeLessThan(from.x);
      expect(drawn('fling')[2].y).toBeGreaterThan(from.y);
      expect(figure.dataset.phase).toBe('landing');
      expect(select).not.toHaveBeenCalled();
    });

    it('화면 끝으로 크게 던져도 착지점은 마당 안에 남고 키보드 놓기에는 관성이 없다', () => {
      start();
      pointer(window, 'pointermove', 4000, 4000); pointer(window, 'pointerup', 4000, 4000);
      history.step(.61);
      const landed = drawn('fling')[2];
      expect(Math.abs(landed.x)).toBeLessThanOrEqual(4.8);
      expect(landed.z).toBeLessThanOrEqual(15.9);
      history.step(.81);
      const figure = stage.querySelector('.history-character[data-post-id="fling"]');
      figure.focus(); figure.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      figure.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      history.step(.25);
      figure.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      history.step(LANDING_FALL_SECONDS);
      expect(figure.dataset.phase).toBe('splat');
    });

    it('기존 대화 구역 밖에서 던져도 중앙으로 돌아오지 않고 보이는 마당으로 날아간다', () => {
      history.setLayout({ left: { x: 180, y: 300 }, right: { x: 620, y: 300 },
        worldLeft: { x: -4.4, y: -6.3, z: 10.1 }, worldRight: { x: 4.4, y: -6.3, z: 10.1 }, width: 800, floorHalfWidth: 39 });
      start();
      pointer(window, 'pointermove', 680, 200);
      const released = { ...drawn('fling')[2] };
      pointer(window, 'pointerup', 680, 200);
      let previousX = released.x;
      for (const delta of [.1, .1, .1, .1, .1, .11]) {
        history.step(delta);
        const point = drawn('fling')[2];
        expect(point.x).toBeGreaterThanOrEqual(previousX);
        expect(visuals.project(point).x).toBeLessThanOrEqual(772);
        previousX = point.x;
      }
      const landing = drawn('fling')[2];
      expect(landing.x).toBeGreaterThan(released.x);
      expect(visuals.project(landing).x).toBeLessThanOrEqual(772);
    });
    it('미끄럼틀 방향으로 던져도 패싸움 마당의 뒤쪽 경계 안에 착지한다', () => {
      const figure = start();
      now += 16; pointer(window, 'pointermove', 400, -1000);
      pointer(window, 'pointerup', 400, -1000);
      history.step(.61);
      expect(figure.dataset.phase).toBe('splat');
      expect(drawn('fling')[2].z).toBeCloseTo(10.1 - 1.4);
    });
  });
  it('말풍선 호버와 짧은 누름은 움직임을 멈추지 않고 클릭은 받아치기를 유지한다', () => {
    history.setBrawl(true);
    add('bubble'); add('opponent', 'b');
    const figure = stage.querySelector('.history-character[data-post-id="bubble"]');
    const speech = bubble('a');
    pointer(speech, 'pointerenter'); pointer(speech, 'pointerdown');
    const before = { ...drawn('bubble')[4] };
    history.step(.3);
    expect(figure.dataset.hovered).not.toBe('true');
    expect(figure.dataset.grabbed).toBe('false');
    expect(history.pinned()).toBe(false);
    expect(drawn('bubble')[4]).not.toEqual(before);
    pointer(window, 'pointerup'); speech.click();
    expect(select).toHaveBeenCalledWith('bubble');
  });
  it('말풍선 드래그로 같은 인물을 부드럽게 집고 놓으면 받아치기 없이 착지한다', () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    history.setBrawl(true); add('bubble');
    const figure = stage.querySelector('.history-character[data-post-id="bubble"]');
    const speech = bubble('a');
    pointer(speech, 'pointerdown', 200, 150);
    const position = { ...drawn('bubble')[2] };
    pointer(window, 'pointermove', 215, 140);
    expect(drawn('bubble')[2]).toEqual(position);
    expect(figure).toHaveAttribute('data-grabbed', 'true');
    expect(figure).toHaveAttribute('aria-pressed', 'true');
    expect(speech).toHaveAttribute('data-grabbed', 'true');
    expect(document.querySelector('.history-grab-hand').hidden).toBe(false);
    history.step(.22);
    expect(drawn('bubble')[4].hangBlend).toBe(1);
    pointer(window, 'pointerup', 215, 140); speech.click();
    expect(select).not.toHaveBeenCalled();
    expect(figure.dataset.phase).toBe('landing');
    expect(speech.dataset.postId).toBe('bubble');
    history.step(LANDING_SECONDS);
    expect(figure.dataset.phase).toBe('brawling');
    expect(figure).toHaveAttribute('aria-pressed', 'false');
  });
  it('호버에서 집으면 같은 위치·크기로 시작해 0.22초 동안 확대하며 들어 올린다', () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    visuals.cameraFacing = () => .4;
    history.setBrawl(true);
    add('lift');
    const figure = stage.querySelector('.history-character[data-post-id="lift"]');
    pointer(figure, 'pointerenter');
    history.step(.5);
    const before = drawn('lift');
    const startPosition = { ...before[2] }, startScale = before[4].scale, startYaw = before[5];
    pointer(figure, 'pointerdown');
    expect(drawn('lift')[2]).toEqual(startPosition);
    expect(drawn('lift')[4].scale).toBe(startScale);
    expect(drawn('lift')[5]).toBe(startYaw);
    expect(drawn('lift')[4].hangBlend).toBe(0);
    history.step(.11);
    const middle = { ...drawn('lift')[2] }, middleScale = drawn('lift')[4].scale;
    expect(drawn('lift')[4].hangBlend).toBeCloseTo(.5);
    history.step(.11);
    expect(drawn('lift')[4].hangBlend).toBe(1);
    expect(middleScale).toBeCloseTo((startScale + drawn('lift')[4].scale) / 2);
    for (const axis of ['x', 'y', 'z']) expect(middle[axis]).toBeCloseTo((startPosition[axis] + drawn('lift')[2][axis]) / 2);
  });
  it('키보드로 놓아도 낙하·철푸덕·먼지·일어나기를 끝낸 뒤 다시 활동하고 교체 대기를 푼다', () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    history.setBrawl(true);
    add('drop');
    const figure = stage.querySelector('.history-character[data-post-id="drop"]');
    const enter = () => figure.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    figure.focus(); enter(); history.step(.25); enter();
    expect(figure.dataset.phase).toBe('landing');
    expect(document.querySelector('.history-grab-hand').hidden).toBe(true);
    expect(history.canAccept()).toBe(false);
    expect(history.canReplace()).toBe(false);
    expect(history.needsFrame()).toBe(true);
    expect(document.querySelector('.history-landing-dust:not([hidden])')).toBeNull();
    history.step(LANDING_FALL_SECONDS + .01);
    expect(figure.dataset.phase).toBe('splat');
    const dust = document.querySelector('.history-landing-dust');
    expect(dust.hidden).toBe(false);
    expect(dust.children).toHaveLength(6);
    expect(drawn('drop')[4]).toMatchObject({ released: true, hanging: false, chairVisible: false });
    history.emerge(post('waiting', 'b'), entrance);
    expect(history.stats().historyPostIds).toEqual(['drop']);
    const opacity = Number(dust.style.opacity);
    history.step(.25);
    expect(figure.dataset.phase).toBe('recovering');
    expect(Number(dust.style.opacity)).toBeLessThan(opacity);
    history.step(LANDING_SECONDS);
    expect(figure.dataset.phase).toBe('brawling');
    expect(drawn('drop')[4].released).toBeUndefined();
    expect(dust.hidden).toBe(true);
    expect(history.stats().historyPostIds).toEqual(['drop', 'waiting']);
  });
  it('집은 인물은 떠 있고 말풍선과 작성자는 유지하며 놓으면 이동한 바닥에서 다시 싸운다', () => {
    visuals.unproject = (point, y) => ({ x: (point.x - 400) / 50, y, z: 11 });
    history.setBrawl(true);
    add('held'); add('other', 'b');
    const figure = stage.querySelector('.history-character[data-post-id="held"]');
    const original = { ...drawn('held')[2] };
    pointer(figure, 'pointerdown');
    history.step(.25);
    expect(history.stats().historyGrabbedId).toBe('held');
    const heldFeet = visuals.project(drawn('held')[2]);
    const heldHead = visuals.project({ ...drawn('held')[2], y: drawn('held')[2].y + 2.08 * drawn('held')[4].scale });
    expect(heldFeet.y - heldHead.y).toBeCloseTo(200);
    expect(drawn('held')[4].scale).toBeGreaterThan(.65 * 2.4);
    expect(drawn('held')[4].hanging).toBe(true);
    expect(drawn('held')[4]).toMatchObject({ seated: 0 });
    expect(bubble('a')).toHaveAttribute('data-grabbed', 'true');
    expect(history.canReplace()).toBe(false);
    expect(history.canAccept()).toBe(false);
    expect(bubble('a')).toHaveTextContent('의견 held');
    const beforeMove = { ...drawn('held')[2] };
    pointer(window, 'pointermove', 150, 50);
    expect(drawn('held')[2].x).toBeCloseTo(beforeMove.x + 1);
    expect(drawn('held')[2].y).toBeCloseTo(beforeMove.y + 1.25);
    expect(document.querySelector('.history-grab-hand').style.top).toBe('50px');
    const heldPosition = { ...drawn('held')[2] };
    history.step(.3);
    expect(drawn('held')[2]).toEqual(heldPosition);
    expect(Math.abs(drawn('held')[4].hangAngle)).toBeGreaterThan(.01);
    expect(select).not.toHaveBeenCalled();
    const pausedClock = jest.spyOn(performance, 'now').mockReturnValue(performance.now() + 300);
    pointer(window, 'pointerup', 150, 50);
    pausedClock.mockRestore();
    history.step(LANDING_SECONDS);
    expect(history.stats().historyGrabbedId).toBeNull();
    expect(bubble('a')).toHaveAttribute('data-grabbed', 'false');
    expect(drawn('held')[2].y).toBe(original.y);
    expect(history.stats().historyCharacters).toBe(2);
    expect(figure).toHaveAttribute('data-phase', 'brawling');
  });
  it('들고 있으면 반응 동작을 바꾸며 전투 종류와 손에 고정된 몸 위치는 유지한다', () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    history.setBrawl(true);
    add('held');
    const figure = stage.querySelector('.history-character[data-post-id="held"]');
    const allowed = figure.dataset.brawlStyle.startsWith('chair-') ? CHAIR_BRAWL_STYLES : UNARMED_BRAWL_STYLES;
    pointer(figure, 'pointerdown');
    history.step(.25);
    const position = { ...drawn('held')[2] };
    const poses = new Set();
    for (let frame = 0; frame < 50; frame++) {
      history.step(.1);
      const pose = drawn('held')[4];
      expect(drawn('held')[2]).toEqual(position);
      expect(pose.hanging).toBe(true);
      expect(allowed).toContain(figure.dataset.brawlStyle);
      poses.add(JSON.stringify([pose.leftArm, pose.rightArm, pose.leftElbow, pose.rightKick]));
    }
    expect(poses.size).toBeGreaterThan(5);
    pointer(window, 'pointercancel');
    expect(document.querySelector('.history-grab-hand').hidden).toBe(true);
    expect(bubble('a')).toHaveAttribute('data-grabbed', 'false');
  });
  it('화면에서 자유롭게 들고 다니고 취소하면 원래 자리로 돌아간다', () => {
    visuals.unproject = () => ({ x: 1000, y: -6.3, z: 1000 });
    add('held');
    const original = { ...drawn('held')[2] };
    pointer(stage.querySelector('.history-character[data-post-id="held"]'), 'pointerdown');
    pointer(window, 'pointermove', 200, 200);
    history.step(.25);
    expect(visuals.project({ ...drawn('held')[2], y: drawn('held')[2].y + 2.08 * drawn('held')[4].scale })).toEqual({ x: 200, y: 200 });
    pointer(window, 'pointercancel');
    expect(drawn('held')[2]).toEqual(original);
    expect(history.stats().historyGrabbedId).toBeNull();
  });
  it.each([
    { type: '의자', random: 0, allowed: CHAIR_BRAWL_STYLES, chair: true },
    { type: '맨손', random: .999, allowed: UNARMED_BRAWL_STYLES, chair: false },
  ])('집힌 $type 인물은 의자만 한 번 던진 뒤 계속 발버둥 치고 놓으면 원래 전투 종류로 돌아간다', ({ random, allowed, chair }) => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    const choose = jest.spyOn(Math, 'random').mockReturnValue(random);
    history.setBrawl(true);
    choose.mockRestore();
    add('held');
    const figure = stage.querySelector('.history-character[data-post-id="held"]');
    pointer(figure, 'pointerdown');
    expect(history.stats().historyGrabbedId).toBe('held');
    const reactions = new Set();
    let flightFrames = 0;
    for (let frame = 0; frame < 500; frame++) {
      history.step(.05);
      const elapsed = (frame + 1) * .05;
      reactions.add(figure.dataset.heldReaction);
      expect(allowed).toContain(figure.dataset.brawlStyle);
      const pose = drawn('held')[4];
      if (pose.chairFlight) {
        flightFrames++;
        expect(chair).toBe(true);
        expect(pose.chairFlight.target).toBe('camera');
        expect(elapsed).toBeGreaterThanOrEqual(HELD_CHAIR_RELEASE_SECONDS);
        expect(elapsed).toBeLessThanOrEqual(HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS);
      }
      const throwFinished = HELD_CHAIR_RELEASE_SECONDS + HELD_CHAIR_FLIGHT_SECONDS;
      if (chair && elapsed < throwFinished) expect(pose.airRun).toBe(0);
      if (elapsed > throwFinished) expect(pose.chairVisible).toBe(false);
    }
    expect(flightFrames > 0).toBe(chair);
    expect(reactions).toEqual(new Set(chair ? ['chair-throw', 'struggling'] : ['struggling']));
    expect(history.stats().historyGrabbedId).toBe('held');
    pointer(window, 'pointerup');
    history.step(LANDING_SECONDS);
    expect(figure.dataset.heldReaction).toBe('');
    expect(figure.dataset.phase).toBe('brawling');
    expect(allowed).toContain(figure.dataset.brawlStyle);
  });
  it('일반 대화에서도 집기 반응을 보이고 모션 감소에서는 떨림과 반응 순환을 멈춘다', () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    add('held');
    const figure = stage.querySelector('.history-character[data-post-id="held"]');
    pointer(figure, 'pointerdown');
    history.step(.7);
    expect(figure.dataset.heldReaction).toBe('struggling');
    expect(drawn('held')[4].chairVisible).toBe(false);
    history.step(.5, true);
    const resting = drawn('held')[4];
    expect(figure.dataset.heldReaction).toBe('rest');
    history.step(8, true);
    expect(drawn('held')[4]).toEqual(resting);
    history.setVisible(false);
    expect(history.stats().historyGrabbedId).toBeNull();
    expect(figure.dataset.heldReaction).toBe('');
  });
  it('마우스 흔들기의 속도와 방향 전환에 따라 더 놀라고 멈추면 가라앉는다', () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    let now = 0;
    const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      add('held');
      const figure = stage.querySelector('.history-character[data-post-id="held"]');
      pointer(figure, 'pointerdown');
      history.step(.5);
      const restingSurprise = drawn('held')[4].surprise;
      now = 500;
      pointer(window, 'pointermove', 120, 100);
      history.step(.05);
      expect(drawn('held')[4].surprise).toBeCloseTo(restingSurprise);
      for (let i = 0; i < 8; i++) {
        now += 16;
        pointer(window, 'pointermove', i % 2 ? 190 : 70, 100);
        history.step(.016);
      }
      const startled = drawn('held')[4].surprise;
      expect(startled).toBeGreaterThan(restingSurprise + .1);
      expect(figure.dataset.heldReaction).toBe('struggling');
      expect(Number(figure.dataset.agitation)).toBeGreaterThan(.5);
      history.step(3);
      now += 3000;
      expect(drawn('held')[4].surprise).toBeLessThan(startled);
      expect(Number(figure.dataset.agitation)).toBeLessThan(.02);
      pointer(window, 'pointerup', 190, 100);
      history.step(LANDING_SECONDS);
      pointer(figure, 'pointerdown');
      expect(Number(figure.dataset.agitation)).toBe(0);
    } finally { clock.mockRestore(); }
  });
  it('호버한 인물만 정지해 카메라를 보고 다른 인물은 계속 움직이며 떠나면 재개한다', () => {
    visuals.cameraFacing = () => .35;
    history.setBrawl(true);
    add('look'); add('other', 'b');
    const figure = stage.querySelector('.history-character[data-post-id="look"]');
    pointer(figure, 'pointerenter');
    const frozen = { position: { ...drawn('look')[2] }, pose: { ...drawn('look')[4] } };
    const other = { ...drawn('other')[2] };
    history.step(.7);
    expect(figure.dataset.hovered).toBe('true');
    expect(figure.dataset.phase).toBe('hovered');
    expect(drawn('look')[2]).toEqual(frozen.position);
    expect(drawn('look')[4]).toEqual(frozen.pose);
    expect(drawn('look')[5]).toBeCloseTo(.35, 3);
    expect(drawn('look')[4].focused).toBe(true);
    expect(drawn('other')[4].focused).toBe(false);
    expect(figure.dataset.focused).toBe('true');
    // Add another opponent so the unhovered pair can keep fighting.
    add('third');
    history.step(1);
    expect(drawn('other')[2]).not.toEqual(other);
    expect(drawn('look')[2]).toEqual(frozen.position);
    pointer(figure, 'pointerleave');
    history.step(.5);
    expect(figure.dataset.hovered).toBe('false');
    expect(figure.dataset.phase).toBe('brawling');
    expect(drawn('look')[4].focused).toBe(false);
  });
  it('키보드 포커스와 호버가 겹쳐도 전경 인물은 하나이며 집기를 우선한다', async () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    add('first'); add('second', 'b');
    const first = stage.querySelector('.history-character[data-post-id="first"]');
    const second = stage.querySelector('.history-character[data-post-id="second"]');
    first.focus();
    expect(drawn('first')[4].focused).toBe(true);
    pointer(second, 'pointerenter');
    expect(drawn('first')[4].focused).toBe(false);
    expect(drawn('second')[4].focused).toBe(true);
    pointer(first, 'pointerdown');
    expect(drawn('first')[4].focused).toBe(true);
    expect(drawn('second')[4].focused).toBe(false);
    pointer(window, 'pointercancel');
    first.blur();
    await Promise.resolve();
    expect(drawn('first')[4].focused).toBe(false);
    expect(stage.querySelectorAll('[data-focused="true"]')).toHaveLength(0);
  });
  it('지나가는 인물의 진입·이탈 이벤트가 와도 포인터가 기존 인물 안에 있으면 포커스를 빼앗지 않는다', () => {
    history.setBrawl(true);
    add('look'); add('passing', 'b');
    const figure = stage.querySelector('.history-character[data-post-id="look"]');
    const passing = stage.querySelector('.history-character[data-post-id="passing"]');
    jest.spyOn(figure, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 160, top: 200, bottom: 280, width: 60, height: 80 });
    jest.spyOn(passing, 'getBoundingClientRect').mockReturnValue({ left: 240, right: 300, top: 200, bottom: 280, width: 60, height: 80 });
    pointer(figure, 'pointerenter', 120, 240);
    const frozen = { ...drawn('look')[2] };
    pointer(figure, 'pointerleave', 120, 240, { relatedTarget: passing });
    pointer(passing, 'pointerenter', 120, 240);
    pointer(window, 'pointermove', 120, 240);
    history.step(.5);
    expect(figure.dataset.hovered).toBe('true');
    expect(passing.dataset.hovered).not.toBe('true');
    expect(drawn('look')[2]).toEqual(frozen);
    expect(bubble('a').dataset.focused).toBe('true');
    expect(bubble('b').dataset.focused).toBe('false');
    pointer(passing, 'pointermove', 260, 240);
    expect(figure.dataset.hovered).toBe('false');
    expect(passing.dataset.hovered).toBe('true');
    expect(bubble('a').dataset.focused).toBe('false');
    expect(bubble('b').dataset.focused).toBe('true');
  });
  it('이미 호버한 인물과 자신의 말풍선 사이에서는 유지하고 둘 다 벗어나면 해제한다', () => {
    add('look');
    const figure = stage.querySelector('.history-character[data-post-id="look"]');
    const speech = bubble('a');
    jest.spyOn(figure, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 160, top: 200, bottom: 280, width: 60, height: 80 });
    jest.spyOn(speech, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 220, top: 100, bottom: 180, width: 120, height: 80 });
    pointer(figure, 'pointerenter', 120, 240);
    pointer(figure, 'pointerleave', 150, 190, { relatedTarget: speech.querySelector('strong') });
    expect(figure.dataset.hovered).toBe('true');
    pointer(speech, 'pointerenter', 150, 140);
    pointer(speech, 'pointermove', 150, 140);
    expect(speech.dataset.focused).toBe('true');
    pointer(speech, 'pointerleave', 120, 240, { relatedTarget: figure });
    pointer(figure, 'pointerenter', 120, 240);
    expect(figure.dataset.hovered).toBe('true');
    pointer(figure, 'pointerleave', 150, 140, { relatedTarget: speech });
    pointer(speech, 'pointerleave', 400, 400);
    expect(figure.dataset.hovered).toBe('false');
    expect(speech.dataset.focused).toBe('false');
    pointer(speech, 'pointerenter', 150, 140);
    pointer(speech, 'pointermove', 150, 140);
    expect(figure.dataset.hovered).toBe('false');
    expect(speech.dataset.focused).toBe('false');
  });
  it('가림으로 이탈을 무시한 뒤에도 실제 포인터 이동은 호버를 해제하고 dispose는 감시를 제거한다', () => {
    add('look');
    const figure = stage.querySelector('.history-character[data-post-id="look"]');
    jest.spyOn(figure, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 160, top: 200, bottom: 280, width: 60, height: 80 });
    pointer(figure, 'pointerenter', 120, 240);
    pointer(figure, 'pointerleave', 120, 240);
    expect(figure.dataset.hovered).toBe('true');
    pointer(window, 'pointermove', 400, 400);
    expect(figure.dataset.hovered).toBe('false');
    expect(bubble('a').dataset.focused).toBe('false');
    pointer(figure, 'pointerenter', 120, 240);
    const remove = jest.spyOn(window, 'removeEventListener');
    history.dispose();
    expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function));
    visuals.draw.mockClear();
    pointer(figure, 'pointerenter', 120, 240);
    pointer(window, 'pointermove', 400, 400);
    expect(visuals.draw).not.toHaveBeenCalled();
  });
  it.each([false, true])('집게 전체 영역을 말풍선 배치에서 피한다: 겹침 허용=%s', overlap => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    history.setSpeechOverlap(overlap);
    add('held');
    const claw = document.querySelector('.history-grab-hand');
    jest.spyOn(claw, 'getBoundingClientRect').mockReturnValue({ left: 172, right: 228, top: 144, bottom: 206, width: 56, height: 62 });
    pointer(stage.querySelector('.history-character[data-post-id="held"]'), 'pointerdown', 200, 200);
    const speech = bubble('a');
    const left = parseFloat(speech.style.left) - 120, bottom = parseFloat(speech.style.top);
    expect(left >= 228 || left + 240 <= 172 || bottom <= 144 || bottom - 64 >= 206).toBe(true);
  });
  it('터치 호버는 무시하고 집기·화면 숨김·모드 변경은 호버를 해제한다', () => {
    visuals.unproject = (_point, y) => ({ x: 0, y, z: 11 });
    add('look');
    const figure = stage.querySelector('.history-character[data-post-id="look"]');
    const touch = new Event('pointerenter');
    Object.assign(touch, { pointerType: 'touch', buttons: 0 });
    figure.dispatchEvent(touch);
    expect(figure.dataset.phase).not.toBe('hovered');
    pointer(figure, 'pointerenter');
    pointer(figure, 'pointerdown');
    expect(figure.dataset.hovered).toBe('false');
    expect(figure.dataset.phase).toBe('held');
    pointer(window, 'pointercancel');
    pointer(figure, 'pointerenter');
    history.setVisible(false);
    expect(figure.dataset.hovered).toBe('false');
    history.setVisible(true);
    pointer(figure, 'pointerenter');
    history.setBrawl(true);
    expect(figure.dataset.hovered).toBe('false');
  });
  it('같은 작성자의 다음 글과 패싸움 재진입에서도 전투 종류가 바뀌지 않는다', () => {
    const choose = jest.spyOn(Math, 'random').mockReturnValue(0);
    history.setBrawl(true);
    choose.mockRestore();
    history.emerge(authored('first'), entrance);
    history.step(2.5);
    const figure = stage.querySelector('.history-character[data-post-id="first"]');
    expect(figure.dataset.brawlStyle).toMatch(/^chair-/);
    history.emerge(authored('next'), entrance);
    history.step(2);
    expect(figure).toHaveAttribute('data-post-id', 'next');
    expect(figure.dataset.brawlStyle).toMatch(/^chair-/);
    history.setBrawl(false);
    const changedRandom = jest.spyOn(Math, 'random').mockReturnValue(.999);
    history.setBrawl(true);
    changedRandom.mockRestore();
    expect(figure.dataset.brawlStyle).toMatch(/^chair-/);
    expect(history.stats().historyCharacters).toBe(1);
  });
  it('집는 중 도착한 글은 대기했다가 놓은 뒤 기존 캡슐 입장을 이어간다', () => {
    visuals.unproject = () => ({ x: 0, y: -6.3, z: 10.1 });
    add('held');
    pointer(stage.querySelector('.history-character[data-post-id="held"]'), 'pointerdown');
    expect(history.emerge(post('waiting'), entrance)).toBe(true);
    history.step(2);
    expect(history.stats().historyPostIds).toEqual(['held']);
    pointer(window, 'pointerup');
    history.step(.31); history.step(WALKOUT_SECONDS);
    expect(history.stats().historyPostIds).toEqual(['held', 'waiting']);
  });
  it('팀별 상한을 줄이면 오래된 인물부터 퇴장하고 늘려도 인물을 만들어 채우지 않는다', () => {
    history.setBrawl(true, true);
    for (const side of ['a', 'b']) for (let i = 0; i < 8; i++) history.emerge(authored(side + i, side + i, side), entrance, true);
    bubble('a').focus();
    history.setCharacterLimits({ a: 3, b: 5 });
    expect(field().contains(document.activeElement)).toBe(false);
    expect(history.stats()).toMatchObject({ historyCharacters: 8, historyLeaving: 8, historyCapacityBySide: { a: 3, b: 5 } });
    expect(history.stats().historyPostIds).toEqual(['a5', 'a6', 'a7', 'b3', 'b4', 'b5', 'b6', 'b7']);
    history.step(EXIT_SECONDS);
    expect(history.stats().historyLeaving).toBe(0);
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(8);
    history.setCharacterLimits({ a: 6, b: 8 });
    expect(history.stats().historyCharacters).toBe(8);
    history.emerge(authored('new', 'new'), entrance);
    history.step(WALKOUT_SECONDS);
    expect(history.stats().historyCharacters).toBe(9);
    expect(stage.querySelector('.history-conversation-speech[data-post-id="new"]')).toBeVisible();
  });
  it('기본 인원은 모드를 따르고 명시한 팀별 상한은 모드를 바꿔도 유지한다', () => {
    history.setCharacterLimits({ a: 2, b: null }, true);
    expect(history.stats().historyCapacityBySide).toEqual({ a: 2, b: 4 });
    history.setBrawl(true, true);
    expect(history.stats().historyCapacityBySide).toEqual({ a: 2, b: 8 });
    for (const side of ['a', 'b']) for (let i = 0; i < 8; i++) history.emerge(authored(side + i, side + i, side), entrance, true);
    expect(history.stats().historyCharacters).toBe(10);
    history.setBrawl(false, true);
    expect(history.stats()).toMatchObject({ historyCharacters: 6, historyLeaving: 0, historyCapacityBySide: { a: 2, b: 4 } });
    history.setCharacterLimits({ a: null, b: 1 }, true);
    expect(history.stats()).toMatchObject({ historyCharacters: 3, historyCapacityBySide: { a: 4, b: 1 } });
  });
  it('인원 상한을 바꿔도 같은 작성자의 다음 글은 같은 인물에서 읽기 시간을 지킨다', () => {
    history.setCharacterLimits({ a: 1, b: 2 });
    history.emerge(authored('first'), entrance); history.step(WALKOUT_SECONDS);
    history.emerge(authored('second'), entrance);
    history.setCharacterLimits({ a: 8, b: 2 });
    history.step(1.79);
    expect(bubble('a')).toHaveTextContent('의견 first');
    history.step(.02);
    expect(bubble('a')).toHaveTextContent('의견 second');
    expect(history.stats().historyCharacters).toBe(1);
  });
  it('퇴장 중 상한을 다시 늘려도 대기한 글과 인물 수 제한을 유지한다', () => {
    history.setBrawl(true, true);
    for (let i = 0; i < 8; i++) history.emerge(authored('a' + i, 'a' + i), entrance, true);
    history.setCharacterLimits({ a: 1, b: 1 });
    history.emerge(authored('return', 'a0'), entrance);
    history.setCharacterLimits({ a: 3, b: 2 });
    history.step(EXIT_SECONDS);
    history.step(WALKOUT_SECONDS);
    expect(history.stats().historyPostIds).toContain('return');
    expect(history.stats().historyParticipants.filter(item => item.side === 'a').length).toBeLessThanOrEqual(3);
    expect(history.stats().historyLeaving).toBe(0);
  });
  it('범위를 벗어나거나 불완전한 팀별 상한은 현재 설정을 바꾸지 않는다', () => {
    history.setCharacterLimits({ a: 3, b: 5 });
    for (const value of [null, {}, { a: 1 }, { a: 0, b: 2 }, { a: 9, b: 2 }, { a: '2', b: 3 }, { a: 1.5, b: 3 }]) {
      history.setCharacterLimits(value);
      expect(history.stats().historyCapacityBySide).toEqual({ a: 3, b: 5 });
    }
  });
  it.each(['pause', 'hidden', 'focus', 'reduced'])('마당 이동과 말풍선은 함께 따라가고 %s 동안 멈춘다', control => {
    history.setBrawl(true, true);
    history.emerge(authored('runner', 'runner'), entrance, true);
    history.emerge(authored('opponent', 'opponent', 'b'), entrance, true);
    const figure = stage.querySelector('.history-character[data-post-id="runner"]');
    const before = figure.style.left;
    for (let i = 0; i < 30; i++) history.step(1 / 60);
    expect(figure.style.left).not.toBe(before);
    const stopped = figure.style.left;
    if (control === 'pause') history.setPaused(true);
    if (control === 'hidden') history.setVisible(false);
    if (control === 'focus') bubble('a').focus();
    history.step(1, control === 'reduced');
    expect(figure.style.left).toBe(stopped);
    expect(history.stats().historyCharacters).toBe(2);
    if (control !== 'hidden') expect(bubble('a')).toHaveTextContent('의견 runner');
  });
  it('패싸움은 행과 열 없이 흩어지고 다른 작성자의 입장으로 기존 인물 자리가 바뀌지 않는다', () => {
    history.setBrawl(true, true);
    history.emerge(authored('a0', 'a0'), entrance, true);
    const firstPosition = { ...visuals.draw.mock.lastCall[2] };
    for (let i = 1; i < 8; i++) history.emerge(authored('a' + i, 'a' + i), entrance, true);
    for (let i = 0; i < 8; i++) history.emerge(authored('b' + i, 'b' + i, 'b'), entrance, true);
    visuals.draw.mockClear(); history.step(0, true);
    const calls = visuals.draw.mock.calls;
    expect(calls).toHaveLength(16);
    expect(calls.find(([, entry]) => entry.id === 'a0')[2]).toEqual(firstPosition);
    expect(new Set(calls.map(([, , position]) => position.z.toFixed(2))).size).toBeGreaterThan(8);
    expect(new Set(calls.map(([, , , , , yaw]) => yaw.toFixed(2))).size).toBeGreaterThan(6);
    expect(calls.every(([, , position]) => position.y === -6.3)).toBe(true);
  });
  it.each([9.6, 10.1])('마당 기준 z=%s에서 싸우는 16명이 미끄럼틀 앞 공간을 비우고 앞쪽 경계를 유지한다', historyZ => {
    history.setLayout({ worldLeft: { x: -1.25, y: -6.4, z: historyZ }, worldRight: { x: 1.25, y: -6.4, z: historyZ } });
    history.setBrawl(true, true);
    for (const side of ['a', 'b']) for (let i = 0; i < 8; i++) history.emerge(authored(side + i, side + i, side), entrance, true);
    for (let tick = 0; tick < 120; tick++) {
      visuals.draw.mockClear(); history.step(.05, tick === 0);
      expect(visuals.draw.mock.calls).toHaveLength(16);
      for (const [, , position] of visuals.draw.mock.calls) {
        expect(position.z).toBeGreaterThanOrEqual(historyZ - 1.4 - 1e-8);
        expect(position.z).toBeLessThanOrEqual(historyZ + 5.8 + 1e-8);
        expect(position.y).toBe(-6.4);
      }
    }
  });
  it('패싸움은 기존 입장과 말풍선을 유지하고 편당 8명 이후 같은 편의 가장 오래된 인물을 교체한다', () => {
    history.setBrawl(true);
    expect(history.stats()).toMatchObject({ historyCharacters: 0, historyCapacityPerSide: 8 });
    for (let i = 0; i < 8; i++) {
      for (const side of ['a', 'b']) {
        history.emerge(authored(side + i, side + i, side), entrance);
        history.step(WALKOUT_SECONDS);
      }
    }
    expect(history.stats().historyCharacters).toBe(16);
    expect(stage.querySelectorAll('.history-character[data-phase="brawling"]')).toHaveLength(16);
    const speeches = [...stage.querySelectorAll('.history-conversation-speech:not([hidden])')];
    expect(speeches).toHaveLength(16);
    expect(new Set(speeches.map(speech => speech.dataset.postId)).size).toBe(16);
    expect(speeches.map(speech => speech.dataset.postId).sort()).toEqual([...history.stats().historyPostIds].sort());
    expect(visuals.draw.mock.lastCall[4]).toMatchObject({ chairCarry: false, seated: 0 });
    history.emerge(authored('new-a', 'new-a'), entrance);
    expect(history.stats()).toMatchObject({ historyCharacters: 16, historyLeavingPostIds: ['a0'] });
    expect(stage.querySelector('[data-post-id="new-a"]')).toHaveAttribute('data-phase', 'standing');
    expect(stage.querySelector('.history-conversation-speech[data-post-id="new-a"]')).toBeNull();
    history.step(WALKOUT_SECONDS);
    expect(stage.querySelector('.history-conversation-speech[data-post-id="new-a"]')).toBeVisible();
    expect(history.stats().historyPostIds).toEqual(expect.arrayContaining(Array.from({ length: 8 }, (_, i) => 'b' + i)));
    history.setBrawl(false); history.step(EXIT_SECONDS);
    expect(history.stats()).toMatchObject({ historyCharacters: 8, historyCapacityPerSide: 4, historyLeaving: 0 });
    expect(history.stats().historyPostIds).toContain('new-a');
  });
  it('패싸움에서도 한 작성자의 연속 글은 한 인물에서 1.8초씩 말하고 모드 전환은 읽기 시간을 보존한다', () => {
    history.emerge(authored('first'), entrance); history.step(WALKOUT_SECONDS);
    const ids = history.stats().historyPostIds;
    history.setBrawl(true);
    expect(history.stats().historyPostIds).toEqual(ids);
    history.emerge(authored('second'), entrance);
    history.step(1.79); expect(bubble('a')).toHaveTextContent('의견 first');
    history.step(.02); expect(bubble('a')).toHaveTextContent('의견 second');
    expect(history.stats()).toMatchObject({ historyCharacters: 1, historyLeaving: 0 });
    history.setBrawl(false); expect(bubble('a')).toHaveTextContent('의견 second');
    bubble('a').click(); expect(select).toHaveBeenLastCalledWith('second');
  });
  it('패싸움도 실제 편별 작성자 수를 따르고 포커스와 정지 중에는 움직이지 않는다', () => {
    history.setBrawl(true);
    for (const side of ['a', 'b']) for (let i = 0; i < (side === 'a' ? 3 : 7); i++) {
      history.emerge(authored(side + i, side + i, side), entrance); history.step(2);
    }
    expect(history.stats().historyParticipants.filter(item => item.side === 'a')).toHaveLength(3);
    expect(history.stats().historyParticipants.filter(item => item.side === 'b')).toHaveLength(7);
    history.setPaused(true); visuals.draw.mockClear(); history.step(20); expect(visuals.draw).not.toHaveBeenCalled();
    history.setPaused(false); history.step(0, true);
    expect(visuals.draw.mock.lastCall[4]).toMatchObject({ seated: 0, lift: 0, time: 0 });
  });
  it('한 작성자의 연속 글은 한 인물의 말풍선으로 각각 1.8초씩 읽고 넘긴다', () => {
    const origin = { x: 0, y: -6, z: 9 };
    history.emerge(authored('first'), origin);
    history.emerge(authored('second'), origin);
    history.emerge(authored('third'), origin);
    history.step(WALKOUT_SECONDS);
    const figure = stage.querySelector('.history-character[data-post-id="first"]');
    const position = [figure.style.left, figure.style.top];
    expect(history.stats().historyCharacters).toBe(1);
    expect(bubble('a')).toHaveTextContent('의견 first');
    for (const [current, next] of [['first', 'second'], ['second', 'third']]) {
      history.step(1.79);
      expect(bubble('a')).toHaveTextContent('의견 ' + current);
      history.step(0.02);
      expect(bubble('a')).toHaveTextContent('의견 ' + next);
      expect(figure).toHaveAttribute('data-post-id', next);
      expect([figure.style.left, figure.style.top]).toEqual(position);
      expect(history.stats()).toMatchObject({ historyCharacters: 1, historyLeaving: 0 });
    }
    expect(reveal.mock.calls.map(([entry]) => entry.id)).toEqual(['first', 'second', 'third']);
    bubble('a').click();
    expect(select).toHaveBeenLastCalledWith('third');
    expect(history.canAccept()).toBe(true);
  });
  it('맞은편 발언이 끼어도 같은 작성자는 자기 자리에 남아 이어서 말한다', () => {
    history.emerge(authored('first'), entrance, true);
    const figure = stage.querySelector('[data-post-id="first"]');
    history.emerge(authored('opponent', 'member-2', 'b'), entrance, true);
    history.step(1.8, true);
    history.emerge(authored('next'), entrance, true);
    expect(history.stats()).toMatchObject({ historyCharacters: 2, historyLeaving: 0 });
    expect(figure).toHaveAttribute('data-post-id', 'next');
    expect(bubble('a')).toHaveTextContent('의견 next');
  });
  it.each(['pause', 'hidden', 'focus', 'cheer'])('%s 동안 연속 글의 읽기 시간이 지나지 않는다', control => {
    history.emerge(authored('first'), entrance, true);
    history.emerge(authored('next'), entrance, true);
    if (control === 'pause') history.setPaused(true);
    if (control === 'hidden') history.setVisible(true, { speech: false });
    if (control === 'focus') bubble('a').focus();
    if (control === 'cheer') history.setCheering(true, true);
    history.step(20, true);
    expect(history.stats().historyPostIds).toEqual(['first']);
    history.setPaused(false); history.setVisible(true); document.activeElement.blur(); history.setCheering(false, true);
    history.step(1.79, true);
    expect(bubble('a')).toHaveTextContent('의견 first');
    history.step(.02, true);
    expect(bubble('a')).toHaveTextContent('의견 next');
    expect(history.canAccept()).toBe(true);
  });
  it('이름만 같은 다른 작성자, 작성자 미상, 서로 다른 편은 합치지 않는다', () => {
    for (const entry of [authored('one'), authored('two', 'member-2'), authored('unknown1', null),
      authored('unknown2', null), authored('other-side', 'member-1', 'b')]) history.emerge(entry, entrance, true);
    expect(history.stats().historyCharacters).toBe(5);
    expect(history.hasAuthor(authored('known'))).toBe(true);
    expect(history.hasAuthor(authored('unknown', null))).toBe(false);
  });
  it('다른 작성자가 늘어도 기존 말풍선을 유지하고 같은 작성자의 다음 글로 넘긴다', () => {
    history.setBrawl(true, true);
    history.emerge(authored('first'), entrance, true);
    history.emerge(authored('other1', 'member-2'), entrance, true);
    history.emerge(authored('other2', 'member-3'), entrance, true);
    history.emerge(authored('other3', 'member-4'), entrance, true);
    history.emerge(authored('other4', 'member-5'), entrance, true);
    expect(bubble('a')).toBeVisible();
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(5);
    history.emerge(authored('next'), entrance, true);
    expect(bubble('a')).toBeVisible();
    history.step(1.8, true);
    expect(bubble('a')).toHaveTextContent('의견 next');
    expect(history.stats().historyCharacters).toBe(5);
  });
  it('겹침 허용은 표시 위치만 바꾸고 인물·말풍선·읽기 시간·받아치기를 유지한다', () => {
    history.setBrawl(true, true);
    Object.defineProperty(stage, 'clientHeight', { value: 640 });
    for (const side of ['a', 'b']) for (let i = 0; i < 8; i++) history.emerge(authored(side + i, side + i, side), entrance, true);
    const speeches = [...stage.querySelectorAll('.history-conversation-speech:not([hidden])')];
    const before = speeches.map(speech => [speech.style.left, speech.style.top]);
    const ids = history.stats().historyPostIds;
    reveal.mockClear();
    history.setSpeechOverlap(true);
    expect(field()).toHaveAttribute('data-speech-overlap', 'true');
    expect(speeches.map(speech => [speech.style.left, speech.style.top])).not.toEqual(before);
    expect(history.stats().historyPostIds).toEqual(ids);
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(16);
    history.setSpeechOverlap(false);
    expect(speeches.map(speech => [speech.style.left, speech.style.top])).toEqual(before);
    expect(reveal).not.toHaveBeenCalled();
    history.emerge(authored('next', 'a0'), entrance, true);
    history.step(1.79, true); expect(bubble('a')).toHaveTextContent('의견 a0');
    history.step(.02, true); expect(bubble('a')).toHaveTextContent('의견 next');
    bubble('a').click(); expect(select).toHaveBeenLastCalledWith('next');
  });
  it('같은 작성자가 퇴장 중이면 다른 글도 퇴장이 끝나야 다시 입장한다', () => {
    history.emerge(authored('first'), entrance, true);
    history.leaveAll();
    history.emerge(authored('next'), entrance);
    expect(history.stats()).toMatchObject({ historyCharacters: 0, historyLeaving: 1 });
    history.step(EXIT_SECONDS);
    expect(history.stats()).toMatchObject({ historyCharacters: 1, historyLeaving: 0, historyPostIds: ['next'] });
  });
  it('받아치기 중 같은 여덟 인물이 응원하고 끝나면 대화 자리와 말풍선으로 복귀한다', () => {
    for (let index = 0; index < 4; index++) { add('a' + index); add('b' + index, 'b'); }
    const ids = history.stats().historyPostIds;
    const before = [...stage.querySelectorAll('.history-character')].map(item => [item.style.left, item.style.top]);
    history.setCheering(true);
    history.step(0.7);
    expect(history.stats()).toMatchObject({ historyCharacters: 8, historyLeaving: 0, historyPostIds: ids });
    expect(stage.querySelectorAll('[data-phase="cheering"]')).toHaveLength(8);
    const styles = [...stage.querySelectorAll('[data-phase="cheering"]')].map(item => item.dataset.cheer);
    expect(new Set(styles).size).toBe(5);
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(0);
    expect(history.canAccept()).toBe(false);
    history.setCheering(true); history.step(6);
    expect([...stage.querySelectorAll('[data-phase="cheering"]')].map(item => item.dataset.cheer)).toEqual(styles);
    history.setCheering(false); history.step(0.7);
    expect(history.stats().historyPostIds).toEqual(ids);
    expect([...stage.querySelectorAll('.history-character')].map(item => [item.style.left, item.style.top])).toEqual(before);
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(8);
    expect(history.canAccept()).toBe(true);
  });
  it('응원 중 교체 요청은 보관하고 응원이 끝나야 가장 오래된 인물을 교체한다', () => {
    for (let index = 0; index < 4; index++) add('a' + index);
    history.setCheering(true); history.step(1);
    history.emerge(post('next'), { x: 0, y: -6, z: 9 }); history.step(2);
    expect(history.stats()).toMatchObject({ historyPostIds: ['a0', 'a1', 'a2', 'a3'], historyLeaving: 0 });
    history.setCheering(false); history.step(0.7);
    expect(history.stats().historyPostIds).toContain('next');
    expect(history.stats().historyLeavingPostIds).toEqual(['a0']);
  });
  it('응원 시계도 일시정지하고 모션 감소에서는 인물을 유지한 채 움직임만 생략한다', () => {
    add('a1'); history.setCheering(true); history.step(1);
    const pose = visuals.draw.mock.lastCall[4];
    history.setPaused(true); visuals.draw.mockClear(); history.step(3);
    expect(visuals.draw).not.toHaveBeenCalled();
    history.setPaused(false); history.step(0);
    expect(visuals.draw.mock.lastCall[4]).toEqual(pose);
    history.step(1, true);
    expect(history.stats()).toMatchObject({ historyCharacters: 1, historyLeaving: 0, historyCheerAmount: 0 });
    expect(visuals.draw.mock.lastCall[4]).toMatchObject({ seated: 1, lift: 0, time: 0 });
    history.setCheering(false, true);
    expect(bubble('a')).toBeVisible();
    expect(history.canAccept()).toBe(true);
  });
  it('입장 도중 받아치기가 시작돼도 걸음을 마친 위치에서 응원을 시작한다', () => {
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 });
    history.step(0.5); history.setCheering(true); history.step(WALKOUT_SECONDS);
    expect(stage.querySelector('[data-post-id="a1"]')).toHaveAttribute('data-phase', 'talking');
    history.step(0.1);
    expect(stage.querySelector('[data-post-id="a1"]')).toHaveAttribute('data-phase', 'cheering');
    expect(history.stats().historyLeaving).toBe(0);
  });
  it('말풍선을 읽는 동안 받아치기로 교체하지 않고 숨김·정지·포커스 시간은 제외한다', () => {
    expect(history.canReplace()).toBe(true);
    history.emerge(post('reading'), { x: 0, y: -6, z: 9 });
    expect(history.canReplace()).toBe(false);
    history.step(WALKOUT_SECONDS);
    expect(history.canReplace()).toBe(false);
    history.setVisible(true, { speech: false }); history.step(10);
    history.setVisible(true); history.setPaused(true); history.step(10);
    history.setPaused(false); bubble('a').focus(); history.step(10);
    bubble('a').blur(); history.step(1.79);
    expect(history.canReplace()).toBe(false);
    history.step(.02);
    expect(history.canReplace()).toBe(true);
  });
  it('같은 표시 상태를 다시 받아도 캐릭터와 말풍선을 중복 갱신하지 않고 실제 전환만 반영한다', () => {
    add('a1');
    visuals.draw.mockClear(); visuals.hide.mockClear(); reveal.mockClear();
    history.step(1 / 60);
    expect(visuals.draw).toHaveBeenCalledTimes(1);
    const position = { ...visuals.draw.mock.lastCall[2] };
    history.setVisible(true);
    expect(visuals.draw).toHaveBeenCalledTimes(1);
    expect(reveal).not.toHaveBeenCalled();
    history.setVisible(false);
    expect(bubble('a')).not.toBeVisible();
    visuals.hide.mockClear();
    history.setVisible(false);
    expect(visuals.hide).not.toHaveBeenCalled();
    history.setVisible(true);
    expect(bubble('a')).toBeVisible();
    expect(visuals.draw.mock.lastCall[2]).toEqual(position);
    bubble('a').click(); expect(select).toHaveBeenCalledWith('a1');
  });
  it('캐릭터를 유지한 채 말풍선만 숨기거나 복원하는 전환도 반영하고 반복 갱신은 생략한다', () => {
    add('a1');
    history.setVisible(true, { speech: false });
    expect(bubble('a')).not.toBeVisible();
    expect(field()).not.toHaveAttribute('hidden');
    visuals.draw.mockClear();
    history.setVisible(true, { speech: false });
    expect(visuals.draw).not.toHaveBeenCalled();
    history.setVisible(true, { speech: true });
    expect(bubble('a')).toBeVisible();
    expect(visuals.draw).toHaveBeenCalledTimes(1);
  });
  it('크기 전환은 보이던 대화와 발 위치를 유지하고 말풍선을 머리 높이에 맞춘 뒤 원복한다', () => {
    add('a1');
    const speech = bubble('a'), beforeTop = speech.style.top, ids = history.stats().historyPostIds;
    const layout = { left: { x: 180, y: 300 }, right: { x: 620, y: 300 }, worldLeft: { x: -4.4, y: -6.3, z: 10.1 }, worldRight: { x: 4.4, y: -6.3, z: 10.1 }, width: 800 };
    const feet = { ...visuals.draw.mock.lastCall[2] };
    history.setLayout({ ...layout, characterScale: PACKED_SCALE });
    expect(visuals.draw.mock.lastCall[4].scale).toBe(PACKED_SCALE);
    expect(visuals.draw.mock.lastCall[2]).toEqual(feet);
    expect(parseFloat(speech.style.top)).toBeGreaterThan(parseFloat(beforeTop));
    expect(history.stats().historyPostIds).toEqual(ids);
    history.setLayout(layout);
    expect(visuals.draw.mock.lastCall[4].scale).toBe(0.65);
    expect(speech.style.top).toBe(beforeTop);
    expect(speech).toHaveAttribute('data-cue-active', 'true');
    expect(speech.querySelector('.speech-cue-label')).toHaveAttribute('aria-hidden', 'true');
    speech.click(); expect(select).toHaveBeenCalledWith('a1');
    expect(speech).toHaveAttribute('data-reply-selected', 'true');
    history.step(0.1);
    expect(speech).toHaveAttribute('data-reply-selected', 'true');
  });
  it('개봉 위치에서 출발하고 자기 편에 도착한 뒤 말풍선을 보여준다', () => {
    history.emerge(post('1'), { x: 0, y: -6, z: 9 });
    const figure = stage.querySelector('.history-character[data-post-id="1"]');
    expect(figure.style.left).toBe('400px'); expect(bubble('a')).not.toBeVisible();
    expect(reveal).not.toHaveBeenCalled(); history.step(2.5);
    expect(Number.parseFloat(figure.style.left)).toBeCloseTo((-4.4) * 50 + 400); expect(bubble('a')).toBeVisible(); expect(bubble('b')).not.toBeVisible();
    expect(reveal).toHaveBeenCalledWith(post('1'), false);
  });
  it('가운데 두 캐릭터도 말풍선을 자기 편의 바깥쪽으로 배치한다', () => {
    visuals.project = point => ({ x: point.x * 100 + 600, y: 300 - (point.y + 6.3) * 40 });
    history.setLayout({ left: { x: 160, y: 300 }, right: { x: 1040, y: 300 }, worldLeft: { x: -2.4, y: -6.3, z: 10.1 }, worldRight: { x: 2.4, y: -6.3, z: 10.1 }, width: 1200 });
    add('a1'); add('b1', 'b');
    for (const [side, sign] of [['a', 1], ['b', -1]]) {
      const speech = bubble(side);
      const character = stage.querySelector(`.history-character[data-post-id="${side}1"]`);
      expect((parseFloat(speech.style.left) - parseFloat(character.style.left)) * sign).toBeLessThan(0);
    }
  });
  it('편당 4명을 유지하고 새 글은 같은 편의 가장 오래된 자리를 교체하되 말풍선은 8개까지 보여준다', () => {
    for (let i = 1; i <= 4; i++) { add('a' + i); add('b' + i, 'b'); }
    expect(history.stats().historyCharacters).toBe(8);
    history.emerge(post('a5'), { x: 0, y: -6, z: 9 }); history.step(0.3); history.step(2.5);
    expect(history.stats().historyCharacters).toBe(8);
    expect(history.stats().historyPostIds).toEqual(expect.arrayContaining(['a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'b3', 'b4']));
    expect(history.stats().historyPostIds).not.toContain('a1'); expect(bubble('a')).toHaveTextContent('의견 a5');
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(8);
    expect(field()).toHaveAttribute('data-bubble-count', '8');
  });
  it('같은 글의 재생은 기존 인물이 다시 말하고 중복 인물을 만들지 않는다', () => {
    add('a1'); add('a2'); add('b1', 'b');
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 });
    expect(history.stats().historyCharacters).toBe(3); expect(history.stats().historyArriving).toBe(0);
    expect(history.stats().historySpeakingId).toBe('a1'); expect(bubble('a')).toHaveTextContent('의견 a1');
    expect(reveal).toHaveBeenLastCalledWith(post('a1'), false);
    expect(reveal).toHaveBeenCalledTimes(4);
  });
  it('실제 답장이 없는 의견에는 상대나 받아치기 관계를 만들지 않는다', () => {
    const createdAt = Date.now() - 5 * 60_000;
    history.emerge({ ...post('a1'), createdAt }, { x: 0, y: -6, z: 9 }, true);
    history.emerge({ ...post('b1', 'b'), createdAt }, { x: 0, y: -6, z: 9 }, true);
    expect(bubble('a')).toHaveTextContent('5분 전'); expect(bubble('b')).toHaveTextContent('5분 전');
    expect(stage.textContent).not.toContain('VS');
    history.emerge({ ...post('a2'), createdAt, replyTo: post('b1', 'b') }, { x: 0, y: -6, z: 9 }, true);
    expect(stage.querySelector('.history-conversation-speech[data-post-id="a2"]')).toHaveTextContent('5분 전');
    expect(stage.textContent).not.toContain('지난 받아치기');
    expect(stage.textContent).not.toContain('지난 한마디');
  });
  it.each([
    [-1, '방금 전'], [0, '방금 전'], [59_999, '방금 전'],
    [60_000, '1분 전'], [59 * 60_000, '59분 전'],
    [60 * 60_000, '1시간 전'], [23 * 60 * 60_000, '23시간 전'],
    [24 * 60 * 60_000, '1일 전'], [3 * 24 * 60 * 60_000, '3일 전'],
  ])('작성 후 %ims가 지난 의견에 %s를 표시한다', (age, caption) => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    try {
      history.emerge({ ...post('time'), createdAt: Date.now() - age }, { x: 0, y: -6, z: 9 }, true);
      expect(bubble('a').querySelector('.history-conversation-time')).toHaveTextContent(caption);
      expect(bubble('a')).toHaveAccessibleName(`크루 time, ${caption}: 의견 time. 눌러서 받아치기`);
    } finally { clock.mockRestore(); }
  });
  it('화면이 다시 그려질 때 같은 의견의 경과 시간도 갱신한다', () => {
    const now = 1_800_000_000_000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      history.emerge({ ...post('time'), createdAt: now - 60_000 }, { x: 0, y: -6, z: 9 }, true);
      expect(bubble('a').querySelector('.history-conversation-time')).toHaveTextContent('1분 전');
      clock.mockReturnValue(now + 60_000);
      history.step(0, true);
      expect(bubble('a').querySelector('.history-conversation-time')).toHaveTextContent('2분 전');
    } finally { clock.mockRestore(); }
  });
  it('작성 시간이 없으면 잘못된 상대 시간을 만들지 않는다', () => {
    add('unknown');
    expect(bubble('a').querySelector('.history-conversation-time')).not.toBeVisible();
    expect(bubble('a')).toHaveAccessibleName('크루 unknown: 의견 unknown. 눌러서 받아치기');
  });
  it('말풍선이 실제 캐릭터 머리 바로 위에 붙고 꼬리가 해당 인물을 가리킨다', () => {
    Object.defineProperty(stage, 'clientHeight', { value: 400, configurable: true });
    add('a1'); add('b1', 'b');
    for (const side of ['a', 'b']) {
      const speech = bubble(side);
      const character = stage.querySelector(`.history-character[data-post-id="${side}1"]`);
      const center = Number.parseFloat(speech.style.left);
      const width = Number.parseFloat(speech.style.getPropertyValue('--history-bubble-width'));
      const tail = Number.parseFloat(speech.style.getPropertyValue('--history-tail-x'));
      expect(center - width / 2 + tail).toBeCloseTo(Number.parseFloat(character.style.left));
      expect(Number.parseFloat(speech.style.top)).toBeCloseTo(300 - 1.9 * 0.65 * 40 - 12);
    }
    const previousLeft = Number.parseFloat(bubble('a').style.left);
    add('a2');
    const nextBubble = stage.querySelector('.history-conversation-speech[data-post-id="a2"]');
    const nextCenter = Number.parseFloat(nextBubble.style.left);
    const nextWidth = Number.parseFloat(nextBubble.style.getPropertyValue('--history-bubble-width'));
    const nextTail = Number.parseFloat(nextBubble.style.getPropertyValue('--history-tail-x'));
    expect(nextCenter - nextWidth / 2 + nextTail).toBeCloseTo(
      Number.parseFloat(stage.querySelector('.history-character[data-post-id="a2"]').style.left));
    expect(Number.parseFloat(bubble('a').style.left)).toBe(previousLeft);
  });
  it('좁은 화면에서도 말풍선이 양쪽 화면 경계 안에 머문다', () => {
    visuals.project = point => ({ x: 195 + point.x * 12, y: 300 - (point.y + 6.3) * 20 });
    history.setLayout({ left: { x: 160, y: 300 }, right: { x: 230, y: 300 }, worldLeft: { x: -2.2, y: -6.3, z: 8.5 }, worldRight: { x: 2.2, y: -6.3, z: 8.5 }, width: 390 });
    add('a1'); add('b1', 'b');
    for (const side of ['a', 'b']) {
      const center = Number.parseFloat(bubble(side).style.left);
      const width = Number.parseFloat(bubble(side).style.getPropertyValue('--history-bubble-width'));
      expect(center - width / 2).toBeGreaterThanOrEqual(8);
      expect(center + width / 2).toBeLessThanOrEqual(382);
    }
  });
  it('좁은 화면에서도 여덟 인물의 말풍선이 화면 안에서 서로 피한다', () => {
    visuals.project = point => ({ x: 179 + point.x * 20, y: 280 - (point.y + 6.3) * 20 });
    history.setLayout({ worldLeft: { x: -1.6, y: -6.3, z: 8.5 }, worldRight: { x: 1.6, y: -6.3, z: 8.5 }, width: 358 });
    for (let i = 1; i <= 4; i++) { add('a' + i); add('b' + i, 'b'); }
    expect(history.stats().historyCharacters).toBe(8);
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(8);
    const boxes = [...stage.querySelectorAll('.history-conversation-speech:not([hidden])')].map(speech => {
      const center = Number.parseFloat(speech.style.left), bottom = Number.parseFloat(speech.style.top);
      const width = Number.parseFloat(speech.style.getPropertyValue('--history-bubble-width'));
      const box = { left: center - width / 2, right: center + width / 2, top: bottom - 44, bottom };
      expect(speech.hidden).toBe(false);
      if (speech.dataset.side === 'a') expect(box.right).toBeLessThanOrEqual(174);
      else expect(box.left).toBeGreaterThanOrEqual(184);
      return box;
    });
    expect(Math.max(...boxes.map(box => box.bottom)) - Math.min(...boxes.map(box => box.bottom))).toBeLessThanOrEqual(162);
    boxes.forEach((box, i) => boxes.slice(0, i).forEach(other => {
      expect(box.left >= other.right || box.right <= other.left || box.bottom <= other.top || box.top >= other.bottom).toBe(true);
    }));
  });
  it('말풍선 선택은 전문 선택 콜백을 보내고 포커스 동안 발언 교체를 멈춘다', () => {
    add('a1'); add('b1', 'b'); bubble('a').focus(); bubble('a').click();
    expect(select).toHaveBeenCalledWith('a1'); expect(history.pinned()).toBe(true);
    expect(bubble('a')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_reply_start');
    const id = history.stats().historySpeakingId; history.step(4);
    expect(history.stats().historySpeakingId).toBe(id);
    expect(history.emerge(post('a2'), { x: 0, y: 0 })).toBe(false);
    bubble('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(history.pinned()).toBe(false); history.step(3.3);
    expect(history.stats().historySpeakingId).not.toBe(id);
  });
  it('멈춤과 화면 숨김은 등장 시계를 고정한다', () => {
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 }); history.step(0.2);
    const figure = stage.querySelector('.history-character[data-post-id="a1"]'), before = figure.style.left;
    history.setPaused(true); history.step(3); expect(figure.style.left).toBe(before); expect(history.needsFrame()).toBe(false);
    history.setPaused(false); history.setVisible(false); history.step(3);
    expect(visuals.hide).toHaveBeenCalledWith(0);
    expect(field()).not.toBeVisible(); expect(figure.style.left).toBe(before); expect(history.needsFrame()).toBe(false);
    history.setVisible(true); history.step(2.5); expect(history.stats().historyArriving).toBe(0);
  });
  it('모션 감소는 이동 없이 바로 읽을 수 있고 자동 몸짓도 멈춘다', () => {
    add('a1', 'a', true); add('b1', 'b', true);
    expect(history.stats().historyArriving).toBe(0); expect(history.needsFrame()).toBe(false);
    expect(bubble('a')).toBeVisible(); expect(bubble('b')).toBeVisible();
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(visuals.draw).toHaveBeenLastCalledWith(8, post('b1', 'b'),
      expect.objectContaining({ y: -6.3 }), 1,
      expect.objectContaining({ stride: 0, speaking: false, scale: 0.65 }), expect.any(Number));
    expect(visuals.draw.mock.lastCall[2].x).toBeCloseTo(4.4);
    expect(visuals.draw.mock.lastCall[5]).toBeCloseTo(-0.85);

  });
  const lastDraw = id => visuals.draw.mock.calls.filter(call => call[1].id === id).at(-1);
  it('편당 네 인물은 마주 보는 네 쌍으로 앉고 각자의 말풍선을 보여준다', () => {
    for (let i = 1; i <= 4; i++) { add('a' + i); add('b' + i, 'b'); }
    const positions = history.stats().historyPostIds.map(id => lastDraw(id)[2]);
    expect(new Set(positions.map(point => `${point.x},${point.z}`)).size).toBe(8);
    expect(new Set(positions.map(point => point.z)).size).toBe(4);
    expect(stage.querySelector('.history-conversation-speech[data-post-id="a1"]')).toBeVisible();
    expect(stage.querySelector('.history-conversation-speech[data-post-id="b4"]')).toBeVisible();
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 });
    expect(stage.querySelector('.history-conversation-speech[data-post-id="a1"]')).toBeVisible();
    expect(history.stats().historyCharacters).toBe(8);
  });
  it('받아치기 발사 중 말풍선만 숨겨도 캐릭터의 입장과 몸짓은 유지한다', () => {
    add('a1');
    history.emerge(post('b1', 'b'), { x: 0, y: -6, z: 9 });
    const before = lastDraw('b1')[2];
    bubble('a').focus();
    visuals.draw.mockClear();
    history.setVisible(true, { speech: false });
    expect(history.pinned()).toBe(false);
    expect(field()).toBeVisible();
    expect(bubble('a')).not.toBeVisible();
    expect(lastDraw('a1')).toBeDefined();
    history.step(0.7);
    expect(lastDraw('b1')[2].x).toBeGreaterThan(before.x);
  });

  it.each([[1.25, 0.8, PACKED_SCALE], [2.0, 1.25, 0.65]])('간격 %s의 마당에서 여덟 명이 중앙선을 넘지 않고 맞은편을 바라본다', (spread, gap, scale) => {
    history.setLayout({ worldLeft: { x: -spread, y: -6.4, z: 9.6 }, worldRight: { x: spread, y: -6.4, z: 9.6 },
      width: 800, characterGap: gap, characterScale: scale });
    for (let i = 1; i <= 4; i++) { add('a' + i); add('b' + i, 'b'); }
    for (let i = 1; i <= 4; i++) {
      const left = lastDraw('a' + i), right = lastDraw('b' + i);
      expect(left[2].x).toBeLessThan(-scale);
      expect(right[2].x).toBeGreaterThan(scale);
      expect(left[2].y).toBe(-6.4);
      expect(right[2].y).toBe(-6.4);
      expect(left[2].z).toBe(right[2].z);
      expect(left[2].z).toBeGreaterThan(7 + scale);
      expect(Math.sin(left[5])).toBeCloseTo(Math.sin(0.85));
      expect(Math.sin(right[5])).toBeCloseTo(-Math.sin(0.85));
      expect(Math.cos(left[5])).toBeCloseTo(Math.cos(0.85));
      if (i > 1) expect(Math.hypot(left[2].z - lastDraw('a' + (i - 1))[2].z, left[2].x - lastDraw('a' + (i - 1))[2].x)).toBeGreaterThan(scale * 2);
    }
  });
  it('마당을 비울 때 현재 위치와 크기에서 동시에 걸어나가고 VS 뒤 다시 나타나지 않는다', () => {
    add('a1'); add('a2'); add('b1', 'b'); add('b2', 'b');
    const ids = ['a1', 'a2', 'b1', 'b2'];
    const before = new Map(ids.map(id => [id, lastDraw(id)]));
    const reveals = reveal.mock.calls.length;
    history.leaveAll();
    expect(history.stats().historyLeavingPostIds).toEqual(ids);
    expect(history.stats().historyCharacters).toBe(0);
    expect(history.canAccept()).toBe(false);
    for (const id of ids) {
      expect(lastDraw(id)[2]).toEqual(before.get(id)[2]);
      expect(lastDraw(id)[4].scale).toBe(before.get(id)[4].scale);
    }
    history.step(0.7);
    for (const id of ids) {
      const direction = id[0] === 'a' ? -1 : 1;
      expect((lastDraw(id)[2].x - before.get(id)[2].x) * direction).toBeGreaterThan(0);
      expect(lastDraw(id)[4].shrink).toBe(1);
    }
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(0);
    history.leaveAll(); // A second reply must not restart an ongoing exit.
    history.step(EXIT_SECONDS - 0.7);
    visuals.draw.mockClear();
    history.setVisible(true); history.step(1);
    expect(history.stats().historyLeaving).toBe(0);
    expect(history.stats().historyPostIds).toEqual([]);
    expect(visuals.draw).not.toHaveBeenCalled();
    expect(reveal).toHaveBeenCalledTimes(reveals);
    expect(history.canAccept()).toBe(true);
    add('next');
    expect(history.stats().historyPostIds).toEqual(['next']);
  });

  it('이미 퇴장 중인 인물과 입장 중인 인물도 사라지지 않고 각자의 위치에서 마당을 비운다', () => {
    add('a1'); add('a2'); add('b1', 'b'); add('b2', 'b');
    for (const side of ['a', 'b']) {
      history.emerge(post(side + '3', side), { x: 0, y: -6, z: 9 });
      history.emerge(post(side + '4', side), { x: 0, y: -6, z: 9 });
    }
    history.step(0.4);
    const ids = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'];
    const before = new Map(ids.map(id => [id, lastDraw(id)]));
    history.leaveAll();
    expect(history.stats().historyLeaving).toBe(8);
    for (const id of ids) expect(lastDraw(id)[2]).toEqual(before.get(id)[2]);
    history.setPaused(true); history.step(5);
    expect(history.stats().historyLeaving).toBe(8);
    history.setPaused(false); history.step(0.3);
    expect(history.stats().historyLeaving).toBe(8);
    history.step(EXIT_SECONDS - 0.3);
    expect(history.stats().historyLeaving).toBe(0);
    expect(history.stats().historyArriving).toBe(0);
  });

  it('마당 퇴장 중 같은 의견은 새 인물을 중복 표시하지 않고 퇴장이 끝난 뒤 입장한다', () => {
    add('a1');
    history.leaveAll();
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 });
    expect(history.stats().historyPostIds).toEqual([]);
    expect(history.stats().historyLeavingPostIds).toEqual(['a1']);
    history.step(EXIT_SECONDS);
    expect(history.stats().historyPostIds).toEqual(['a1']);
    expect(history.stats().historyLeaving).toBe(0);
  });

  it('모션 감소에서는 마당 퇴장을 즉시 끝내고 보류된 이전 입장을 남기지 않는다', () => {
    add('a1'); add('a2');
    for (let i = 3; i < 8; i++) history.emerge(post('a' + i), { x: 0, y: -6, z: 9 });
    history.leaveAll(true);
    expect(history.stats()).toMatchObject({ historyCharacters: 0, historyLeaving: 0, historyArriving: 0 });
    expect(history.needsFrame()).toBe(false);
    history.step(3);
    expect(history.stats().historyCharacters).toBe(0);
  });

  it('새 인물은 바로 개봉 위치에서 나타나고 기존 인물은 크기를 유지하며 동시에 걸어나간다', () => {
    add('a1'); add('a2'); add('a3'); add('a4');
    const before = lastDraw('a1');
    visuals.draw.mockClear();
    history.emerge(post('a5'), { x: 0, y: -6, z: 9 });
    expect(lastDraw('a1')[2]).toEqual(before[2]);
    expect(lastDraw('a1')[4].scale).toBe(before[4].scale);
    expect(lastDraw('a5')[2]).toEqual({ x: 0, y: -6, z: 9 });
    expect(history.stats().historyLeavingPostIds).toEqual(['a1']);
    history.step(0.7);
    expect(lastDraw('a1')[2].x).toBeLessThan(before[2].x);
    expect(lastDraw('a1')[4].shrink).toBe(1);
    expect(lastDraw('a5')[2].x).toBeLessThan(0);
    expect(history.stats().historyLeaving).toBe(1);
    history.step(EXIT_SECONDS - 0.7);
    expect(history.stats().historyLeaving).toBe(0);
    expect(visuals.hide).toHaveBeenCalledWith(8);
    history.step(WALKOUT_SECONDS);
    expect(stage.querySelector('.history-conversation-speech[data-post-id="a5"]')).toBeVisible();
  });

  it('양쪽 퇴장은 각각 바깥쪽으로 걷고 대화 자리는 편당 네 개를 유지한다', () => {
    for (let i = 1; i <= 4; i++) { add('a' + i); add('b' + i, 'b'); }
    const left = lastDraw('a1')[2].x, right = lastDraw('b1')[2].x;
    history.emerge(post('a5'), { x: 0, y: -6, z: 9 });
    history.emerge(post('b5', 'b'), { x: 0, y: -6, z: 9 });
    history.step(0.8);
    expect(lastDraw('a1')[2].x).toBeLessThan(left);
    expect(lastDraw('b1')[2].x).toBeGreaterThan(right);
    expect(history.stats().historyCharacters).toBe(8);
    expect(history.stats().historyLeaving).toBe(2);
  });

  it('연속 입장은 입장 중인 인물을 지우지 않고 모든 의견을 차례로 보여준다', () => {
    add('a1'); add('a2'); add('b1', 'b'); add('b2', 'b');
    for (let id = 3; id <= 7; id++) {
      history.emerge(post('a' + id), { x: 0, y: -6, z: 9 });
      history.emerge(post('b' + id, 'b'), { x: 0, y: -6, z: 9 });
    }
    expect(history.canAccept()).toBe(false);
    for (let tick = 0; tick < 120; tick++) {
      history.step(0.1);
      expect(history.stats().historyCharacters + history.stats().historyLeaving).toBeLessThanOrEqual(HISTORY_MODEL_CAPACITY);
    }
    const ids = reveal.mock.calls.map(([entry]) => entry.id);
    expect(new Set(ids).size).toBe(14);
    expect(ids).toHaveLength(14);
    expect(history.canAccept()).toBe(true);
    expect(history.stats().historyLeaving).toBe(0);
    expect(history.stats().historyPostIds).toEqual(expect.arrayContaining(['a6', 'a7', 'b6', 'b7']));
  });

  it.each(['pause', 'hidden', 'focus'])('%s 동안 입장과 퇴장 시계가 함께 멈추고 재개된다', control => {
    add('a1'); add('a2'); add('a3'); add('a4');
    history.emerge(post('a5'), { x: 0, y: -6, z: 9 }); history.step(0.5);
    const before = lastDraw('a1')[2];
    if (control === 'pause') history.setPaused(true);
    if (control === 'hidden') history.setVisible(false);
    if (control === 'focus') stage.querySelector('.history-conversation-speech[data-post-id="a4"]').focus();
    history.step(5);
    expect(history.stats().historyLeaving).toBe(1);
    expect(history.needsFrame()).toBe(false);
    if (control === 'pause') history.setPaused(false);
    if (control === 'hidden') history.setVisible(true);
    if (control === 'focus') document.activeElement.blur();
    expect(lastDraw('a1')[2]).toEqual(before);
    history.step(0.2);
    expect(lastDraw('a1')[2].x).toBeLessThan(before.x);
  });

  it('퇴장 도중 같은 인물을 재생하면 중복 생성하지 않고 퇴장 뒤 다시 입장한다', () => {
    add('a1'); add('a2'); add('a3'); add('a4');
    history.emerge(post('a5'), { x: 0, y: -6, z: 9 });
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 });
    expect(history.stats().historyPostIds).not.toContain('a1');
    history.step(EXIT_SECONDS);
    expect(history.stats().historyLeavingPostIds).not.toContain('a1');
    expect(history.stats().historyPostIds).toContain('a1');
  });

  it('모션 감소로 전환하면 퇴장을 정리하고 대기 의견을 이동 없이 표시한다', () => {
    add('a1'); add('a2');
    for (let id = 3; id <= 9; id++) history.emerge(post('a' + id), { x: 0, y: -6, z: 9 });
    history.step(0, true);
    expect(history.stats().historyLeaving).toBe(0);
    expect(history.stats().historyArriving).toBe(0);
    expect(history.needsFrame()).toBe(false);
    expect(history.stats().historyPostIds).toEqual(expect.arrayContaining(['a8', 'a9']));
    expect(stage.querySelector('.history-conversation-speech[data-post-id="a9"]')).toBeVisible();
    expect(new Set(reveal.mock.calls.map(([entry]) => entry.id)).size).toBe(9);
  });

  it('dispose는 입장과 퇴장의 모든 렌더 슬롯을 정리한다', () => {
    add('a1'); add('a2');
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 });
    visuals.hide.mockClear();
    history.dispose();
    expect(visuals.hide.mock.calls.map(([index]) => index)).toEqual(Array.from({ length: HISTORY_MODEL_CAPACITY }, (_, i) => i));
    expect(history.needsFrame()).toBe(false);
    expect(history.emerge(post('a4'), { x: 0, y: -6, z: 9 })).toBe(false);
  });

  it('숨긴 상태에서 모션 감소로 채운 자리도 다시 보일 때 올바른 자세에서 퇴장한다', () => {
    history.setVisible(false);
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 }, true);
    history.emerge(post('a2'), { x: 0, y: -6, z: 9 }, true);
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 });
    history.setVisible(true);
    expect(lastDraw('a1')[2].x).toBeCloseTo(-4.4);
    expect(lastDraw('a1')[2].y).toBeCloseTo(-6.3);
    history.step(EXIT_SECONDS);
    expect(history.stats().historyLeaving).toBe(0);
  });

});
