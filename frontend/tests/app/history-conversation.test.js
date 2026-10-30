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
  it('개봉 위치에서 출발하고 자기 편에 도착한 뒤 말풍선을 보여준다', () => {
    history.emerge(post('1'), { x: 0, y: -6, z: 9 });
    const figure = stage.querySelector('.history-character[data-post-id="1"]');
    expect(figure.style.left).toBe('400px'); expect(bubble('a')).not.toBeVisible();
    expect(reveal).not.toHaveBeenCalled(); history.step(2.5);
    expect(Number.parseFloat(figure.style.left)).toBeCloseTo(225); expect(bubble('a')).toBeVisible(); expect(bubble('b')).not.toBeVisible();
    expect(reveal).toHaveBeenCalledWith(post('1'), false);
  });
  it('편당 2명을 유지하고 새 글은 같은 편의 가장 오래된 자리를 교체한다', () => {
    add('a1'); add('b1', 'b'); add('a2'); add('b2', 'b');
    expect(history.stats().historyCharacters).toBe(4);
    history.emerge(post('a3'), { x: 0, y: -6, z: 9 }); history.step(0.3); history.step(2.5);
    expect(history.stats().historyCharacters).toBe(4);
    expect(history.stats().historyPostIds).toEqual(expect.arrayContaining(['a2', 'a3', 'b1', 'b2']));
    expect(history.stats().historyPostIds).not.toContain('a1'); expect(bubble('a')).toHaveTextContent('의견 a3');
    expect(stage.querySelectorAll('.history-conversation-speech:not([hidden])')).toHaveLength(4);
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
      expect(Number.parseFloat(speech.style.top)).toBeCloseTo(300 - 2.1 * 0.65 * 40 - 12);
    }
    const previousLeft = Number.parseFloat(bubble('a').style.left);
    add('a2');
    const nextBubble = stage.querySelector('.history-conversation-speech[data-post-id="a2"]');
    expect(Number.parseFloat(nextBubble.style.left)).toBeGreaterThan(previousLeft);
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
  it('멈춤과 받아치기 중 숨김은 등장 시계를 고정한다', () => {
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
});
