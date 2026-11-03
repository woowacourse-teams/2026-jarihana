import { fitVoteLabels } from '../../public/sparring-arena/src/composer.js';

jest.mock('../../public/sparring-arena/src/transport.js', () => ({ updateTransport: jest.fn() }));

let flag, label, lineWidths;
beforeEach(() => {
  document.body.innerHTML = '<button class="vote-flag" style="padding: 8px 0"><strong style="padding: 8px 12px; border: 2px solid">온라인으로 편하게 이야기하기</strong></button>';
  flag = document.querySelector('button');
  label = flag.querySelector('strong');
  Object.defineProperty(flag, 'clientWidth', { value: 220, configurable: true });
  lineWidths = [124.2, 73];
  jest.spyOn(document, 'createRange').mockImplementation(() => ({
    selectNodeContents: jest.fn(), getClientRects: () => lineWidths.map(width => ({ width })),
  }));
});

afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

it('여러 줄 중 가장 긴 글자 폭과 좌우 패딩만 남긴다', () => {
  fitVoteLabels();
  expect(label.style.width).toBe('154px');
  fitVoteLabels();
  expect(document.createRange).toHaveBeenCalledTimes(1);
});

it('화면이 좁아지거나 편명이 변경되면 다시 맞춘다', () => {
  fitVoteLabels();
  Object.defineProperty(flag, 'clientWidth', { value: 140 });
  lineWidths = [104];
  fitVoteLabels();
  expect(label.style.width).toBe('133px');
  label.textContent = '온라인';
  lineWidths = [37];
  fitVoteLabels();
  expect(label.style.width).toBe('66px');
});

it('긴 단어도 주어진 최대 폭을 넘지 않으며 숨겨진 편명은 측정하지 않는다', () => {
  lineWidths = [500];
  fitVoteLabels();
  expect(label.style.width).toBe('220px');
  Object.defineProperty(flag, 'clientWidth', { value: 0 });
  label.textContent = '숨김';
  fitVoteLabels();
  expect(document.createRange).toHaveBeenCalledTimes(1);
});
