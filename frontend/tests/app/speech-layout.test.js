import { placeSpeechBubbles } from '../../public/sparring-arena/src/speech-layout.js';

describe('캐릭터 말풍선 배치', () => {
  it('겹치는 말풍선은 다른 방향에 공간이 있으면 그쪽에 배치한다', () => {
    const bubbles = [
      { headX: 200, headY: 100, width: 120, height: 60, direction: -1 },
      { headX: 250, headY: 100, width: 120, height: 60, direction: -1 },
    ];
    const [first, second] = placeSpeechBubbles(bubbles, 500);
    expect(second.center - 60).toBeGreaterThanOrEqual(first.center + 60);
    expect(second.center - 60 + second.tail).toBe(250);
  });
  it('화면 경계 안에서 겹침이 가장 적은 방향을 고른다', () => {
    const bubbles = [
      { headX: 20, headY: 100, width: 100, height: 60, direction: -1 },
      { headX: 70, headY: 100, width: 100, height: 60, direction: -1 },
    ];
    for (const position of placeSpeechBubbles(bubbles, 240)) {
      expect(position.center - 50).toBeGreaterThanOrEqual(8);
      expect(position.center + 50).toBeLessThanOrEqual(232);
    }
  });
});
