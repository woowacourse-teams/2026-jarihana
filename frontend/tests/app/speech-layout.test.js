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
  it('좁은 화면에서 네 말풍선을 여러 높이로 배치하고 각 꼬리를 원래 인물에 연결한다', () => {
    const bubbles = [140, 170, 210, 240].map((headX, index) => ({
      headX, headY: 320, width: 175, height: 80, direction: index < 2 ? -1 : 1,
    }));
    const positions = placeSpeechBubbles(bubbles, 390);
    expect(positions.some(position => position.bottom < 320)).toBe(true);
    positions.forEach((position, i) => {
      const left = position.center - bubbles[i].width / 2;
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + bubbles[i].width).toBeLessThanOrEqual(382);
      expect(left + position.tailTip).toBe(bubbles[i].headX);
      expect(position.bottom + position.tailHeight).toBe(bubbles[i].headY + 10);
      positions.slice(0, i).forEach((other, j) => {
        const otherLeft = other.center - bubbles[j].width / 2;
        const overlapX = left < otherLeft + bubbles[j].width && left + bubbles[i].width > otherLeft;
        const overlapY = position.bottom - bubbles[i].height < other.bottom && position.bottom > other.bottom - bubbles[j].height;
        expect(overlapX && overlapY).toBe(false);
      });
    });
    expect(placeSpeechBubbles(bubbles, 390)).toEqual(positions);
  });
  it('입력창이 차지한 영역을 피한다', () => {
    const bubble = { headX: 100, headY: 300, width: 160, height: 60, direction: 1 };
    const obstacle = { left: 60, right: 220, top: 240, bottom: 310 };
    const [position] = placeSpeechBubbles([bubble], 390, [obstacle]);
    const left = position.center - bubble.width / 2;
    expect(left >= obstacle.right + 10 || left + bubble.width <= obstacle.left - 10 || position.bottom <= obstacle.top - 10).toBe(true);
  });
});
