import { createCharacterDuel } from '../../public/sparring-arena/src/character-duel.js';

const original = { id: '1', side: 'a', memberType: 'CREW', name: '크루', text: '맛있으면 기다릴래요' };
const reply = { id: '2', side: 'b', memberType: 'COACH', name: '코치', text: '점심시간이 더 아까워요', replyTo: original };

describe('미끄럼틀에서 나온 캐릭터 대치', () => {
  let stage, duel, onSelect, onReveal;
  const field = () => stage.querySelector('.character-duel');
  const bubble = side => stage.querySelector(`.${side} .duel-speech`);
  function land(post = reply, fresh = false, reduced = false) {
    duel.updateState([original, post]);
    const participants = duel.prepare(post, fresh, reduced);
    participants.forEach(({ role }) => duel.emerge(role, { x: 200, y: 250 }, reduced));
    duel.step(1, reduced);
    return participants;
  }

  beforeEach(() => {
    stage = document.createElement('div');
    document.body.append(stage);
    onSelect = jest.fn(); onReveal = jest.fn();
    duel = createCharacterDuel(stage, onSelect, onReveal);
    duel.setLayout([{ x: 100, y: 350 }, { x: 300, y: 350 }]);
  });
  afterEach(() => { duel.dispose(); stage.remove(); });

  it('캡슐이 열리기 전에는 캐릭터나 말풍선을 보여주지 않는다', () => {
    duel.updateState([original, reply]);
    const participants = duel.prepare(reply, true);
    expect(participants.map(item => item.post.id)).toEqual(['1', '2']);
    expect([...stage.querySelectorAll('.duel-figure')].every(item => item.hidden)).toBe(true);
    expect(bubble('left')).not.toBeVisible();
    expect(bubble('right')).not.toBeVisible();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('개봉한 위치에서 작게 나온 뒤 양옆에 도착해야 대치를 시작한다', () => {
    duel.updateState([original, reply]);
    duel.prepare(reply, true);
    duel.emerge(0, { x: 200, y: 250 });
    expect(stage.querySelector('.left').style.left).toBe('200px');
    expect(stage.querySelector('.left .duel-figure').style.transform).toContain('scale(0.18)');
    duel.step(1);
    expect(stage.querySelector('.left').style.left).toBe('100px');
    expect(field()).toHaveAttribute('data-phase', 'emerging');
    expect(stage.querySelector('.duel-versus')).not.toBeVisible();
    duel.emerge(1, { x: 190, y: 255 });
    duel.step(1);
    expect(stage.querySelector('.right').style.left).toBe('300px');
    expect(field()).toHaveAttribute('data-phase', 'argue');
    expect(stage.querySelector('.duel-versus')).toBeVisible();
    expect(onReveal).toHaveBeenCalledWith(reply, true);
  });

  it('실제 원문부터 말하고 답장 캐릭터가 받아친다', () => {
    land();
    expect(bubble('left')).toHaveTextContent(original.text);
    expect(bubble('right')).toHaveTextContent(reply.text);
    expect(field()).toHaveAttribute('data-turn', 'left');
    duel.step(1.5);
    expect(field()).toHaveAttribute('data-turn', 'right');
    expect(stage.querySelector('.right .duel-sprite')).toHaveAttribute('data-pose', 'protest');
    expect(stage.querySelector('.left .duel-sprite')).toHaveAttribute('data-pose', 'listen');
  });

  it('모바일 가장자리의 캐릭터 말풍선은 화면 안에 두고 꼬리는 캐릭터를 가리킨다', () => {
    duel.setLayout([{ x: 48, y: 350 }, { x: 342, y: 350 }], 390);
    land(reply, true, true);
    for (const side of ['left', 'right']) {
      const slotX = parseFloat(stage.querySelector('.' + side).style.left);
      const speech = bubble(side);
      const width = parseFloat(speech.style.width);
      const center = slotX + parseFloat(speech.style.left);
      expect(center - width / 2).toBeGreaterThanOrEqual(8);
      expect(center + width / 2).toBeLessThanOrEqual(382);
      expect(center - width / 2 + parseFloat(speech.style.getPropertyValue('--duel-tail-x'))).toBe(slotX);
    }
  });

  it('같은 편의 받아치기도 서로 다른 캡슐 역할과 원래 색을 유지한다', () => {
    const participants = land({ ...reply, side: 'a' });
    expect(participants.map(item => item.role)).toEqual([1, 0]);
    expect(stage.querySelector('.left')).toHaveAttribute('data-side', 'a');
    expect(stage.querySelector('.right')).toHaveAttribute('data-side', 'a');
    expect(stage.querySelector('.left .duel-sprite')).toHaveAttribute('data-variant', '1');
    expect(stage.querySelector('.right .duel-sprite')).toHaveAttribute('data-variant', '0');
    expect(bubble('right')).toHaveTextContent(original.text);
  });

  it('상대 글이 없으면 캡슐 하나만 내려보내고 가짜 상대는 만들지 않는다', () => {
    const participants = land(original, true);
    expect(participants).toHaveLength(1);
    expect(bubble('left')).toBeVisible();
    expect(bubble('right')).not.toBeVisible();
    expect(stage.querySelector('.right .duel-figure')).not.toBeVisible();
    expect(stage.querySelector('.duel-versus')).not.toBeVisible();
  });

  it('빈 판의 첫 새 글은 실제 개봉 후 새 한마디로 알린다', () => {
    duel.updateState([]);
    duel.updateState([original]);
    duel.prepare(original, true);
    expect(onReveal).not.toHaveBeenCalled();
    duel.emerge(0, { x: 200, y: 250 });
    duel.step(1);
    duel.emerge(0, { x: 200, y: 250 });
    duel.step(1);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith(original, true);
  });

  it('모션 감소에서는 확대나 이동 없이 실제 의견을 바로 표시한다', () => {
    land(reply, true, true);
    for (const figure of stage.querySelectorAll('.duel-figure')) {
      expect(figure.style.transform).toBe('translate(0px, 0px) rotate(0deg) scale(1)');
    }
    expect(bubble('right')).toHaveTextContent(reply.text);
    expect(duel.needsFrame()).toBe(false);
  });

  it('등장 중 일시정지하면 위치를 고정하고 재생하면 이어간다', () => {
    duel.prepare(original, true);
    duel.emerge(0, { x: 200, y: 250 });
    duel.step(0.3);
    const left = stage.querySelector('.left').style.left;
    duel.setPaused(true); duel.step(3);
    expect(stage.querySelector('.left').style.left).toBe(left);
    duel.setPaused(false); duel.step(1);
    expect(stage.querySelector('.left').style.left).toBe('100px');
  });

  it('말풍선 포커스 중 새 장면을 보류하고 Escape 뒤 교체를 허용한다', () => {
    land(original);
    bubble('left').focus(); bubble('left').click();
    expect(onSelect).toHaveBeenCalledWith(original.id);
    expect(bubble('left')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_reply_start');
    expect(duel.canReplace(true)).toBe(false);
    expect(duel.prepare(reply, true)).toEqual([]);
    duel.step(10);
    expect(bubble('right')).not.toBeVisible();
    bubble('left').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(duel.canReplace()).toBe(true);
    land(reply, true);
    expect(bubble('right')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_reply_start');
  });

  it('새 글은 과거 장면보다 우선하지만 재생 중인 새 글은 끝까지 보여준다', () => {
    land(original);
    expect(duel.canReplace(true)).toBe(true);
    land(reply, true);
    expect(duel.canReplace(true)).toBe(false);
    duel.step(6.5);
    expect(duel.canReplace(true)).toBe(true);
  });
});
