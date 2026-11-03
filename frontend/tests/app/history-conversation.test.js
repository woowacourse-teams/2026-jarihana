import { PACKED_SCALE, EXIT_SECONDS, WALKOUT_SECONDS } from '../../public/sparring-arena/src/history-walk.js';
import { createHistoryConversation } from '../../public/sparring-arena/src/history-conversation.js';
const post = (id, side = 'a') => ({ id, side, name: '크루 ' + id, text: '의견 ' + id, memberType: 'CREW' });
describe('지난 메시지 캐릭터 모임', () => {
  let stage, history, select, reveal, visuals;
  const field = () => stage.querySelector('.history-conversation');
  const bubble = side => stage.querySelector(`.history-conversation-speech[data-side="${side}"]`);
  const add = (id, side = 'a', reduced = false) => { history.emerge(post(id, side), { x: 0, y: -6, z: 9 }, reduced); history.step(2.5, reduced); };
  beforeEach(() => {
    stage = document.createElement('div'); document.body.append(stage); select = jest.fn(); reveal = jest.fn();
    visuals = { draw: jest.fn(), hide: jest.fn(), project: point => ({ x: point.x * 50 + 400, y: 300 - (point.y + 6.3) * 40 }) };
    history = createHistoryConversation(stage, select, reveal, visuals);
    history.setLayout({ left: { x: 180, y: 300 }, right: { x: 620, y: 300 }, worldLeft: { x: -4.4, y: -6.3, z: 10.1 }, worldRight: { x: 4.4, y: -6.3, z: 10.1 }, width: 800 });
  });
  afterEach(() => { history.dispose(); stage.remove(); });
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
    expect(speech).toHaveAttribute('data-cue-active', 'false');
    history.step(0.1);
    expect(speech).toHaveAttribute('data-cue-active', 'false');
  });
  it('개봉 위치에서 출발하고 자기 편에 도착한 뒤 말풍선을 보여준다', () => {
    history.emerge(post('1'), { x: 0, y: -6, z: 9 });
    const figure = stage.querySelector('.history-character[data-post-id="1"]');
    expect(figure.style.left).toBe('400px'); expect(bubble('a')).not.toBeVisible();
    expect(reveal).not.toHaveBeenCalled(); history.step(2.5);
    expect(Number.parseFloat(figure.style.left)).toBeCloseTo(225); expect(bubble('a')).toBeVisible(); expect(bubble('b')).not.toBeVisible();
    expect(reveal).toHaveBeenCalledWith(post('1'), false);
  });
  it('가운데 두 캐릭터는 말풍선을 각자의 안쪽 방향으로 우선 배치한다', () => {
    visuals.project = point => ({ x: point.x * 100 + 600, y: 300 - (point.y + 6.3) * 40 });
    history.setLayout({ left: { x: 160, y: 300 }, right: { x: 1040, y: 300 }, worldLeft: { x: -4.4, y: -6.3, z: 10.1 }, worldRight: { x: 4.4, y: -6.3, z: 10.1 }, width: 1200 });
    add('a1'); add('b1', 'b');
    for (const [side, sign] of [['a', 1], ['b', -1]]) {
      const speech = bubble(side);
      const character = stage.querySelector(`.history-character[data-post-id="${side}1"]`);
      expect((parseFloat(speech.style.left) - parseFloat(character.style.left)) * sign).toBeGreaterThan(0);
    }
  });
  it('편당 2명을 유지하고 새 글은 같은 편의 가장 오래된 자리를 교체한다', () => {
    add('a1'); add('b1', 'b'); add('a2'); add('b2', 'b');
    expect(history.stats().historyCharacters).toBe(4);
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 }); history.step(0.3); history.step(2.5);
    expect(history.stats().historyCharacters).toBe(4);
    expect(history.stats().historyPostIds).toEqual(expect.arrayContaining(['a2', 'a3', 'b1', 'b2']));
    expect(history.stats().historyPostIds).not.toContain('a1'); expect(bubble('a')).toHaveTextContent('의견 a3');
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(4);
    expect(field()).toHaveAttribute('data-bubble-count', '4');
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
    add('a1'); add('b1', 'b');
    expect(bubble('a')).toHaveTextContent('지난 한마디'); expect(bubble('b')).toHaveTextContent('지난 한마디');
    expect(stage.textContent).not.toContain('VS');
    history.emerge({ ...post('a2'), replyTo: post('b1', 'b') }, { x: 0, y: -6, z: 9 }, true);
    expect(stage.querySelector('.history-conversation-speech[data-post-id="a2"]')).toHaveTextContent('지난 받아치기');
    expect(bubble('a')).toHaveTextContent('지난 한마디');
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
    expect(Number.parseFloat(nextBubble.style.left)).toBeLessThan(previousLeft);
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
    expect(visuals.draw).toHaveBeenLastCalledWith(2, post('b1', 'b'),
      expect.objectContaining({ y: -6.3 }), 1,
      expect.objectContaining({ stride: 0, speaking: false, scale: 0.65 }), expect.any(Number));
    expect(visuals.draw.mock.lastCall[2].x).toBeCloseTo(3.5);
    expect(visuals.draw.mock.lastCall[5]).toBeCloseTo(-0.85);

  });
  const lastDraw = id => visuals.draw.mock.calls.filter(call => call[1].id === id).at(-1);
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
    add('a1'); add('a2');
    const before = lastDraw('a1');
    visuals.draw.mockClear();
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 });
    expect(lastDraw('a1')[2]).toEqual(before[2]);
    expect(lastDraw('a1')[4].scale).toBe(before[4].scale);
    expect(lastDraw('a3')[2]).toEqual({ x: 0, y: -6, z: 9 });
    expect(history.stats().historyLeavingPostIds).toEqual(['a1']);
    history.step(0.7);
    expect(lastDraw('a1')[2].x).toBeLessThan(before[2].x);
    expect(lastDraw('a1')[4].shrink).toBe(1);
    expect(lastDraw('a3')[2].x).toBeLessThan(0);
    expect(history.stats().historyLeaving).toBe(1);
    history.step(EXIT_SECONDS - 0.7);
    expect(history.stats().historyLeaving).toBe(0);
    expect(visuals.hide).toHaveBeenCalledWith(4);
    history.step(WALKOUT_SECONDS);
    expect(stage.querySelector('.history-conversation-speech[data-post-id="a3"]')).toBeVisible();
  });

  it('양쪽 퇴장은 각각 바깥쪽으로 걷고 대화 자리는 편당 두 개를 유지한다', () => {
    add('a1'); add('a2'); add('b1', 'b'); add('b2', 'b');
    const left = lastDraw('a1')[2].x, right = lastDraw('b1')[2].x;
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 });
    history.emerge(post('b3', 'b'), { x: 0, y: -6, z: 9 });
    history.step(0.8);
    expect(lastDraw('a1')[2].x).toBeLessThan(left);
    expect(lastDraw('b1')[2].x).toBeGreaterThan(right);
    expect(history.stats().historyCharacters).toBe(4);
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
      expect(history.stats().historyCharacters + history.stats().historyLeaving).toBeLessThanOrEqual(8);
    }
    const ids = reveal.mock.calls.map(([entry]) => entry.id);
    expect(new Set(ids).size).toBe(14);
    expect(ids).toHaveLength(14);
    expect(history.canAccept()).toBe(true);
    expect(history.stats().historyLeaving).toBe(0);
    expect(history.stats().historyPostIds).toEqual(expect.arrayContaining(['a6', 'a7', 'b6', 'b7']));
  });

  it.each(['pause', 'hidden', 'focus'])('%s 동안 입장과 퇴장 시계가 함께 멈추고 재개된다', control => {
    add('a1'); add('a2');
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 }); history.step(0.5);
    const before = lastDraw('a1')[2];
    if (control === 'pause') history.setPaused(true);
    if (control === 'hidden') history.setVisible(false);
    if (control === 'focus') stage.querySelector('.history-conversation-speech[data-post-id="a2"]').focus();
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
    add('a1'); add('a2');
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 });
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
    expect(visuals.hide.mock.calls.map(([index]) => index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(history.needsFrame()).toBe(false);
    expect(history.emerge(post('a4'), { x: 0, y: -6, z: 9 })).toBe(false);
  });

  it('숨긴 상태에서 모션 감소로 채운 자리도 다시 보일 때 올바른 자세에서 퇴장한다', () => {
    history.setVisible(false);
    history.emerge(post('a1'), { x: 0, y: -6, z: 9 }, true);
    history.emerge(post('a2'), { x: 0, y: -6, z: 9 }, true);
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 });
    history.setVisible(true);
    expect(lastDraw('a1')[2].x).toBeCloseTo(-3.5);
    expect(lastDraw('a1')[2].y).toBeCloseTo(-6.3);
    history.step(EXIT_SECONDS);
    expect(history.stats().historyLeaving).toBe(0);
  });

});
