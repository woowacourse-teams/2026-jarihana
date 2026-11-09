import { createSpeechCue } from '../../public/sparring-arena/src/speech-cue.js';

test('머리 아래로 피한 말풍선은 꼬리를 위로 향하게 하고 돌아오면 복원한다', () => {
  const button = document.createElement('button');
  const cue = createSpeechCue(button, document.createElement('span'));
  cue.layout(160, 44, 80, 80, 30, true);
  for (const path of button.querySelectorAll('.speech-cue-body, .speech-cue-wave')) {
    expect(path).toHaveAttribute('transform', 'translate(0 44) scale(1 -1)');
  }
  cue.layout(160, 44, 80, 80, 30, false);
  for (const path of button.querySelectorAll('.speech-cue-body, .speech-cue-wave')) expect(path).not.toHaveAttribute('transform');
});
import { readFileSync } from 'node:fs';
import path from 'node:path';

test('호버 인물과 자기 말풍선은 다른 말풍선보다 앞이며 자기 말풍선 배경만 불투명해진다', () => {
  const style = document.createElement('style');
  style.textContent = ['history-conversation.css', 'speech-cue.css']
    .map(file => readFileSync(path.join(__dirname, '../../public/sparring-arena', file), 'utf8')).join('\n');
  const field = document.createElement('section'); field.className = 'history-conversation';
  const character = document.createElement('button'); character.className = 'history-character'; character.dataset.focused = 'true';
  const canvas = document.createElement('canvas'); canvas.className = 'arena-held-renderer'; canvas.dataset.held = 'false';
  const own = document.createElement('button'); own.className = 'history-conversation-speech';
  const other = document.createElement('button'); other.className = 'history-conversation-speech';
  createSpeechCue(own, document.createElement('span'));
  field.append(character, canvas, own, other); document.head.append(style); document.body.append(field);
  try {
    const body = own.querySelector('.speech-cue-body');
    const stroke = getComputedStyle(body).strokeWidth;
    expect(parseFloat(getComputedStyle(body).fillOpacity)).toBe(.8);
    own.dataset.focused = 'true';
    expect(parseFloat(getComputedStyle(body).fillOpacity)).toBe(1);
    expect(getComputedStyle(body).strokeWidth).toBe(stroke);
    other.focus();
    const depth = element => Number(getComputedStyle(element).zIndex);
    expect(depth(character)).toBeGreaterThan(depth(other));
    expect(depth(canvas)).toBeGreaterThan(depth(character));
    expect(depth(own)).toBeGreaterThan(depth(canvas));
    own.dataset.focused = 'false';
    expect(parseFloat(getComputedStyle(body).fillOpacity)).toBe(.8);
  } finally { style.remove(); field.remove(); }
});

test.each(['history-conversation-speech', 'duel-speech'])('%s 선택 후 파동처럼 보이는 바깥 테두리를 남기지 않는다', className => {
  const style = document.createElement('style');
  style.textContent = ['history-conversation.css', 'character-duel.css', 'speech-cue.css']
    .map(file => readFileSync(path.join(__dirname, '../../public/sparring-arena', file), 'utf8')).join('\n');
  const button = document.createElement('button');
  button.className = className;
  const action = document.createElement('span');
  button.append(action);
  document.head.append(style); document.body.append(button);
  try {
    const cue = createSpeechCue(button, action);
    cue.present('selected');
    cue.dismiss(); button.dataset.replySelected = 'true';
    expect(button).toHaveAttribute('data-reply-selected', 'true');
    expect(getComputedStyle(button.querySelector('.speech-cue-wave')).animation).not.toContain('speech-cue-wave');
    expect(getComputedStyle(button.querySelector('.speech-cue-wave')).opacity).toBe('0');
    expect(getComputedStyle(button).outline).not.toContain('solid');
  } finally { style.remove(); button.remove(); }
});

test.each(['history-conversation-speech', 'duel-speech'])('%s의 선택 취소·대상 변경·재등장 뒤 유도 효과가 다시 반복된다', className => {
  const style = document.createElement('style');
  style.textContent = readFileSync(path.join(__dirname, '../../public/sparring-arena/speech-cue.css'), 'utf8');
  const button = document.createElement('button');
  button.className = className;
  const action = document.createElement('span');
  button.append(action);
  document.head.append(style); document.body.append(button);
  const cue = createSpeechCue(button, action);
  const animation = () => getComputedStyle(button.querySelector('.speech-cue-wave')).animation;
  try {
    cue.present('first');
    expect(animation()).toContain('infinite');
    expect(action.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    cue.dismiss(); cue.present('first');
    expect(animation()).not.toContain('speech-cue-wave');
    delete button.dataset.replySelected;
    expect(animation()).toContain('speech-cue-wave');
    cue.dismiss(); button.dataset.replySelected = 'false';
    expect(animation()).toContain('speech-cue-wave');
    cue.dismiss(); cue.present('second'); cue.present('first');
    expect(animation()).toContain('infinite');
  } finally { style.remove(); button.remove(); }
});

test.each([2, 3, 4, 5, 8, 9, 16])('말풍선 %i개에서도 받아치기 문구를 원래 크기와 위치로 반복한다', count => {
  const style = document.createElement('style');
  style.textContent = ['history-conversation.css', 'speech-cue.css']
    .map(file => readFileSync(path.join(__dirname, '../../public/sparring-arena', file), 'utf8')).join('\n');
  const field = document.createElement('section');
  field.className = 'history-conversation'; field.dataset.bubbleCount = String(count);
  field.dataset.dense = String(count > 4); field.dataset.crowded = String(count > 8);
  const button = document.createElement('button'); button.className = 'history-conversation-speech';
  field.append(button); document.head.append(style); document.body.append(field);
  try {
    createSpeechCue(button, document.createElement('span')).present('first');
    const label = getComputedStyle(button.querySelector('.speech-cue-label'));
    expect(label.display).not.toBe('none');
    expect(label.fontSize).toBe('24px');
    expect(label.top).toBe('-27px');
    expect(label.letterSpacing).toBe('-1px');
    expect(label.animation).toContain('infinite');
    field.dataset.reduced = 'true';
    expect(getComputedStyle(button.querySelector('.speech-cue-label')).animation).toBe('none');
    expect(getComputedStyle(button.querySelector('.speech-cue-wave')).animation).toBe('none');
  } finally { style.remove(); field.remove(); }
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
