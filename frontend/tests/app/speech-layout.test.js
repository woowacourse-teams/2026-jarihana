import { placeSpeechBubbles } from '../../public/sparring-arena/src/speech-layout.js';

describe('캐릭터 말풍선 배치', () => {
  it.each([358, 607, 800, 1440])('%ipx 화면에서 16개 말풍선과 주제 영역이 서로 겹치지 않는다', stageWidth => {
    const width = Math.min(stageWidth <= 700 ? 150 : 240, (stageWidth - 46) / (stageWidth < 600 ? 2 : 4));
    const height = 44, stageHeight = 640;
    const bubbles = Array.from({ length: 16 }, (_, index) => ({
      headX: stageWidth / 2 + (index < 8 ? -25 : 25), headY: 320, width, height,
      direction: index < 8 ? -1 : 1,
      region: index < 8 ? { left: 8, right: stageWidth / 2 - 5 } : { left: stageWidth / 2 + 5, right: stageWidth - 8 },
    }));
    const obstacles = [{ left: 8, right: stageWidth - 8, top: 8, bottom: 110 }];
    const positions = placeSpeechBubbles(bubbles, stageWidth, obstacles, { stageHeight });
    expect(positions).toHaveLength(16);
    const boxes = [...obstacles];
    for (const position of positions) {
      const box = { left: position.center - width / 2, right: position.center + width / 2, top: position.bottom - height, bottom: position.bottom };
      expect(box.left).toBeGreaterThanOrEqual(8);
      expect(box.right).toBeLessThanOrEqual(stageWidth - 8);
      expect(box.top).toBeGreaterThanOrEqual(8);
      expect(box.bottom).toBeLessThanOrEqual(stageHeight - 8);
      for (const other of boxes) expect(box.left >= other.right || box.right <= other.left || box.bottom <= other.top || box.top >= other.bottom).toBe(true);
      boxes.push(box);
    }
    expect(placeSpeechBubbles(bubbles, stageWidth, obstacles, { stageHeight })).toEqual(positions);
  });
  it('겹침 허용이면 충돌을 피하지 않고 캐릭터 머리 곁에 둔다', () => {
    const bubble = { headX: 200, headY: 300, width: 160, height: 44, direction: -1 };
    const [first, second] = placeSpeechBubbles([bubble, bubble], 800, [], { allowOverlap: true });
    expect(first).toEqual(second);
    expect(first.bottom).toBe(300);
    expect(first.center - 80 + first.tailTip).toBe(200);
    expect(placeSpeechBubbles([bubble, bubble], 800)[1]).not.toEqual(first);
  });
  it.each([false, true])('말풍선이 많아도 집게 영역을 먼저 비운다: 겹침 허용=%s', allowOverlap => {
    const claw = { left: 167, right: 223, top: 180, bottom: 242, blocking: true };
    const bubbles = Array.from({ length: 16 }, (_, index) => ({
      headX: 195, headY: 230, width: 150, height: 44, direction: index < 8 ? -1 : 1,
    }));
    const positions = placeSpeechBubbles(bubbles, 390, [claw], { allowOverlap, stageHeight: 640 });
    for (const position of positions) {
      const left = position.center - 75;
      expect(left >= claw.right || left + 150 <= claw.left || position.bottom <= claw.top || position.bottom - 44 >= claw.bottom).toBe(true);
      expect(Number.isFinite(position.tailHeight)).toBe(true);
    }
  });
  it('위쪽을 집게가 막으면 높이 제한이 없어도 아래쪽 빈 공간을 쓴다', () => {
    const claw = { left: 8, right: 182, top: 8, bottom: 80, blocking: true };
    const [position] = placeSpeechBubbles([{ headX: 95, headY: 60, width: 174, height: 44, direction: 1 }], 190, [claw], { allowOverlap: true });
    expect(position.bottom - 44).toBeGreaterThanOrEqual(90);
    expect(Number.isFinite(position.tailHeight)).toBe(true);
  });
  it('가까운 네 인물의 말풍선이 반대편을 차지해 세 층으로 밀려나지 않는다', () => {
    const bubbles = [165.207, 128.911, 192.793, 229.089].map((headX, index) => ({
      headX, headY: 214, width: 150, height: 47, direction: index < 2 ? -1 : 1,
      region: index < 2 ? { left: 8, right: 174 } : { left: 184, right: 350 },
    }));
    const positions = placeSpeechBubbles(bubbles, 358);
    positions.forEach((position, i) => {
      expect(position.center - 75).toBeGreaterThanOrEqual(bubbles[i].region.left);
      expect(position.center + 75).toBeLessThanOrEqual(bubbles[i].region.right);
      expect(position.bottom).toBeGreaterThanOrEqual(214 - 47 - 10);
      positions.slice(0, i).forEach(other => {
        expect(Math.abs(position.center - other.center) >= 150 || Math.abs(position.bottom - other.bottom) >= 47).toBe(true);
      });
    });
  });
  it('장애물을 피해도 말풍선을 화면 위로 밀어내지 않는다', () => {
    const [position] = placeSpeechBubbles([
      { headX: 180, headY: 100, width: 150, height: 60, direction: -1 },
    ], 358, [{ left: 0, right: 358, top: 40, bottom: 120 }]);
    expect(position.bottom - 60).toBeGreaterThanOrEqual(8);
  });
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
