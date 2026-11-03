import { createSpeechCue } from '../../public/sparring-arena/src/speech-cue.js';

test('선택한 말풍선의 유도 효과를 멈추고 새 의견에는 다시 표시한다', () => {
  const button = document.createElement('button');
  const action = document.createElement('span');
  button.append(action);
  const cue = createSpeechCue(button, action);
  cue.present('first');
  expect(button.dataset.cueActive).toBe('true');
  expect(action.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(action.textContent).toBe('');
  cue.dismiss();
  cue.present('first');
  expect(button.dataset.cueActive).toBe('false');
  cue.present('second');
  expect(button.dataset.cueActive).toBe('true');
  cue.present('first');
  expect(button.dataset.cueActive).toBe('false');
});

test.each([
  ['기본', 200, 70, 120, 120, 10],
  ['길어진 꼬리', 200, 70, 120, 120, 300],
  ['왼쪽 모서리', 200, 70, 12, 12, 10],
  ['오른쪽 모서리', 200, 70, 188, 188, 10],
  ['왼쪽으로 치우친 꼬리', 200, 70, 12, -300, 10],
  ['오른쪽으로 치우친 꼬리', 200, 70, 188, 500, 10],
  ['좁은 말풍선', 48, 48, 12, -100, 200],
])('%s도 모서리를 침범하지 않는 뾰족한 꼬리를 본체와 한 선으로 그린다',
  (_, width, height, tail, tip, tailHeight) => {
    const button = document.createElement('button');
    const cue = createSpeechCue(button, document.createElement('span'));
    cue.layout(width, height, tail, tip, tailHeight);
    const body = button.querySelector('.speech-cue-body');
    expect(body).not.toBeNull();
    const d = body.getAttribute('d');
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.endsWith('Z')).toBe(true);
    const shadow = button.querySelector('.speech-cue-shadow');
    expect(shadow.tagName).toBe('rect');
    expect(shadow).toHaveAttribute('width', String(width - 2));
    expect(shadow).toHaveAttribute('height', String(height - 2));
    expect(button.querySelector('.speech-cue-wave')).toHaveAttribute('d', d);
    const triangle = d.match(/H ([\d.]+) L (-?[\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) H/);
    expect(triangle).not.toBeNull();
    const [, right, tipX, tipY, left, bottom] = triangle.map(Number);
    const radius = Math.min(18, width / 4, height / 2);
    expect(left).toBeGreaterThanOrEqual(radius + 1);
    expect(right).toBeLessThanOrEqual(width - radius - 1);
    expect(right).toBeGreaterThan(left);
    const dx = tipX - (right + left) / 2;
    const dy = tipY - bottom;
    expect(dy).toBeGreaterThanOrEqual(9.99);
    expect(Math.abs(dx)).toBeLessThanOrEqual(dy + 0.01);
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(24.01);
  });
