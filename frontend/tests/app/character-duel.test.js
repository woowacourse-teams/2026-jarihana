import { createCharacterDuel } from '../../public/sparring-arena/src/character-duel.js';

const original = { id: '1', side: 'a', memberType: 'CREW', name: '크루', text: '맛있으면 기다릴래요' };
const reply = { id: '2', side: 'b', memberType: 'COACH', name: '코치', text: '점심시간이 더 아까워요', replyTo: original };

describe('캐릭터 대치', () => {
  let stage, duel, onSelect, onReveal;
  const field = () => stage.querySelector('.character-duel');
  const bubble = side => stage.querySelector(`.${side} .duel-speech`);

  beforeEach(() => {
    stage = document.createElement('div');
    document.body.append(stage);
    onSelect = jest.fn();
    onReveal = jest.fn();
    duel = createCharacterDuel(stage, onSelect, onReveal);
  });

  afterEach(() => { duel.dispose(); stage.remove(); });

  it('실제 원문과 답장을 마주 배치하고 원문부터 번갈아 말한다', () => {
    duel.updateState([original, reply]);
    expect(bubble('left')).toHaveTextContent(original.text);
    expect(bubble('right')).toHaveTextContent(reply.text);
    expect(field()).toHaveAttribute('data-turn', 'left');
    duel.step(1.5);
    expect(field()).toHaveAttribute('data-turn', 'right');
    expect(stage.querySelector('.right .duel-sprite')).toHaveAttribute('data-pose', 'protest');
    expect(stage.querySelector('.left .duel-sprite')).toHaveAttribute('data-pose', 'listen');
    expect(onReveal).toHaveBeenCalledWith(reply, false);
  });

  it('같은 편의 받아치기도 원문의 편 색과 회원 유형을 보존한다', () => {
    const sameSide = { ...reply, side: 'a' };
    duel.updateState([original, sameSide]);
    expect(stage.querySelector('.left')).toHaveAttribute('data-side', 'a');
    expect(stage.querySelector('.right')).toHaveAttribute('data-side', 'a');
    expect(stage.querySelector('.left .duel-sprite')).toHaveAttribute('data-variant', '1');
    expect(stage.querySelector('.right .duel-sprite')).toHaveAttribute('data-variant', '0');
    expect(bubble('right')).toHaveTextContent(original.text);
  });

  it('반대편 글이 없으면 가짜 반박을 만들지 않는다', () => {
    duel.updateState([original]);
    expect(bubble('left')).toBeVisible();
    expect(bubble('right')).not.toBeVisible();
    expect(bubble('right')).toHaveTextContent('');
  });

  it('빈 판의 첫 새 글도 지난 대화가 아닌 새 한마디로 보여준다', () => {
    duel.updateState([]);
    duel.updateState([original]);
    duel.start(original, true);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith(original, true);
    expect(field()).toHaveAttribute('data-fresh', 'true');
  });

  it('모션 감소에서는 이동과 회전을 생략하고 실제 의견은 남긴다', () => {
    duel.start(reply, true, true);
    duel.step(0.6, true);
    for (const figure of stage.querySelectorAll('.duel-figure')) {
      expect(figure.style.transform).toBe('translate(0px, 0px) rotate(0deg)');
    }
    expect(bubble('right')).toHaveTextContent(reply.text);
  });

  it('일시정지 동안 동작 시계를 멈추고 재생하면 이어간다', () => {
    duel.start(reply, false);
    duel.step(0.5);
    const transform = stage.querySelector('.left .duel-figure').style.transform;
    duel.setPaused(true);
    duel.step(3);
    expect(duel.needsFrame()).toBe(false);
    expect(field()).toHaveAttribute('data-turn', 'left');
    expect(stage.querySelector('.left .duel-figure').style.transform).toBe(transform);
    duel.setPaused(false);
    duel.step(1);
    expect(field()).toHaveAttribute('data-turn', 'right');
  });

  it('말풍선을 읽는 동안 새 글을 보류하고 Escape 후 이어간다', () => {
    duel.updateState([original]);
    bubble('left').focus();
    bubble('left').click();
    expect(onSelect).toHaveBeenCalledWith(original.id);
    expect(bubble('left')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_capsule_select');
    duel.start(reply, true);
    duel.step(10);
    expect(bubble('right')).not.toBeVisible();
    expect(duel.needsFrame()).toBe(false);
    bubble('left').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    duel.step(0.1);
    expect(bubble('right')).toHaveTextContent(reply.text);
    expect(bubble('right')).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_clash_expand');
    expect(duel.stats().duelQueued).toBe(0);
  });

  it('같은 새 글의 중복 수신은 재생 대기열에 다시 넣지 않는다', () => {
    duel.start(original, true);
    duel.start(reply, true);
    duel.start(reply, true);
    expect(duel.stats().duelQueued).toBe(1);
    duel.step(6.5);
    expect(onReveal).toHaveBeenCalledTimes(2);
    duel.start(reply, true);
    expect(duel.stats().duelQueued).toBe(0);
  });
});
